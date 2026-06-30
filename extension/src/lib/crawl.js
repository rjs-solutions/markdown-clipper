// Site spider engine. Opens each page in a background tab, lets it render,
// injects the collector (reusing capture.js), and optionally follows same-host
// links breadth-first. Requires host permissions for the target origins, which
// the UI requests before starting. Sequential by design: gentle and reliable.

import { capturePage } from "./capture.js";
import { comparableUrl, sameHost } from "./discover.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForTabComplete(tabId, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        finish(true);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(() => finish(false), timeoutMs);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab && tab.status === "complete") {
        finish(true);
      }
    }).catch(() => {});
  });
}

async function collectLinks(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => anchor.href)
        .filter((href) => /^https?:\/\//i.test(href))
    });
    return injection && Array.isArray(injection.result) ? injection.result : [];
  } catch {
    return [];
  }
}

async function captureInNewTab(url, captureOptions, { followLinks, settleMs }) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    if (settleMs) {
      await sleep(settleMs);
    }
    const result = await capturePage(tab.id, captureOptions);
    const links = followLinks ? await collectLinks(tab.id) : [];
    return { result, links };
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      // tab may already be gone
    }
  }
}

export async function crawlSite({
  seeds,
  captureOptions = {},
  maxPages = 25,
  followLinks = false,
  sameHostOnly = true,
  settleMs = 600,
  delayMs = 300,
  onProgress = () => {},
  shouldStop = () => false
}) {
  const seen = new Set();
  const queue = [];
  const enqueue = (url) => {
    const key = comparableUrl(url);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    queue.push(url);
  };

  seeds.forEach(enqueue);
  const origin = seeds[0];
  const pages = [];

  while (queue.length && pages.length < maxPages) {
    if (shouldStop()) {
      break;
    }
    const url = queue.shift();
    onProgress({ type: "start", url, count: pages.length });
    try {
      const { result, links } = await captureInNewTab(url, captureOptions, { followLinks, settleMs });
      pages.push({ url, title: result.title, markdown: result.markdown, metadata: result.metadata });
      onProgress({ type: "done", url, title: result.title, count: pages.length });
      if (followLinks) {
        for (const link of links) {
          if (pages.length + queue.length >= maxPages) {
            break;
          }
          if (sameHostOnly && !sameHost(link, origin)) {
            continue;
          }
          enqueue(link);
        }
      }
    } catch (error) {
      onProgress({ type: "error", url, error: error && error.message ? error.message : String(error) });
    }
    if (delayMs) {
      await sleep(delayMs);
    }
  }

  return pages;
}

// Fetch + parse a sitemap (recursing one level into a sitemap index). Needs
// host permission for the sitemap origin. Caps the number of pages returned.
export async function fetchSitemapPages(startUrl, { maxPages = 200, parse }) {
  const pages = [];
  const queue = [startUrl];
  const seenSitemaps = new Set();
  while (queue.length && pages.length < maxPages) {
    const sitemapUrl = queue.shift();
    if (seenSitemaps.has(sitemapUrl)) {
      continue;
    }
    seenSitemaps.add(sitemapUrl);
    let xml;
    try {
      const response = await fetch(sitemapUrl);
      xml = await response.text();
    } catch {
      continue;
    }
    const { pages: found, sitemaps } = parse(xml);
    for (const page of found) {
      if (pages.length >= maxPages) {
        break;
      }
      pages.push(page);
    }
    for (const nested of sitemaps) {
      if (!seenSitemaps.has(nested)) {
        queue.push(nested);
      }
    }
  }
  return pages;
}
