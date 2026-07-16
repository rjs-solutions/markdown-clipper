import { test } from "node:test";
import assert from "node:assert/strict";
import { isCollectionSyncDue } from "../extension/src/lib/collection-schedule.js";

test("collection sync reminders become due at weekly and monthly intervals", () => {
  const day = 24 * 60 * 60 * 1000;
  assert.equal(isCollectionSyncDue("weekly", 1, 1 + 6 * day), false);
  assert.equal(isCollectionSyncDue("weekly", 1, 1 + 7 * day), true);
  assert.equal(isCollectionSyncDue("monthly", 1, 1 + 29 * day), false);
  assert.equal(isCollectionSyncDue("monthly", 1, 1 + 30 * day), true);
  assert.equal(isCollectionSyncDue("off", 0, Date.now()), false);
});
