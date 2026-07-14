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

const LAYOUT_BLOCK_SELECTOR = "form, div, ul, ol, pre, hr, h1, h2, h3, h4, h5, h6";
const REMOVED_TAGS = ["script", "style", "noscript", "svg"];
const REMOVED_SELECTOR = REMOVED_TAGS.join(", ");

// Build a configured Turndown instance. Exposed for tests and reuse.
export function createConverter(overrides = {}) {
  const service = new TurndownService({ ...DEFAULT_TURNDOWN, ...overrides });
  service.use(gfm);

  const layoutCache = new WeakMap();
  const isLayout = (table) => {
    if (layoutCache.has(table)) {
      return layoutCache.get(table);
    }
    const result = isLayoutTable(table);
    layoutCache.set(table, result);
    return result;
  };

  // Drop links that carry no destination -- SharePoint emits many empty anchors.
  service.addRule("dropEmptyLinks", {
    filter: (node) => node.nodeName === "A" && !node.getAttribute("href"),
    replacement: (content) => content
  });

  // Drop links with nothing to click on: whitespace-only text, or a bare image
  // with no alt text (Hacker News' blank upvote arrows and logo wrappers). An
  // <a> wrapping an image that HAS alt text still carries meaning -- keep it.
  service.addRule("dropContentlessLinks", {
    filter: (node) => node.nodeName === "A" && Boolean(node.getAttribute("href")) && isContentlessLink(node),
    replacement: () => ""
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

  // Many real-world pages (Hacker News foremost among them) are built entirely
  // from nested layout <table>s rather than CSS. Left to the vendored GFM
  // plugin, those become either corrupt pipe tables or raw HTML dumps. These
  // three rules classify every table and either unwrap layout tables to plain
  // flowing content or emit a proper GFM table for real data tables. They are
  // added after `service.use(gfm)`, so they take priority over -- and fully
  // replace -- the plugin's own table/tableRow/tableCell rules.
  service.addRule("tableClassifier", {
    filter: (node) => node.nodeName === "TABLE",
    replacement: (content, node) => tableReplacement(content, node, isLayout)
  });

  service.addRule("tableRowClassifier", {
    filter: "tr",
    replacement: (content, node) => tableRowReplacement(content, node, isLayout)
  });

  service.addRule("tableCellClassifier", {
    filter: ["th", "td"],
    replacement: (content, node) => tableCellReplacement(content, node, isLayout)
  });

  // <pre> without an inner <code> (turndown's built-in fencedCodeBlock rule
  // only fires when node.firstChild is CODE). Using textContent naturally
  // strips syntax-highlighter span soup and leaves markdown characters
  // unescaped.
  service.addRule("preformattedCode", {
    filter: (node) => node.nodeName === "PRE" && (!node.firstChild || node.firstChild.nodeName !== "CODE"),
    replacement: (content, node, options) => {
      const code = node.textContent || "";
      if (!code.trim()) {
        return "";
      }
      const fence = pickFence(code, options.fence.charAt(0));
      return `\n\n${fence}\n${code.replace(/\n$/, "")}\n${fence}\n\n`;
    }
  });

  // Definition lists (heavily used by MDN): bold term, pandoc-style indented
  // definition. A literal 4-space indent would be read as a code block, so
  // ": " is used instead.
  service.addRule("definitionTerm", {
    filter: "dt",
    replacement: (content) => {
      const text = content.trim();
      return text ? `\n\n**${text}**\n` : "";
    }
  });
  service.addRule("definitionDescription", {
    filter: "dd",
    replacement: (content) => {
      const text = content.trim();
      return text ? `\n: ${text}\n` : "";
    }
  });

  // <mark> -> ==highlight==.
  service.addRule("highlightMark", {
    filter: "mark",
    replacement: (content) => (content ? `==${content}==` : "")
  });

  // Never let script/style/noscript/svg content land in the output.
  service.remove(REMOVED_TAGS);

  return service;
}

// Convert an HTML string to normalized Markdown. `options.baseUrl`, when
// supplied, resolves relative link/image URLs against it before conversion.
export function htmlToMarkdown(html, options = {}) {
  if (!html) {
    return "";
  }
  const { turndown, baseUrl } = options;
  const service = createConverter(turndown);
  const input = baseUrl ? resolveUrlsAgainstBase(html, baseUrl) : html;
  return normalizeMarkdown(service.turndown(input));
}

// Classify a <table> as a layout table (built for visual arrangement, not
// tabular data) or a data table. Pure and DOM-only so it's directly testable.
export function isLayoutTable(table) {
  if (!table || table.nodeName !== "TABLE") {
    return false;
  }
  const role = table.getAttribute && table.getAttribute("role");
  if (role === "presentation" || role === "none") {
    return true;
  }

  // Header signals beat structural ones: a data table may legitimately hold a
  // presentational table inside one of its cells. The inner table is then
  // classified independently on its own merits.
  if (hasOwnHeaderSignal(table)) {
    return false;
  }

  if (table.querySelector("table")) {
    return true;
  }
  if (table.parentElement && table.parentElement.closest("table")) {
    return true;
  }

  const rows = Array.from(table.rows || []);
  const rowCount = rows.length;
  const columnCount = rows.reduce((max, row) => Math.max(max, row.cells ? row.cells.length : 0), 0);
  if (rowCount < 2 || columnCount < 2) {
    return true;
  }

  const hasBlockCell = rows.some((row) =>
    Array.from(row.cells || []).some((cell) => cell.querySelector(LAYOUT_BLOCK_SELECTOR) != null)
  );
  return hasBlockCell;
}

// A <th>, <thead>, or <caption> belonging to this table rather than to a table
// nested inside one of its cells.
function hasOwnHeaderSignal(table) {
  return Array.from(table.querySelectorAll("th, thead, caption")).some(
    (el) => el.closest("table") === table
  );
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

// Replacement for a classified <table>: unwrap layout tables to plain
// content, fall through to raw HTML when GFM can't represent colspan/rowspan,
// otherwise emit the pipe-table body assembled by the row/cell rules.
function tableReplacement(content, node, isLayout) {
  if (isLayout(node)) {
    const trimmed = content.trim();
    return trimmed ? `\n\n${trimmed}\n\n` : "";
  }
  if (hasColspanOrRowspan(node)) {
    return `\n\n${rawTableHtml(node)}\n\n`;
  }
  const body = content.replace(/^\n+/, "").trim();
  return body ? `\n\n${body}\n\n` : "";
}

// An <a> with nothing clickable inside it: no visible text, and no image
// carrying alt text. Images with alt text still render as [![alt](src)](href),
// which is meaningful, so those links are kept. Text inside elements we strip
// (an <svg> logo's <title>, most commonly) does not count as content, since it
// won't survive to the output either.
function isContentlessLink(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll(REMOVED_SELECTOR).forEach((el) => el.remove());
  if (String(clone.textContent || "").trim()) {
    return false;
  }
  const images = Array.from(clone.querySelectorAll("img"));
  return !images.some((img) => String(img.getAttribute("alt") || "").trim());
}

// Raw HTML fallback for tables GFM can't represent (colspan/rowspan). Still
// honors the defensive script/style/noscript/svg removal, since that fallback
// bypasses Turndown's normal node-by-node processing entirely.
function rawTableHtml(table) {
  const clone = table.cloneNode(true);
  clone.querySelectorAll(REMOVED_SELECTOR).forEach((el) => el.remove());
  return clone.outerHTML;
}

// Replacement for a <tr> inside a classified table. Rows of an unwrapped
// layout table are always separated by a block boundary; the cells within one
// have already decided whether they join inline or split (see below).
function tableRowReplacement(content, node, isLayout) {
  const table = node.closest("table");
  if (!table) {
    return content;
  }
  if (isLayout(table)) {
    const trimmed = content.trim();
    return trimmed ? `\n\n${trimmed}\n\n` : "";
  }
  if (hasColspanOrRowspan(table)) {
    return content;
  }
  const border = isEffectiveHeaderRow(node, table) ? buildBorderRow(node) : "";
  return `\n${content}${border ? `\n${border}` : ""}`;
}

// Replacement for a <th>/<td> inside a classified table. In an unwrapped
// layout table, a cell whose rendered content is inline-level joins its
// siblings on one line; a cell that rendered block-level content (its
// replacement carries newlines) keeps a block boundary. Deciding on the
// rendered content rather than the source DOM is what lets a cell whose only
// block child was a dropped empty link still join inline.
function tableCellReplacement(content, node, isLayout) {
  const table = node.closest("table");
  const trimmed = content.trim();
  if (table && isLayout(table)) {
    if (!trimmed) {
      return "";
    }
    // Test the untrimmed content: a cell holding a single block child carries
    // its newlines only at the edges, which trimming would hide.
    return /\n/.test(content) ? `\n\n${trimmed}\n\n` : `${trimmed} `;
  }
  if (!table || hasColspanOrRowspan(table)) {
    return trimmed ? `\n\n${trimmed}\n\n` : "";
  }
  const text = content.replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|").trim();
  return cellPipe(text, node);
}

function cellPipe(text, node) {
  const siblings = node.parentNode ? node.parentNode.children : null;
  const index = siblings ? Array.prototype.indexOf.call(siblings, node) : 0;
  return `${index === 0 ? "| " : " "}${text} |`;
}

function buildBorderRow(row) {
  const cells = Array.from(row.children || []);
  if (!cells.length) {
    return "";
  }
  return cells.map((cellNode) => cellPipe("---", cellNode)).join("");
}

function getEffectiveHeaderRow(table) {
  const rows = Array.from(table.rows || []);
  if (!rows.length) {
    return null;
  }
  const withTh = rows.find((row) => Array.from(row.cells || []).some((cell) => cell.nodeName === "TH"));
  return withTh || rows[0];
}

function isEffectiveHeaderRow(row, table) {
  return getEffectiveHeaderRow(table) === row;
}

function hasColspanOrRowspan(table) {
  return Array.from(table.querySelectorAll("th, td")).some((cell) => {
    const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);
    const rowspan = parseInt(cell.getAttribute("rowspan") || "1", 10);
    return colspan > 1 || rowspan > 1;
  });
}

// Choose a fence at least 3 chars of `fenceChar` that can't collide with a
// run of the same character already present in the code.
function pickFence(code, fenceChar) {
  let fenceSize = 3;
  const fenceInCodeRegex = new RegExp(`^${fenceChar}{3,}`, "gm");
  let match;
  while ((match = fenceInCodeRegex.exec(code))) {
    if (match[0].length >= fenceSize) {
      fenceSize = match[0].length + 1;
    }
  }
  return fenceChar.repeat(fenceSize);
}

// Resolve relative <a href> and <img src> values against baseUrl. Absolute
// URLs, fragments, and non-http(s) schemes (mailto:, tel:, javascript:, data:)
// are left untouched.
function resolveUrlsAgainstBase(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const isRelative = (value) => value && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("#");
  const resolve = (value) => {
    try {
      return new URL(value, baseUrl).href;
    } catch {
      return value;
    }
  };

  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (isRelative(href)) {
      a.setAttribute("href", resolve(href));
    }
  });
  doc.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src");
    if (isRelative(src)) {
      img.setAttribute("src", resolve(src));
    }
  });

  return doc.body.innerHTML;
}
