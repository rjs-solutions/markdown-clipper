import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSavedSite, savedSiteExportPreset } from "../extension/src/lib/sharepoint-export.js";

const root = { id: "root", name: "Root", webUrl: "https://x.sharepoint.com" };
const team = { id: "team", name: "Team", webUrl: "https://x.sharepoint.com/sites/team" };

test("matchSavedSite chooses the most specific saved SharePoint site", () => {
  assert.equal(matchSavedSite([root, team], `${team.webUrl}/SitePages/Home.aspx`).id, "team");
  assert.equal(matchSavedSite([team], "https://example.com/") , null);
});

test("savedSiteExportPreset uses a deduplicated refreshed inventory", () => {
  const url = `${team.webUrl}/SitePages/Home.aspx`;
  const preset = savedSiteExportPreset(team, { pages: [{ url }, { url }, { url: "not-a-url" }] });
  assert.deepEqual(preset, {
    mode: "list",
    urls: [url],
    startUrl: team.webUrl,
    maxPages: 1,
    inventoryCount: 1
  });
});

test("savedSiteExportPreset falls back to a constrained Site Pages crawl", () => {
  assert.deepEqual(savedSiteExportPreset(team, { pages: [] }), {
    mode: "crawl",
    urls: [],
    startUrl: team.webUrl,
    maxPages: 25,
    inventoryCount: 0,
    includePatterns: "/SitePages/"
  });
});
