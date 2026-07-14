// Controller for the site-export page. The crawl itself runs in the
// background service worker (extension/src/background/service-worker.js) so
// it survives this window being closed; this page just starts/pauses/
// resumes/cancels a job by messaging the worker and renders progress read
// straight out of the persisted job (chrome.storage.local), so reopening the
// window shows the crawl exactly where it left off.

import { loadSettings } from "../lib/settings.js";
import { parseUrlList, parseSitemap } from "../lib/discover.js";
import { fetchSitemapPages } from "../lib/crawl.js";
import { buildPageFiles, buildIndexMarkdown, buildAggregateMarkdown } from "../lib/aggregate.js";
import { createZip } from "../lib/zip.js";
import { downloadBlob, downloadText } from "../lib/download.js";
import { slugify } from "../lib/slug.js";
import { applyTheme } from "../lib/theme.js";
import { loadJob, saveJob, getJobBodies } from "../lib/crawl-state.js";

const CURRENT_JOB_KEY = "crawl-ui-current-job";
const POLL_MS = 700;

const form = document.getElementById("crawl-form");
const urlsInput = document.getElementById("urls");
const startInput = document.getElementById("start");
const startLabel = document.getElementById("start-label");
const maxPagesInput = document.getElementById("max-pages");
const maxDepthInput = document.getElementById("max-depth");
const includePatternsInput = document.getElementById("include-patterns");
const excludePatternsInput = document.getElementById("exclude-patterns");
const outputSelect = document.getElementById("output");
const startButton = document.getElementById("start-btn");
const pauseButton = document.getElementById("pause-btn");
const resumeButton = document.getElementById("resume-btn");
const stopButton = document.getElementById("stop-btn");
const summary = document.getElementById("summary");
const logList = document.getElementById("log");

let pollTimer = null;
let renderedLogLines = 0;
let currentSettings = null;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  currentSettings = await loadSettings();
  applyTheme(currentSettings.theme);

  const seed = new URLSearchParams(location.search).get("seed");
  if (seed) {
    urlsInput.value = seed;
    startInput.value = seed;
  }
  for (const radio of form.querySelectorAll("input[name='mode']")) {
    radio.addEventListener("change", reflectMode);
  }
  reflectMode();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    start();
  });
  pauseButton.addEventListener("click", () => sendMessage({ type: "crawl:pause", id: getCurrentJobId() }));
  resumeButton.addEventListener("click", () => sendMessage({ type: "crawl:resume", id: getCurrentJobId() }));
  stopButton.addEventListener("click", () => sendMessage({ type: "crawl:cancel", id: getCurrentJobId() }));

  // A worker that was killed while this window was closed only resumes on
  // its next wake-up; give it one now instead of waiting for the 1-minute
  // alarm watchdog.
  await sendMessage({ type: "crawl:resume-check" });

  const existingId = await getStoredJobId();
  if (existingId) {
    const job = await loadJob(existingId);
    if (job && job.status !== "done" && job.status !== "cancelled" && job.status !== "failed") {
      setCurrentJobId(existingId);
      renderedLogLines = 0;
      logList.replaceChildren();
      setRunning(job.status);
      startPolling(existingId);
    } else if (job) {
      renderJobSnapshot(job);
    }
  }
}

function currentMode() {
  return form.querySelector("input[name='mode']:checked").value;
}

function reflectMode() {
  const mode = currentMode();
  for (const field of form.querySelectorAll("[data-mode]")) {
    const modes = field.getAttribute("data-mode").split(" ");
    field.style.display = modes.includes(mode) ? "" : "none";
  }
  startLabel.textContent = mode === "sitemap" ? "Sitemap URL" : "Start URL";
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response));
  });
}

let cachedJobId = null;

function getCurrentJobId() {
  return cachedJobId;
}

function setCurrentJobId(id) {
  cachedJobId = id;
  chrome.storage.local.set({ [CURRENT_JOB_KEY]: id });
}

async function getStoredJobId() {
  const stored = await chrome.storage.local.get(CURRENT_JOB_KEY);
  cachedJobId = stored[CURRENT_JOB_KEY] || null;
  return cachedJobId;
}

function parsePatterns(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function start() {
  logList.replaceChildren();
  renderedLogLines = 0;
  summary.textContent = "";

  try {
    const mode = currentMode();
    const maxPages = clampInt(maxPagesInput.value, 1, 500, 25);
    const maxDepth = clampInt(maxDepthInput.value, 0, 20, 5);
    const includePatterns = parsePatterns(includePatternsInput.value);
    const excludePatterns = parsePatterns(excludePatternsInput.value);

    let seeds = [];
    let followLinks = false;

    // Resolve seeds and request host permission FIRST, before any other
    // await, so the Start click's user activation is still valid when we
    // call chrome.permissions.request (which requires it). Permissions
    // granted here are extension-wide, so the background service worker
    // that actually runs the crawl already has them -- nothing to hand off.
    if (mode === "list") {
      seeds = parseUrlList(urlsInput.value);
      if (!seeds.length) {
        throw new Error("Enter at least one http(s) URL.");
      }
      await requestOrigins(seeds);
    } else if (mode === "sitemap") {
      const sitemapUrl = startInput.value.trim();
      if (!/^https?:\/\//i.test(sitemapUrl)) {
        throw new Error("Enter a sitemap URL.");
      }
      await requestOrigins([sitemapUrl]);
      log(`Fetching sitemap: ${sitemapUrl}`);
      seeds = await fetchSitemapPages(sitemapUrl, { maxPages, parse: parseSitemap });
      if (!seeds.length) {
        throw new Error("No URLs found in that sitemap.");
      }
      log(`Found ${seeds.length} URL(s) in the sitemap.`);
      const permitted = await keepPermittedUrls(seeds);
      if (permitted.length !== seeds.length) {
        log(`Skipped ${seeds.length - permitted.length} URL(s) on unapproved origins. Use URL-list mode to approve multiple hosts.`);
      }
      seeds = permitted;
      if (!seeds.length) {
        throw new Error("The sitemap did not contain pages on an approved origin.");
      }
    } else {
      const startUrl = startInput.value.trim();
      if (!/^https?:\/\//i.test(startUrl)) {
        throw new Error("Enter a start URL.");
      }
      seeds = [startUrl];
      followLinks = true;
      await requestOrigins(seeds);
    }

    const settings = await loadSettings();
    currentSettings = settings;
    const captureOptions = {
      mode: settings.mode,
      scrollBeforeCapture: settings.scrollBeforeCapture,
      maxScrollMs: settings.maxScrollMs,
      scrollPauseMs: settings.scrollPauseMs,
      dropHidden: settings.dropHidden
    };

    log(`Capturing up to ${maxPages} page(s)...`);
    const response = await sendMessage({
      type: "crawl:start",
      seeds,
      options: {
        captureOptions,
        maxPages,
        maxDepth,
        followLinks,
        sameHostOnly: true,
        includePatterns,
        excludePatterns,
        retries: 2,
        retryDelayMs: 500,
        outputMode: outputSelect.value
      }
    });
    if (!response || !response.id) {
      throw new Error((response && response.error) || "Could not start the crawl.");
    }
    setCurrentJobId(response.id);
    setRunning("running");
    startPolling(response.id);
  } catch (error) {
    log(`Error: ${error && error.message ? error.message : error}`, true);
    setRunning("done");
  }
}

function startPolling(jobId) {
  stopPolling();
  pollTimer = setInterval(() => pollJob(jobId), POLL_MS);
  pollJob(jobId);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollJob(jobId) {
  const job = await loadJob(jobId);
  if (!job) {
    return;
  }
  renderJobSnapshot(job);
  setRunning(job.status);

  if (job.status === "done" || job.status === "failed") {
    stopPolling();
    if (job.status === "done" && !job.exported) {
      await exportJob(job);
    }
  }
}

function renderJobSnapshot(job) {
  const lines = job.log || [];
  for (let i = renderedLogLines; i < lines.length; i += 1) {
    log(lines[i], /failed/i.test(lines[i]));
  }
  renderedLogLines = lines.length;
  summary.textContent = `${job.status} — ${job.results.length} page(s) captured, ${job.errors.length} error(s), ${job.queue.length} queued.`;
}

async function exportJob(job) {
  try {
    log(`Captured ${job.results.length} page(s). Building output...`);
    const bodies = await getJobBodies(job.id);
    const bodyByUrl = new Map(bodies.map((body) => [body.url, body]));
    const pages = job.results
      .map((meta) => {
        const body = bodyByUrl.get(meta.url);
        return body ? { url: body.url, title: body.title, markdown: body.markdown, metadata: body.metadata } : null;
      })
      .filter(Boolean);

    if (!pages.length) {
      throw new Error("No pages were captured.");
    }

    await buildOutputs(pages, currentSettings, job.options.outputMode);
    summary.textContent = `Exported ${pages.length} page(s).`;
    log("Done.");
    await saveJob({ ...job, exported: true });
  } catch (error) {
    log(`Error: ${error && error.message ? error.message : error}`, true);
  }
}

async function buildOutputs(pages, settings, outputMode) {
  const siteTitle = deriveSiteTitle(pages);
  const base = slugify(siteTitle, { fallback: "site-export" });
  const options = {
    metadataStyle: settings.metadataStyle,
    includeTitleHeading: settings.includeTitleHeading
  };
  const output = outputMode || "zip";

  if (output === "zip" || output === "both") {
    const files = buildPageFiles(pages, options);
    const index = buildIndexMarkdown(files, { siteTitle });
    const entries = files.map((file) => ({ name: file.path, data: file.content }));
    entries.push({ name: "index.md", data: index });
    await downloadBlob(createZip(entries), `${base}.zip`);
    log(`Wrote ${files.length} file(s) + index.md to ${base}.zip`);
  }
  if (output === "aggregate" || output === "both") {
    await downloadText(buildAggregateMarkdown(pages, { siteTitle }), `${base}.md`);
    log(`Wrote ${base}.md`);
  }
}

function deriveSiteTitle(pages) {
  try {
    return new URL(pages[0].url).hostname;
  } catch {
    return "site-export";
  }
}

async function requestOrigins(urls) {
  const origins = [...new Set(urls.map(originPattern).filter(Boolean))];
  if (!origins.length) {
    return;
  }
  // Call request() as the first asynchronous operation from the Start click.
  // Chrome resolves already-granted origins without showing another prompt.
  const granted = await chrome.permissions.request({ origins });
  if (!granted) {
    throw new Error("Permission to access those sites was declined.");
  }
}

async function keepPermittedUrls(urls) {
  const allowed = [];
  for (const url of urls) {
    const origin = originPattern(url);
    if (origin && await chrome.permissions.contains({ origins: [origin] })) {
      allowed.push(url);
    }
  }
  return allowed;
}

function originPattern(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return "";
  }
}

function clampInt(value, min, max, fallback) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function setRunning(status) {
  const running = status === "running" || status === "queued";
  const paused = status === "paused";
  startButton.disabled = running || paused;
  pauseButton.disabled = !running;
  resumeButton.disabled = !paused;
  stopButton.disabled = !(running || paused);
}

function log(message, isError = false) {
  const item = document.createElement("li");
  item.textContent = message;
  if (isError) {
    item.classList.add("is-error");
  }
  logList.appendChild(item);
  logList.scrollTop = logList.scrollHeight;
}
