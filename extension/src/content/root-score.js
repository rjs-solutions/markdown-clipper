// Shared content-root selection heuristic used by every site adapter that
// needs to pick the best candidate element out of several selector matches
// (e.g. SharePoint's canvas vs. Confluence's page body). Single home for this
// logic so adapters can't silently diverge if the heuristic is ever tuned.

import { getVisibleText, isVisible } from "./dom-utils.js";

export function isUsableRoot(element) {
  return Boolean(element) && isVisible(element) && getVisibleText(element).length > 80;
}

export function scoreRoot(element) {
  const textLength = getVisibleText(element).length;
  const linkCount = element.querySelectorAll("a").length;
  const headingCount = element.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
  const navPenalty = element.querySelectorAll("nav,[role='navigation'],header,footer").length * 300;
  return textLength + headingCount * 120 - linkCount * 5 - navPenalty;
}

// Pick the content root with the best text-to-chrome score out of every
// element matched by the given selectors (best-first order doesn't matter;
// scoring decides the winner). Falls back to document.body if nothing usable
// is found.
export function pickBestRoot(selectors) {
  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(isUsableRoot);
  if (candidates.length === 0) {
    return document.body;
  }
  return candidates.sort((a, b) => scoreRoot(b) - scoreRoot(a))[0];
}
