// Durable clip-history log, kept in its own IndexedDB store. Mirrors the IDB
// helper style in crawl-state.js (open/onupgradeneeded, one short-lived
// transaction per call, db.close() in a finally). Every clip the extension
// saves (via vault or downloads) gets a record here so later features
// (index.md generation, the prompt generator) can build off it without
// re-reading disk.

import { comparableUrl } from "./discover.js";

const DB_NAME = "markdown-clip-log";
const DB_VERSION = 1;
const STORE_NAME = "clips";

function generateId() {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function openLogDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// record: { id?, url, title, path, clipped, type, tags?: string[], description?, byteLength }
// `clipped` is an ISO string the caller supplies (this module never calls
// Date.now()/new Date() itself, so callers stay in control of the timestamp).
export async function appendClip(record) {
  const entry = {
    tags: [],
    description: "",
    ...record,
    id: record.id || generateId()
  };
  const db = await openLogDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return entry;
}

// Newest-first. Optional filters: since (ISO string, inclusive), type, limit.
export async function listClips({ since, type, limit } = {}) {
  const db = await openLogDb();
  let all;
  try {
    all = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const results = [];
      const request = tx.objectStore(STORE_NAME).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push(cursor.value);
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

  let filtered = all;
  if (since) {
    const sinceTime = new Date(since).getTime();
    filtered = filtered.filter((clip) => new Date(clip.clipped).getTime() >= sinceTime);
  }
  if (type) {
    filtered = filtered.filter((clip) => clip.type === type);
  }
  filtered.sort((a, b) => new Date(b.clipped).getTime() - new Date(a.clipped).getTime());
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

// Most recent record whose URL normalizes the same as `url` (comparableUrl --
// the same normalization the crawler's dedupe uses, e.g. it strips the
// fragment so "…/page#section" matches an existing "…/page" clip). Returns
// null when nothing matches, so callers can fall back to a plain new clip.
export async function findClipByUrl(url) {
  const target = comparableUrl(url);
  const all = await listClips();
  return all.find((clip) => comparableUrl(clip.url) === target) || null;
}

// Merge `patch` into the existing record with this id (keeping its id) and
// save. Used to refresh a clip in place on re-clip -- title/tags/description
// /byteLength/updatedAt change, while the original id, path, and clipped date
// stay unless explicitly overridden in the patch.
export async function updateClip(id, patch) {
  const existing = await getClip(id);
  if (!existing) {
    throw new Error(`No clip found with id ${id}`);
  }
  const merged = { ...existing, ...patch, id: existing.id };
  const db = await openLogDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(merged);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return merged;
}

export async function getClip(id) {
  const db = await openLogDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function clearLog() {
  const db = await openLogDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
