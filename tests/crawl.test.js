import { test } from "node:test";
import assert from "node:assert/strict";
import { crawlSite } from "../extension/src/lib/crawl.js";

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
