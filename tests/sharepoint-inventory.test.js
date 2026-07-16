import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadSiteInventories,
  pageIdentity,
  reconcileSitePages
} from "../extension/src/lib/sharepoint-inventory.js";

const home = {
  id: 1,
  title: "Home",
  fileRef: "/sites/x/SitePages/Home.aspx",
  guid: "guid-home",
  modified: "2026-01-01T00:00:00Z",
  url: "https://x.sharepoint.com/sites/x/SitePages/Home.aspx"
};

test("pageIdentity prefers the stable case-insensitive SharePoint path", () => {
  assert.equal(pageIdentity(home), "path:/sites/x/sitepages/home.aspx");
});

test("reconcileSitePages replaces updates instead of duplicating a page", () => {
  const updated = { ...home, title: "New home", modified: "2026-07-15T00:00:00Z" };
  const result = reconcileSitePages([home], [updated, { ...updated }]);

  assert.equal(result.pages.length, 1);
  assert.equal(result.newCount, 0);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.removedCount, 0);
  assert.equal(result.pages[0].title, "New home");
  assert.equal(result.changeTypes[pageIdentity(updated)], "updated");
});

test("reconcileSitePages reports new, unchanged, and removed pages", () => {
  const removed = { ...home, id: 2, fileRef: "/sites/x/SitePages/Removed.aspx" };
  const added = { ...home, id: 3, fileRef: "/sites/x/SitePages/New.aspx", title: "New" };
  const result = reconcileSitePages([home, removed], [home, added]);

  assert.equal(result.pages.length, 2);
  assert.equal(result.newCount, 1);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.removedCount, 1);
  assert.equal(result.changeTypes[pageIdentity(added)], "new");
});

test("reconcileSitePages tolerates empty and malformed page lists", () => {
  assert.deepEqual(reconcileSitePages(null, undefined), {
    pages: [],
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    removedCount: 0,
    changeTypes: {}
  });
});

test("loadSiteInventories reads the shared map once and normalizes missing sites", async () => {
  let reads = 0;
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: {
        async get() {
          reads += 1;
          return {
            sharepointSiteInventories: {
              saved: { pages: [home, { ...home }], lastRefreshedAt: 123 }
            }
          };
        }
      }
    }
  };
  try {
    const result = await loadSiteInventories(["saved", "missing"]);
    assert.equal(reads, 1);
    assert.equal(result.saved.pages.length, 1);
    assert.equal(result.saved.lastRefreshedAt, 123);
    assert.deepEqual(result.missing, { pages: [], lastRefreshedAt: null });
  } finally {
    globalThis.chrome = previousChrome;
  }
});
