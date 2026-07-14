// MV3 background service worker. Owns crawl orchestration and nothing else --
// the rest of the extension's architecture (popup, options, content capture)
// is unchanged.
//
// Service workers are ephemeral: Chrome can (and will) kill this file after
// ~30s of no pending extension-API activity, and can force-terminate a long
// crawl regardless of activity. The crawl loop in lib/crawl.js checkpoints
// the full job state (queue/visited/results/errors) to chrome.storage.local
// after EVERY page via crawl-state.saveJob, so a killed worker never loses
// more than the page it was mid-capture on. Nothing here assumes the loop
// itself survives: resumeRunningJobs() re-enters any job stuck in "running"
// whenever this file gets a fresh chance to run -- on install/startup, on
// the first message from a reopened crawl UI, and on a periodic "alarms"
// watchdog (the minimum period Chrome allows is 1 minute, so treat it purely
// as a safety net, not the primary driver of a healthy crawl).

import { crawlSite } from "../lib/crawl.js";
import { toRelativeMarkdownPath } from "../lib/sitepath.js";
import {
  createJob,
  loadJob,
  saveJob,
  listJobs,
  resumeJob,
  savePageBody
} from "../lib/crawl-state.js";

const WATCHDOG_ALARM = "crawl-watchdog";
const MAX_LOG_LINES = 300;

const activeRuns = new Set();

function toResultMeta(page) {
  return {
    url: page.url,
    title: page.title,
    path: toRelativeMarkdownPath(page.url, { fallback: "page" }),
    byteLength: new TextEncoder().encode(page.markdown || "").length
  };
}

function appendLog(job, line) {
  const log = [...(job.log || []), line];
  return log.length > MAX_LOG_LINES ? log.slice(log.length - MAX_LOG_LINES) : log;
}

export async function runJob(id) {
  // Claim the id SYNCHRONOUSLY -- has()/add() must not straddle an await, or
  // two near-simultaneous callers (this worker fires resumeRunningJobs from
  // four separate triggers: the top-level call, onStartup, onInstalled, and
  // the crawl:resume-check message -- all of which can land in the same
  // tick) would both pass the has() check before either reached add(),
  // producing two concurrent crawlSite() loops for one job. Everything that
  // needs an await -- including deciding whether the job is even resumable
  // -- happens AFTER the claim, inside the try, so the matching `finally`
  // always releases it: on the early "not resumable" return, on any thrown
  // error from the crawl loop, and on normal completion.
  if (activeRuns.has(id)) {
    return;
  }
  activeRuns.add(id);
  try {
    const resumable = await resumeJob(id);
    if (!resumable) {
      return;
    }
    await runResumedJob(id, resumable);
  } finally {
    activeRuns.delete(id);
  }
}

async function runResumedJob(id, resumable) {
  let job = { ...resumable, status: "running" };
  await saveJob(job);

  // Bodies already persisted to IndexedDB (from a previous run of this job,
  // if this is a resume) shouldn't be written again.
  let bodySavedCount = job.results.length;
  const metaResults = [...job.results];

  try {
    await crawlSite({
      seeds: job.seeds,
      captureOptions: job.options.captureOptions,
      maxPages: job.options.maxPages,
      maxDepth: job.options.maxDepth,
      followLinks: job.options.followLinks,
      sameHostOnly: job.options.sameHostOnly,
      includePatterns: job.options.includePatterns,
      excludePatterns: job.options.excludePatterns,
      retries: job.options.retries,
      retryDelayMs: job.options.retryDelayMs,
      settleMs: job.options.settleMs,
      delayMs: job.options.delayMs,
      queue: job.queue,
      visited: job.visited,
      results: job.results,
      errors: job.errors,
      onProgress: (event) => {
        if (event.type === "start") {
          job.log = appendLog(job, `Capturing: ${event.url}`);
        } else if (event.type === "done") {
          job.log = appendLog(job, `-> ${event.title || "(captured)"} [${event.count}]`);
        } else if (event.type === "error") {
          job.log = appendLog(job, `-> failed: ${event.error}`);
        } else if (event.type === "warning") {
          job.log = appendLog(job, `-> ${event.message}`);
        }
      },
      onPersist: async (state) => {
        for (let i = bodySavedCount; i < state.results.length; i += 1) {
          const page = state.results[i];
          await savePageBody(id, page);
          metaResults.push(toResultMeta(page));
        }
        bodySavedCount = state.results.length;
        job = {
          ...job,
          queue: state.queue,
          visited: state.visited,
          errors: state.errors,
          results: metaResults,
          stats: { captured: metaResults.length, failed: state.errors.length }
        };
        await saveJob(job);
      },
      shouldPause: async () => {
        const fresh = await loadJob(id);
        return !fresh || fresh.status === "paused" || fresh.status === "cancelled";
      }
    });

    const finalJob = await loadJob(id);
    if (finalJob && finalJob.status !== "paused" && finalJob.status !== "cancelled") {
      await saveJob({ ...finalJob, status: "done" });
    }
  } catch (error) {
    const failed = await loadJob(id);
    if (failed) {
      await saveJob({
        ...failed,
        status: "failed",
        log: appendLog(failed, `Crawl failed: ${error && error.message ? error.message : error}`)
      });
    }
  }
}

async function resumeRunningJobs() {
  const jobs = await listJobs();
  for (const job of jobs) {
    if (job.status === "running" && !activeRuns.has(job.id)) {
      runJob(job.id);
    }
  }
}

async function handleMessage(message) {
  switch (message && message.type) {
    case "crawl:start": {
      const job = createJob({ seeds: message.seeds, options: message.options || {} });
      await saveJob(job);
      runJob(job.id);
      return { id: job.id };
    }
    case "crawl:pause": {
      const job = await loadJob(message.id);
      if (job && job.status === "running") {
        await saveJob({ ...job, status: "paused" });
      }
      return { ok: true };
    }
    case "crawl:resume": {
      const job = await loadJob(message.id);
      if (job && job.status !== "done") {
        await saveJob({ ...job, status: "running" });
        runJob(job.id);
      }
      return { ok: true };
    }
    case "crawl:cancel": {
      const job = await loadJob(message.id);
      if (job) {
        await saveJob({ ...job, status: "cancelled" });
      }
      return { ok: true };
    }
    case "crawl:list": {
      return { jobs: await listJobs() };
    }
    case "crawl:resume-check": {
      await resumeRunningJobs();
      return { ok: true };
    }
    default:
      return { error: `Unknown message type: ${message && message.type}` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error && error.message ? error.message : String(error) }));
  return true; // keep the message channel open for the async response
});

chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) {
    resumeRunningJobs();
  }
});

chrome.runtime.onStartup.addListener(resumeRunningJobs);
chrome.runtime.onInstalled.addListener(resumeRunningJobs);

// Also try immediately: any reason this file was (re)loaded is a reason to
// check for a job that got cut off mid-run.
resumeRunningJobs();
