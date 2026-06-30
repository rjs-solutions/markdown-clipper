import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUrlList, parseSitemap, sameHost, comparableUrl } from "../extension/src/lib/discover.js";

test("parseUrlList keeps http(s) lines and dedupes", () => {
  const list = parseUrlList("https://a.com/1\n  http://a.com/2 \nnot a url\nhttps://a.com/1\n");
  assert.deepEqual(list, ["https://a.com/1", "http://a.com/2"]);
});

test("parseSitemap reads page locs from a urlset", () => {
  const xml = `<urlset><url><loc>https://a.com/x</loc></url><url><loc>https://a.com/y&amp;z</loc></url></urlset>`;
  const { pages, sitemaps } = parseSitemap(xml);
  assert.deepEqual(pages, ["https://a.com/x", "https://a.com/y&z"]);
  assert.deepEqual(sitemaps, []);
});

test("parseSitemap reads nested sitemaps from an index", () => {
  const xml = `<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>`;
  const { pages, sitemaps } = parseSitemap(xml);
  assert.deepEqual(pages, []);
  assert.deepEqual(sitemaps, ["https://a.com/s1.xml"]);
});

test("sameHost compares hosts", () => {
  assert.equal(sameHost("https://a.com/1", "https://a.com/2"), true);
  assert.equal(sameHost("https://a.com", "https://b.com"), false);
});

test("comparableUrl strips the hash", () => {
  assert.equal(comparableUrl("https://a.com/x#frag"), "https://a.com/x");
});
