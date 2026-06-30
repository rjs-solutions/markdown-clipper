import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  sanitizeFilename,
  sanitizePathSegment,
  withMarkdownExtension
} from "../extension/src/lib/slug.js";

test("slugify lowercases, strips punctuation, and hyphenates", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("  Spaces   here  "), "spaces-here");
  assert.equal(slugify("Quote's \"test\""), "quotes-test");
});

test("slugify removes accents via NFKD", () => {
  assert.equal(slugify("Café Crème"), "cafe-creme");
});

test("slugify falls back when empty", () => {
  assert.equal(slugify(""), "page");
  assert.equal(slugify("!!!", { fallback: "x" }), "x");
});

test("slugify respects maxLength without trailing hyphen", () => {
  const out = slugify("a".repeat(50) + " " + "b".repeat(50), { maxLength: 20 });
  assert.equal(out.length <= 20, true);
  assert.equal(/-$/.test(out), false);
});

test("sanitizeFilename strips illegal path characters but keeps spaces/case", () => {
  assert.equal(sanitizeFilename('A/B:C*D?"E<F>G|H'), "A B C D E F G H");
  assert.equal(sanitizeFilename("Normal Title"), "Normal Title");
});

test("sanitizeFilename strips control characters and trailing dots", () => {
  const ctrl = String.fromCharCode(7);
  assert.equal(sanitizeFilename(`a${ctrl}b...`), "a b");
});

test("sanitizePathSegment guards reserved Windows names", () => {
  assert.equal(sanitizePathSegment("CON"), "_CON");
  assert.equal(sanitizePathSegment("readme"), "readme");
});

test("withMarkdownExtension appends .md once", () => {
  assert.equal(withMarkdownExtension("note"), "note.md");
  assert.equal(withMarkdownExtension("note.md"), "note.md");
  assert.equal(withMarkdownExtension("note.MD"), "note.MD");
});
