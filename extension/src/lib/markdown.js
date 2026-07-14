// HTML -> Markdown conversion, built on the vendored Turndown + GFM plugin.
// Pure given an HTML string and a global DOM (Turndown's browser build uses
// `document` internally). Unit-tested with jsdom; in the extension the page
// DOM is always present.

import TurndownService from "../vendor/turndown.js";
import { gfm } from "../vendor/turndown-plugin-gfm.js";

const NBSP = String.fromCharCode(0xa0);

const DEFAULT_TURNDOWN = {
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined"
};

// Build a configured Turndown instance. Exposed for tests and reuse.
export function createConverter(overrides = {}) {
  const service = new TurndownService({ ...DEFAULT_TURNDOWN, ...overrides });
  service.use(gfm);

  // Drop links that carry no destination -- SharePoint emits many empty anchors.
  service.addRule("dropEmptyLinks", {
    filter: (node) => node.nodeName === "A" && !node.getAttribute("href"),
    replacement: (content) => content
  });

  // Keep <figcaption> readable as caption text.
  service.addRule("figureCaption", {
    filter: "figcaption",
    replacement: (content) => (content ? `\n\n*${content.trim()}*\n\n` : "")
  });

  // SharePoint (and many web apps) render tabular data as ARIA grids built from
  // <div role="grid">/<div role="row">/<div role="gridcell"> rather than real
  // <table>s, so Turndown would otherwise emit each cell as a loose paragraph.
  // Rebuild those into a GFM table. Real <table>s don't carry role="grid", so
  // the GFM plugin still handles them.
  service.addRule("ariaGrid", {
    filter: (node) => {
      if (!node.getAttribute) {
        return false;
      }
      const role = node.getAttribute("role");
      return (role === "grid" || role === "table") && node.querySelector('[role="row"]') != null;
    },
    replacement: (content, node) => {
      const table = ariaGridToMarkdown(node);
      return table ? `\n\n${table}\n\n` : content;
    }
  });

  // Iframes (maps, videos, embedded forms) would otherwise leak as raw HTML.
  // Convert to a plain link when the src is http(s); drop otherwise.
  service.addRule("iframeEmbed", {
    filter: "iframe",
    replacement: (content, node) => {
      const src = node.getAttribute("src") || "";
      if (!/^https?:\/\//i.test(src)) {
        return "";
      }
      let label = (node.getAttribute("title") || "").trim();
      if (!label) {
        try {
          label = new URL(src).hostname;
        } catch {
          label = "embedded content";
        }
      }
      return `\n\n[Embedded: ${label}](${src})\n\n`;
    }
  });

  return service;
}

// Convert an HTML string to normalized Markdown.
export function htmlToMarkdown(html, { turndown } = {}) {
  if (!html) {
    return "";
  }
  const service = createConverter(turndown);
  return normalizeMarkdown(service.turndown(html));
}

// Collapse whitespace noise so output is stable and diff-friendly.
export function normalizeMarkdown(value) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .split(NBSP).join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

// If the body's lead heading repeats the page title, drop it (the composed
// document already opens with an H1 title). Leading images, horizontal rules,
// and blank lines are skipped when locating that heading -- SharePoint pages
// often open with a banner image before the title heading.
export function removeDuplicateLeadHeading(markdown, title) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) {
    return markdown;
  }
  const lines = String(markdown || "").split("\n");
  let i = 0;
  while (i < lines.length && isSkippableLeadLine(lines[i])) {
    i++;
  }
  const headingMatch = lines[i] && lines[i].match(/^#{1,6}\s+(.+?)\s*$/);
  if (!headingMatch || normalize(headingMatch[1]) !== normalizedTitle) {
    return markdown;
  }
  lines.splice(i, 1);
  while (i < lines.length && !lines[i].trim()) {
    lines.splice(i, 1);
  }
  return lines.join("\n");
}

// Blank lines, standalone images, and horizontal rules that may precede a
// duplicate lead heading.
function isSkippableLeadLine(line) {
  const trimmed = String(line || "").trim();
  return (
    trimmed === "" ||
    /^!\[[^\]]*\]\([^\n]*\)$/.test(trimmed) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)
  );
}

// Convert an ARIA grid/table (div-based) into a GFM table string, or "" when it
// doesn't hold usable rows. Cells are flattened to single-line text.
function ariaGridToMarkdown(grid) {
  const rows = Array.from(grid.querySelectorAll('[role="row"]'));
  if (!rows.length) {
    return "";
  }
  const cellsOf = (row) =>
    Array.from(row.querySelectorAll('[role="columnheader"], [role="rowheader"], [role="gridcell"], [role="cell"]'));
  const text = (cell) => String(cell.textContent || "").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");

  const headerRow = rows.find((row) => row.querySelector('[role="columnheader"]'));
  const bodyRows = rows.filter((row) => row !== headerRow);
  const headerCells = headerRow ? cellsOf(headerRow).map(text) : cellsOf(rows[0]).map(text);
  const dataRows = headerRow ? bodyRows : rows.slice(1);

  const columnCount = Math.max(headerCells.length, ...dataRows.map((row) => cellsOf(row).length), 0);
  if (columnCount === 0) {
    return "";
  }
  const pad = (values) => {
    const out = values.slice(0, columnCount);
    while (out.length < columnCount) {
      out.push("");
    }
    return out;
  };
  const header = pad(headerCells.length ? headerCells : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`));

  const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
  for (const row of dataRows) {
    const cells = pad(cellsOf(row).map(text));
    if (cells.some((cell) => cell !== "")) {
      lines.push(`| ${cells.join(" | ")} |`);
    }
  }
  return lines.length > 2 ? lines.join("\n") : "";
}
