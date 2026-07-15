// Confluence detection (Cloud + Server/Data Center), content-root selection
// (scored), and title extraction. DOM-bound. Mirrors sharepoint.js.

import { cleanText } from "./dom-utils.js";
import { pickBestRoot } from "./root-score.js";

// High-confidence signals only. #main-content alone is far too common a
// selector on the open web to be trusted as a Confluence signal, so it is
// deliberately never checked here in isolation (see findConfluenceRoot for
// where it is used, as one of several scored root candidates instead).
export function isConfluence() {
  const host = location.hostname.toLowerCase();
  if (host.endsWith(".atlassian.net") && location.pathname.startsWith("/wiki")) {
    return true;
  }
  if (document.querySelector("meta[name^='confluence-']")) {
    return true;
  }
  if (document.querySelector("#com-atlassian-confluence")) {
    return true;
  }
  return false;
}

const ROOT_SELECTORS = [
  "#main-content",
  ".wiki-content",
  "[data-testid='page-content']",
  "#content .view",
  ".ak-renderer-document"
];

// Pick the content root with the best text-to-chrome score.
export function findConfluenceRoot() {
  return pickBestRoot(ROOT_SELECTORS);
}

// Extract the Confluence space key from the URL shape, falling back to a
// meta tag or a space link in the page chrome. Returns "" when none found;
// callers must treat that as "unknown", never fabricate a value.
export function getConfluenceSpace() {
  const path = location.pathname;
  const cloudMatch = path.match(/\/wiki\/spaces\/([^/]+)/);
  if (cloudMatch) {
    return cloudMatch[1];
  }
  const serverMatch = path.match(/\/(?:display|spaces)\/([^/]+)/);
  if (serverMatch) {
    return serverMatch[1];
  }
  const meta = document.querySelector("meta[name='confluence-space-key']");
  const metaValue = meta ? cleanText(meta.getAttribute("content") || "") : "";
  if (metaValue) {
    return metaValue;
  }
  const chromeSelectors = ["#breadcrumbs a[href*='/spaces/']", "#breadcrumbs a[href*='/display/']", ".aui-nav a[href*='/spaces/']", ".aui-nav a[href*='/display/']"];
  for (const selector of chromeSelectors) {
    const anchor = document.querySelector(selector);
    if (!anchor) {
      continue;
    }
    const href = anchor.getAttribute("href") || "";
    const match = href.match(/\/(?:spaces|display)\/([^/?#]+)/);
    if (match) {
      return match[1];
    }
  }
  return "";
}

export function getConfluenceTitle(root) {
  const selectors = [
    "#title-text",
    "[data-testid='title-text']",
    "h1#title-text",
    ".pagetitle"
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector) || (root ? root.querySelector(selector) : null);
    const text = element ? cleanText(element.innerText || element.textContent || "") : "";
    if (text) {
      return text;
    }
  }
  const heading = root ? root.querySelector("h1") : null;
  const headingText = heading ? cleanText(heading.innerText || heading.textContent || "") : "";
  if (headingText) {
    return headingText;
  }
  const fallback = cleanText(document.title || "Confluence page");
  return fallback.replace(/\s+-\s+Confluence\s*$/i, "").replace(/\s+-\s+[^-]+$/i, "") || "Confluence page";
}
