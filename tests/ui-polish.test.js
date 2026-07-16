import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("popup header stays focused while collection capture and editing use a shorter second row", async () => {
  const html = await readFile(new URL("../extension/src/popup/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/popup/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(html, /id="open-collections"/);
  assert.ok(html.indexOf('id="open-options"') < html.indexOf('id="do-export"'));
  assert.ok(html.indexOf('id="do-export"') < html.indexOf('id="do-expand"'));
  assert.match(html, /class="actions-row actions-row-primary"/);
  assert.match(html, /class="actions-row actions-row-secondary"/);
  assert.match(html, /id="do-export"[^>]*>[\s\S]*?<svg[^>]*>[\s\S]*?<span>Capture Collection<\/span>[\s\S]*?id="do-expand"/);
  assert.match(html, /id="do-expand"[^>]*>[\s\S]*?<svg[^>]*>[\s\S]*?<span>Edit Markdown<\/span>/);
  assert.match(html, /id="do-export"[^>]*title="Open Capture Collection in a separate window"[\s\S]*?class="launch-context"/);
  assert.match(html, /id="do-expand"[^>]*title="Open the full Markdown editor in a new tab"[\s\S]*?class="launch-context"/);
  assert.match(css, /\.icon-button\s*\{[^}]*padding:\s*0;/s);
  assert.match(css, /\.icon-button svg\s*\{[^}]*display:\s*block;/s);
  assert.match(css, /\.act-workflow\s*\{[^}]*min-height:\s*26px;[^}]*background:\s*var\(--surface-muted\);/s);
  assert.match(css, /\.act-workflow \.launch-context\s*\{[^}]*position:\s*absolute;[^}]*right:\s*8px;[^}]*width:\s*11px;/s);
});

test("ready popup uses Chrome's full height while only the Markdown preview grows", async () => {
  const css = await readFile(new URL("../extension/src/popup/styles.css", import.meta.url), "utf8");
  assert.match(css, /body:not\(\.in-panel\):not\(\.in-iframe\):has\(\.card:not\(\[hidden\]\)\)\s*\{[^}]*height:\s*600px;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /:has\(\.card:not\(\[hidden\]\)\) \.card\s*\{[^}]*flex:\s*1 1 auto;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;/s);
  assert.match(css, /:has\(\.card:not\(\[hidden\]\)\) \.card > \*:not\(\.preview\)\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.match(css, /:has\(\.card:not\(\[hidden\]\)\) \.preview\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*display:\s*flex;/s);
  assert.match(css, /:has\(\.card:not\(\[hidden\]\)\) \.preview-body\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*height:\s*auto;/s);
  assert.match(css, /:has\(\.card:not\(\[hidden\]\)\) \.actions\s*\{[^}]*margin-top:\s*6px;[^}]*padding-top:\s*7px;[^}]*border-top:\s*1px solid var\(--border\);/s);
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

test("Saved Collections keeps primary utilities labeled and only Refresh all as an icon", async () => {
  const source = await readFile(new URL("../extension/src/options/options.js", import.meta.url), "utf8");
  assert.match(source, /configureLabeledButton\(importListButton, "Import URL list…", ACTION_ICONS\.upload/);
  assert.match(source, /configureLabeledButton\(exportAllButton, "Export all URLs", ACTION_ICONS\.download/);
  assert.match(source, /"Refresh all saved collection inventories"/);
  assert.match(source, /utilityActions\.className = "collection-utility-actions"/);
  assert.doesNotMatch(source, /importDefinitionsButton|exportDefinitionsButton/);
});

test("saved collection rows use quiet actions and one combined export menu", async () => {
  const source = await readFile(new URL("../extension/src/options/options.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(source, /markdownButton\.textContent = "Download Markdown snapshot"/);
  assert.match(source, /inventoryMenu\.append\(syncMenuButton, markdownButton, csvButton, txtButton\)/);
  assert.match(source, /actions\.append\(discoverButton, inventoryExport, removeButton\)/);
  assert.match(source, /syncMenuButton\.textContent = "Sync Markdown files to library"/);
  assert.match(css, /\.site-actions \.collection-icon-action\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s);
  assert.match(css, /\.sites-list\s*\{[^}]*border-top:\s*1px solid var\(--border\);/s);
  assert.match(css, /\.collection-library-field\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
});

test("collection reminder choices match Theme cards and utility actions share a height", async () => {
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.collection-schedule-options\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  assert.match(css, /\.collection-schedule-options \.segmented-option\s*\{[^}]*border-color:\s*var\(--border\);[^}]*background:\s*transparent;/s);
  assert.match(css, /\.collection-utility-actions \.collection-icon-action\s*\{[^}]*height:\s*37px;[^}]*min-height:\s*37px;/s);
});

test("Activity statistics use secondary text sizing", async () => {
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.activity-stats\s*\{[^}]*font-size:\s*12\.5px;/s);
});

test("Collections emphasizes ready intake, segments sync reminders, and groups utilities", async () => {
  const source = await readFile(new URL("../extension/src/options/options.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(source, /addButton\.classList\.toggle\("is-primary-action", isReady\)/);
  assert.match(source, /scheduleOptions\.className = "segmented collection-schedule-options"/);
  assert.match(source, /\[\["off", "Off"\], \["weekly", "Weekly"\], \["monthly", "Monthly"\]\]/);
  assert.match(css, /button\.is-primary-action\s*\{[^}]*background:\s*var\(--accent\);/s);
  assert.match(css, /\.sites-toolbar\s*\{[^}]*justify-content:\s*flex-start;/s);
  assert.match(css, /\.collection-utility-actions\s*\{[^}]*margin-left:\s*0;/s);
  assert.match(css, /\.collection-schedule-status\s*\{[^}]*grid-column:\s*1 \/ -1;/s);
});

test("settings actions use clear labels, meaningful icons, and explanatory hover text", async () => {
  const source = await readFile(new URL("../extension/src/options/options.js", import.meta.url), "utf8");
  const schema = await readFile(new URL("../extension/src/lib/settings-schema.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(source, /configureLabeledButton\(chooseButton, "Choose vault folder", ACTION_ICONS\.folder, "Choose where individual Markdown clips are saved"\)/);
  assert.match(source, /configureLabeledButton\(addButton, "Add & discover pages", ACTION_ICONS\.discover/);
  assert.match(source, /configureLabeledButton\(exportButton, "Download backup", ACTION_ICONS\.download/);
  assert.match(source, /configureLabeledButton\(resetButton, "Reset settings", ACTION_ICONS\.reset/);
  assert.match(source, /setLabeledButtonText\(copyButton, "Copied"\)/);
  assert.match(schema, /label: "When the toolbar icon is clicked"/);
  assert.match(schema, /label: "Local vault"/);
  assert.match(css, /\.button-with-icon\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*7px;/s);
});

test("options and collection capture use padded custom select chevrons", async () => {
  const options = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  const crawl = await readFile(new URL("../extension/src/crawl/styles.css", import.meta.url), "utf8");
  for (const css of [options, crawl]) {
    assert.match(css, /select\s*\{[^}]*padding-right:\s*34px;[^}]*appearance:\s*none;/s);
    assert.match(css, /background-position:\s*(?:\r?\n\s*)?calc\(100% - 15px\)/s);
  }
});

test("Capture Collection uses branded flat sections and icon-led source choices", async () => {
  const html = await readFile(new URL("../extension/src/crawl/index.html", import.meta.url), "utf8");
  const popupHtml = await readFile(new URL("../extension/src/popup/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/crawl/crawl.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../extension/src/crawl/styles.css", import.meta.url), "utf8");
  assert.match(html, /<title>Capture Collection — Markdown Clipper<\/title>/);
  assert.match(html, /class="header-subtitle">Capture Collection<\/span>/);
  assert.match(popupHtml, /id="do-export"[^>]*title="Open Capture Collection in a separate window"/);
  assert.doesNotMatch(html, /id="close-window"/);
  assert.doesNotMatch(source, /close-window/);
  assert.doesNotMatch(html, /radio-mark/);
  assert.match(html, /class="form-panel"/);
  assert.match(html, /id="source-heading" class="group-heading"/);
  assert.match(html, /id="scope-heading" class="group-heading"/);
  assert.match(html, /id="output-heading" class="group-heading"/);
  assert.equal((html.match(/class="mode-icon"/g) || []).length, 4);
  assert.match(html, />Import URL file</);
  assert.match(html, />Save as collection</);
  assert.match(html, />Export Markdown</);
  assert.match(html, /id="urls" rows="5"/);
  assert.match(css, /\.modes label:has\(input:checked\)\s*\{[^}]*background:\s*var\(--surface-muted\);/s);
  assert.match(css, /\.modes label\s*\{[^}]*min-height:\s*44px;[^}]*padding:\s*5px 9px;/s);
  assert.match(css, /#urls\s*\{[^}]*min-height:\s*124px;/s);
  assert.match(css, /#urls::\-webkit-resizer\s*\{[^}]*background-color:\s*var\(--bg\);/s);
  assert.match(css, /#save-collection\.is-primary-action\s*\{[^}]*background:\s*var\(--accent\);/s);
  assert.match(source, /collectionNameInput\.addEventListener\("input", updateCollectionSaveState\)/);
  assert.match(source, /saveCollectionButton\.classList\.toggle\("is-primary-action", isReady\)/);
  assert.match(css, /textarea,[\s\S]*?background-color:\s*var\(--bg\);/s);
});

test("every Theme option is outlined and the active option uses a filled surface", async () => {
  const css = await readFile(new URL("../extension/src/options/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.segmented-field\[data-key="theme"\] \.segmented-option\s*\{[^}]*border-color:\s*var\(--border\);[^}]*background:\s*transparent;/s);
  assert.match(css, /\.segmented-field\[data-key="theme"\] \.segmented-option\.is-active\s*\{[^}]*background:\s*var\(--surface-muted\);/s);
});
