import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeActivity } from "../extension/src/lib/activity-summary.js";

test("summarizeActivity reports compact aggregate clip and collection statistics", () => {
  const summary = summarizeActivity([
    { url: "https://example.com/a", clipped: "2026-07-01T10:00:00.000Z" },
    { url: "https://example.com/b", clipped: "2026-07-03T10:00:00.000Z" },
    { url: "https://other.example/c", clipped: "2026-07-02T10:00:00.000Z" }
  ], [{ id: "one" }, { id: "two" }]);
  assert.deepEqual(summary, {
    clips: 3,
    sourceSites: 2,
    collections: 2,
    lastClipped: "2026-07-03T10:00:00.000Z"
  });
});

test("summarizeActivity tolerates empty and malformed inputs", () => {
  assert.deepEqual(summarizeActivity(null, null), {
    clips: 0,
    sourceSites: 0,
    collections: 0,
    lastClipped: ""
  });
});
