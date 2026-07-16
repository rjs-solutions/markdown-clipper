import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Collections settings expose one library root, per-collection paths, and sync", async () => {
  const source = await readFile(new URL("../extension/src/options/options.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(source, /Local Collections Library/);
  assert.match(source, /Choose a library folder/);
  assert.match(source, /configureQuietIconButton\(regrantLibraryButton, "Restore write access to this folder"/);
  assert.match(source, /configureQuietIconButton\(syncAllLibraryButton, "Sync all collections to this folder"/);
  assert.match(source, /configureQuietIconButton\(forgetLibraryButton, "Forget this library folder/);
  assert.match(source, /collectionLibraryPath/);
  assert.match(source, /destination=library/);
  assert.match(source, /"Move existing files"/);
  assert.match(source, /"Future syncs only"/);
  assert.match(source, /"Move files…"/);
  assert.match(source, /Stored in \$\{location\}/);
  assert.match(source, /Downloaded snapshots remain in Chrome Downloads/);
  assert.match(source, /refreshStorageLocation/);
  assert.match(source, /library-folder-button/);
  assert.match(source, /moveCollectionLibraryFolder/);
  assert.match(source, /writeCollectionLibraryCatalog/);
  assert.match(css, /\.collection-move-choice\[hidden\]/);
  assert.match(css, /\.collection-library-inline-actions\s*\{[^}]*margin-left:\s*auto;/s);
  assert.match(css, /\.quiet-icon-button\s*\{[^}]*width:\s*26px;[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s);
  assert.match(css, /\.collection-storage-badge/);
  assert.match(css, /\.collection-storage-status\.is-stored/);
  assert.doesNotMatch(source, /collection-library-buttons/);
});

test("Capture Collection separates snapshot downloads from local library sync", async () => {
  const html = await readFile(new URL("../extension/src/crawl/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/crawl/crawl.js", import.meta.url), "utf8");
  assert.match(html, /id="destination"/);
  assert.match(html, /value="download">Chrome Downloads/);
  assert.match(html, /value="library">Local library: page files \+ index\.md/);
  assert.match(html, /value="aggregate" selected>Single combined Markdown \(\.md\)/);
  assert.match(html, /id="download-format-field"/);
  assert.match(html, /id="library-format-field"[^>]*hidden>[\s\S]*Markdown page files \+ index\.md/);
  assert.match(source, /selectedCollection\(\)[\s\S]*loadCollectionLibraryHandle\(\)[\s\S]*destinationSelect\.value = "library"/);
  assert.match(source, /downloadFormatField\.hidden = library/);
  assert.match(source, /libraryFormatField\.hidden = !library/);
  assert.match(source, /Choose Chrome Downloads to select a combined Markdown or ZIP format/);
  assert.match(source, /Downloads one combined Markdown file through Chrome Downloads; no extraction needed/);
  assert.match(source, /syncCollectionToLibrary/);
  assert.match(source, /collectionId/);
  assert.match(source, /job\.status === "done" && !job\.exported\) await exportJob\(job\)/);
});
