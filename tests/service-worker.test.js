import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal in-memory fake of the IndexedDB surface crawl-state.js uses (open,
// one object store, put/delete/openCursor, transaction completion). Real
// browsers and service workers have IndexedDB natively; node --test doesn't,
// so runJob's savePageBody()/getJobBodies() calls need this to avoid
// "indexedDB is not defined" once a page is actually captured.
function installFakeIndexedDb() {
  const records = new Map();

  function makeCursorRequest() {
    const entries = [...records.values()];
    const request = { result: null, onsuccess: null, onerror: null };
    let index = 0;
    const step = () => {
      request.result = index < entries.length
        ? { value: entries[index], continue: () => { index += 1; queueMicrotask(step); } }
        : null;
      if (request.onsuccess) {
        request.onsuccess();
      }
    };
    queueMicrotask(step);
    return request;
  }

  function makeTransaction() {
    const store = {
      put: (value) => records.set(value.key, value),
      delete: (key) => records.delete(key),
      openCursor: makeCursorRequest
    };
    const tx = { objectStore: () => store, _oncomplete: null, _onerror: null };
    Object.defineProperty(tx, "oncomplete", {
      get: () => tx._oncomplete,
      set: (fn) => {
        tx._oncomplete = fn;
        queueMicrotask(() => tx._oncomplete && tx._oncomplete());
      }
    });
    Object.defineProperty(tx, "onerror", {
      get: () => tx._onerror,
      set: (fn) => {
        tx._onerror = fn;
      }
    });
    return tx;
  }

  globalThis.indexedDB = {
    open() {
      const request = { result: { transaction: makeTransaction, close() {} }, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => request.onsuccess && request.onsuccess());
      return request;
    }
  };
}

// Fake enough of the Chrome APIs for the service worker module to load (it
// registers alarms/message/lifecycle listeners at import time) and for a
// real crawlSite() pass to run against a single seed URL. tabs.create is
// the spy: one call per page capture attempt, so "ran exactly once" is
// exactly "createCalls.length === 1".
function installFakeChrome() {
  const store = {};
  const tabUrls = new Map();
  let nextId = 1;
  const createCalls = [];

  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: { addListener() {} },
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} }
    },
    alarms: {
      create() {},
      onAlarm: { addListener() {} }
    },
    storage: {
      local: {
        async get(keys) {
          if (keys === undefined) {
            return { ...store };
          }
          if (typeof keys === "string") {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          if (Array.isArray(keys)) {
            const out = {};
            for (const key of keys) {
              if (key in store) {
                out[key] = store[key];
              }
            }
            return out;
          }
          const out = {};
          for (const key of Object.keys(keys)) {
            out[key] = key in store ? store[key] : keys[key];
          }
          return out;
        },
        async set(values) {
          Object.assign(store, values);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete store[key];
          }
        }
      }
    },
    tabs: {
      onUpdated: { addListener() {}, removeListener() {} },
      async create({ url }) {
        createCalls.push(url);
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
        return [{ result: [] }];
      }
    }
  };

  return { store, createCalls };
}

// Fake enough of chrome.storage.sync + chrome.action + chrome.sidePanel for
// applyActionMode (called at module import time, bottom of
// service-worker.js) to run against a preset defaultAction and record what
// it configured. action.onClicked/contextMenus/storage.onChanged are left
// out: their registrations are individually try/catch-guarded in the module,
// so a missing API there is swallowed rather than thrown.
function installFakeChromeForActionMode(defaultAction) {
  const syncStore = { defaultAction };
  const setPopupCalls = [];
  const setPanelBehaviorCalls = [];
  const setOptionsCalls = [];

  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: { addListener() {} },
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} }
    },
    alarms: {
      create() {},
      onAlarm: { addListener() {} }
    },
    storage: {
      local: {
        async get() {
          return {};
        },
        async set() {},
        async remove() {}
      },
      sync: {
        async get(keys) {
          const out = {};
          for (const key of Object.keys(keys)) {
            out[key] = key in syncStore ? syncStore[key] : keys[key];
          }
          return out;
        }
      }
    },
    action: {
      setPopup: async (opts) => {
        setPopupCalls.push(opts);
      },
      onClicked: { addListener() {} }
    },
    sidePanel: {
      open: async () => {},
      setPanelBehavior: async (opts) => {
        setPanelBehaviorCalls.push(opts);
      },
      setOptions: async (opts) => {
        setOptionsCalls.push(opts);
      }
    },
    tabs: {
      onUpdated: { addListener() {}, removeListener() {} }
    },
    scripting: {
      async executeScript() {
        return [{ result: [] }];
      }
    }
  };

  return { setPopupCalls, setPanelBehaviorCalls, setOptionsCalls };
}

// applyActionMode isn't exported (it's an internal, module-load-time side
// effect -- see the bottom of service-worker.js), so this observes it the
// same way the real extension does: import the module and inspect the
// chrome.* spy calls it made, after letting its async work settle.
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("applyActionMode enables openPanelOnActionClick only when defaultAction is sidepanel", async () => {
  const sidepanelSpies = installFakeChromeForActionMode("sidepanel");
  await import(`../extension/src/background/service-worker.js?case=action-mode-sidepanel`);
  await flushMicrotasks();

  assert.deepEqual(sidepanelSpies.setPopupCalls.at(-1), { popup: "" });
  assert.deepEqual(sidepanelSpies.setPanelBehaviorCalls.at(-1), { openPanelOnActionClick: true });
  assert.deepEqual(sidepanelSpies.setOptionsCalls.at(-1), {
    path: "src/popup/index.html?panel=1",
    enabled: true
  });

  const popupSpies = installFakeChromeForActionMode("popup");
  await import(`../extension/src/background/service-worker.js?case=action-mode-popup`);
  await flushMicrotasks();

  assert.deepEqual(popupSpies.setPopupCalls.at(-1), { popup: "src/popup/index.html" });
  assert.deepEqual(popupSpies.setPanelBehaviorCalls.at(-1), { openPanelOnActionClick: false });
  assert.equal(popupSpies.setOptionsCalls.length, 0);
});

test("runJob claims the job id synchronously: two concurrent calls run the crawl body exactly once", async () => {
  installFakeIndexedDb();
  const { createCalls } = installFakeChrome();

  const { createJob, saveJob, loadJob, getJobBodies } = await import(
    `../extension/src/lib/crawl-state.js?case=concurrency-guard`
  );
  const { runJob, prepareFailedPageRetry } = await import(`../extension/src/background/service-worker.js?case=concurrency-guard`);

  const retry = prepareFailedPageRetry({
    id: "retry-test",
    status: "done",
    results: Array.from({ length: 12 }, (_, index) => ({ url: `https://a.com/${index}` })),
    errors: [
      { url: "https://a.com/12", error: "No current window" },
      { url: "https://a.com/13", error: "No current window" },
      { url: "https://a.com/13", error: "duplicate attempt" }
    ],
    options: { maxPages: 13 },
    log: []
  }, 1234);
  assert.equal(retry.count, 2);
  assert.equal(retry.job.results.length, 12, "successful pages are preserved");
  assert.deepEqual(retry.job.queue.map((entry) => entry.url), ["https://a.com/12", "https://a.com/13"]);
  assert.equal(retry.job.options.maxPages, 14);
  assert.equal(retry.job.errors.length, 0);
  assert.equal(retry.job.exported, false);

  const job = createJob({
    seeds: ["https://a.com/1"],
    options: {
      maxPages: 1,
      followLinks: false,
      sameHostOnly: true,
      settleMs: 0,
      delayMs: 0,
      retries: 0,
      retryDelayMs: 0
    }
  });
  await saveJob({ ...job, status: "running" });

  // Fire both calls before awaiting either one -- this is exactly the shape
  // of the real bug: resumeRunningJobs() can be invoked from several
  // triggers (top-level load, onStartup, onInstalled, crawl:resume-check)
  // in the same tick, each calling runJob(sameId) without waiting on the
  // other's result.
  const first = runJob(job.id);
  const second = runJob(job.id);
  await Promise.all([first, second]);

  assert.equal(createCalls.length, 1, "only one crawlSite pass should have opened a tab for the seed URL");

  const finished = await loadJob(job.id);
  assert.equal(finished.status, "done");
  assert.equal(finished.results.length, 1);
  assert.equal(finished.results[0].markdown, undefined, "persisted job state keeps metadata, not full page bodies");
  const storedBodies = await getJobBodies(job.id);
  assert.equal(storedBodies.length, 1);
  assert.match(storedBodies[0].markdown, /^# /, "the released body remains available in IndexedDB");

  // Guard against the id getting permanently wedged: activeRuns must have
  // been released (via the try/finally in runJob) so the SAME job id can be
  // driven through the loop again once it's back in a runnable state. Hand
  // it one more queued page and confirm runJob actually processes it,
  // rather than just checking it doesn't throw.
  await saveJob({
    ...finished,
    status: "running",
    queue: [{ url: "https://a.com/2", depth: 0 }],
    visited: [...finished.visited, "https://a.com/2"],
    options: { ...finished.options, maxPages: 2 }
  });
  await runJob(job.id);

  assert.equal(createCalls.length, 2, "runJob(id) is not stuck locked out after its first pass completed");
  const secondRun = await loadJob(job.id);
  assert.equal(secondRun.status, "done");
  assert.ok(
    secondRun.results.some((result) => result.url === "https://a.com/2"),
    "the second page was actually captured, not silently skipped"
  );
});
