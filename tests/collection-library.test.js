import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectionLibraryPath,
  normalizeLibraryPath,
  uniqueCollectionLibraryPath,
  syncCollectionToLibrary,
  writeCollectionLibraryCatalog,
  reviewRemovedCollectionFile,
  moveCollectionLibraryFolder
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
    kind: "directory",
    name,
    directories,
    files,
    async *entries() {
      for (const entry of directories) yield entry;
      for (const entry of files) yield entry;
    },
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
          kind: "file",
          content: "",
          async createWritable() {
            const file = this;
            return { async write(value) { file.pending = String(value); }, async close() { file.content = file.pending; } };
          },
          async getFile() { const file = this; return { async text() { return file.content; } }; }
        });
      }
      return files.get(fileName);
    },
    async removeEntry(fileName) {
      if (!files.delete(fileName) && !directories.delete(fileName)) throw missing(fileName);
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
  assert.equal(result.updatedCount, 1);
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
  assert.equal(result.updatedCount, 1);
  assert.match(docs.files.get("keep.md").content, /New/);
  assert.ok(docs.files.has("remove.md"), "stale local files are preserved for review");
  assert.match(directory(root, "sharepoint/team-docs").files.get("_sync-report.md").content, /docs\/remove\.md/);
});

test("unchanged content is not rewritten on incremental sync", async () => {
  const root = makeDirectory();
  const pages = [{ url: "https://example.test/docs/keep", title: "Keep", markdown: "Same", metadata: {} }];
  await syncCollectionToLibrary(root, collection, pages, { metadataStyle: "none", includeTitleHeading: true });
  const result = await syncCollectionToLibrary(root, collection, pages, { metadataStyle: "none", includeTitleHeading: true });
  assert.equal(result.updatedCount, 0);
  assert.equal(result.unchangedCount, 1);
});

test("multi-host custom collections group page files by hostname", async () => {
  const root = makeDirectory();
  const custom = { id: "mixed", name: "Mixed", type: "custom" };
  const pages = [
    { url: "https://one.test/docs/start", title: "One", markdown: "One", metadata: {} },
    { url: "https://two.test/docs/start", title: "Two", markdown: "Two", metadata: {} }
  ];
  await syncCollectionToLibrary(root, custom, pages, { metadataStyle: "none", includeTitleHeading: true });
  const target = directory(root, "custom/mixed");
  assert.ok(directory(target, "one.test/docs").files.has("start.md"));
  assert.ok(directory(target, "two.test/docs").files.has("start.md"));
});

test("library catalog links every collection that has been synced", async () => {
  const root = makeDirectory();
  const pages = [{ url: "https://example.test/docs/start", title: "Start", markdown: "Hello", metadata: {} }];
  await syncCollectionToLibrary(root, collection, pages, { metadataStyle: "none", includeTitleHeading: true });
  const result = await writeCollectionLibraryCatalog(root, [collection, { id: "not-synced", name: "Later", type: "website" }]);
  assert.equal(result.count, 1);
  assert.match(root.files.get("_collections.md").content, /sharepoint\/team-docs\/index\.md/);
  assert.match(root.files.get("_collections.json").content, /"name": "Team Docs"/);
});

test("a synced collection can be moved to a different library subfolder", async () => {
  const root = makeDirectory();
  const pages = [{ url: "https://example.test/docs/start", title: "Start", markdown: "Hello", metadata: {} }];
  await syncCollectionToLibrary(root, collection, pages, { metadataStyle: "none", includeTitleHeading: true });

  const result = await moveCollectionLibraryFolder(root, collection, "SharePoint Markdowns/Site A");
  assert.deepEqual(result, { from: "sharepoint/team-docs", to: "SharePoint Markdowns/Site A", fileCount: 4 });
  assert.equal(root.directories.get("sharepoint").directories.has("team-docs"), false);
  const target = directory(root, "SharePoint Markdowns/Site A");
  assert.match(target.files.get("index.md").content, /Start/);
  assert.match(target.files.get("collection.json").content, /"folder": "SharePoint Markdowns\/Site A"/);
  assert.equal(directory(target, "docs").files.get("start.md").content, "# Start\n\nHello\n");
});

test("collection moves reject existing and nested destinations", async () => {
  const root = makeDirectory();
  const pages = [{ url: "https://example.test/docs/start", title: "Start", markdown: "Hello", metadata: {} }];
  await syncCollectionToLibrary(root, collection, pages, { metadataStyle: "none", includeTitleHeading: true });
  await root.getDirectoryHandle("occupied", { create: true });

  await assert.rejects(moveCollectionLibraryFolder(root, collection, "occupied"), /already exists/);
  await assert.rejects(moveCollectionLibraryFolder(root, collection, "sharepoint/team-docs/nested"), /outside the current folder/);
  assert.ok(directory(root, "sharepoint/team-docs").files.has("collection.json"));
});

test("removed local files can be explicitly archived after review", async () => {
  const root = makeDirectory();
  const first = [
    { url: "https://example.test/docs/keep", title: "Keep", markdown: "Keep", metadata: {} },
    { url: "https://example.test/docs/old", title: "Old", markdown: "Old", metadata: {} }
  ];
  await syncCollectionToLibrary(root, collection, first, { metadataStyle: "none", includeTitleHeading: true });
  await syncCollectionToLibrary(root, collection, first.slice(0, 1), { metadataStyle: "none", includeTitleHeading: true });
  const result = await reviewRemovedCollectionFile(root, collection, "docs/old.md", "archive", { reviewedAt: Date.UTC(2026, 6, 16) });
  assert.equal(result.remaining, 0);
  assert.equal(directory(root, "sharepoint/team-docs/docs").files.has("old.md"), false);
  assert.ok(directory(root, "sharepoint/team-docs/_archive/2026-07-16/docs").files.has("old.md"));
});
