// Build site-export outputs from captured pages: per-page files (structure
// preserving) + index, and a single concatenated aggregate document. Pure.

import { composeDocument } from "./compose.js";
import { toRelativeMarkdownPath, uniquePath, encodePathForLink } from "./sitepath.js";
import { slugify } from "./slug.js";

// page: { url, title, markdown (body), metadata }

function escapeLinkText(text) {
  return String(text || "").replace(/\]/g, "\\]");
}

function ghSlug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// A single page's structure-preserving, unique-path Markdown file. Shared by
// buildPageFiles() (whole-array export) and callers that stream pages one at
// a time (e.g. a job's export driven by iterateJobBodies()) -- both need the
// exact same path/content derivation, just fed one page vs. many.
export function buildPageFile(page, options = {}, used = new Set()) {
  const { metadataStyle = "frontmatter", includeTitleHeading = true } = options;
  const path = uniquePath(
    toRelativeMarkdownPath(page.url, { fallback: slugify(page.title, { fallback: "page" }) }),
    used
  );
  const content = composeDocument({
    title: page.title,
    body: page.markdown,
    metadata: page.metadata,
    options: { metadataStyle, includeTitleHeading }
  });
  return { path, url: page.url, title: page.title, content };
}

// Per-page Markdown files with structure-preserving, unique paths.
export function buildPageFiles(pages, options = {}) {
  const used = new Set();
  return pages.map((page) => buildPageFile(page, options, used));
}

// index.md linking to every page file (relative links).
export function buildIndexMarkdown(files, { siteTitle = "Site export" } = {}) {
  const lines = [`# ${siteTitle}`, "", `${files.length} page${files.length === 1 ? "" : "s"}.`, ""];
  for (const file of files) {
    lines.push(`- [${escapeLinkText(file.title || file.path)}](${encodePathForLink(file.path)})`);
  }
  return `${lines.join("\n")}\n`;
}

// Builds the full aggregate document as a single string. This is the
// canonical transform (TOC + sections joined, 3+ blank lines collapsed,
// trimmed); both buildAggregateMarkdown() and buildAggregateParts() derive
// from it so they can never drift from each other.
function buildAggregateDocument(pages, { siteTitle = "Site export" } = {}) {
  const toc = [`# ${siteTitle}`, "", `${pages.length} page${pages.length === 1 ? "" : "s"}.`, "", "## Contents", ""];
  const sections = [];
  pages.forEach((page, index) => {
    const heading = `${index + 1}. ${page.title || page.url}`;
    toc.push(`- [${escapeLinkText(page.title || page.url)}](#${ghSlug(heading)})`);
    sections.push(
      `## ${heading}`,
      "",
      `Source: ${page.url}`,
      "",
      String(page.markdown || "").trim(),
      "",
      "---",
      ""
    );
  });
  const out = [...toc, "", ...sections].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return `${out}\n`;
}

// Single concatenated document with a table of contents.
export function buildAggregateMarkdown(pages, options = {}) {
  return buildAggregateDocument(pages, options);
}

// Same content as buildAggregateMarkdown(), but returned as an array of
// section strings meant to be passed straight to `new Blob(parts)` rather
// than joined into one giant string first. Computed by slicing the exact
// canonical document at each section boundary, so `parts.join("")` is
// byte-identical to buildAggregateMarkdown()'s output by construction.
export function buildAggregateParts(pages, options = {}) {
  const full = buildAggregateDocument(pages, options);
  const parts = [];
  let cursor = 0;
  pages.forEach((page, index) => {
    const heading = `${index + 1}. ${page.title || page.url}`;
    const marker = `## ${heading}`;
    const pos = full.indexOf(marker, cursor);
    parts.push(full.slice(cursor, pos));
    cursor = pos;
  });
  parts.push(full.slice(cursor));
  return parts;
}
