// Assemble the final Markdown document from a converted body + collected
// metadata. Pure -- unit-tested. The templating engine (template.js) can
// override this for users who define a custom template.

import { buildFrontmatter } from "./frontmatter.js";
import { normalizeMarkdown, removeDuplicateLeadHeading } from "./markdown.js";

const LIST_LABELS = {
  source: "Source",
  author: "Author",
  published: "Published",
  modified: "Modified",
  date: "Date",
  site: "Site",
  captured: "Captured",
  description: "Description"
};

// Map raw collected metadata into ordered front-matter properties.
export function buildProperties(metadata = {}, options = {}) {
  const m = metadata;
  const props = {};
  if (m.title) {
    props.title = m.title;
  }
  if (m.url) {
    props.source = m.url;
  }
  if (m.author) {
    props.author = m.author;
  }
  if (m.published) {
    props.published = m.published;
  }
  if (m.modified && m.modified !== m.published) {
    props.modified = m.modified;
  }
  if (m.pageDate && m.pageDate !== m.published && m.pageDate !== m.modified) {
    props.date = m.pageDate;
  }
  if (m.description) {
    props.description = m.description;
  }
  if (m.site) {
    props.site = m.site;
  }
  if (Array.isArray(m.tags) && m.tags.length) {
    props.tags = m.tags;
  }
  if (m.capturedAt) {
    props.captured = m.capturedAt;
  }
  if (options.extraProperties) {
    Object.assign(props, options.extraProperties);
  }
  return props;
}

function buildMetadataList(props) {
  const lines = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === "title" || value === undefined || value === null || value === "") {
      continue;
    }
    const label = LIST_LABELS[key] || key;
    if (Array.isArray(value)) {
      if (value.length) {
        lines.push(`${label}: ${value.join(", ")}`);
      }
    } else {
      lines.push(`${label}: ${value}`);
    }
  }
  return lines.join("\n");
}

// Compose the final document.
// options.metadataStyle: "frontmatter" (default) | "list" | "none"
// options.includeTitleHeading: include an H1 of the title (default true)
export function composeDocument({ title, body, metadata = {}, options = {} }) {
  const style = options.metadataStyle || "frontmatter";
  const includeTitleHeading = options.includeTitleHeading !== false;
  const heading = String(title || metadata.title || "").replace(/^#+\s*/, "").trim();
  const props = buildProperties({ ...metadata, title: heading || metadata.title }, options);

  const parts = [];
  if (style === "frontmatter") {
    const fm = buildFrontmatter(props);
    if (fm) {
      parts.push(fm);
    }
  }
  if (includeTitleHeading && heading) {
    parts.push(`# ${heading}`);
  }
  if (style === "list") {
    const list = buildMetadataList(props);
    if (list) {
      parts.push(list);
    }
  }
  const cleanBody = removeDuplicateLeadHeading(normalizeMarkdown(body), heading);
  if (cleanBody) {
    parts.push(cleanBody);
  }
  return `${normalizeMarkdown(parts.join("\n\n"))}\n`;
}
