import { test } from "node:test";
import assert from "node:assert/strict";
import { crawlSite, recommendedCaptureConcurrency } from "../extension/src/lib/crawl.js";

const LINKS = {
  "https://a.com/1": [
    "https://a.com/2",
    "https://a.com/3",
    "https://a.com/4",
    "https://b.com/x"
  ]
};

// Minimal fake of the Chrome APIs the spider touches, so we can exercise the
// queue/dedup/host/limit orchestration without a browser.
function installFakeChrome() {
  const tabUrls = new Map();
  let nextId = 1;
  globalThis.chrome = {
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    tabs: {
      onUpdated: { addListener() {}, removeListener() {} },
      async create({ url }) {
        const id = nextId++;
        tabUrls.set(id, url);
        return { id, url, status: "complete" };
      },
      async get(id) {
        return { id, url: tabUrls.get(id), status: "complete" };
      },
      async remove() {}
    },
    scripting: {
      async executeScript(opts) {
        const url = tabUrls.get(opts.target.tabId);
        if (opts.args) {
          return [{ result: { ok: true, title: `Title ${url}`, url, markdown: `# ${url}`, metadata: {}, variables: {} } }];
        }
        return [{ result: LINKS[url] || [] }];
      }
    }
  };
}

// Like installFakeChrome, but a capture for a given url fails a configurable
// number of times before succeeding, to exercise the retry path. Returns a
// Map of url -> attempt count so tests can assert on it.
function installFakeChromeFlaky(failCounts) {
  const tabUrls = new Map();
  let nextId = 1;
  const attempts = new Map();
  globalThis.chrome = {
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    tabs: {
      onUpdated: { addListener() {}, removeListener() {} },
      async create({ url }) {
        const id = nextId++;
        tabUrls.set(id, url);
        return { id, url, status: "complete" };
      },
      async get(id) {
        return { id, url: tabUrls.get(id), status: "complete" };
      },
      async remove() {}
    },
    scripting: {
      async executeScript(opts) {
        const url = tabUrls.get(opts.target.tabId);
        if (opts.args) {
          const count = (attempts.get(url) || 0) + 1;
          attempts.set(url, count);
          const failTimes = failCounts.get(url) || 0;
          if (count <= failTimes) {
            return [{ result: { ok: false, error: `attempt ${count} failed` } }];
          }
          return [{ result: { ok: true, title: `Title ${url}`, url, markdown: `# ${url}`, metadata: {}, variables: {} } }];
        }
        return [{ result: LINKS[url] || [] }];
      }
    }
  };
  return attempts;
}

test("crawlSite follows same-host links up to maxPages and dedupes", async () => {
  installFakeChrome();
  const pages = await crawlSite({
    seeds: ["https://a.com/1"],
    followLinks: true,
    sameHostOnly: true,
    maxPages: 3,
    settleMs: 0,
    delayMs: 0
  });
  assert.equal(pages.length, 3);
  const urls = pages.map((p) => p.url);
  assert.ok(urls.every((u) => u.startsWith("https://a.com/")), "only same-host pages captured");
  assert.ok(!urls.includes("https://b.com/x"), "cross-host link excluded");
});

test("crawlSite without followLinks captures only the seeds", async () => {
  installFakeChrome();
  const pages = await crawlSite({
    seeds: ["https://a.com/1", "https://a.com/2"],
    followLinks: false,
    maxPages: 25,
    settleMs: 0,
    delayMs: 0
  });
  assert.equal(pages.length, 2);
});

test("capture concurrency stays sequential for SharePoint and conservative elsewhere", () => {
  assert.equal(recommendedCaptureConcurrency({
    urls: ["https://tenant.sharepoint.com/sites/example/SitePages/Home.aspx"],
    requested: 3
  }), 1);
  assert.equal(recommendedCaptureConcurrency({
    urls: ["https://example.com/a", "https://example.com/b"]
  }), 2);
  assert.equal(recommendedCaptureConcurrency({
    urls: ["https://example.com/"],
    collectionType: "sharepoint"
  }), 1);
  assert.equal(recommendedCaptureConcurrency({
    urls: ["https://example.com/"],
    followLinks: true
  }), 1);
});

test("known URL lists are capped at two pages concurrently", async () => {
  installFakeChrome();
  const executeScript = chrome.scripting.executeScript;
  let activeCaptures = 0;
  let peakCaptures = 0;
  chrome.scripting.executeScript = async (options) => {
    if (!options.args) return executeScript(options);
    activeCaptures += 1;
    peakCaptures = Math.max(peakCaptures, activeCaptures);
    await new Promise((resolve) => setTimeout(resolve, 10));
    try {
      return await executeScript(options);
    } finally {
      activeCaptures -= 1;
    }
  };
  const pages = await crawlSite({
    seeds: ["https://a.com/1", "https://a.com/2", "https://a.com/3", "https://a.com/4"],
    followLinks: false,
    concurrency: 3,
    maxPages: 25,
    settleMs: 0,
    delayMs: 0
  });
  assert.equal(pages.length, 4);
  assert.equal(peakCaptures, 2);
});

test("link-discovery crawls remain sequential even when concurrency is requested", async () => {
  installFakeChrome();
  const executeScript = chrome.scripting.executeScript;
  let activeCaptures = 0;
  let peakCaptures = 0;
  chrome.scripting.executeScript = async (options) => {
    if (!options.args) return executeScript(options);
    activeCaptures += 1;
    peakCaptures = Math.max(peakCaptures, activeCaptures);
    await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      return await executeScript(options);
    } finally {
      activeCaptures -= 1;
    }
  };
  await crawlSite({
    seeds: ["https://a.com/1"],
    followLinks: true,
    concurrency: 3,
    maxPages: 3,
    settleMs: 0,
    delayMs: 0
  });
  assert.equal(peakCaptures, 1);
});

test("crawlSite stops when shouldStop returns true", async () => {
  installFakeChrome();
  let calls = 0;
  const pages = await crawlSite({
    seeds: ["https://a.com/1", "https://a.com/2", "https://a.com/3"],
    followLinks: false,
    maxPages: 25,
    settleMs: 0,
    delayMs: 0,
    shouldStop: () => calls++ >= 1
  });
  assert.equal(pages.length, 1);
});

test("maxDepth stops enqueuing links past the limit", async () => {
  installFakeChrome();
  const pages = await crawlSite({
    seeds: ["https://a.com/1"],
    followLinks: true,
    sameHostOnly: true,
    maxDepth: 0,
    maxPages: 25,
    settleMs: 0,
    delayMs: 0
  });
  // The seed is depth 0; its links would be depth 1, past maxDepth: 0.
  assert.equal(pages.length, 1);
  assert.equal(pages[0].url, "https://a.com/1");
});

test("excludePatterns beats includePatterns", async () => {
  installFakeChrome();
  const pages = await crawlSite({
    seeds: ["https://a.com/1"],
    followLinks: true,
    sameHostOnly: true,
    maxPages: 25,
    includePatterns: ["a\\.com"],
    excludePatterns: ["a\\.com/3"],
    settleMs: 0,
    delayMs: 0
  });
  const urls = pages.map((page) => page.url);
  assert.ok(urls.includes("https://a.com/2"));
  assert.ok(!urls.includes("https://a.com/3"), "excluded even though it also matches includePatterns");
});

test("the explicit seed may discover matching descendants without matching includePatterns itself", async () => {
  installFakeChrome();
  const pages = await crawlSite({
    seeds: ["https://a.com/1"],
    followLinks: true,
    sameHostOnly: true,
    maxPages: 25,
    includePatterns: ["/2$"],
    settleMs: 0,
    delayMs: 0
  });
  assert.deepEqual(pages.map((page) => page.url), ["https://a.com/1", "https://a.com/2"]);
});

test("an invalid pattern is reported and ignored instead of crashing the crawl", async () => {
  installFakeChrome();
  const warnings = [];
  const pages = await crawlSite({
    seeds: ["https://a.com/1"],
    followLinks: false,
    maxPages: 25,
    includePatterns: ["["],
    settleMs: 0,
    delayMs: 0,
    onProgress: (event) => {
      if (event.type === "warning") {
        warnings.push(event);
      }
    }
  });
  assert.equal(pages.length, 1, "the invalid pattern is dropped, not treated as an exclusion of everything");
  assert.equal(warnings.length, 1);
});

test("a capture that fails twice then succeeds is retried and recorded once", async () => {
  const attempts = installFakeChromeFlaky(new Map([["https://a.com/1", 2]]));
  const errors = [];
  const pages = await crawlSite({
    seeds: ["https://a.com/1"],
    followLinks: false,
    maxPages: 25,
    retries: 2,
    retryDelayMs: 0,
    settleMs: 0,
    delayMs: 0,
    onProgress: (event) => {
      if (event.type === "error") {
        errors.push(event);
      }
    }
  });
  assert.equal(pages.length, 1);
  assert.equal(errors.length, 0);
  assert.equal(attempts.get("https://a.com/1"), 3);
});

test("a capture that keeps failing past the retry budget is recorded as one error", async () => {
  installFakeChromeFlaky(new Map([["https://a.com/1", 99]]));
  const errors = [];
  const pages = await crawlSite({
    seeds: ["https://a.com/1"],
    followLinks: false,
    maxPages: 25,
    retries: 2,
    retryDelayMs: 0,
    settleMs: 0,
    delayMs: 0,
    onProgress: (event) => {
      if (event.type === "error") {
        errors.push(event);
      }
    }
  });
  assert.equal(pages.length, 0);
  assert.equal(errors.length, 1);
});

test("pausing between pages leaves the remaining queue intact for a resumable job", async () => {
  installFakeChrome();
  let checks = 0;
  let lastPersisted = null;
  const pages = await crawlSite({
    seeds: ["https://a.com/1", "https://a.com/2", "https://a.com/3"],
    followLinks: false,
    maxPages: 25,
    settleMs: 0,
    delayMs: 0,
    onPersist: (state) => {
      lastPersisted = state;
    },
    shouldPause: () => {
      checks += 1;
      return checks > 1;
    }
  });
  assert.equal(pages.length, 1, "only the first page was captured before the pause");
  assert.equal(lastPersisted.queue.length, 2);
  assert.deepEqual(
    lastPersisted.queue.map((entry) => entry.url),
    ["https://a.com/2", "https://a.com/3"]
  );
  assert.ok(lastPersisted.queue.every((entry) => entry.depth === 0));
});
