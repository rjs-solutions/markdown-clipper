import { test } from "node:test";
import assert from "node:assert/strict";
import { exportCollectionDefinitions, mergeCollectionDefinitions, parseCollectionDefinitions } from "../extension/src/lib/collection-backup.js";

test("collection definitions round-trip URLs, types, discovery, and library paths", () => {
  const source = [{ id: "docs", name: "Docs", type: "website", webUrl: "https://example.test/docs", sourceMode: "llms", libraryPath: "Knowledge/Docs", urls: [] }];
  const parsed = parseCollectionDefinitions(exportCollectionDefinitions(source, { exportedAt: "2026-01-01T00:00:00.000Z" }));
  assert.equal(parsed[0].sourceMode, "llms");
  assert.equal(parsed[0].libraryPath, "Knowledge/Docs");
});

test("collection definition import updates matching sources and adds new ones", () => {
  const existing = [{ id: "old", name: "Old", type: "website", webUrl: "https://example.test/docs" }];
  const imported = [
    { id: "other", name: "New name", type: "website", webUrl: "https://example.test/docs" },
    { id: "two", name: "Two", type: "custom", urls: ["https://two.test/"] }
  ];
  const result = mergeCollectionDefinitions(existing, imported);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.collections[0].id, "old");
  assert.equal(result.collections[0].name, "New name");
});

test("collection definition parser rejects unrelated JSON", () => {
  assert.throws(() => parseCollectionDefinitions('{"collections":[]}'), /not a supported/);
});
