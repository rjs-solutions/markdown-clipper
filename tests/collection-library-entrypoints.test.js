import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Collections settings expose one library root, per-collection paths, and sync", async () => {
  const source = await readFile(new URL("../extension/src/options/options.js", import.meta.url), "utf8");
  assert.match(source, /Local Collections Library/);
  assert.match(source, /Choose library folder/);
  assert.match(source, /collectionLibraryPath/);
  assert.match(source, /destination=library/);
});

test("Capture Collection separates snapshot downloads from local library sync", async () => {
  const html = await readFile(new URL("../extension/src/crawl/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/crawl/crawl.js", import.meta.url), "utf8");
  assert.match(html, /id="destination"/);
  assert.match(html, /value="download">Download snapshot/);
  assert.match(html, /value="library">Local Collections Library/);
  assert.match(source, /syncCollectionToLibrary/);
  assert.match(source, /collectionId/);
  assert.match(source, /job\.status === "done" && !job\.exported\) await exportJob\(job\)/);
});
