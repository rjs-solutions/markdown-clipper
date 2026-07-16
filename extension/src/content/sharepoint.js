// SharePoint detection, content-root selection (scored), and title extraction.
// DOM-bound. This is the specialized path; generic pages use article.js.

import { cleanText } from "./dom-utils.js";
import { pickBestRoot } from "./root-score.js";

export function isSharePoint() {
  const host = location.hostname.toLowerCase();
  if (host.endsWith(".sharepoint.com") || host === "sharepoint.com") {
    return true;
  }
  return Boolean(
    document.querySelector("[data-sp-feature-tag], [data-automation-id='Canvas'], #spPageCanvasContent")
  );
}

const ROOT_SELECTORS = [
  "[data-automation-id='Canvas']",
  "[data-sp-feature-tag='PageCanvas']",
  "#spPageCanvasContent",
  ".CanvasComponent",
  "article",
  "main[role='main']",
  "main",
  "[role='main']"
];

// Pick the content root with the best text-to-chrome score.
export function findSharePointRoot() {
  return pickBestRoot(ROOT_SELECTORS);
}

// Weak signal by design: the DOM does not reliably expose semantic page
// types (policy, how-to, etc.), so this only distinguishes a News post from
// a regular Site Page, using the same news automation-ids already relied on
// for author/date metadata.
const NEWS_INDICATOR_SELECTORS = [
  "[data-automation-id='newsAuthor']",
  "[data-automation-id='newsDate']",
  "[data-automation-id='promotedNews']"
];

export function getSharePointPageType() {
  const isNews = NEWS_INDICATOR_SELECTORS.some((selector) => document.querySelector(selector));
  return isNews ? "news" : "page";
}

export function parseSharePointPageContext(source) {
  const text = String(source || "");
  const marker = text.indexOf("spClientSidePageContext");
  if (marker < 0) return null;
  const start = text.indexOf("{", marker);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function getSharePointDescription() {
  for (const script of document.scripts) {
    const context = parseSharePointPageContext(script.textContent);
    const description = cleanText(context && context.item && context.item.Description || "");
    if (description) return description;
  }
  return "";
}

export function getSharePointTitle(root) {
  const selectors = [
    "[data-automation-id='pageTitle']",
    "[data-automation-id='TitleTextId']",
    "h1"
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector) || (root ? root.querySelector(selector) : null);
    const text = element ? cleanText(element.innerText || element.textContent || "") : "";
    if (text) {
      return text;
    }
  }
  const fallback = cleanText(document.title || "SharePoint page");
  return fallback.replace(/\s+-\s+SharePoint\s*$/i, "") || "SharePoint page";
}
