// Unit tests for the inline prompt generator now rendered in the Options >
// Knowledge base panel (extension/src/options/options.js,
// renderPromptGeneratorControl). It replaced the standalone
// src/prompt/index.html page, which opened in its own tab via
// chrome.tabs.create -- see options.js for the migration notes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { appendClip, clearLog } from "../extension/src/lib/clip-log.js";

// Same minimal in-memory IndexedDB fake used by tests/clip-log.test.js,
// duplicated here (not exported there) so this file can seed the clip log
// directly. Mirrors the same "install a fake global" shape.
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

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://example.com/options.html"
  });
  globalThis.window = dom.window;
  globalThis.Event = dom.window.Event;
  globalThis.document = dom.window.document;
  globalThis.chrome = {
    storage: {
      sync: {
        get: async (defaults) => defaults
      }
    }
  };
  return dom;
}

async function loadModule() {
  installDom();
  return import(`../extension/src/options/options.js?case=${Math.random()}`);
}

function flushMicrotasks(times = 20) {
  let chain = Promise.resolve();
  for (let i = 0; i < times; i++) {
    chain = chain.then(() => Promise.resolve());
  }
  return chain;
}

test("empty vault: shows the empty state and disables Generate/Copy without throwing", async () => {
  await clearLog();
  const { renderPromptGeneratorControl } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);

  renderPromptGeneratorControl(panel);
  await flushMicrotasks();

  const emptyState = panel.querySelector(".prompt-empty-state");
  assert.ok(emptyState, "expected an empty-state element");
  assert.equal(emptyState.hidden, false);
  assert.equal(emptyState.textContent, "No clips yet. Clip some pages, then generate a prompt.");

  const buttons = panel.querySelectorAll(".prompt-buttons button");
  const [generateButton, copyButton] = buttons;
  assert.equal(generateButton.disabled, true);
  assert.equal(copyButton.disabled, true);
});

test("non-empty vault: content-type filter is derived dynamically from the clips' real types", async () => {
  await clearLog();
  await appendClip({
    id: "clip-a",
    url: "https://a.example.com/x",
    title: "A",
    path: "a.md",
    clipped: "2026-07-01T00:00:00.000Z",
    type: "sharepoint",
    tags: []
  });
  await appendClip({
    id: "clip-b",
    url: "https://b.example.com/y",
    title: "B",
    path: "b.md",
    clipped: "2026-07-02T00:00:00.000Z",
    type: "tweet",
    tags: []
  });
  await appendClip({
    id: "clip-c",
    url: "https://c.example.com/z",
    title: "C",
    path: "c.md",
    clipped: "2026-07-03T00:00:00.000Z",
    type: "sharepoint",
    tags: []
  });

  const { renderPromptGeneratorControl } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);

  renderPromptGeneratorControl(panel);
  await flushMicrotasks();

  const typeSelect = panel.querySelector("#prompt-type-filter");
  const values = Array.from(typeSelect.options).map((opt) => opt.value);
  assert.deepEqual(values, ["", "sharepoint", "tweet"], "All types option plus the distinct real types, deduped");

  const summary = panel.querySelector(".prompt-summary");
  assert.match(summary.textContent, /3 items included/);

  const output = panel.querySelector("#prompt-output");
  assert.match(output.value, /SCOPE: All saved clips/);
  assert.match(output.value, /SOURCE FOLDER: Not configured/);
  assert.match(output.value, /ask the user to attach the files or grant access/i);
});

test("non-empty vault: Generate re-runs with the selected filters and Copy writes to the clipboard", async () => {
  await clearLog();
  await appendClip({
    id: "clip-x",
    url: "https://x.example.com/1",
    title: "Sharepoint doc",
    path: "x.md",
    clipped: "2026-07-01T00:00:00.000Z",
    type: "sharepoint",
    tags: []
  });
  await appendClip({
    id: "clip-y",
    url: "https://y.example.com/2",
    title: "Article",
    path: "y.md",
    clipped: "2026-07-02T00:00:00.000Z",
    type: "article",
    tags: []
  });

  const { renderPromptGeneratorControl } = await loadModule();

  let copiedText = null;
  navigator.clipboard = { writeText: (text) => Promise.resolve((copiedText = text)) };

  const panel = document.createElement("section");
  document.body.append(panel);

  renderPromptGeneratorControl(panel);
  await flushMicrotasks();

  const typeSelect = panel.querySelector("#prompt-type-filter");
  typeSelect.value = "sharepoint";
  const [generateButton, copyButton] = panel.querySelectorAll(".prompt-buttons button");

  generateButton.click();
  await flushMicrotasks();

  const summary = panel.querySelector(".prompt-summary");
  assert.match(summary.textContent, /1 item included/);
  const output = panel.querySelector("#prompt-output");
  assert.ok(output.value.includes("Sharepoint doc"));
  assert.equal(output.value.includes("Article"), false);
  assert.equal(copyButton.disabled, false);

  copyButton.click();
  await flushMicrotasks();
  assert.equal(copiedText, output.value);
});

test("the generator's controls never register as schema controls (Save button stays hidden)", async () => {
  await clearLog();
  await appendClip({
    id: "clip-z",
    url: "https://z.example.com/1",
    title: "Z",
    path: "z.md",
    clipped: "2026-07-01T00:00:00.000Z",
    type: "article",
    tags: []
  });

  const { createOptionsForm, renderPromptGeneratorControl } = await loadModule();
  const { SETTINGS_SCHEMA } = await import("../extension/src/lib/settings-schema.js");

  const form = document.createElement("form");
  const navElement = document.createElement("nav");
  const panelsElement = document.createElement("div");
  form.append(panelsElement);
  document.body.append(navElement, form);

  const { controls } = createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });
  const knowledgeBasePanel = panelsElement.querySelector('[data-section="knowledgeBase"]');
  renderPromptGeneratorControl(knowledgeBasePanel);
  await flushMicrotasks();

  assert.equal(controls.has("prompt-task"), false);
  assert.equal(controls.has("prompt-type-filter"), false);
  assert.equal(controls.has("prompt-scope"), false);

  const generateButton = knowledgeBasePanel.querySelector(".prompt-buttons button");
  assert.equal(generateButton.getAttribute("type"), "button");
  const copyButton = knowledgeBasePanel.querySelectorAll(".prompt-buttons button")[1];
  assert.equal(copyButton.getAttribute("type"), "button");

  let submitted = false;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitted = true;
  });
  generateButton.click();
  await flushMicrotasks();
  assert.equal(submitted, false, "clicking Generate must not submit the options form");
});
