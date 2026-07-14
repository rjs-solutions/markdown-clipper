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
