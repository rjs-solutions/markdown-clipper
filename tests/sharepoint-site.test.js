import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSharePointSite } from "../extension/src/lib/sharepoint-site.js";

test("parses a full /sites/ URL", () => {
  const result = parseSharePointSite("https://contoso.sharepoint.com/sites/Marketing");
  assert.equal(result.ok, true);
  assert.equal(result.hostname, "contoso.sharepoint.com");
  assert.equal(result.tenant, "contoso");
  assert.equal(result.sitePath, "/sites/Marketing");
  assert.equal(result.origin, "https://contoso.sharepoint.com");
  assert.equal(result.webUrl, "https://contoso.sharepoint.com/sites/Marketing");
  assert.equal(result.apiBase, "https://contoso.sharepoint.com/sites/Marketing/_api");
  assert.equal(result.name, "Marketing");
});

test("parses a /teams/ URL", () => {
  const result = parseSharePointSite("https://contoso.sharepoint.com/teams/Engineering");
  assert.equal(result.ok, true);
  assert.equal(result.sitePath, "/teams/Engineering");
  assert.equal(result.webUrl, "https://contoso.sharepoint.com/teams/Engineering");
  assert.equal(result.name, "Engineering");
});

test("parses a root site with no /sites/ or /teams/ segment", () => {
  const result = parseSharePointSite("https://contoso.sharepoint.com/");
  assert.equal(result.ok, true);
  assert.equal(result.sitePath, "");
  assert.equal(result.webUrl, "https://contoso.sharepoint.com");
  assert.equal(result.apiBase, "https://contoso.sharepoint.com/_api");
  assert.equal(result.name, "contoso");
});

test("resolves sitePath from a page URL under a site", () => {
  const result = parseSharePointSite("https://contoso.sharepoint.com/sites/x/SitePages/Plan.aspx");
  assert.equal(result.ok, true);
  assert.equal(result.sitePath, "/sites/x");
  assert.equal(result.webUrl, "https://contoso.sharepoint.com/sites/x");
  assert.equal(result.name, "x");
});

test("rejects a non-SharePoint URL", () => {
  const result = parseSharePointSite("https://example.com/sites/Marketing");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "Enter a SharePoint site URL (something.sharepoint.com).");
});

test("rejects garbage input, and treats a bare host without protocol as valid", () => {
  const garbage = parseSharePointSite("not a url at all !!");
  assert.equal(garbage.ok, false);
  assert.equal(garbage.reason, "That does not look like a valid URL.");

  const noProtocol = parseSharePointSite("contoso.sharepoint.com/sites/Marketing");
  assert.equal(noProtocol.ok, true);
  assert.equal(noProtocol.webUrl, "https://contoso.sharepoint.com/sites/Marketing");
});
