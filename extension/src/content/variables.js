// Build the flat variable map consumed by the template engine. DOM-bound:
// standard fields from metadata, plus meta tags, JSON-LD schema fields, and any
// requested CSS selectors.

import { cleanText } from "./dom-utils.js";

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function buildVariables(metadata, { content = "", selectors = [] } = {}) {
  const url = location.href;
  let domain = location.hostname;
  let path = location.pathname;
  try {
    const parsed = new URL(url);
    domain = parsed.hostname;
    path = parsed.pathname;
  } catch {
    // keep location fallbacks
  }

  const now = new Date();
  const values = {
    title: metadata.title || "",
    author: metadata.author || "",
    published: metadata.published || "",
    modified: metadata.modified || "",
    date: metadata.pageDate || metadata.published || "",
    description: metadata.description || "",
    site: metadata.site || "",
    url,
    domain,
    path,
    captured: metadata.capturedAt || "",
    today: isoDate(now),
    time: now.toTimeString().slice(0, 8),
    content
  };

  addMetaTags(values);
  addSchema(values);
  for (const css of selectors) {
    values[`selector:${css}`] = resolveSelector(css);
  }
  return values;
}

function addMetaTags(values) {
  for (const meta of document.querySelectorAll("meta[name], meta[property]")) {
    const key = meta.getAttribute("name") || meta.getAttribute("property");
    const content = cleanText(meta.getAttribute("content") || "");
    const mapKey = `meta:${key}`;
    if (key && content && !(mapKey in values)) {
      values[mapKey] = content;
    }
  }
}

function addSchema(values) {
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    let parsed;
    try {
      parsed = JSON.parse(script.textContent || "{}");
    } catch {
      continue;
    }
    const objects = Array.isArray(parsed) ? parsed : [parsed];
    for (const object of objects) {
      if (!object || typeof object !== "object") {
        continue;
      }
      for (const [key, value] of Object.entries(object)) {
        const mapKey = `schema:${key}`;
        if (mapKey in values) {
          continue;
        }
        const flat = flattenSchemaValue(value);
        if (flat) {
          values[mapKey] = flat;
        }
      }
    }
  }
}

function flattenSchemaValue(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return cleanText(String(value));
  }
  if (Array.isArray(value)) {
    return value.map(flattenSchemaValue).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    return cleanText(value.name || value["@id"] || "");
  }
  return "";
}

function resolveSelector(css) {
  try {
    const element = document.querySelector(css);
    return element ? cleanText(element.innerText || element.textContent || "") : "";
  } catch {
    return "";
  }
}
