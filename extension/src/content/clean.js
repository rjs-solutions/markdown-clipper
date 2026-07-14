// Produce a clean HTML string from a content root: drop hidden/chrome/script
// nodes and rewrite link/image URLs to absolute. The result is handed to
// Turndown. DOM-bound.

import { isVisible } from "./dom-utils.js";

const UNWANTED_TAGS = [
  "script", "style", "noscript", "template", "svg", "canvas",
  "iframe", "object", "embed", "button", "input", "select", "textarea"
];

const GENERIC_UNWANTED_SELECTORS = [
  "[data-mwc-capture-overlay]",
  "[aria-hidden='true']",
  "[role='navigation']",
  "[role='banner']",
  "[role='search']",
  "nav", "header", "footer"
];

const OMIT_ATTR = "data-mwc-omit";

// Clone `root`, strip unwanted nodes, absolutize URLs, and return inner HTML.
// Visibility is computed on the live tree (detached clones can't be measured),
// then marked nodes are removed from the clone; the live markers are cleaned up.
// `unwantedSelectors` are extra, site-specific chrome selectors supplied by
// the active site adapter; they are merged with the generic set above.
export function prepareContent(root, { baseUrl = document.baseURI, dropHidden = true, unwantedSelectors = [] } = {}) {
  if (!root) {
    return "";
  }
  const marked = [];
  if (dropHidden) {
    for (const element of root.querySelectorAll("*")) {
      if (!isVisible(element)) {
        element.setAttribute(OMIT_ATTR, "");
        marked.push(element);
      }
    }
  }

  const clone = root.cloneNode(true);
  try {
    clone.querySelectorAll(`[${OMIT_ATTR}]`).forEach((node) => node.remove());
    clone.querySelectorAll(UNWANTED_TAGS.join(",")).forEach((node) => node.remove());
    const siteSelectors = [...GENERIC_UNWANTED_SELECTORS, ...unwantedSelectors];
    clone.querySelectorAll(siteSelectors.join(",")).forEach((node) => node.remove());
    absolutizeUrls(clone, baseUrl);
  } finally {
    for (const element of marked) {
      element.removeAttribute(OMIT_ATTR);
    }
  }
  return clone.innerHTML;
}

function absolutizeUrls(container, baseUrl) {
  for (const anchor of container.querySelectorAll("a[href]")) {
    const abs = toAbsolute(anchor.getAttribute("href"), baseUrl);
    if (abs) {
      anchor.setAttribute("href", abs);
    } else {
      anchor.removeAttribute("href");
    }
  }
  for (const img of container.querySelectorAll("img")) {
    const raw = img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      firstSrcsetCandidate(img.getAttribute("srcset"));
    const abs = toAbsolute(raw, baseUrl);
    if (abs) {
      img.setAttribute("src", abs);
      img.removeAttribute("srcset");
    } else {
      img.remove();
    }
  }
}

function firstSrcsetCandidate(srcset) {
  if (!srcset) {
    return "";
  }
  const first = String(srcset).split(",")[0].trim();
  return first.split(/\s+/)[0] || "";
}

// Resolve a URL to absolute. Keeps already-schemed URLs (http, mailto, tel,
// data, ...), drops `javascript:` and bare fragments, resolves relatives.
export function toAbsolute(value, baseUrl) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("#")) {
    return "";
  }
  if (/^javascript:/i.test(raw)) {
    return "";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return raw;
  }
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return "";
  }
}
