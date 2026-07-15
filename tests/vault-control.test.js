// Unit tests for the vaultEnabled <-> vault folder picker coupling in
// extension/src/options/options.js (renderVaultControl + wireVaultToggle).
// Uses the same fake IndexedDB fixture as tests/clip-log.test.js /
// prompt-generator-inline.test.js so renderVaultControl's real loadHandle/
// saveHandle/clearHandle (vault-handle.js) run against an in-memory store,
// with window.showDirectoryPicker mocked per test to simulate pick/cancel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { clearHandle } from "../extension/src/lib/vault-handle.js";

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
    delete(key) {
      const request = new FakeRequest();
      this._map().delete(key);
      request._succeed(undefined);
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

// A checkbox that stands in for the schema-driven vaultEnabled control
// (createOptionsForm registers change listeners and updateDependents the
// same way regardless of which field triggered them, so a bare checkbox
// with the same id/behavior is an accurate stand-in for these tests).
function makeVaultEnabledCheckbox() {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  document.body.append(checkbox);
  return checkbox;
}

test("the vault control starts hidden and setVisible shows/hides it", async () => {
  await clearHandle();
  const { renderVaultControl } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);

  const vaultControl = renderVaultControl(panel);
  await flushMicrotasks();

  assert.equal(vaultControl.element.hidden, true);
  vaultControl.setVisible(true);
  assert.equal(vaultControl.element.hidden, false);
  vaultControl.setVisible(false);
  assert.equal(vaultControl.element.hidden, true);
});

test("turning vaultEnabled on just shows the control, with no folder chosen yet", async () => {
  await clearHandle();
  const { renderVaultControl, wireVaultToggle } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);
  const vaultControl = renderVaultControl(panel);
  await flushMicrotasks();

  let promptCalls = 0;
  window.showDirectoryPicker = async () => {
    promptCalls += 1;
    return { name: "notes", kind: "directory", queryPermission: async () => "granted" };
  };

  const vaultEnabled = makeVaultEnabledCheckbox();
  wireVaultToggle(vaultEnabled, vaultControl);

  vaultEnabled.checked = true;
  vaultEnabled.dispatchEvent(new Event("change"));
  await flushMicrotasks();

  assert.equal(promptCalls, 0, "turning the toggle on never opens the picker itself");
  assert.equal(vaultEnabled.checked, true);
  assert.equal(vaultControl.element.hidden, false, "the folder control shows as soon as the toggle turns on");
  assert.match(
    vaultControl.element.querySelector(".vault-status").textContent,
    /No folder chosen yet/,
    "the status line makes the Downloads fallback clear until a folder is chosen"
  );
});

test("turning vaultEnabled off hides the control without touching the stored folder", async () => {
  await clearHandle();
  const { renderVaultControl, wireVaultToggle } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);
  const vaultControl = renderVaultControl(panel);
  await flushMicrotasks();

  const vaultEnabled = makeVaultEnabledCheckbox();
  wireVaultToggle(vaultEnabled, vaultControl);

  vaultEnabled.checked = true;
  vaultEnabled.dispatchEvent(new Event("change"));
  await flushMicrotasks();
  assert.equal(vaultControl.element.hidden, false);

  vaultEnabled.checked = false;
  vaultEnabled.dispatchEvent(new Event("change"));
  await flushMicrotasks();
  assert.equal(vaultControl.element.hidden, true);
});

test("the Choose folder button opens the picker and a successful pick updates the status", async () => {
  await clearHandle();
  const { renderVaultControl, wireVaultToggle } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);
  const vaultControl = renderVaultControl(panel);
  await flushMicrotasks();

  let promptCalls = 0;
  window.showDirectoryPicker = async () => {
    promptCalls += 1;
    return { name: "notes", kind: "directory", queryPermission: async () => "granted" };
  };

  const vaultEnabled = makeVaultEnabledCheckbox();
  wireVaultToggle(vaultEnabled, vaultControl);
  vaultEnabled.checked = true;
  vaultEnabled.dispatchEvent(new Event("change"));
  await flushMicrotasks();

  const chooseButton = Array.from(panel.querySelectorAll(".vault-buttons button")).find(
    (button) => button.textContent === "Choose folder"
  );
  assert.ok(chooseButton);
  chooseButton.click();
  await flushMicrotasks();

  assert.equal(promptCalls, 1);
  assert.match(vaultControl.element.querySelector(".vault-status").textContent, /notes/);
  assert.equal(vaultEnabled.checked, true, "picking a folder never touches the toggle");
});

test("forgetting the folder while vaultEnabled is on leaves the toggle on and returns to the no-folder status", async () => {
  await clearHandle();
  const { renderVaultControl, wireVaultToggle } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);
  const vaultControl = renderVaultControl(panel);

  window.showDirectoryPicker = async () => ({
    name: "notes",
    kind: "directory",
    queryPermission: async () => "granted"
  });
  await vaultControl.promptForFolder();
  await flushMicrotasks();

  const vaultEnabled = makeVaultEnabledCheckbox();
  vaultEnabled.checked = true;
  wireVaultToggle(vaultEnabled, vaultControl);
  vaultControl.setVisible(true);

  const forgetButton = Array.from(panel.querySelectorAll(".vault-buttons button")).find(
    (button) => button.textContent === "Forget folder"
  );
  assert.ok(forgetButton);
  forgetButton.click();
  await flushMicrotasks();

  assert.equal(vaultEnabled.checked, true, "forgetting the folder does not touch the toggle");
  assert.equal(vaultControl.element.hidden, false, "the control stays visible, just with no folder chosen");
  assert.match(vaultControl.element.querySelector(".vault-status").textContent, /No folder chosen yet/);
});
