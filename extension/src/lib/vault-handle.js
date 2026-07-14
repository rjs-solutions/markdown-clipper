// Persistence + permission handling for the vault's FileSystemDirectoryHandle.
// The handle itself is structured-cloneable, so it lives in its own IndexedDB
// store (chrome.storage can only hold JSON-serializable values). Mirrors the
// IDB helper style in crawl-state.js / clip-log.js.

const DB_NAME = "markdown-clip-vault";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const HANDLE_KEY = "directory";

function openHandleDb() {
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

export async function saveHandle(handle) {
  const db = await openHandleDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ key: HANDLE_KEY, handle });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadHandle() {
  const db = await openHandleDb();
  try {
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    return record ? record.handle : null;
  } finally {
    db.close();
  }
}

export async function clearHandle() {
  const db = await openHandleDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function hasVault() {
  return Boolean(await loadHandle());
}

// { interactive: true } triggers requestPermission(), which REQUIRES an active
// user gesture -- only pass it from inside a click handler.
export async function ensurePermission(handle, { interactive = false } = {}) {
  if (!handle) {
    return "denied";
  }
  let state = await handle.queryPermission({ mode: "readwrite" });
  if (state !== "granted" && interactive) {
    state = await handle.requestPermission({ mode: "readwrite" });
  }
  return state;
}
