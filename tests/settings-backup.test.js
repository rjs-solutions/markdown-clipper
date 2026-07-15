// Unit tests for extension/src/lib/settings-backup.js: export/import
// round-tripping settings + tag rules through one JSON-shaped object, and
// defensive rejection of malformed backups.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../extension/src/lib/settings.js";

// Minimal fake of chrome.storage.sync, mirroring the pattern used for
// chrome.storage.local in tests/crawl-state.test.js and tests/panel-host.test.js.
function installFakeChrome() {
  const store = {};
  globalThis.chrome = {
    storage: {
      sync: {
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
        }
      }
    }
  };
  return store;
}

async function loadModule() {
  installFakeChrome();
  return import(`../extension/src/lib/settings-backup.js?case=${Math.random()}`);
}

test("exportSettings bundles settings and tag rules with a version", async () => {
  const { exportSettings } = await loadModule();
  const rule = { id: "rule-1", scope: "domain", pattern: "example.com", isRegex: false, tags: ["work"] };
  await chrome.storage.sync.set({ tagRules: [rule], mode: "full" });

  const backup = await exportSettings();

  assert.equal(typeof backup.version, "number");
  assert.equal(backup.settings.mode, "full");
  assert.deepEqual(backup.tagRules, [rule]);
});

test("importSettings round-trips exportSettings' own output", async () => {
  const { exportSettings, importSettings } = await loadModule();
  await chrome.storage.sync.set({
    tagRules: [{ id: "rule-1", scope: "url", pattern: "docs", isRegex: false, tags: ["reference"] }],
    mode: "sharepoint",
    metadataStyle: "list"
  });

  const backup = await exportSettings();
  await chrome.storage.sync.set({ mode: "auto", metadataStyle: "frontmatter", tagRules: [] });
  await importSettings(backup);

  const restored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  assert.equal(restored.mode, "sharepoint");
  assert.equal(restored.metadataStyle, "list");
  const rulesAfter = await chrome.storage.sync.get({ tagRules: [] });
  assert.deepEqual(rulesAfter.tagRules, [{ id: "rule-1", scope: "url", pattern: "docs", isRegex: false, tags: ["reference"] }]);
});

test("importSettings defaults tagRules to [] when the backup omits them", async () => {
  const { importSettings } = await loadModule();
  await chrome.storage.sync.set({ tagRules: [{ id: "old", scope: "domain", pattern: "x", isRegex: false, tags: [] }] });

  await importSettings({ version: 1, settings: { mode: "article" } });

  const rules = await chrome.storage.sync.get({ tagRules: [] });
  assert.deepEqual(rules.tagRules, []);
});

test("importSettings rejects a non-object backup", async () => {
  const { importSettings } = await loadModule();
  await assert.rejects(() => importSettings(null), /doesn't look like/);
  await assert.rejects(() => importSettings([1, 2, 3]), /doesn't look like/);
  await assert.rejects(() => importSettings("not an object"), /doesn't look like/);
});

test("importSettings rejects a backup missing a settings object", async () => {
  const { importSettings } = await loadModule();
  await assert.rejects(() => importSettings({ version: 1 }), /missing settings/);
  await assert.rejects(() => importSettings({ version: 1, settings: [] }), /missing settings/);
});

test("importSettings ignores unknown top-level keys", async () => {
  const { importSettings } = await loadModule();
  await importSettings({ version: 1, settings: { mode: "full" }, futureThing: "whatever" });
  const restored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  assert.equal(restored.mode, "full");
});
