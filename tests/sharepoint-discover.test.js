import { test } from "node:test";
import assert from "node:assert/strict";
import { sitePagesQueryUrl, normalizeDiscoveredPages, extractPageItems } from "../extension/src/lib/sharepoint-discover.js";

test("sitePagesQueryUrl builds the expected REST query string", () => {
  const url = sitePagesQueryUrl("https://contoso.sharepoint.com/sites/x/_api");
  assert.equal(
    url,
    "https://contoso.sharepoint.com/sites/x/_api/web/lists/getByTitle('Site%20Pages')/items?$select=Id,Title,FileRef,GUID,Modified&$orderby=Modified desc&$top=100"
  );
});

test("sitePagesQueryUrl honors a custom top", () => {
  const url = sitePagesQueryUrl("https://contoso.sharepoint.com/_api", { top: 25 });
  assert.match(url, /\$top=25$/);
});

test("normalizeDiscoveredPages maps rows and derives url from origin + FileRef", () => {
  const rows = [
    { Id: 1, Title: "Home", FileRef: "/sites/x/SitePages/Home.aspx", GUID: "guid-1", Modified: "2026-01-01T00:00:00Z" }
  ];
  const pages = normalizeDiscoveredPages(rows, "https://contoso.sharepoint.com");
  assert.deepEqual(pages, [
    {
      id: 1,
      title: "Home",
      fileRef: "/sites/x/SitePages/Home.aspx",
      guid: "guid-1",
      modified: "2026-01-01T00:00:00Z",
      url: "https://contoso.sharepoint.com/sites/x/SitePages/Home.aspx"
    }
  ]);
});

test("normalizeDiscoveredPages derives a title from FileRef when Title is missing", () => {
  const rows = [{ Id: 2, FileRef: "/sites/x/SitePages/Plan.aspx" }];
  const pages = normalizeDiscoveredPages(rows, "https://contoso.sharepoint.com");
  assert.equal(pages[0].title, "Plan");
});

test("normalizeDiscoveredPages skips rows lacking FileRef and tolerates non-arrays", () => {
  const rows = [{ Id: 3, Title: "No file ref" }, null, { Id: 4, FileRef: "/sites/x/SitePages/Ok.aspx" }];
  const pages = normalizeDiscoveredPages(rows, "https://contoso.sharepoint.com");
  assert.equal(pages.length, 1);
  assert.equal(pages[0].id, 4);

  assert.deepEqual(normalizeDiscoveredPages(undefined, "https://contoso.sharepoint.com"), []);
});

test("extractPageItems unwraps the nometadata shape", () => {
  const json = {
    value: [{ Id: 1, Title: "Home" }],
    "odata.nextLink": "https://contoso.sharepoint.com/_api/web/lists/getByTitle('Site%20Pages')/items?$skiptoken=1"
  };
  const { items, nextLink } = extractPageItems(json);
  assert.deepEqual(items, [{ Id: 1, Title: "Home" }]);
  assert.equal(nextLink, "https://contoso.sharepoint.com/_api/web/lists/getByTitle('Site%20Pages')/items?$skiptoken=1");
});

test("extractPageItems unwraps the verbose shape", () => {
  const json = {
    d: {
      results: [{ Id: 2, Title: "Plan" }],
      __next: "https://contoso.sharepoint.com/_api/web/lists/getByTitle('Site%20Pages')/items?$skiptoken=2"
    }
  };
  const { items, nextLink } = extractPageItems(json);
  assert.deepEqual(items, [{ Id: 2, Title: "Plan" }]);
  assert.equal(nextLink, "https://contoso.sharepoint.com/_api/web/lists/getByTitle('Site%20Pages')/items?$skiptoken=2");
});

test("extractPageItems returns empty items and null nextLink when neither shape nor link is present", () => {
  assert.deepEqual(extractPageItems({ value: [{ Id: 1 }] }), { items: [{ Id: 1 }], nextLink: null });
  assert.deepEqual(extractPageItems({}), { items: [], nextLink: null });
});

test("extractPageItems tolerates null and garbage input", () => {
  assert.deepEqual(extractPageItems(null), { items: [], nextLink: null });
  assert.deepEqual(extractPageItems(undefined), { items: [], nextLink: null });
  assert.deepEqual(extractPageItems("not an object"), { items: [], nextLink: null });
  assert.deepEqual(extractPageItems({ value: "not an array" }), { items: [], nextLink: null });
});
