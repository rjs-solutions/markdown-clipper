import { test } from "node:test";
import assert from "node:assert/strict";
import { writeArtifact } from "../extension/src/lib/vault.js";

// Fake FileSystemDirectoryHandle tree: records every getDirectoryHandle /
// getFileHandle / write call so a test can assert the exact nested path and
// content writeArtifact produced, with no real File System Access API.
function makeFakeDirectory(name = "root") {
  const children = new Map();
  const writes = [];
  const dir = {
    name,
    kind: "directory",
    children,
    writes,
    async getDirectoryHandle(childName, { create } = {}) {
      if (!children.has(childName)) {
        if (!create) {
          throw new Error(`directory not found: ${childName}`);
        }
        children.set(childName, makeFakeDirectory(childName));
      }
      return children.get(childName);
    },
    async getFileHandle(fileName, { create } = {}) {
      const key = `file:${fileName}`;
      if (!children.has(key)) {
        if (!create) {
          throw new Error(`file not found: ${fileName}`);
        }
        children.set(key, {
          name: fileName,
          kind: "file",
          content: null,
          async createWritable() {
            return {
              async write(data) {
                this._pending = data;
              },
              async close() {
                const fileHandle = children.get(key);
                fileHandle.content = this._pending;
                writes.push({ dir: name, fileName, content: this._pending });
              }
            };
          }
        });
      }
      return children.get(key);
    }
  };
  return dir;
}

test("writeArtifact writes into the vault and creates nested directories when permission is granted", async () => {
  const root = makeFakeDirectory("vault-root");
  let downloaderCalled = false;

  const result = await writeArtifact(
    { relativePath: "clips/2026/my page.md", content: "# Hello" },
    {
      getHandle: async () => root,
      checkPermission: async () => "granted",
      download: async () => {
        downloaderCalled = true;
      }
    }
  );

  assert.equal(result.backend, "vault");
  assert.equal(result.ok, true);
  assert.equal(downloaderCalled, false);

  const clipsDir = root.children.get("clips");
  assert.ok(clipsDir, "clips directory was created");
  const yearDir = clipsDir.children.get("2026");
  assert.ok(yearDir, "2026 directory was created");
  const fileEntry = Array.from(yearDir.children.values()).find((entry) => entry.kind === "file");
  assert.ok(fileEntry, "file was created");
  assert.equal(fileEntry.content, "# Hello");
  assert.equal(yearDir.writes[0].content, "# Hello");
});

test("writeArtifact falls back to the injected downloader when no vault handle exists", async () => {
  let downloadArgs = null;

  const result = await writeArtifact(
    { relativePath: "my-page.md", content: "# Fallback" },
    {
      getHandle: async () => null,
      checkPermission: async () => "granted",
      download: async (content, filename, options) => {
        downloadArgs = { content, filename, options };
      }
    }
  );

  assert.equal(result.backend, "downloads");
  assert.equal(result.ok, true);
  assert.deepEqual(downloadArgs, {
    content: "# Fallback",
    filename: "my-page.md",
    options: { saveAs: false }
  });
});

test("writeArtifact falls back to downloads when a handle exists but permission is not granted", async () => {
  const root = makeFakeDirectory("vault-root");
  let downloadArgs = null;

  const result = await writeArtifact(
    { relativePath: "nested/page.md", content: "content" },
    {
      getHandle: async () => root,
      checkPermission: async () => "prompt",
      download: async (content, filename) => {
        downloadArgs = { content, filename };
      }
    }
  );

  assert.equal(result.backend, "downloads");
  assert.equal(result.ok, true);
  assert.deepEqual(downloadArgs, { content: "content", filename: "page.md" });
  assert.equal(root.children.size, 0, "nothing was written into the vault");
});
