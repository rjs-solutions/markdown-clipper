import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const surface of ["popup", "editor"]) {
  test(`${surface} exposes an accessible split Download action`, async () => {
    const html = await readFile(new URL(`../extension/src/${surface}/index.html`, import.meta.url), "utf8");
    assert.match(html, /class="download-split"[^>]*role="group"/);
    assert.match(html, /id="do-download"/);
    assert.match(html, /id="do-download-location"[^>]*title="Choose download location"[^>]*aria-label="Choose download location"/s);
  });

  test(`${surface} exposes body and complete-document Copy actions`, async () => {
    const html = await readFile(new URL(`../extension/src/${surface}/index.html`, import.meta.url), "utf8");
    assert.match(html, /class="copy-split"[^>]*role="group"/);
    assert.match(html, /id="do-copy"/);
    assert.match(html, /id="do-copy-full"[^>]*title="Copy complete Markdown with title and metadata"/s);
  });
}

test("popup folder segment bypasses the vault and requests Save As", async () => {
  const source = await readFile(new URL("../extension/src/popup/popup.js", import.meta.url), "utf8");
  assert.match(source, /run\("save-as"\)/);
  assert.match(source, /saveAs: chooseLocation/);
  assert.match(source, /useVault: chooseLocation \? false : settings\.vaultEnabled/);
});

test("editor folder segment requests Save As", async () => {
  const source = await readFile(new URL("../extension/src/editor/editor.js", import.meta.url), "utf8");
  assert.match(source, /downloadText\(out\.markdown, out\.filename, \{ saveAs \}\)/);
  assert.match(source, /downloadLocation\.addEventListener\("click", \(\) => download\(true\)\)/);
});

test("primary Copy uses the editable body while complete Copy uses assembled Markdown", async () => {
  const popup = await readFile(new URL("../extension/src/popup/popup.js", import.meta.url), "utf8");
  const editor = await readFile(new URL("../extension/src/editor/editor.js", import.meta.url), "utf8");
  assert.match(popup, /action === "copy" \? currentFields\(\)\.body : payload\.markdown/);
  assert.match(popup, /navigator\.clipboard\.writeText\(copyText\)/);
  assert.match(editor, /navigator\.clipboard\.writeText\(el\.body\.value\)/);
  assert.match(editor, /navigator\.clipboard\.writeText\(assemble\(\)\.markdown\)/);
});
