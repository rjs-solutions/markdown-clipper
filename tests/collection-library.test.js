import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectionLibraryPath,
  normalizeLibraryPath,
  uniqueCollectionLibraryPath,
  syncCollectionToLibrary
} from "../extension/src/lib/collection-library.js";

function missing(name) {
  const error = new Error(`missing: ${name}`);
  error.name = "NotFoundError";
  return error;
}

function makeDirectory(name = "root") {
  const directories = new Map();
  const files = new Map();
  return {
    name,
    directories,
    files,
    async getDirectoryHandle(childName, { create = false } = {}) {
      if (!directories.has(childName)) {
        if (!create) throw missing(childName);
        directories.set(childName, makeDirectory(childName));
      }
      return directories.get(childName);
    },
    async getFileHandle(fileName, { create = false } = {}) {
      if (!files.has(fileName)) {
        if (!create) throw missing(fileName);
        files.set(fileName, {
          content: "",
          async createWritable() {
            const file = this;
            return { async write(value) { file.pending = String(value); }, async close() { file.content = file.pending; } };
          },
          async getFile() { const file = this; return { async text() { return file.content; } }; }
        });
      }
      return files.get(fileName);
    }
  };
}

function directory(root, path) {
  return path.split("/").filter(Boolean).reduce((current, part) => current.directories.get(part), root);
}

const collection = { id: "docs", name: "Team Docs", type: "sharepoint", sourceUrl: "https://example.test/docs" };

test("collection library paths are predictable and traversal-safe", () => {
  assert.equal(collectionLibraryPath(collection), "sharepoint/team-docs");
  assert.equal(normalizeLibraryPath(" Teams/../Product Docs\\Current "), "Teams/Product Docs/Current");
  assert.equal(collectionLibraryPath({ ...collection, libraryPath: "Knowledge/Team Docs" }), "Knowledge/Team Docs");
  assert.equal(uniqueCollectionLibraryPath({ ...collection, id: "other" }, [collection]), "sharepoint/team-docs-2");
});

test("sync writes normal Markdown files, index, manifest, and report", async () => {
  const root = makeDirectory();
  const pages = [{ url: "https://example.test/docs/start", title: "Start", markdown: "Hello", metadata: {} }];
  const result = await syncCollectionToLibrary(root, collection, pages, { metadataStyle: "none", includeTitleHeading: true }, { syncedAt: 1_700_000_000_000 });
  const target = directory(root, "sharepoint/team-docs");

  assert.equal(result.folder, "sharepoint/team-docs");
  assert.equal(result.pageCount, 1);
  assert.match(target.files.get("index.md").content, /\[Start\]/);
  assert.match(target.files.get("collection.json").content, /"collectionId": "docs"/);
  assert.match(target.files.get("_sync-report.md").content, /Current pages: 1/);
  assert.equal(directory(target, "docs").files.get("start.md").content, "# Start\n\nHello\n");
});

test("a later sync overwrites current pages and reports missing files without deleting them", async () => {
  const root = makeDirectory();
  const first = [
    { url: "https://example.test/docs/keep", title: "Keep", markdown: "Old", metadata: {} },
    { url: "https://example.test/docs/remove", title: "Remove", markdown: "Gone", metadata: {} }
  ];
  await syncCollectionToLibrary(root, collection, first, { metadataStyle: "none", includeTitleHeading: true });
  const second = [{ url: "https://example.test/docs/keep", title: "Keep", markdown: "New", metadata: {} }];
  const result = await syncCollectionToLibrary(root, collection, second, { metadataStyle: "none", includeTitleHeading: true });
  const docs = directory(root, "sharepoint/team-docs/docs");

  assert.deepEqual(result.removed, ["docs/remove.md"]);
  assert.match(docs.files.get("keep.md").content, /New/);
  assert.ok(docs.files.has("remove.md"), "stale local files are preserved for review");
  assert.match(directory(root, "sharepoint/team-docs").files.get("_sync-report.md").content, /docs\/remove\.md/);
});
