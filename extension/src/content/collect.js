// Orchestrates a single-page capture. This module is dynamically imported into
// the page (isolated world) by the popup; `collectPage` is the entry point and
// returns a JSON-serializable result.

import { getCurrentScroll, restoreScroll, scrollThroughPage } from "./scroll.js";
import { getAdapterById, resolveAdapter } from "./adapters.js";
import { prepareContent } from "./clean.js";
import { collectMetadata } from "./metadata.js";
import { parseArticle } from "./article.js";
import { buildVariables } from "./variables.js";
import { cleanText } from "./dom-utils.js";
import { htmlToMarkdown } from "../lib/markdown.js";

const DEFAULTS = {
  mode: "auto", // auto | article | full | <registered site-adapter id>
  scrollBeforeCapture: true,
  maxScrollMs: 12000,
  scrollPauseMs: 450,
  dropHidden: true
};

// A mode is valid if it is one of the generic modes, or the id of a
// registered, non-generic site adapter (e.g. whatever adapters.js exposes).
function isValidMode(mode) {
  if (mode === "auto" || mode === "article" || mode === "full") {
    return true;
  }
  const adapter = getAdapterById(mode);
  return Boolean(adapter && adapter.id !== "generic");
}

function sanitize(raw) {
  const clampNumber = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, number));
  };
  return {
    mode: isValidMode(raw.mode) ? raw.mode : DEFAULTS.mode,
    scrollBeforeCapture: raw.scrollBeforeCapture !== false,
    maxScrollMs: clampNumber(raw.maxScrollMs, 3000, 45000, DEFAULTS.maxScrollMs),
    scrollPauseMs: clampNumber(raw.scrollPauseMs, 150, 2500, DEFAULTS.scrollPauseMs),
    dropHidden: raw.dropHidden !== false,
    selectors: Array.isArray(raw.selectors) ? raw.selectors.filter((s) => typeof s === "string") : []
  };
}

// A matched site adapter (anything but "generic") always finds a usable root
// (the current site adapter falls back to document.body), so matching is
// equivalent to "found a root" for the adapters that exist today.
function resolveMode(requested, detectedAdapter) {
  if (requested !== "auto") {
    return requested;
  }
  return detectedAdapter && detectedAdapter.id !== "generic" ? detectedAdapter.id : "article";
}

function visibleLength(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function cleanDocumentTitle() {
  return cleanText(document.title || "Untitled page");
}

export async function collectPage(rawOptions = {}) {
  const options = sanitize(rawOptions);
  const detectedAdapter = resolveAdapter();
  const mode = resolveMode(options.mode, detectedAdapter);
  const siteAdapter = getAdapterById(mode);
  const startScroll = getCurrentScroll(siteAdapter ? siteAdapter.scrollTargets : []);
  let captureOverlay = null;

  try {
    let scrollStats = null;
    if (options.scrollBeforeCapture && siteAdapter && siteAdapter.needsScroll) {
      captureOverlay = showCaptureOverlay();
      scrollStats = await scrollThroughPage(options, siteAdapter.scrollTargets);
    }

    let title = "";
    let html = "";
    let root = "document";
    const overrides = {};
    const siteRoot = siteAdapter ? siteAdapter.findRoot() : null;

    if (siteAdapter && siteRoot) {
      title = siteAdapter.getTitle(siteRoot);
      html = prepareContent(siteRoot, {
        baseUrl: document.baseURI,
        dropHidden: options.dropHidden,
        unwantedSelectors: siteAdapter.unwantedSelectors
      });
      root = describe(siteRoot);
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

    const markdown = htmlToMarkdown(html, { baseUrl: document.baseURI });
    const metadata = collectMetadata(document.body, {
      mode,
      overrides,
      selectors: siteAdapter ? siteAdapter.metadataSelectors : undefined
    });
    const extraMetadata = siteAdapter && siteAdapter.extraMetadata ? siteAdapter.extraMetadata() : {};
    Object.assign(metadata, extraMetadata);
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
