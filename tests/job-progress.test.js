import test from "node:test";
import assert from "node:assert/strict";
import { formatClock, getJobProgress } from "../extension/src/lib/job-progress.js";

test("collection progress counts captured and failed pages as completed work", () => {
  const job = {
    status: "running",
    startedAt: 1_000,
    options: { maxPages: 10 },
    results: [{}, {}],
    errors: [{}],
    queue: [{}, {}, {}, {}, {}, {}, {}]
  };
  assert.deepEqual(getJobProgress(job, 31_000), {
    captured: 2,
    failed: 1,
    completed: 3,
    total: 10,
    percent: 30,
    elapsedMs: 30_000,
    etaMs: 70_000
  });
});

test("collection progress expands the cap for failed attempts and completes at 100 percent", () => {
  const running = getJobProgress({
    status: "running",
    startedAt: 0,
    options: { maxPages: 2 },
    results: [{}],
    errors: [{}],
    queue: [{}, {}, {}]
  }, 10_000);
  assert.equal(running.total, 3);

  const done = getJobProgress({ ...running, status: "done", results: [{}, {}], errors: [{}], queue: [] }, 10_000);
  assert.equal(done.total, 3);
  assert.equal(done.percent, 100);
  assert.equal(done.etaMs, null);
});

test("formatClock always returns an HH:MM:SS duration", () => {
  assert.equal(formatClock(0), "00:00:00");
  assert.equal(formatClock(3_661_000), "01:01:01");
});
