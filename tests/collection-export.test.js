import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionExportPreset, matchSavedCollection } from "../extension/src/lib/collection-export.js";
import { collectionsToCsv } from "../extension/src/lib/collection-csv.js";

test("collection presets support inventories, llms.txt, and custom lists", () => {
  const llms = { id: "l", type: "website", sourceMode: "llms", sourceUrl: "https://a.test/llms.txt", webUrl: "https://a.test" };
  assert.equal(collectionExportPreset(llms, { pages: [] }).mode, "llms");
  const custom = { id: "c", type: "custom", sourceMode: "list", urls: ["https://a.test/1"], webUrl: "https://a.test/1" };
  assert.deepEqual(collectionExportPreset(custom, { pages: [] }).urls, ["https://a.test/1"]);
});

test("matchSavedCollection chooses the most specific base", () => {
  const collections = [{ id: "root", webUrl: "https://a.test" }, { id: "docs", webUrl: "https://a.test/docs" }];
  assert.equal(matchSavedCollection(collections, "https://a.test/docs/page").id, "docs");
});

test("matchSavedCollection finds any URL in a custom list", () => {
  const collection = { id: "custom", type: "custom", webUrl: "https://one.example/a", urls: ["https://one.example/a", "https://two.example/b"] };
  const broadSite = { id: "site", type: "website", webUrl: "https://two.example" };
  assert.equal(matchSavedCollection([broadSite, collection], "https://two.example/b#details")?.id, "custom");
});

test("collectionsToCsv exports labels, types, source, and inventory URLs", () => {
  const csv = collectionsToCsv([{ id: "x", name: "Docs, Inc", type: "website", sourceMode: "sitemap", sourceUrl: "https://a.test/sitemap.xml" }], {
    x: { lastRefreshedAt: 1, pages: [{ title: "Home", url: "https://a.test/", modified: "2026-01-01" }] }
  });
  assert.match(csv, /"Docs, Inc",website,sitemap/);
  assert.match(csv, /https:\/\/a\.test\//);
});
