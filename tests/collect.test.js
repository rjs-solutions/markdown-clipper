// Integration test for the full content pipeline (root selection -> clean ->
// Turndown -> metadata), driven through jsdom. Verifies the modules wire
// together and produce sensible Markdown + metadata.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

function installDom(html, url) {
  const dom = new JSDOM(html, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;
  // jsdom does not implement scrolling; the collector calls it harmlessly.
  dom.window.scrollTo = () => {};
  return dom;
}

const { collectPage } = await import("../extension/src/content/collect.js");

test("collectPage (sharepoint mode) extracts the content region as Markdown", async () => {
  installDom(
    `<!doctype html><html><head><title>Quarter Update - SharePoint</title>
       <meta name="author" content="Dana Lee">
       <meta property="article:published_time" content="2026-02-01">
     </head>
     <body>
       <div data-automation-id="SiteHeader"><nav>Home</nav></div>
       <div data-automation-id="Canvas">
         <h1 data-automation-id="pageTitle">Quarter Update</h1>
         <p>We shipped <strong>three</strong> features this quarter.</p>
         <ul><li>Alpha</li><li>Beta</li></ul>
       </div>
     </body></html>`,
    "https://contoso.sharepoint.com/sites/team/page.aspx"
  );

  const result = await collectPage({ scrollBeforeCapture: false, mode: "auto" });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "sharepoint");
  assert.equal(result.title, "Quarter Update");
  assert.match(result.markdown, /shipped \*\*three\*\* features/);
  assert.match(result.markdown, /-\s+Alpha/);
  assert.equal(result.markdown.includes("Home"), false);
  assert.equal(result.metadata.author, "Dana Lee");
  assert.equal(result.metadata.published, "2026-02-01");
  assert.equal(result.url, "https://contoso.sharepoint.com/sites/team/page.aspx");
});

test("collectPage (auto) falls back to article mode on a generic site", async () => {
  const body = "<p>" + "This is a meaningful sentence in the article body. ".repeat(20) + "</p>";
  installDom(
    `<!doctype html><html><head><title>News Story</title></head>
     <body><nav>menu</nav><article><h1>News Story</h1>${body}</article><footer>foot</footer></body></html>`,
    "https://news.example.com/story"
  );

  const result = await collectPage({ scrollBeforeCapture: true, mode: "auto" });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "article");
  assert.match(result.markdown, /meaningful sentence in the article body/);
  assert.equal(result.stats.scroll, null, "non-SharePoint captures must never scroll");
  assert.equal(document.querySelector("[data-mwc-capture-overlay]"), null);
});
