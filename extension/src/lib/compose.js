// Assemble the final Markdown document from a converted body + collected
// metadata. Pure -- unit-tested. The templating engine (template.js) can
// override this for users who define a custom template.

import { buildFrontmatter } from "./frontmatter.js";
import { normalizeMarkdown, removeDuplicateLeadHeading } from "./markdown.js";
import { toRelativeMarkdownPath } from "./sitepath.js";

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

// Map a capture mode to a Knowledge Base preset content type. See
// docs/llm-vault-design.md ("Frontmatter"). Only three shapes are supported;
// anything that isn't sharepoint/confluence is treated as a plain article.
export function contentTypeFromMode(mode) {
  if (mode === "sharepoint") {
    return "sharepoint";
  }
  if (mode === "confluence") {
    return "confluence";
  }
  return "article";
}

// Strip enough Markdown syntax to leave a readable plain-text snippet, for
// the last-resort auto-description fallback (first ~200 chars of the body).
function stripMarkdownForSummary(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function autoDescriptionFromBody(body, limit = 200) {
  const text = stripMarkdownForSummary(body);
  if (!text) {
    return "";
  }
  if (text.length <= limit) {
    return text;
  }
  const truncated = text.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim()}...`;
}

// Auto-description order (docs/llm-vault-design.md): og:description / meta
// description are already merged into metadata.description by
// content/metadata.js, so here it's description -> twitterDescription ->
// first ~200 chars of the body.
function resolveDescription(m, body) {
  if (m.description) {
    return m.description;
  }
  if (m.twitterDescription) {
    return m.twitterDescription;
  }
  return autoDescriptionFromBody(body);
}

function withoutEmpty(props) {
  const clean = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

// Knowledge Base preset: content-type-aware frontmatter. Only used when
// options.knowledgeBasePreset is true; otherwise buildProperties keeps its
// original, unconditional shape (see below) so existing users see zero
// change.
function buildKnowledgeBaseProperties(metadata, options) {
  const m = metadata;
  const type = contentTypeFromMode(m.type || m.mode);
  const path = m.url ? toRelativeMarkdownPath(m.url, { fallback: "page" }) : undefined;
  const description = resolveDescription(m, options.body);

  let props;
  if (type === "sharepoint") {
    props = {
      title: m.title,
      source_url: m.url,
      site: m.site,
      path,
      last_modified: m.modified,
      captured: m.capturedAt,
      author: m.author,
      type
    };
  } else {
    props = {
      title: m.title,
      source_url: m.url,
      author: m.author,
      published: m.published,
      clipped: m.clippedAt || new Date().toISOString(),
      description,
      tags: m.tags,
      type
    };
    if (type === "confluence") {
      props.path = path;
    }
  }

  const clean = withoutEmpty(props);
  if (options.extraProperties) {
    Object.assign(clean, options.extraProperties);
  }
  return clean;
}

// Map raw collected metadata into ordered front-matter properties.
export function buildProperties(metadata = {}, options = {}) {
  if (options.knowledgeBasePreset) {
    return buildKnowledgeBaseProperties(metadata, options);
  }
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
  const props = buildProperties(
    { ...metadata, title: heading || metadata.title },
    { ...options, body }
  );

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
