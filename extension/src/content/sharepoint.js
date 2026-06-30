// SharePoint detection, content-root selection (scored), and title extraction.
// DOM-bound. This is the specialized path; generic pages use article.js.

import { cleanText, getVisibleText, isVisible } from "./dom-utils.js";

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
  const candidates = ROOT_SELECTORS
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(isUsableRoot);
  if (candidates.length === 0) {
    return document.body;
  }
  return candidates.sort((a, b) => scoreRoot(b) - scoreRoot(a))[0];
}

function isUsableRoot(element) {
  return Boolean(element) && isVisible(element) && getVisibleText(element).length > 80;
}

export function scoreRoot(element) {
  const textLength = getVisibleText(element).length;
  const linkCount = element.querySelectorAll("a").length;
  const headingCount = element.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
  const navPenalty = element.querySelectorAll("nav,[role='navigation'],header,footer").length * 300;
  return textLength + headingCount * 120 - linkCount * 5 - navPenalty;
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
