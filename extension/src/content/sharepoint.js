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
