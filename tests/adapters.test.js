// Unit tests for the site-adapter registry: resolution order, id lookup, and
// the generic fallback's empty selector contract.

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

const { resolveAdapter, getAdapterById } = await import("../extension/src/content/adapters.js");

test("resolveAdapter picks the sharepoint adapter on a SharePoint-like DOM", () => {
  installDom(
    `<!doctype html><html><body><div data-automation-id="Canvas"><h1>Title</h1></div></body></html>`,
    "https://contoso.sharepoint.com/sites/team/page.aspx"
  );
  const adapter = resolveAdapter();
  assert.equal(adapter.id, "sharepoint");
});

test("resolveAdapter picks the generic adapter on a non-SharePoint DOM", () => {
  installDom(
    `<!doctype html><html><body><article><h1>News</h1><p>Body</p></article></body></html>`,
    "https://news.example.com/story"
  );
  const adapter = resolveAdapter();
  assert.equal(adapter.id, "generic");
});

test("resolveAdapter picks the confluence adapter on a Confluence-like DOM", () => {
  installDom(
    `<!doctype html><html><head><meta name="confluence-base-url" content="https://wiki.internal.example.com"></head>
     <body><div id="main-content"><h1>Title</h1><p>Body copy.</p></div></body></html>`,
    "https://wiki.internal.example.com/display/ENG/Some+Page"
  );
  const adapter = resolveAdapter();
  assert.equal(adapter.id, "confluence");
});

test("resolveAdapter still picks sharepoint on a SharePoint-like DOM", () => {
  installDom(
    `<!doctype html><html><body><div data-automation-id="Canvas"><h1>Title</h1></div></body></html>`,
    "https://contoso.sharepoint.com/sites/team/page.aspx"
  );
  const adapter = resolveAdapter();
  assert.equal(adapter.id, "sharepoint");
});

test("resolveAdapter still picks generic on a non-matching DOM", () => {
  installDom(
    `<!doctype html><html><body><article><h1>News</h1><p>Body</p></article></body></html>`,
    "https://news.example.com/story"
  );
  const adapter = resolveAdapter();
  assert.equal(adapter.id, "generic");
});

test("getAdapterById round-trips known ids and returns null for unknown ones", () => {
  assert.equal(getAdapterById("sharepoint").id, "sharepoint");
  assert.equal(getAdapterById("confluence").id, "confluence");
  assert.equal(getAdapterById("generic").id, "generic");
  assert.equal(getAdapterById("unknown"), null);
});

test("the generic adapter's selector lists are empty and its root/title are null", () => {
  installDom(`<!doctype html><html><body></body></html>`, "https://news.example.com/story");
  const adapter = getAdapterById("generic");
  assert.equal(adapter.match(), true);
  assert.equal(adapter.findRoot(), null);
  assert.equal(adapter.getTitle(), null);
  assert.deepEqual(adapter.unwantedSelectors, []);
  assert.deepEqual(adapter.metadataSelectors, { author: [], published: [] });
  assert.deepEqual(adapter.scrollTargets, []);
  assert.equal(adapter.needsScroll, false);
});

test("the generic adapter defines no extraMetadata seam", () => {
  const adapter = getAdapterById("generic");
  assert.equal(adapter.extraMetadata, undefined);
});

test("confluenceAdapter.extraMetadata returns { space } on a spaced DOM", () => {
  installDom(
    `<!doctype html><html><body><div id="main-content"><h1>Title</h1></div></body></html>`,
    "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Some+Page"
  );
  const adapter = getAdapterById("confluence");
  assert.deepEqual(adapter.extraMetadata(), { space: "ENG" });
});

test("confluenceAdapter.extraMetadata returns {} when no space is detectable", () => {
  installDom(
    `<!doctype html><html><body><div id="main-content"><h1>Title</h1></div></body></html>`,
    "https://wiki.internal.example.com/pages/viewpage.action?pageId=123"
  );
  const adapter = getAdapterById("confluence");
  assert.deepEqual(adapter.extraMetadata(), {});
});

test("sharepointAdapter.extraMetadata returns { page_type: 'news' } when a newsAuthor node is present", () => {
  installDom(
    `<!doctype html><html><body><div data-automation-id="Canvas"><div data-automation-id="newsAuthor">Jane</div></div></body></html>`,
    "https://contoso.sharepoint.com/sites/team/news.aspx"
  );
  const adapter = getAdapterById("sharepoint");
  assert.deepEqual(adapter.extraMetadata(), { page_type: "news" });
});

test("sharepointAdapter.extraMetadata returns { page_type: 'page' } otherwise", () => {
  installDom(
    `<!doctype html><html><body><div data-automation-id="Canvas"><h1>Title</h1></div></body></html>`,
    "https://contoso.sharepoint.com/sites/team/page.aspx"
  );
  const adapter = getAdapterById("sharepoint");
  assert.deepEqual(adapter.extraMetadata(), { page_type: "page" });
});
