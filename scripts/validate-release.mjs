import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = join(root, "extension");
const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function extensionFile(pathWithQuery) {
  const path = String(pathWithQuery || "").split("?")[0];
  check(path && existsSync(join(extensionRoot, path)), `Missing manifest resource: ${path}`);
}

function pngDimensions(path) {
  const bytes = readFileSync(path);
  check(bytes.toString("ascii", 1, 4) === "PNG", `${path} is not a PNG file`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

check(manifest.manifest_version === 3, "Manifest must use version 3");
check(manifest.version === packageJson.version, "Manifest and package versions must match");
check(!manifest.content_scripts, "Persistent content_scripts are outside the on-demand architecture");
check(!manifest.optional_permissions, "Unexpected optional API permission; justify it before adding");
check(JSON.stringify(manifest.host_permissions) === JSON.stringify(["https://cdn.syndication.twimg.com/*"]),
  "Install-time host permissions changed");
check(JSON.stringify(manifest.optional_host_permissions) === JSON.stringify(["http://*/*", "https://*/*"]),
  "Optional host permission ceiling changed");
check(!manifest.content_security_policy.extension_pages.includes("unsafe-eval"), "CSP must not allow unsafe-eval");

extensionFile(manifest.background.service_worker);
extensionFile(manifest.action.default_popup);
extensionFile(manifest.options_page);
extensionFile(manifest.side_panel.default_path);

for (const [size, path] of Object.entries(manifest.icons || {})) {
  extensionFile(path);
  const dimensions = pngDimensions(join(extensionRoot, path));
  check(dimensions.width === Number(size) && dimensions.height === Number(size),
    `${path} must be ${size}x${size}, got ${dimensions.width}x${dimensions.height}`);
}

const releaseDocs = ["PRIVACY.md", "CHANGELOG.md", "docs/PUBLISHING.md", "docs/STORE_LISTING.md", "docs/SCREENSHOTS.md"];
for (const path of releaseDocs) check(existsSync(join(root, path)), `Missing release document: ${path}`);
check(readFileSync(join(root, "CHANGELOG.md"), "utf8").includes(manifest.version),
  `CHANGELOG.md does not mention ${manifest.version}`);

if (failures.length) {
  console.error(`Release validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Release validation passed for Markdown Clipper ${manifest.version}.`);
