// Extract page metadata (author, dates, description, site, tags) from meta
// tags, JSON-LD, and visible bylines. DOM-bound.

import { cleanText, cssEscape, isVisible, looksLikeDate } from "./dom-utils.js";

export function collectMetadata(root, { mode, overrides = {} } = {}) {
  const published = firstValue([
    metaContent("article:published_time"),
    metaContent("og:published_time"),
    metaContent("datePublished"),
    metaContent("publishdate"),
    jsonLdValue(["datePublished", "dateCreated"])
  ]);
  const modified = firstValue([
    metaContent("article:modified_time"),
    metaContent("og:updated_time"),
    metaContent("dateModified"),
    metaContent("last-modified"),
    jsonLdValue(["dateModified"])
  ]);
  const pageDate = firstValue([
    visibleDateFromSelectors(root),
    metaContent("date"),
    metaContent("DC.date"),
    metaContent("DC.date.issued")
  ]);

  return {
    author: overrides.author || findPageAuthor(root),
    published,
    modified,
    pageDate,
    description: overrides.description || metaContent("description") || metaContent("og:description"),
    site: metaContent("og:site_name") || siteFromHost(),
    tags: collectTags(),
    capturedAt: new Date().toLocaleString(),
    mode
  };
}

function siteFromHost() {
  return location.hostname.replace(/^www\./i, "");
}

function collectTags() {
  const keywords = metaContent("keywords");
  if (!keywords) {
    return [];
  }
  return keywords
    .split(",")
    .map((tag) => cleanText(tag))
    .filter(Boolean)
    .slice(0, 12);
}

export function findPageAuthor(root) {
  return firstValue([
    metaContent("author"),
    metaContent("article:author"),
    metaContent("parsely-author"),
    metaContent("creator"),
    metaContent("DC.creator"),
    jsonLdAuthor(),
    visibleAuthorFromSelectors(root)
  ]);
}

function metaContent(nameOrProperty) {
  const escaped = cssEscape(nameOrProperty);
  const selectors = [
    `meta[name='${escaped}']`,
    `meta[property='${escaped}']`,
    `meta[itemprop='${escaped}']`
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const value = element ? cleanText(element.getAttribute("content") || "") : "";
    if (value) {
      return value;
    }
  }
  return "";
}

function visibleAuthorFromSelectors(root) {
  const selectors = [
    "[data-automation-id='pageAuthor']",
    "[data-automation-id='newsAuthor']",
    "[data-automation-id='AuthorByline']",
    "[data-automation-id='authorByline']",
    "[data-automation-id='author']",
    "[itemprop='author']",
    ".author",
    ".byline"
  ];
  return firstVisibleText(selectors, root).replace(/^by\s+/i, "");
}

function visibleDateFromSelectors(root) {
  const dateSelectors = [
    "[data-automation-id='pagePublishedDate']",
    "[data-automation-id='pageModifiedDate']",
    "[data-automation-id='newsDate']",
    "[data-automation-id='modifiedDate']",
    "[itemprop='datePublished']",
    "[itemprop='dateModified']",
    "time[datetime]"
  ];
  for (const selector of dateSelectors) {
    const elements = [
      ...document.querySelectorAll(selector),
      ...(root ? Array.from(root.querySelectorAll(selector)) : [])
    ];
    for (const element of elements) {
      if (!isVisible(element)) {
        continue;
      }
      const value = cleanText(
        element.getAttribute("datetime") ||
        element.getAttribute("content") ||
        element.innerText ||
        element.textContent ||
        ""
      );
      if (looksLikeDate(value)) {
        return value;
      }
    }
  }
  return "";
}

function firstVisibleText(selectors, root) {
  for (const selector of selectors) {
    const elements = [
      ...document.querySelectorAll(selector),
      ...(root ? Array.from(root.querySelectorAll(selector)) : [])
    ];
    for (const element of elements) {
      if (!isVisible(element)) {
        continue;
      }
      const value = cleanText(element.innerText || element.textContent || "");
      if (value) {
        return value;
      }
    }
  }
  return "";
}

function jsonLdAuthor() {
  const author = jsonLdValue(["author", "creator"]);
  if (Array.isArray(author)) {
    return firstValue(author.map(authorName));
  }
  return authorName(author);
}

function authorName(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return cleanText(value);
  }
  if (typeof value === "object") {
    return cleanText(value.name || value.givenName || "");
  }
  return "";
}

function jsonLdValue(keys) {
  const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || "{}");
      const value = findNestedValue(parsed, keys);
      if (value) {
        return value;
      }
    } catch {
      // Ignore malformed page-provided JSON-LD.
    }
  }
  return "";
}

function findNestedValue(value, keys) {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedValue(item, keys);
      if (found) {
        return found;
      }
    }
    return "";
  }
  if (typeof value !== "object") {
    return "";
  }
  for (const key of keys) {
    if (value[key]) {
      return value[key];
    }
  }
  for (const nested of Object.values(value)) {
    const found = findNestedValue(nested, keys);
    if (found) {
      return found;
    }
  }
  return "";
}

function firstValue(values) {
  for (const value of values) {
    const normalized = typeof value === "string" ? cleanText(value) : value;
    if (normalized) {
      return normalized;
    }
  }
  return "";
}
