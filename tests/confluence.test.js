// Unit tests for Confluence detection, root selection, and title extraction
// (Cloud + Server/Data Center flavors).

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

function installDom(html, url) {
  const dom = new JSDOM(html, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.Node = dom.window.Node;
  return dom;
}

const { isConfluence, findConfluenceRoot, getConfluenceTitle, getConfluenceSpace } = await import(
  "../extension/src/content/confluence.js"
);

test("isConfluence is true for a Cloud-shaped DOM (atlassian.net/wiki + meta)", () => {
  installDom(
    `<!doctype html><html><head><meta name="confluence-space-key" content="ENG"></head>
     <body><div id="main-content"><h1>Title</h1><p>Body copy.</p></div></body></html>`,
    "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Some+Page"
  );
  assert.equal(isConfluence(), true);
});

test("isConfluence is true for a Server/Data Center DOM (meta confluence-base-url)", () => {
  installDom(
    `<!doctype html><html><head><meta name="confluence-base-url" content="https://wiki.internal.example.com"></head>
     <body><div id="main-content"><h1>Title</h1><p>Body copy.</p></div></body></html>`,
    "https://wiki.internal.example.com/display/ENG/Some+Page"
  );
  assert.equal(isConfluence(), true);
});

test("isConfluence is true when #com-atlassian-confluence is present on body", () => {
  installDom(
    `<!doctype html><html><body id="com-atlassian-confluence">
       <div id="main-content"><h1>Title</h1><p>Body copy.</p></div>
     </body></html>`,
    "https://wiki.internal.example.com/display/ENG/Some+Page"
  );
  assert.equal(isConfluence(), true);
});

test("isConfluence is false for a plain page that merely has a #main-content div", () => {
  installDom(
    `<!doctype html><html><body><div id="main-content"><h1>Welcome</h1><p>Some unrelated site content.</p></div></body></html>`,
    "https://random-blog.example.com/post"
  );
  assert.equal(isConfluence(), false);
});

test("findConfluenceRoot picks #main-content over a nav-heavy sibling", () => {
  installDom(
    `<!doctype html><html><head><meta name="confluence-base-url" content="https://wiki.internal.example.com"></head>
     <body>
       <nav><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></nav>
       <div id="main-content">
         <h1>Real Page Title</h1>
         <p>${"This is real page content. ".repeat(20)}</p>
       </div>
     </body></html>`,
    "https://wiki.internal.example.com/display/ENG/Some+Page"
  );
  const root = findConfluenceRoot();
  assert.equal(root.id, "main-content");
});

test("findConfluenceRoot falls back to document.body when nothing matches", () => {
  installDom(
    `<!doctype html><html><head><meta name="confluence-base-url" content="https://wiki.internal.example.com"></head>
     <body><p>Just some text, no known selectors.</p></body></html>`,
    "https://wiki.internal.example.com/display/ENG/Some+Page"
  );
  const root = findConfluenceRoot();
  assert.equal(root, document.body);
});

test("getConfluenceTitle prefers #title-text", () => {
  installDom(
    `<!doctype html><title>Fallback Title - Confluence</title><html><body>
       <div id="title-text">Real Title</div>
       <div id="main-content"><h1>Not This</h1></div>
     </body></html>`,
    "https://wiki.internal.example.com/display/ENG/Some+Page"
  );
  const root = document.getElementById("main-content");
  assert.equal(getConfluenceTitle(root), "Real Title");
});

test("getConfluenceTitle strips the ' - Confluence' suffix from document.title fallback", () => {
  installDom(
    `<!doctype html><title>My Page Title - Confluence</title><html><body>
       <div id="main-content"><p>No heading here.</p></div>
     </body></html>`,
    "https://wiki.internal.example.com/display/ENG/Some+Page"
  );
  const root = document.getElementById("main-content");
  assert.equal(getConfluenceTitle(root), "My Page Title");
});

test("getConfluenceSpace parses a Cloud /wiki/spaces/<KEY>/ URL", () => {
  installDom(
    `<!doctype html><html><body><div id="main-content"><h1>Title</h1></div></body></html>`,
    "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Some+Page"
  );
  assert.equal(getConfluenceSpace(), "ENG");
});

test("getConfluenceSpace parses a Server /display/<KEY>/ URL", () => {
  installDom(
    `<!doctype html><html><body><div id="main-content"><h1>Title</h1></div></body></html>`,
    "https://wiki.internal.example.com/display/OPS/Some+Page"
  );
  assert.equal(getConfluenceSpace(), "OPS");
});

test("getConfluenceSpace falls back to meta[confluence-space-key] when the URL has no space", () => {
  installDom(
    `<!doctype html><html><head><meta name="confluence-space-key" content="MKT"></head>
     <body><div id="main-content"><h1>Title</h1></div></body></html>`,
    "https://wiki.internal.example.com/pages/viewpage.action?pageId=123"
  );
  assert.equal(getConfluenceSpace(), "MKT");
});

test("getConfluenceSpace returns empty string when no space signal is present", () => {
  installDom(
    `<!doctype html><html><body><div id="main-content"><h1>Title</h1></div></body></html>`,
    "https://wiki.internal.example.com/pages/viewpage.action?pageId=123"
  );
  assert.equal(getConfluenceSpace(), "");
});
