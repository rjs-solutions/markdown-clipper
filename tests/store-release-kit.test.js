import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(relative) {
  return readFile(new URL(relative, root), "utf8");
}

test("store release kit defines five sanitized capture scenarios and branded outputs", async () => {
  const capture = await text("scripts/capture-store-screenshots.mjs");
  const assets = await text("scripts/create-store-assets.mjs");
  const expectedRaw = [
    "01-capture-raw.png",
    "02-collections-raw.png",
    "03-collection-capture-raw.png",
    "04-knowledge-base-raw.png",
    "05-editor-raw.png"
  ];
  const expectedFinal = [
    "01-capture-1280x800.png",
    "02-collections-1280x800.png",
    "03-collection-capture-1280x800.png",
    "04-knowledge-base-1280x800.png",
    "05-editor-1280x800.png"
  ];
  for (const filename of expectedRaw) assert.match(capture, new RegExp(filename.replaceAll(".", "\\.")));
  for (const filename of expectedFinal) assert.match(assets, new RegExp(filename.replaceAll(".", "\\.")));
  assert.match(capture, /source: "sanitized local demo"/);
  assert.doesNotMatch(capture, /gehealthcare|223028173|cmc-ai-central/i);
  assert.match(assets, /small-promo-tile-440x280\.png/);
  assert.match(assets, /marquee-promo-tile-1400x560\.png/);
  assert.match(assets, /social-preview-1280x640\.png/);
  assert.match(assets, /docsImageDir/);
  assert.match(assets, /capture\.png/);
  assert.match(assets, /collections\.png/);
});

test("store documentation includes dashboard, privacy, image, and reviewer guidance", async () => {
  const listing = await text("docs/STORE_LISTING.md");
  const publishing = await text("docs/PUBLISHING.md");
  const screenshots = await text("docs/SCREENSHOTS.md");
  assert.match(listing, /Single purpose/);
  assert.match(listing, /Permission justification drafts/);
  assert.match(listing, /Privacy practices dashboard selections/);
  assert.match(listing, /Reviewer test instructions/);
  assert.match(listing, /Distribution selections/);
  assert.match(publishing, /Dashboard field map/);
  assert.match(screenshots, /1280×800/);
  assert.match(screenshots, /440×280/);
  assert.match(screenshots, /1400×560/);
  assert.match(screenshots, /npm run store:prepare/);
});
