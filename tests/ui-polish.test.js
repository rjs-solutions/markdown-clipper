import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("popup header centers icons and orders Export before Manage before Options", async () => {
  const html = await readFile(new URL("../extension/src/popup/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/popup/styles.css", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="do-export"') < html.indexOf('id="open-collections"'));
  assert.ok(html.indexOf('id="open-collections"') < html.indexOf('id="open-options"'));
  assert.match(css, /\.icon-button\s*\{[^}]*padding:\s*0;/s);
  assert.match(css, /\.icon-button svg\s*\{[^}]*display:\s*block;/s);
});

test("popup exposes a clipped-state detail popover and collection link", async () => {
  const html = await readFile(new URL("../extension/src/popup/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/popup/popup.js", import.meta.url), "utf8");
  assert.match(html, /id="clip-state"[^>]*aria-controls="clip-state-popover"/s);
  assert.match(html, /id="clip-state-collection"/);
  assert.match(source, /previewFingerprint: fingerprintMarkdown/);
  assert.match(source, /openCollectionsSettings\(clipStateCollectionId\)/);
});

test("Collections uses a second-line intake row and compact CSV or TXT export", async () => {
  const source = await readFile(new URL("../extension/src/options/options.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(source, /addControls\.className = "sites-add-controls"/);
  assert.match(source, /configureCollectionIcon\(removeButton/);
  assert.match(source, /CSV spreadsheet/);
  assert.match(source, /TXT URL list/);
  assert.match(css, /\.site-row-top\s*\{[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\) auto;/s);
});

test("options and collection export use padded custom select chevrons", async () => {
  const options = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  const crawl = await readFile(new URL("../extension/src/crawl/styles.css", import.meta.url), "utf8");
  for (const css of [options, crawl]) {
    assert.match(css, /select\s*\{[^}]*padding-right:\s*34px;[^}]*appearance:\s*none;/s);
    assert.match(css, /background-position:\s*(?:\r?\n\s*)?calc\(100% - 15px\)/s);
  }
});

test("every Theme option is outlined and the active option uses a filled surface", async () => {
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.segmented-field\[data-key="theme"\] \.segmented-option\s*\{[^}]*border-color:\s*var\(--border\);[^}]*background:\s*transparent;/s);
  assert.match(css, /\.segmented-field\[data-key="theme"\] \.segmented-option\.is-active\s*\{[^}]*background:\s*var\(--surface-muted\);/s);
});
