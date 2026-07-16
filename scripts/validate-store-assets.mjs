import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const storeRoot = join(root, "dist", "store-listing");
const required = [
  ["screenshots/01-capture-1280x800.png", 1280, 800],
  ["screenshots/02-collections-1280x800.png", 1280, 800],
  ["screenshots/03-collection-import-1280x800.png", 1280, 800],
  ["screenshots/04-knowledge-base-1280x800.png", 1280, 800],
  ["screenshots/05-editor-1280x800.png", 1280, 800],
  ["promo-tiles/small-promo-tile-440x280.png", 440, 280]
];
const optional = [["promo-tiles/marquee-promo-tile-1400x560.png", 1400, 560]];
const failures = [];

function validate([relative, width, height], isRequired = true) {
  const path = join(storeRoot, relative);
  if (!existsSync(path)) {
    if (isRequired) failures.push(`Missing ${relative}`);
    return;
  }
  const bytes = readFileSync(path);
  if (bytes.toString("ascii", 1, 4) !== "PNG") {
    failures.push(`${relative} must be PNG`);
    return;
  }
  const actualWidth = bytes.readUInt32BE(16);
  const actualHeight = bytes.readUInt32BE(20);
  if (actualWidth !== width || actualHeight !== height) {
    failures.push(`${relative} must be ${width}x${height}; got ${actualWidth}x${actualHeight}`);
  }
}

required.forEach((asset) => validate(asset));
optional.forEach((asset) => validate(asset, false));

if (failures.length) {
  console.error(`Store asset validation failed:\n- ${failures.join("\n- ")}\nSee docs/SCREENSHOTS.md.`);
  process.exit(1);
}

console.log("Chrome Web Store assets are present and correctly sized.");
