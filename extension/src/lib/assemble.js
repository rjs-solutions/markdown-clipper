// Assemble the final Markdown document + filename from a capture result plus the
// user's edits. Shared by the popup card and the full-screen editor so both
// produce identical output. Pure -- unit-tested.

import { composeDocument } from "./compose.js";
import { applyTemplate } from "./template.js";
import { slugify, sanitizeFilename, withMarkdownExtension } from "./slug.js";

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

// Parse a comma-separated tag string into a clean array. Passes arrays through.
export function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// result: { title, url, mode, markdown, metadata, variables }
// fields: any of { title, body, tags, description, author, published, modified, site, url, filenameBase }
//         (omitted fields fall back to the capture result)
// settings: { metadataStyle, includeTitleHeading, useTemplate, template, filenameTemplate }
export function assembleOutput({ result, fields = {}, settings }) {
  const meta = result.metadata || {};
  const title = (fields.title != null ? fields.title : result.title || "").trim() || result.title || "page";
  const body = fields.body != null ? fields.body : result.markdown || "";
  const tags = parseTags(fields.tags != null ? fields.tags : meta.tags || []);
  const url = fields.url != null ? fields.url : result.url;

  const metadata = {
    ...meta,
    title,
    tags,
    url,
    description: fields.description != null ? fields.description : meta.description,
    author: fields.author != null ? fields.author : meta.author,
    published: fields.published != null ? fields.published : meta.published,
    modified: fields.modified != null ? fields.modified : meta.modified,
    site: fields.site != null ? fields.site : meta.site
  };

  let markdown;
  if (settings.useTemplate) {
    const values = {
      ...result.variables,
      content: body,
      title,
      tags: tags.join(", "),
      description: metadata.description || "",
      author: metadata.author || "",
      published: metadata.published || "",
      modified: metadata.modified || "",
      site: metadata.site || "",
      url
    };
    markdown = ensureTrailingNewline(applyTemplate(settings.template, values));
  } else {
    markdown = composeDocument({
      title,
      body,
      metadata,
      options: {
        metadataStyle: settings.metadataStyle,
        includeTitleHeading: settings.includeTitleHeading
      }
    });
  }

  const base = (fields.filenameBase || "").trim() || slugify(title, { fallback: "page" });
  const filename = withMarkdownExtension(sanitizeFilename(base, { fallback: "page" }));

  return { title, url, mode: result.mode, markdown, filename };
}
