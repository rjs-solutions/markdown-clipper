// Site spider engine. Opens each page in a background tab, lets it render,
// injects the collector (reusing capture.js), and optionally follows same-host
// links breadth-first. Requires host permissions for the target origins, which
// the UI requests before starting. Known URL lists may use a small concurrent
// batch; discovery crawls remain sequential so newly found links stay ordered.
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

function isSharePointUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase().endsWith(".sharepoint.com");
  } catch {
    return false;
  }
}

// Rendered SharePoint pages are unusually memory-heavy. Keep them sequential
// and use only a small amount of parallelism for ordinary, already-known URL
// lists. Link-discovery crawls must remain sequential for deterministic queue
// expansion regardless of platform.
export function recommendedCaptureConcurrency({
  urls = [],
  followLinks = false,
  collectionType = "",
  requested = null
} = {}) {
  const safeMaximum = followLinks || collectionType === "sharepoint" || urls.some(isSharePointUrl) ? 1 : 2;
  const requestedCount = requested == null
    ? safeMaximum
    : Math.max(1, Math.floor(Number(requested)) || 1);
  return Math.min(safeMaximum, requestedCount);
}

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

async function normalWindowId() {
  if (!chrome.windows?.getAll) return null;
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const target = windows.find((window) => window.focused) || windows[0];
  return target?.id ?? null;
}

async function captureInNewTab(url, captureOptions, { followLinks, settleMs }) {
  const windowId = await normalWindowId();
  if (chrome.windows?.getAll && windowId == null) {
    throw new Error("No normal Chrome window is available. Open a browser window and retry.");
  }
  const tab = await chrome.tabs.create({
    url,
    active: false,
    ...(windowId == null ? {} : { windowId })
  });
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
  concurrency = 1,
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

  const enqueue = (url, depth, { isSeed = false } = {}) => {
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
    // A crawl's explicit start page is the discovery entry point, even when
    // it does not match the include filter. The filter applies to links found
    // from that page; otherwise a useful pattern such as /SitePages/ would
    // reject a SharePoint site home before it could discover any pages.
    if (!isSeed && includeRe.length && !matchesAny(url, includeRe)) {
      return;
    }
    seen.add(key);
    queue.push({ url, depth });
  };

  if (!initialQueue) {
    seeds.forEach((url) => enqueue(url, 0, { isSeed: true }));
  }
  const origin = seeds[0];

  const persist = async () => {
    if (onPersist) {
      await onPersist({ queue, visited: [...seen], results: pages, errors });
    }
  };

  // Apply the safety cap here as well as in the UI so jobs saved by an older
  // extension version cannot resume with unsafe parallelism after an update.
  const batchSize = recommendedCaptureConcurrency({
    urls: seeds,
    followLinks,
    requested: concurrency
  });

  while (queue.length && pages.length < maxPages) {
    if (shouldStop()) {
      break;
    }
    if (await shouldPause()) {
      await persist();
      break;
    }
    const remainingCapacity = maxPages - pages.length;
    const batch = queue.splice(0, Math.min(batchSize, remainingCapacity));
    for (const { url } of batch) onProgress({ type: "start", url, count: pages.length });
    const captures = await Promise.all(batch.map(async ({ url, depth }) => {
      try {
        const capture = await captureWithRetry(
          url,
          captureOptions,
          { followLinks, settleMs },
          retries,
          retryDelayMs
        );
        return { url, depth, capture };
      } catch (error) {
        return { url, depth, error };
      }
    }));
    for (const { url, depth, capture, error } of captures) {
      if (error) {
        const message = error && error.message ? error.message : String(error);
        errors.push({ url, error: message });
        onProgress({ type: "error", url, error: message });
        continue;
      }
      const { result, links } = capture;
      pages.push({ url, title: result.title, markdown: result.markdown, metadata: result.metadata });
      onProgress({ type: "done", url, title: result.title, count: pages.length });
      if (followLinks) {
        for (const link of links) {
          if (pages.length + queue.length >= maxPages) break;
          if (sameHostOnly && !sameHost(link, origin)) continue;
          enqueue(link, depth + 1);
        }
      }
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
