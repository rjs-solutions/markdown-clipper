// Orchestrates a single-page capture. This module is dynamically imported into
// the page (isolated world) by the popup; `collectPage` is the entry point and
// returns a JSON-serializable result.

import { getCurrentScroll, restoreScroll, scrollThroughPage } from "./scroll.js";
import { findSharePointRoot, getSharePointTitle, isSharePoint } from "./sharepoint.js";
import { prepareContent } from "./clean.js";
import { collectMetadata } from "./metadata.js";
import { parseArticle } from "./article.js";
import { buildVariables } from "./variables.js";
import { cleanText } from "./dom-utils.js";
import { htmlToMarkdown } from "../lib/markdown.js";

const DEFAULTS = {
  mode: "auto", // auto | sharepoint | article | full
  scrollBeforeCapture: true,
  maxScrollMs: 12000,
  scrollPauseMs: 450,
  dropHidden: true
};

function sanitize(raw) {
  const clampNumber = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, number));
  };
  return {
    mode: ["auto", "sharepoint", "article", "full"].includes(raw.mode) ? raw.mode : DEFAULTS.mode,
    scrollBeforeCapture: raw.scrollBeforeCapture !== false,
    maxScrollMs: clampNumber(raw.maxScrollMs, 3000, 45000, DEFAULTS.maxScrollMs),
    scrollPauseMs: clampNumber(raw.scrollPauseMs, 150, 2500, DEFAULTS.scrollPauseMs),
    dropHidden: raw.dropHidden !== false,
    selectors: Array.isArray(raw.selectors) ? raw.selectors.filter((s) => typeof s === "string") : []
  };
}

function resolveMode(requested) {
  if (requested !== "auto") {
    return requested;
  }
  return isSharePoint() ? "sharepoint" : "article";
}

function visibleLength(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function cleanDocumentTitle() {
  return cleanText(document.title || "Untitled page");
}

export async function collectPage(rawOptions = {}) {
  const options = sanitize(rawOptions);
  const mode = resolveMode(options.mode);
  const startScroll = getCurrentScroll();
  let captureOverlay = null;

  try {
    let scrollStats = null;
    if (options.scrollBeforeCapture && mode === "sharepoint") {
      captureOverlay = showCaptureOverlay();
      scrollStats = await scrollThroughPage(options);
    }

    let title = "";
    let html = "";
    let root = "document";
    const overrides = {};

    if (mode === "sharepoint") {
      const element = findSharePointRoot();
      title = getSharePointTitle(element);
      html = prepareContent(element, { baseUrl: document.baseURI, dropHidden: options.dropHidden });
      root = describe(element);
    } else if (mode === "article") {
      const article = parseArticle();
      if (article && visibleLength(article.content) > 200) {
        title = article.title || cleanDocumentTitle();
        html = article.content;
        overrides.author = article.byline;
        overrides.description = article.excerpt;
        root = "readability";
      } else {
        title = cleanDocumentTitle();
        html = prepareContent(document.body, { baseUrl: document.baseURI, dropHidden: options.dropHidden });
        root = "body (article fallback)";
      }
    } else {
      title = cleanDocumentTitle();
      html = prepareContent(document.body, { baseUrl: document.baseURI, dropHidden: options.dropHidden });
      root = "body";
    }

    const markdown = htmlToMarkdown(html);
    const metadata = collectMetadata(document.body, { mode, overrides });
    metadata.title = title;
    metadata.url = location.href;

    const variables = buildVariables(metadata, { content: markdown, selectors: options.selectors });

    return {
      ok: true,
      title,
      url: location.href,
      mode,
      markdown,
      metadata,
      variables,
      stats: {
        characters: markdown.length,
        root,
        scroll: scrollStats
      }
    };
  } finally {
    restoreScroll(startScroll);
    captureOverlay?.remove();
  }
}

function showCaptureOverlay() {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-mwc-capture-overlay", "");
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.textContent = "Markdown Clipper is loading the complete SharePoint page…";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "grid",
    placeItems: "center",
    padding: "32px",
    background: "rgba(15, 23, 42, 0.92)",
    color: "#f8fafc",
    font: "600 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    textAlign: "center",
    cursor: "wait"
  });
  (document.body || document.documentElement).appendChild(overlay);
  return overlay;
}

function describe(element) {
  if (!element || !element.tagName) {
    return "document";
  }
  const parts = [element.tagName.toLowerCase()];
  if (element.id) {
    parts.push(`#${element.id}`);
  }
  return parts.join("");
}
