import { test } from "node:test";
import assert from "node:assert/strict";
import { toRelativeMarkdownPath, uniquePath, encodePathForLink } from "../extension/src/lib/sitepath.js";

test("toRelativeMarkdownPath preserves folders and strips the extension", () => {
  assert.equal(
    toRelativeMarkdownPath("https://x.sharepoint.com/sites/team/SitePages/Plan.aspx"),
    "sites/team/SitePages/Plan.md"
  );
});

test("toRelativeMarkdownPath maps the site root to index.md", () => {
  assert.equal(toRelativeMarkdownPath("https://x.com/"), "index.md");
});

test("toRelativeMarkdownPath decodes percent-encoded segments", () => {
  assert.equal(toRelativeMarkdownPath("https://x.com/a/My%20Page"), "a/My Page.md");
});

test("uniquePath appends a counter on collision", () => {
  const used = new Set();
  assert.equal(uniquePath("a/b.md", used), "a/b.md");
  assert.equal(uniquePath("a/b.md", used), "a/b-1.md");
  assert.equal(uniquePath("a/b.md", used), "a/b-2.md");
});

test("encodePathForLink encodes segments but keeps slashes", () => {
  assert.equal(encodePathForLink("a/My Page.md"), "a/My%20Page.md");
});
