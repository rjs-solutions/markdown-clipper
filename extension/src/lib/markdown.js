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

// If the body's first heading repeats the page title, drop it (the composed
// document already opens with an H1 title).
export function removeDuplicateLeadHeading(markdown, title) {
  const normalizedTitle = String(title || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedTitle) {
    return markdown;
  }
  const lines = String(markdown || "").split("\n");
  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  const headingMatch = lines[0] && lines[0].match(/^#{1,6}\s+(.+?)\s*$/);
  if (headingMatch && headingMatch[1].replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle) {
    lines.shift();
    while (lines.length && !lines[0].trim()) {
      lines.shift();
    }
    return lines.join("\n");
  }
  return markdown;
}
