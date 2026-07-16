import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Collections settings expose one library root, per-collection paths, and sync", async () => {
  const source = await readFile(new URL("../extension/src/options/options.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(source, /Local Collections Library/);
  assert.match(source, /Choose library folder/);
  assert.match(source, /collectionLibraryPath/);
  assert.match(source, /destination=library/);
  assert.match(source, /"Move existing files"/);
  assert.match(source, /"Future syncs only"/);
  assert.match(source, /"Apply change…"/);
  assert.match(source, /library-folder-name/);
  assert.match(source, /moveCollectionLibraryFolder/);
  assert.match(source, /writeCollectionLibraryCatalog/);
  assert.match(css, /\.collection-move-choice\[hidden\]/);
});

test("Capture Collection separates snapshot downloads from local library sync", async () => {
  const html = await readFile(new URL("../extension/src/crawl/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/crawl/crawl.js", import.meta.url), "utf8");
  assert.match(html, /id="destination"/);
  assert.match(html, /value="download">Chrome Downloads/);
  assert.match(html, /value="library">Local library: page files \+ index\.md/);
  assert.match(html, /value="aggregate" selected>Single combined Markdown \(\.md\)/);
  assert.match(source, /selectedCollection\(\)[\s\S]*loadCollectionLibraryHandle\(\)[\s\S]*destinationSelect\.value = "library"/);
  assert.match(source, /Downloads one combined Markdown file through Chrome Downloads; no extraction needed/);
  assert.match(source, /syncCollectionToLibrary/);
  assert.match(source, /collectionId/);
  assert.match(source, /job\.status === "done" && !job\.exported\) await exportJob\(job\)/);
});
