import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createJob,
  saveJob,
  loadJob,
  listJobs,
  deleteJob,
  resumeJob
} from "../extension/src/lib/crawl-state.js";

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
