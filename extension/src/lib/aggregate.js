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

// Per-page Markdown files with structure-preserving, unique paths.
export function buildPageFiles(pages, options = {}) {
  const { metadataStyle = "frontmatter", includeTitleHeading = true } = options;
  const used = new Set();
  return pages.map((page) => {
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
  });
}

// index.md linking to every page file (relative links).
export function buildIndexMarkdown(files, { siteTitle = "Site export" } = {}) {
  const lines = [`# ${siteTitle}`, "", `${files.length} page${files.length === 1 ? "" : "s"}.`, ""];
  for (const file of files) {
    lines.push(`- [${escapeLinkText(file.title || file.path)}](${encodePathForLink(file.path)})`);
  }
  return `${lines.join("\n")}\n`;
}

// Single concatenated document with a table of contents.
export function buildAggregateMarkdown(pages, { siteTitle = "Site export" } = {}) {
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
