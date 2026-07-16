import { test } from "node:test";
import assert from "node:assert/strict";
import { createZip } from "../extension/src/lib/zip.js";
import { extractUrlsFromText, extractUrlsFromXlsx } from "../extension/src/lib/collection-import.js";

test("text and CSV intake find URLs in any column and deduplicate them", () => {
  assert.deepEqual(extractUrlsFromText("Label,URL\nHome,https://example.com/\nAgain,https://example.com/", { format: "csv" }), ["https://example.com/"]);
  assert.deepEqual(extractUrlsFromText("Visit https://a.test/x\nhttps://b.test/y"), ["https://a.test/x", "https://b.test/y"]);
});

test("XLSX intake reads shared-string and inline-string URL cells", async () => {
  const workbook = createZip([
    { name: "xl/sharedStrings.xml", data: '<sst><si><t>https://shared.test/page</t></si></sst>' },
    { name: "xl/worksheets/sheet1.xml", data: '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="inlineStr"><is><t>https://inline.test/page</t></is></c></row></sheetData></worksheet>' }
  ]);
  const urls = await extractUrlsFromXlsx(await workbook.arrayBuffer());
  assert.deepEqual(urls, ["https://shared.test/page", "https://inline.test/page"]);
});
