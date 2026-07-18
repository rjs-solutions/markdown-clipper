import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createJob,
  saveJob,
  loadJob,
  listJobs,
  deleteJob,
  resumeJob,
  savePageBody,
  getJobBodies,
  getPageBody,
  iterateJobBodies,
  deleteJobBodies
} from "../extension/src/lib/crawl-state.js";

// Minimal in-memory fake of the IndexedDB surface crawl-state.js uses for
// page bodies: open/onupgradeneeded, one object store with a jobId index,
// put/delete/openCursor (store-level and index-level), and cursor.delete().
// `startVersion` lets a test simulate a pre-existing v1 database (store
// present, no index yet) to exercise the v1 -> v2 upgrade path.
function installFakeBodyIndexedDb({ startVersion = 0 } = {}) {
  const records = new Map();
  let currentVersion = startVersion;
  const indexNames = new Set(startVersion >= 2 ? ["jobId"] : []);

  function makeCursorRequest(entries) {
    const request = { result: null, onsuccess: null, onerror: null };
    let index = 0;
    const step = () => {
      request.result = index < entries.length
        ? {
          value: entries[index],
          continue: () => { index += 1; queueMicrotask(step); },
          delete: () => records.delete(entries[index].key)
        }
        : null;
      if (request.onsuccess) {
        request.onsuccess();
      }
    };
    queueMicrotask(step);
    return request;
  }

  function makeStore() {
    const index = { openCursor: () => makeCursorRequest([...records.values()]) };
    return {
      put: (value) => records.set(value.key, value),
      delete: (key) => records.delete(key),
      get: (key) => {
        const request = { result: records.get(key) || null, onsuccess: null, onerror: null };
        queueMicrotask(() => request.onsuccess && request.onsuccess());
        return request;
      },
      openCursor: () => makeCursorRequest([...records.values()]),
      createIndex: (name) => {
        if (indexNames.has(name)) {
          throw new Error(`Index ${name} already exists`);
        }
        indexNames.add(name);
      },
      index: () => index
    };
  }

  function makeTransaction() {
    const store = makeStore();
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
    open(name, version) {
      const upgradeNeeded = version > currentVersion;
      const db = {
        objectStoreNames: { contains: () => currentVersion >= 1 },
        createObjectStore: () => makeStore(),
        transaction: makeTransaction,
        close() {}
      };
      const request = {
        result: db,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        transaction: makeTransaction()
      };
      queueMicrotask(() => {
        if (upgradeNeeded && request.onupgradeneeded) {
          request.onupgradeneeded();
        }
        currentVersion = version;
        request.onsuccess && request.onsuccess();
      });
      return request;
    }
  };
  return records;
}

// Minimal fake of chrome.storage.local supporting every call shape the
// module uses (string key, array of keys, object-with-defaults, undefined).
// No indexedDB global is installed -- deleteJob() must tolerate that (it
// only touches IndexedDB when the global exists, which it does in a real
// browser/service-worker context but not under node --test).
function installFakeChrome() {
  const store = {};
  globalThis.chrome = {
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
    }
  };
  return store;
}

test("createJob seeds a queue of {url, depth: 0} entries and queued status", () => {
  const job = createJob({ seeds: ["https://a.com/1", "https://a.com/2"], options: { maxPages: 10 } });
  assert.equal(job.status, "queued");
  assert.equal(job.options.maxPages, 10);
  assert.deepEqual(job.queue, [
    { url: "https://a.com/1", depth: 0 },
    { url: "https://a.com/2", depth: 0 }
  ]);
  assert.deepEqual(job.visited, []);
  assert.deepEqual(job.results, []);
});

test("save/load/list/delete round-trip a job", async () => {
  installFakeChrome();
  const job = createJob({ seeds: ["https://a.com/1"], options: {} });

  await saveJob(job);
  const loaded = await loadJob(job.id);
  assert.ok(loaded);
  assert.equal(loaded.id, job.id);
  assert.equal(loaded.status, "queued");

  const listed = await listJobs();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, job.id);

  await deleteJob(job.id);
  assert.equal(await loadJob(job.id), null);
  assert.deepEqual(await listJobs(), []);
});

test("listJobs tracks multiple jobs independently", async () => {
  installFakeChrome();
  const jobA = createJob({ seeds: ["https://a.com/1"], options: {} });
  const jobB = createJob({ seeds: ["https://b.com/1"], options: {} });
  await saveJob(jobA);
  await saveJob(jobB);

  const listed = await listJobs();
  assert.equal(listed.length, 2);
  assert.deepEqual(
    listed.map((j) => j.id).sort(),
    [jobA.id, jobB.id].sort()
  );

  await deleteJob(jobA.id);
  const remaining = await listJobs();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, jobB.id);
});

test("a job saved mid-crawl and reloaded resumes with the correct remaining queue and visited set", async () => {
  installFakeChrome();
  const job = createJob({
    seeds: ["https://a.com/1", "https://a.com/2", "https://a.com/3"],
    options: { maxPages: 25 }
  });
  await saveJob(job);

  // Simulate the worker having captured the first seed and persisted after
  // that page: it's off the queue, into visited + results, and the job is
  // mid-run ("running").
  const midCrawl = {
    ...job,
    status: "running",
    queue: [
      { url: "https://a.com/2", depth: 0 },
      { url: "https://a.com/3", depth: 0 }
    ],
    visited: ["https://a.com/1", "https://a.com/2", "https://a.com/3"],
    results: [{ url: "https://a.com/1", title: "Page 1", path: "page-1.md", byteLength: 42 }]
  };
  await saveJob(midCrawl);

  const resumed = await resumeJob(job.id);
  assert.equal(resumed.status, "running");
  assert.deepEqual(resumed.queue, [
    { url: "https://a.com/2", depth: 0 },
    { url: "https://a.com/3", depth: 0 }
  ]);
  assert.deepEqual(resumed.visited, ["https://a.com/1", "https://a.com/2", "https://a.com/3"]);
  assert.equal(resumed.results.length, 1);
});

test("resumeJob flips a paused job back to running without touching its queue", async () => {
  installFakeChrome();
  const job = createJob({ seeds: ["https://a.com/1", "https://a.com/2"], options: {} });
  const paused = {
    ...job,
    status: "paused",
    queue: [{ url: "https://a.com/2", depth: 0 }],
    visited: ["https://a.com/1", "https://a.com/2"],
    results: [{ url: "https://a.com/1", title: "Page 1", path: "page-1.md", byteLength: 10 }]
  };
  await saveJob(paused);

  const resumed = await resumeJob(job.id);
  assert.equal(resumed.status, "running");
  assert.deepEqual(resumed.queue, [{ url: "https://a.com/2", depth: 0 }]);
});

test("resumeJob returns null for a job that already finished", async () => {
  installFakeChrome();
  const job = createJob({ seeds: ["https://a.com/1"], options: {} });
  await saveJob({ ...job, status: "done" });
  assert.equal(await resumeJob(job.id), null);
});

test("resumeJob returns null for a job id that was never saved", async () => {
  installFakeChrome();
  assert.equal(await resumeJob("nonexistent"), null);
});

test("getJobBodies returns only the requested job's pages via the jobId index", async () => {
  installFakeBodyIndexedDb();
  await savePageBody("job-a", { url: "https://a.com/1", title: "A1", markdown: "# A1", metadata: {} });
  await savePageBody("job-a", { url: "https://a.com/2", title: "A2", markdown: "# A2", metadata: {} });
  await savePageBody("job-b", { url: "https://b.com/1", title: "B1", markdown: "# B1", metadata: {} });

  const bodiesA = await getJobBodies("job-a");
  assert.equal(bodiesA.length, 2);
  assert.deepEqual(bodiesA.map((b) => b.url).sort(), ["https://a.com/1", "https://a.com/2"]);

  const bodiesB = await getJobBodies("job-b");
  assert.equal(bodiesB.length, 1);
  assert.equal(bodiesB[0].url, "https://b.com/1");
});

test("iterateJobBodies awaits onPage per record and never accumulates all bodies at once", async () => {
  installFakeBodyIndexedDb();
  await savePageBody("job-a", { url: "https://a.com/1", title: "A1", markdown: "# A1", metadata: {} });
  await savePageBody("job-a", { url: "https://a.com/2", title: "A2", markdown: "# A2", metadata: {} });
  await savePageBody("job-b", { url: "https://b.com/1", title: "B1", markdown: "# B1", metadata: {} });

  const seen = [];
  let maxConcurrentCallbacks = 0;
  let activeCallbacks = 0;
  await iterateJobBodies("job-a", async (page) => {
    activeCallbacks += 1;
    maxConcurrentCallbacks = Math.max(maxConcurrentCallbacks, activeCallbacks);
    seen.push(page.url);
    await Promise.resolve();
    activeCallbacks -= 1;
  });

  assert.deepEqual(seen.sort(), ["https://a.com/1", "https://a.com/2"]);
  assert.equal(maxConcurrentCallbacks, 1, "onPage calls do not overlap -- one page in flight at a time");
});

test("getPageBody returns the matching record for jobId + url", async () => {
  installFakeBodyIndexedDb();
  await savePageBody("job-a", { url: "https://a.com/1", title: "A1", markdown: "# A1", metadata: {} });
  await savePageBody("job-a", { url: "https://a.com/2", title: "A2", markdown: "# A2", metadata: {} });
  await savePageBody("job-b", { url: "https://a.com/1", title: "B1", markdown: "# B1", metadata: {} });

  const body = await getPageBody("job-a", "https://a.com/2");
  assert.equal(body.title, "A2");
  assert.equal(body.jobId, "job-a");
});

test("getPageBody returns null when no record matches jobId + url", async () => {
  installFakeBodyIndexedDb();
  await savePageBody("job-a", { url: "https://a.com/1", title: "A1", markdown: "# A1", metadata: {} });

  assert.equal(await getPageBody("job-a", "https://a.com/missing"), null);
  assert.equal(await getPageBody("job-nonexistent", "https://a.com/1"), null);
});

test("deleteJobBodies removes only the target job's records via cursor.delete()", async () => {
  const records = installFakeBodyIndexedDb();
  await savePageBody("job-a", { url: "https://a.com/1", title: "A1", markdown: "# A1", metadata: {} });
  await savePageBody("job-a", { url: "https://a.com/2", title: "A2", markdown: "# A2", metadata: {} });
  await savePageBody("job-b", { url: "https://b.com/1", title: "B1", markdown: "# B1", metadata: {} });

  await deleteJobBodies("job-a");

  assert.deepEqual(await getJobBodies("job-a"), []);
  const remaining = await getJobBodies("job-b");
  assert.equal(remaining.length, 1);
  assert.equal(records.size, 1, "only job-b's record remains in the store");
});

test("opening an existing v1 database (store present, no jobId index) upgrades cleanly to v2", async () => {
  installFakeBodyIndexedDb({ startVersion: 1 });
  await savePageBody("job-a", { url: "https://a.com/1", title: "A1", markdown: "# A1", metadata: {} });

  const bodies = await getJobBodies("job-a");
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].url, "https://a.com/1");
});
