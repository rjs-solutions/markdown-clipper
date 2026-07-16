import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("popup exposes a direct Collections settings shortcut", async () => {
  const html = await readFile(new URL("../extension/src/popup/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/popup/popup.js", import.meta.url), "utf8");
  assert.match(html, /id="open-collections"[^>]*title="Manage collections"/);
  assert.match(source, /src\/options\/index\.html\?section=collections/);
});

test("collection export exposes saved collections, imports, and llms.txt", async () => {
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
