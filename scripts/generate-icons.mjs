// Rasterize extension/assets/icons/icon-source.svg into the PNG sizes Chrome
// needs. The SVG is the single source of truth. Re-run with: npm run icons

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "extension", "assets", "icons");
const sizes = [16, 32, 48, 128];

await mkdir(iconsDir, { recursive: true });
const svg = await readFile(join(iconsDir, "icon-source.svg"), "utf8");

for (const size of sizes) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)"
  });
  const png = resvg.render().asPng();
  await writeFile(join(iconsDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}
console.log("Done.");
