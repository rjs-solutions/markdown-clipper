import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "extension", "manifest.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("manifest is MV3 and named Markdown Clipper", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Markdown Clipper");
});

test("no host permissions are requested at install", () => {
  assert.ok(
    !("host_permissions" in manifest) || manifest.host_permissions.length === 0,
    "should not declare install-time host_permissions"
  );
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
});

test("base permissions are exactly the expected minimal set", () => {
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ["activeTab", "downloads", "scripting", "sidePanel", "storage"].sort()
  );
  assert.deepEqual(manifest.optional_permissions, ["tabs"]);
});

test("release versions match and the side-panel entry is packaged", () => {
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.side_panel.default_path, "src/popup/index.html?panel=1");
});

test("collector modules are web-accessible for dynamic-import injection", () => {
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.ok(resources.includes("src/content/*.js"));
  assert.ok(resources.includes("src/lib/*.js"));
  assert.ok(resources.includes("src/vendor/*.js"));
});
