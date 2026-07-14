import { test } from "node:test";
import assert from "node:assert/strict";
import { appendClip, listClips, getClip, clearLog } from "../extension/src/lib/clip-log.js";

// Minimal in-memory fake of the IndexedDB APIs clip-log.js actually uses
// (open/onupgradeneeded, one object store keyed by "id", put/get/delete/clear,
// openCursor). No existing fixture stubs indexedDB in this repo (crawl-state's
// IDB-backed helpers aren't exercised by its tests at all -- indexedDB stays
// undefined under node --test there) so this fake is written fresh, mirroring
// the same "install a fake global, one store per DB name" shape crawl-state's
// tests use for chrome.storage.local.
function installFakeIndexedDB() {
  const databases = new Map();

  class FakeRequest {
    constructor() {
      this.onsuccess = null;
      this.onerror = null;
      this.onupgradeneeded = null;
      this.result = undefined;
      this.error = undefined;
    }
    _succeed(result) {
      this.result = result;
      queueMicrotask(() => this.onsuccess && this.onsuccess());
    }
    _fail(error) {
      this.error = error;
      queueMicrotask(() => this.onerror && this.onerror());
    }
  }

  class FakeObjectStore {
    constructor(db, name) {
      this.db = db;
      this.name = name;
    }
    _map() {
      return this.db._stores.get(this.name);
    }
    put(value) {
      const request = new FakeRequest();
      this._map().set(value.id ?? value.key, value);
      request._succeed(value.id ?? value.key);
      return request;
    }
    get(key) {
      const request = new FakeRequest();
      request._succeed(this._map().get(key));
      return request;
    }
    delete(key) {
      const request = new FakeRequest();
      this._map().delete(key);
      request._succeed(undefined);
      return request;
    }
    clear() {
      const request = new FakeRequest();
      this._map().clear();
      request._succeed(undefined);
      return request;
    }
    openCursor() {
      const request = new FakeRequest();
      const values = Array.from(this._map().values());
      let index = 0;
      queueMicrotask(function advance() {
        if (index < values.length) {
          const value = values[index++];
          request.result = {
            value,
            continue: () => queueMicrotask(advance)
          };
        } else {
          request.result = null;
        }
        request.onsuccess && request.onsuccess();
      });
      return request;
    }
  }

  class FakeTransaction {
    constructor(db, storeNames) {
      this.db = db;
      this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
      this.oncomplete = null;
      this.onerror = null;
      queueMicrotask(() => this.oncomplete && this.oncomplete());
    }
    objectStore(name) {
      return new FakeObjectStore(this.db, name);
    }
  }

  class FakeDatabase {
    constructor(name) {
      this.name = name;
      this.objectStoreNames = {
        _names: new Set(),
        contains(storeName) {
          return this._names.has(storeName);
        }
      };
      this._stores = new Map();
    }
    createObjectStore(name) {
      this.objectStoreNames._names.add(name);
      this._stores.set(name, new Map());
      return new FakeObjectStore(this, name);
    }
    transaction(storeNames) {
      return new FakeTransaction(this, storeNames);
    }
    close() {}
  }

  globalThis.indexedDB = {
    open(name) {
      const request = new FakeRequest();
      queueMicrotask(() => {
        let db = databases.get(name);
        const isNew = !db;
        if (isNew) {
          db = new FakeDatabase(name);
          databases.set(name, db);
        }
        request.result = db;
        if (isNew && request.onupgradeneeded) {
          request.onupgradeneeded();
        }
        request.onsuccess && request.onsuccess();
      });
      return request;
    }
  };

  return databases;
}

installFakeIndexedDB();

test("appendClip stores a record and getClip retrieves it by id", async () => {
  const entry = await appendClip({
    id: "clip-1",
    url: "https://example.com/a",
    title: "A",
    path: "a.md",
    clipped: "2026-07-01T00:00:00.000Z",
    type: "article",
    tags: ["seo"],
    description: "desc",
    byteLength: 123
  });
  assert.equal(entry.id, "clip-1");

  const fetched = await getClip("clip-1");
  assert.equal(fetched.url, "https://example.com/a");
  assert.equal(fetched.byteLength, 123);
  assert.deepEqual(fetched.tags, ["seo"]);

  await clearLog();
});

test("appendClip generates an id when none is supplied", async () => {
  const entry = await appendClip({
    url: "https://example.com/b",
    title: "B",
    path: "b.md",
    clipped: "2026-07-02T00:00:00.000Z",
    type: "article",
    byteLength: 10
  });
  assert.ok(entry.id);
  const fetched = await getClip(entry.id);
  assert.equal(fetched.title, "B");

  await clearLog();
});

test("listClips returns newest-first and supports since/type/limit filters", async () => {
  await appendClip({
    id: "old",
    url: "https://example.com/old",
    title: "Old",
    path: "old.md",
    clipped: "2026-01-01T00:00:00.000Z",
    type: "article",
    byteLength: 1
  });
  await appendClip({
    id: "mid",
    url: "https://example.com/mid",
    title: "Mid",
    path: "mid.md",
    clipped: "2026-03-01T00:00:00.000Z",
    type: "sharepoint",
    byteLength: 1
  });
  await appendClip({
    id: "new",
    url: "https://example.com/new",
    title: "New",
    path: "new.md",
    clipped: "2026-05-01T00:00:00.000Z",
    type: "article",
    byteLength: 1
  });

  const all = await listClips();
  assert.deepEqual(all.map((c) => c.id), ["new", "mid", "old"]);

  const sinceFiltered = await listClips({ since: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(sinceFiltered.map((c) => c.id), ["new", "mid"]);

  const typeFiltered = await listClips({ type: "sharepoint" });
  assert.deepEqual(typeFiltered.map((c) => c.id), ["mid"]);

  const limited = await listClips({ limit: 1 });
  assert.deepEqual(limited.map((c) => c.id), ["new"]);

  await clearLog();
});

test("clearLog empties the store", async () => {
  await appendClip({
    id: "x",
    url: "https://example.com/x",
    title: "X",
    path: "x.md",
    clipped: "2026-06-01T00:00:00.000Z",
    type: "article",
    byteLength: 1
  });
  assert.equal((await listClips()).length, 1);
  await clearLog();
  assert.deepEqual(await listClips(), []);
});
