// Vendors third-party libraries into extension/src/vendor/ as browser ES modules.
// No bundler: the extension loads these files directly (content side via dynamic
// import, pages via <script type="module">). Re-run with: npm run vendor
//
// Why vendored: the Chrome extension ships from extension/ with CSP script-src
// 'self', so every script must be a local file. node_modules is dev-only.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(root, "extension", "src", "vendor");

function version(pkg) {
  return require(`${pkg}/package.json`).version;
}

async function copyAsIs(from, to, banner) {
  const body = await readFile(join(root, "node_modules", from), "utf8");
  await writeFile(join(vendorDir, to), `${banner}\n${body}`, "utf8");
  console.log(`  ${to}`);
}

function banner(name, ver, license, url) {
  return `/* Vendored: ${name} v${ver} (${license}). Source: ${url}\n   Do not edit by hand — regenerate with \`npm run vendor\`. */`;
}

await mkdir(vendorDir, { recursive: true });
console.log("Vendoring libraries -> extension/src/vendor/");

await copyAsIs(
  "turndown/lib/turndown.browser.es.js",
  "turndown.js",
  banner("turndown", version("turndown"), "MIT", "https://github.com/mixmark-io/turndown")
);

await copyAsIs(
  "turndown-plugin-gfm/lib/turndown-plugin-gfm.browser.es.js",
  "turndown-plugin-gfm.js",
  banner("turndown-plugin-gfm", version("turndown-plugin-gfm"), "MIT", "https://github.com/mixmark-io/turndown-plugin-gfm")
);

// Readability is CommonJS (ends with a `typeof module` guard that is inert under
// ESM). Append a named export so we can `import { Readability }`.
{
  const ver = version("@mozilla/readability");
  const src = await readFile(join(root, "node_modules", "@mozilla", "readability", "Readability.js"), "utf8");
  const head = banner("@mozilla/readability", ver, "Apache-2.0", "https://github.com/mozilla/readability");
  await writeFile(join(vendorDir, "readability.js"), `${head}\n${src}\nexport { Readability };\n`, "utf8");
  console.log("  readability.js");
}

console.log("Done.");
