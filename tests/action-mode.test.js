import { test } from "node:test";
import assert from "node:assert/strict";
import { popupPathForAction } from "../extension/src/lib/action-mode.js";

test("popup mode keeps the popup path so onClicked never fires", () => {
  assert.equal(popupPathForAction("popup"), "src/popup/index.html");
});

test("sidepanel mode clears the popup path so onClicked fires", () => {
  assert.equal(popupPathForAction("sidepanel"), "");
});

test("inpage mode clears the popup path so onClicked fires", () => {
  assert.equal(popupPathForAction("inpage"), "");
});

test("an unknown or undefined value falls back to the safe popup path", () => {
  assert.equal(popupPathForAction("bogus"), "src/popup/index.html");
  assert.equal(popupPathForAction(undefined), "src/popup/index.html");
});
