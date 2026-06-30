import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  htmlToMarkdown,
  normalizeMarkdown,
  removeDuplicateLeadHeading
} from "../extension/src/lib/markdown.js";

// Turndown's browser build needs a global DOM. Static imports above are
// evaluated before this runs, but Turndown only touches `document` at
// conversion time, so setting these globals before any test() executes is
// sufficient.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;

test("htmlToMarkdown converts headings, emphasis, and links", () => {
  const md = htmlToMarkdown('<h1>Title</h1><p>A <strong>bold</strong> <a href="https://x.com">link</a>.</p>');
  assert.match(md, /^# Title/);
  assert.match(md, /\*\*bold\*\*/);
  assert.match(md, /\[link\]\(https:\/\/x\.com\)/);
});

test("htmlToMarkdown renders GFM tables", () => {
  const md = htmlToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>");
  assert.match(md, /\| A \| B \|/);
  assert.match(md, /\| --- \| --- \|/);
  assert.match(md, /\| 1 \| 2 \|/);
});

test("htmlToMarkdown renders fenced code blocks", () => {
  const md = htmlToMarkdown("<pre><code>const x = 1;</code></pre>");
  assert.match(md, /```/);
  assert.match(md, /const x = 1;/);
});

test("htmlToMarkdown returns empty string for empty input", () => {
  assert.equal(htmlToMarkdown(""), "");
  assert.equal(htmlToMarkdown(null), "");
});

test("normalizeMarkdown collapses blank lines and nbsp", () => {
  const nbsp = String.fromCharCode(0xa0);
  assert.equal(normalizeMarkdown(`a${nbsp}b`), "a b");
  assert.equal(normalizeMarkdown("a\n\n\n\nb"), "a\n\nb");
  assert.equal(normalizeMarkdown("  \n a \n  "), "a");
});

test("removeDuplicateLeadHeading drops a leading heading equal to the title", () => {
  assert.equal(removeDuplicateLeadHeading("# Hello\n\nBody", "Hello"), "Body");
  assert.equal(removeDuplicateLeadHeading("# Other\n\nBody", "Hello"), "# Other\n\nBody");
  assert.equal(removeDuplicateLeadHeading("Body", "Hello"), "Body");
});
