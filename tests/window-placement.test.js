import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionWindowBounds } from "../extension/src/lib/window-placement.js";

test("collection window opens left of the saved in-page panel and stays in the browser", () => {
  const bounds = collectionWindowBounds({ left: 100, top: 40, width: 1800, height: 1000 }, { left: 1300, top: 12, width: 480, height: 800 });
  assert.equal(bounds.left, 766);
  assert.equal(bounds.top, 96);
  assert.equal(bounds.width, 620);
  assert.equal(bounds.height, 760);
});

test("collection window clamps to the browser's left edge on a narrow window", () => {
  const bounds = collectionWindowBounds({ left: 50, top: 0, width: 900, height: 700 }, { left: 400, width: 480 });
  assert.equal(bounds.left, 62);
  assert.equal(bounds.height, 628);
});
