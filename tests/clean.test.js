import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { toAbsolute, prepareContent } from "../extension/src/content/clean.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://site.example.com/a/b/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

test("toAbsolute resolves relative URLs against the base", () => {
  assert.equal(toAbsolute("/x", "https://x.com/a"), "https://x.com/x");
  assert.equal(toAbsolute("y", "https://x.com/a/"), "https://x.com/a/y");
});

test("toAbsolute keeps schemed URLs and drops javascript/fragments", () => {
  assert.equal(toAbsolute("https://x.com/p", "https://b.com"), "https://x.com/p");
  assert.equal(toAbsolute("mailto:a@b.com", "https://b.com"), "mailto:a@b.com");
  assert.equal(toAbsolute("javascript:void(0)", "https://b.com"), "");
  assert.equal(toAbsolute("#frag", "https://b.com"), "");
  assert.equal(toAbsolute("", "https://b.com"), "");
});

test("prepareContent strips chrome and absolutizes links/images", () => {
  const root = document.createElement("div");
  root.innerHTML = `
    <nav>skip me</nav>
    <script>var x = 1;</script>
    <p>Keep <a href="/docs">this</a>.</p>
    <img src="pics/a.png" alt="A">
  `;
  const html = prepareContent(root, { baseUrl: "https://site.example.com/a/b/", dropHidden: false });
  assert.equal(html.includes("skip me"), false);
  assert.equal(html.includes("var x"), false);
  assert.match(html, /href="https:\/\/site\.example\.com\/docs"/);
  assert.match(html, /src="https:\/\/site\.example\.com\/a\/b\/pics\/a\.png"/);
});

test("prepareContent drops display:none elements when dropHidden is on", () => {
  const root = document.createElement("div");
  root.innerHTML = `<p>Visible text</p><p style="display:none">Hidden text</p>`;
  const html = prepareContent(root, { baseUrl: "https://site.example.com/", dropHidden: true });
  assert.match(html, /Visible text/);
  assert.equal(html.includes("Hidden text"), false);
});
