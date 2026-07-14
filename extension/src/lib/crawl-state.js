// Durable crawl-job state, split across two stores on purpose:
//
//   - chrome.storage.local holds the job DOCUMENT: status, seeds, options,
//     the {url, depth} queue, the visited set, error log, stats, and
//     lightweight per-page RESULT METADATA (url, title, path, byteLength).
//   - IndexedDB (same chrome-extension:// origin, shared by the service
//     worker and every extension page) holds the captured page BODIES
//     (title/markdown/metadata), keyed by job id + url.
//
// Why split: chrome.storage.local has a modest default quota (a few MB,
// no "unlimitedStorage" permission requested here) and a single-item size
// cap. A crawl of a few hundred SharePoint pages worth of Markdown would
// blow past both if the bodies lived in the job document. Keeping the job
// document metadata-only means it stays tiny (a few KB even for a
// thousand-page crawl) and survives service-worker restarts cheaply, while
// the bulk content streams into IndexedDB as each page is captured ("write
// pages out as you go" rather than buffering them in memory/storage until
// the end).

const JOB_PREFIX = "crawl-job:";
const JOB_INDEX_KEY = "crawl-job-index";
const DB_NAME = "markdown-clip-crawl";
const DB_VERSION = 1;
const STORE_NAME = "page-bodies";

function jobKey(id) {
  return `${JOB_PREFIX}${id}`;
}

function generateId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// seeds: string[]; options: { captureOptions, maxPages, maxDepth, followLinks,
// sameHostOnly, includePatterns, excludePatterns, retries, retryDelayMs,
// settleMs, delayMs, outputMode }.
export function createJob({ seeds, options = {} }) {
  const now = Date.now();
  return {
    id: generateId(),
    status: "queued", // queued | running | paused | done | failed | cancelled
    seeds,
    options,
    queue: seeds.map((url) => ({ url, depth: 0 })),
    visited: [],
    results: [],
    errors: [],
    log: [],
    exported: false,
    startedAt: now,
    updatedAt: now,
    stats: { captured: 0, failed: 0 }
  };
}

async function updateIndex(id, remove = false) {
  const stored = await chrome.storage.local.get(JOB_INDEX_KEY);
  const index = stored[JOB_INDEX_KEY] || [];
  const next = remove ? index.filter((existing) => existing !== id) : [...new Set([...index, id])];
  await chrome.storage.local.set({ [JOB_INDEX_KEY]: next });
}

export async function saveJob(job) {
  const updated = { ...job, updatedAt: Date.now() };
  await chrome.storage.local.set({ [jobKey(job.id)]: updated });
  await updateIndex(job.id);
  return updated;
}

export async function loadJob(id) {
  const stored = await chrome.storage.local.get(jobKey(id));
  return stored[jobKey(id)] || null;
}

export async function listJobs() {
  const stored = await chrome.storage.local.get(JOB_INDEX_KEY);
  const index = stored[JOB_INDEX_KEY] || [];
  if (!index.length) {
    return [];
  }
  const keys = index.map(jobKey);
  const all = await chrome.storage.local.get(keys);
  return index.map((id) => all[jobKey(id)]).filter(Boolean);
}

export async function deleteJob(id) {
  await chrome.storage.local.remove(jobKey(id));
  await updateIndex(id, true);
  if (typeof indexedDB !== "undefined") {
    await deleteJobBodies(id);
  }
}

// Hand back a job ready to re-enter the crawl loop: a "paused" job flips to
// "running" (the caller is about to resume it); a job already "running" or
// "queued" (e.g. a service worker restart interrupted it without anyone
// pausing it) is returned as-is so its persisted queue/visited/results keep
// driving the loop. Anything "done"/"cancelled"/"failed" has nothing left to
// resume.
export async function resumeJob(id) {
  const job = await loadJob(id);
  if (!job) {
    return null;
  }
  if (job.status === "paused") {
    return { ...job, status: "running" };
  }
  if (job.status === "running" || job.status === "queued") {
    return job;
  }
  return null;
}

// ---- Page bodies (IndexedDB) --------------------------------------------

function openBodyDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// page: { url, title, markdown, metadata }
export async function savePageBody(jobId, page) {
  const db = await openBodyDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ key: `${jobId}:${page.url}`, jobId, ...page });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getJobBodies(jobId) {
  const db = await openBodyDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const results = [];
      const request = tx.objectStore(STORE_NAME).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (cursor.value.jobId === jobId) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteJobBodies(jobId) {
  const bodies = await getJobBodies(jobId);
  if (!bodies.length) {
    return;
  }
  const db = await openBodyDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const body of bodies) {
        store.delete(body.key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
