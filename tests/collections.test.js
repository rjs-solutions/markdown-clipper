import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyCollectionUrl,
  createCollectionFromUrl,
  createCustomCollection,
  loadCollections
} from "../extension/src/lib/collections.js";

test("classifyCollectionUrl identifies SharePoint, Confluence Cloud, and general sites", () => {
  assert.equal(classifyCollectionUrl("https://contoso.sharepoint.com/sites/Docs").type, "sharepoint");
  assert.equal(classifyCollectionUrl("https://team.atlassian.net/wiki/spaces/ENG").type, "confluence");
  assert.equal(classifyCollectionUrl("https://example.com/docs").type, "website");
});

test("createCollectionFromUrl keeps SharePoint API details and a platform-neutral model", () => {
  const result = createCollectionFromUrl("https://contoso.sharepoint.com/sites/Docs");
  assert.equal(result.ok, true);
  assert.equal(result.collection.type, "sharepoint");
  assert.match(result.collection.apiBase, /\/_api$/);
  assert.equal(result.collection.sourceMode, "sharepoint");
});

test("createCustomCollection deduplicates imported URLs", () => {
  const collection = createCustomCollection("Launch list", ["https://a.test/", "https://a.test/", "nope"]);
  assert.equal(collection.type, "custom");
  assert.deepEqual(collection.urls, ["https://a.test/"]);
});

test("loadCollections migrates legacy SharePoint sites once", async () => {
  const writes = [];
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { storage: { sync: {
    async get() { return { savedCollections: null, sharepointSites: [{ id: "old", name: "Docs", webUrl: "https://contoso.sharepoint.com/sites/Docs", apiBase: "https://contoso.sharepoint.com/sites/Docs/_api" }] }; },
    async set(value) { writes.push(value); }
  } } };
  try {
    const collections = await loadCollections();
    assert.equal(collections[0].type, "sharepoint");
    assert.equal(writes[0].savedCollections.version, 1);
  } finally {
    globalThis.chrome = previousChrome;
  }
});
