// Scroll the page (or its main scroll region) to the bottom so lazy-loaded
// sections render before capture. SharePoint modern pages virtualize content;
// this gives them a chance to materialize. DOM-bound.

import { describeElement, sleep } from "./dom-utils.js";

export function findScrollTarget() {
  const documentScroller = document.scrollingElement || document.documentElement;
  const candidates = [
    documentScroller,
    ...document.querySelectorAll(
      [
        "[data-automation-id='contentScrollRegion']",
        "[data-automation-id='pageScrollRegion']",
        "[role='main']",
        "main"
      ].join(",")
    )
  ];

  return candidates
    .filter(Boolean)
    .filter((element) => getScrollHeight(element) > getViewportHeight(element) + 150)
    .sort((a, b) => getScrollHeight(b) - getScrollHeight(a))[0] || documentScroller;
}

export function getCurrentScroll() {
  const target = findScrollTarget();
  return {
    target,
    top: getScrollTop(target),
    windowX: window.scrollX,
    windowY: window.scrollY
  };
}

export function restoreScroll(position) {
  if (!position) {
    return;
  }
  scrollToPosition(position.target, position.top);
  window.scrollTo(position.windowX, position.windowY);
}

export async function scrollThroughPage(options) {
  const target = findScrollTarget();
  const start = Date.now();
  let steps = 0;
  let stablePasses = 0;
  let lastHeight = getScrollHeight(target);

  while (Date.now() - start < options.maxScrollMs) {
    scrollToPosition(target, getScrollHeight(target));
    steps += 1;
    await sleep(options.scrollPauseMs);

    const nextHeight = getScrollHeight(target);
    const atBottom = getScrollTop(target) + getViewportHeight(target) >= nextHeight - 8;

    if (Math.abs(nextHeight - lastHeight) < 8 && atBottom) {
      stablePasses += 1;
    } else {
      stablePasses = 0;
    }

    lastHeight = nextHeight;
    if (stablePasses >= 3) {
      break;
    }
  }

  return {
    durationMs: Date.now() - start,
    height: lastHeight,
    steps,
    target: describeElement(target)
  };
}

function isDocumentScroller(target) {
  return target === document.body ||
    target === document.documentElement ||
    target === document.scrollingElement;
}

function getScrollHeight(target) {
  if (isDocumentScroller(target)) {
    return Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0,
      target.scrollHeight || 0
    );
  }
  return target.scrollHeight || 0;
}

function getViewportHeight(target) {
  return isDocumentScroller(target) ? window.innerHeight : target.clientHeight;
}

function getScrollTop(target) {
  return isDocumentScroller(target) ? window.scrollY : target.scrollTop;
}

function scrollToPosition(target, top) {
  if (isDocumentScroller(target)) {
    window.scrollTo({ top, left: window.scrollX, behavior: "auto" });
    return;
  }
  target.scrollTo({ top, left: 0, behavior: "auto" });
}
