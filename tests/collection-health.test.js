import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCollectionHealth, saveCollectionHealth } from "../extension/src/lib/collection-health.js";

test("collection health stores successful and failed page checks locally", async () => {
  let state = {};
  const previous = globalThis.chrome;
  globalThis.chrome = { storage: { local: {
    async get(defaults) { return { ...defaults, ...state }; },
    async set(value) { state = { ...state, ...value }; }
  } } };
  try {
    await saveCollectionHealth("docs", { results: [{ url: "https://a.test", title: "A" }], errors: [{ url: "https://b.test", error: "404" }], checkedAt: 10 });
    const health = await loadCollectionHealth("docs");
    assert.equal(health.checkedAt, 10);
    assert.equal(health.pages[0].status, "ok");
    assert.deepEqual(health.pages[1], { url: "https://b.test", title: "", status: "error", error: "404" });
  } finally {
    globalThis.chrome = previous;
  }
});
