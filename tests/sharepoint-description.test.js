import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { getSharePointDescription, parseSharePointPageContext } from "../extension/src/content/sharepoint.js";

test("parseSharePointPageContext extracts the serialized page item safely", () => {
  const context = parseSharePointPageContext('const spClientSidePageContext={"item":{"Title":"Guide","Description":"A useful guide with {braces}."},"other":true};');
  assert.equal(context.item.Description, "A useful guide with {braces}.");
  assert.equal(parseSharePointPageContext("const unrelated = {};"), null);
});

test("getSharePointDescription reads Site Pages Description from page context", () => {
  const dom = new JSDOM('<script>const spClientSidePageContext={"item":{"Description":"Guide for CMC teams building AI solutions."}};<\/script>', { url: "https://contoso.sharepoint.com/sites/ai/SitePages/Guide.aspx" });
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    assert.equal(getSharePointDescription(), "Guide for CMC teams building AI solutions.");
  } finally {
    globalThis.document = previousDocument;
  }
});
