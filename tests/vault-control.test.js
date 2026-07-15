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

test("turning vaultEnabled on with no folder yet prompts, and a successful pick shows the control", async () => {
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
  let dependentsRun = 0;
  let dirtyRuns = 0;
  wireVaultToggle(vaultEnabled, vaultControl, {
    updateDependents: () => {
      dependentsRun += 1;
    },
    refreshDirty: () => {
      dirtyRuns += 1;
    }
  });

  assert.equal(vaultControl.hasHandle(), false);

  vaultEnabled.checked = true;
  vaultEnabled.dispatchEvent(new Event("change"));
  await flushMicrotasks();

  assert.equal(promptCalls, 1, "the picker opens as soon as the toggle turns on with no folder");
  assert.equal(vaultEnabled.checked, true, "a successful pick keeps the toggle on");
  assert.equal(vaultControl.element.hidden, false, "the folder control shows after a successful pick");
  assert.equal(dependentsRun, 0, "no revert happened, so updateDependents was never called by the coupling");
  assert.equal(dirtyRuns, 0);
});

test("cancelling the picker (AbortError) reverts the toggle to off and hides the control", async () => {
  await clearHandle();
  const { renderVaultControl, wireVaultToggle } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);
  const vaultControl = renderVaultControl(panel);
  await flushMicrotasks();

  window.showDirectoryPicker = async () => {
    const error = new Error("The user aborted a request.");
    error.name = "AbortError";
    throw error;
  };

  const vaultEnabled = makeVaultEnabledCheckbox();
  let dependentsRun = 0;
  let dirtyRuns = 0;
  wireVaultToggle(vaultEnabled, vaultControl, {
    updateDependents: () => {
      dependentsRun += 1;
    },
    refreshDirty: () => {
      dirtyRuns += 1;
    }
  });

  vaultEnabled.checked = true;
  vaultEnabled.dispatchEvent(new Event("change"));
  await flushMicrotasks();

  assert.equal(vaultEnabled.checked, false, "cancelling the picker reverts the toggle back off");
  assert.equal(vaultControl.element.hidden, true, "the folder control stays hidden after a cancel");
  assert.equal(dependentsRun, 1, "updateDependents runs once so the frontmatter toggle re-disables");
  assert.equal(dirtyRuns, 1, "the dirty-state check re-runs after the programmatic revert");
});

test("turning vaultEnabled on with an existing handle just shows the control, no re-prompt", async () => {
  await clearHandle();
  const { renderVaultControl, wireVaultToggle } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);
  const vaultControl = renderVaultControl(panel);

  let promptCalls = 0;
  window.showDirectoryPicker = async () => {
    promptCalls += 1;
    return { name: "notes", kind: "directory", queryPermission: async () => "granted" };
  };

  // Pick a folder once up front so a handle already exists.
  await vaultControl.promptForFolder();
  await flushMicrotasks();
  assert.equal(vaultControl.hasHandle(), true);
  promptCalls = 0;

  const vaultEnabled = makeVaultEnabledCheckbox();
  wireVaultToggle(vaultEnabled, vaultControl, { updateDependents: () => {}, refreshDirty: () => {} });

  vaultEnabled.checked = true;
  vaultEnabled.dispatchEvent(new Event("change"));
  await flushMicrotasks();

  assert.equal(promptCalls, 0, "an existing handle means the picker never re-opens");
  assert.equal(vaultEnabled.checked, true);
  assert.equal(vaultControl.element.hidden, false);
});

test("forgetting the folder while vaultEnabled is on turns the toggle off and hides the control", async () => {
  await clearHandle();
  const { renderVaultControl, wireVaultToggle } = await loadModule();
  const panel = document.createElement("section");
  document.body.append(panel);

  // Wires renderVaultControl's onForgotten to the coupling's revertToggleOff,
  // exactly like initialize() does (the coupling object is created after the
  // control, so onForgotten closes over a `let` assigned afterward).
  let coupling;
  const vaultControl = renderVaultControl(panel, {
    onForgotten: () => coupling.revertToggleOff()
  });

  window.showDirectoryPicker = async () => ({
    name: "notes",
    kind: "directory",
    queryPermission: async () => "granted"
  });
  await vaultControl.promptForFolder();
  await flushMicrotasks();

  const vaultEnabled = makeVaultEnabledCheckbox();
  vaultEnabled.checked = true;
  let dependentsRun = 0;
  let dirtyRuns = 0;
  coupling = wireVaultToggle(vaultEnabled, vaultControl, {
    updateDependents: () => {
      dependentsRun += 1;
    },
    refreshDirty: () => {
      dirtyRuns += 1;
    }
  });
  vaultControl.setVisible(true);

  const forgetButton = Array.from(panel.querySelectorAll(".vault-buttons button")).find(
    (button) => button.textContent === "Forget folder"
  );
  assert.ok(forgetButton);
  forgetButton.click();
  await flushMicrotasks();

  assert.equal(vaultEnabled.checked, false, "the toggle turns off once its folder is forgotten");
  assert.equal(vaultControl.element.hidden, true);
  assert.equal(dependentsRun, 1);
  assert.equal(dirtyRuns, 1);
});
