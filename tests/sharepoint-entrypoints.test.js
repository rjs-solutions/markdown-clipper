import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("popup exposes a direct SharePoint settings shortcut", async () => {
  const html = await readFile(new URL("../extension/src/popup/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/popup/popup.js", import.meta.url), "utf8");
  assert.match(html, /id="open-sharepoint"[^>]*title="Manage SharePoint sites"/);
  assert.match(source, /src\/options\/index\.html\?section=sharepoint/);
});

test("collection export exposes saved SharePoint sites and management", async () => {
  const html = await readFile(new URL("../extension/src/crawl/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../extension/src/crawl/crawl.js", import.meta.url), "utf8");
  assert.match(html, /id="saved-site"/);
  assert.match(html, /id="manage-sites"[^>]*title="Manage SharePoint sites"/);
  assert.match(source, /loadSiteInventories/);
  assert.match(source, /savedSiteExportPreset/);
});
