// Site spider engine. Opens each page in a background tab, lets it render,
// injects the collector (reusing capture.js), and optionally follows same-host
// links breadth-first. Requires host permissions for the target origins, which
// the UI requests before starting. Sequential by design: gentle and reliable.
//
// Resumability: the caller (extension/src/background/service-worker.js) may
// pass in an already-in-progress queue/visited/results/errors (loaded from a
// persisted job) and an onPersist callback invoked after every page so the
// job document can be checkpointed. shouldPause is checked between pages
// (before the next url is dequeued) so a paused crawl leaves its queue
// untouched and resumable.

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

async function captureWithRetry(url, captureOptions, opts, retries, retryDelayMs) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await captureInNewTab(url, captureOptions, opts);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }
  }
  throw lastError;
}

// Compile string patterns to RegExp, dropping (and reporting) any that don't
// parse instead of letting a typo crash the whole crawl.
function compilePatterns(patterns = []) {
  const valid = [];
  const invalid = [];
  for (const pattern of patterns) {
    if (!pattern) {
      continue;
    }
    try {
      valid.push(new RegExp(pattern));
    } catch {
      invalid.push(pattern);
    }
  }
  return { valid, invalid };
}

function matchesAny(url, patterns) {
  return patterns.some((re) => re.test(url));
}

export async function crawlSite({
  seeds,
  captureOptions = {},
  maxPages = 25,
  maxDepth = Infinity,
  followLinks = false,
  sameHostOnly = true,
  includePatterns = [],
  excludePatterns = [],
  retries = 2,
  retryDelayMs = 500,
  settleMs = 600,
  delayMs = 300,
  queue: initialQueue = null,
  visited: initialVisited = null,
  results: initialResults = null,
  errors: initialErrors = null,
  onProgress = () => {},
  onPersist = null,
  shouldPause = () => false,
  shouldStop = () => false
}) {
  const { valid: includeRe, invalid: invalidIncludes } = compilePatterns(includePatterns);
  const { valid: excludeRe, invalid: invalidExcludes } = compilePatterns(excludePatterns);
  for (const pattern of [...invalidIncludes, ...invalidExcludes]) {
    onProgress({ type: "warning", message: `Ignoring invalid pattern: ${pattern}` });
  }

  const seen = new Set(initialVisited || []);
  const queue = initialQueue ? [...initialQueue] : [];
  const errors = initialErrors ? [...initialErrors] : [];
  const pages = initialResults ? [...initialResults] : [];

  const enqueue = (url, depth) => {
    const key = comparableUrl(url);
    if (seen.has(key)) {
      return;
    }
    if (depth > maxDepth) {
      return;
    }
    if (excludeRe.length && matchesAny(url, excludeRe)) {
      return;
    }
    if (includeRe.length && !matchesAny(url, includeRe)) {
      return;
    }
    seen.add(key);
    queue.push({ url, depth });
  };

  if (!initialQueue) {
    seeds.forEach((url) => enqueue(url, 0));
  }
  const origin = seeds[0];

  const persist = async () => {
    if (onPersist) {
      await onPersist({ queue, visited: [...seen], results: pages, errors });
    }
  };

  while (queue.length && pages.length < maxPages) {
    if (shouldStop()) {
      break;
    }
    if (await shouldPause()) {
      await persist();
      break;
    }
    const { url, depth } = queue.shift();
    onProgress({ type: "start", url, count: pages.length });
    try {
      const { result, links } = await captureWithRetry(
        url,
        captureOptions,
        { followLinks, settleMs },
        retries,
        retryDelayMs
      );
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
          enqueue(link, depth + 1);
        }
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      errors.push({ url, error: message });
      onProgress({ type: "error", url, error: message });
    }
    await persist();
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
