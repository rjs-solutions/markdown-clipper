// Orchestrates a single-page capture. This module is dynamically imported into
// the page (isolated world) by the popup; `collectPage` is the entry point and
// returns a JSON-serializable result.

import { getCurrentScroll, restoreScroll, scrollThroughPage } from "./scroll.js";
import { findSharePointRoot, getSharePointTitle, isSharePoint } from "./sharepoint.js";
import { prepareContent } from "./clean.js";
import { collectMetadata } from "./metadata.js";
import { parseArticle } from "./article.js";
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
    dropHidden: raw.dropHidden !== false
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

  let scrollStats = null;
  if (options.scrollBeforeCapture) {
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

  restoreScroll(startScroll);

  return {
    ok: true,
    title,
    url: location.href,
    mode,
    markdown,
    metadata,
    stats: {
      characters: markdown.length,
      root,
      scroll: scrollStats
    }
  };
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
