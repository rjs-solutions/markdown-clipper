import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("collection management is contextual instead of duplicating the popup Settings action", async () => {
  const html = await readFile(new URL("../extension/src/popup/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/popup/popup.js", import.meta.url), "utf8");
  const captureHtml = await readFile(new URL("../extension/src/crawl/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /id="open-collections"/);
  assert.doesNotMatch(source, /collectionsButton/);
  assert.match(captureHtml, /<header class="app-header">[\s\S]*id="manage-collections"[^>]*title="Manage collections"/);
  assert.match(source, /src\/options\/index\.html\?section=collections/);
});

test("collection capture exposes saved collections, file intake, and llms.txt", async () => {
  const html = await readFile(new URL("../extension/src/crawl/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/crawl/crawl.js", import.meta.url), "utf8");
  assert.match(html, /id="saved-collection"/);
  assert.match(html, /id="manage-collections"[^>]*title="Manage collections"/);
  assert.match(html, /id="url-file"[^>]*accept="[^"]*\.xlsx/);
  assert.match(html, /value="llms"/);
  assert.match(source, /loadCollections/);
  assert.match(source, /loadSiteInventories/);
  assert.match(source, /collectionExportPreset/);
  assert.match(source, /readCollectionFile/);
});
