import { loadSettings } from "../lib/settings.js";
import { parseUrlList, parseSitemap } from "../lib/discover.js";
import { crawlSite, fetchSitemapPages } from "../lib/crawl.js";
import { buildPageFiles, buildIndexMarkdown, buildAggregateMarkdown } from "../lib/aggregate.js";
import { createZip } from "../lib/zip.js";
import { downloadBlob, downloadText } from "../lib/download.js";
import { slugify } from "../lib/slug.js";

const form = document.getElementById("crawl-form");
const urlsInput = document.getElementById("urls");
const startInput = document.getElementById("start");
const startLabel = document.getElementById("start-label");
const maxPagesInput = document.getElementById("max-pages");
const sameHostInput = document.getElementById("same-host");
const outputSelect = document.getElementById("output");
const startButton = document.getElementById("start-btn");
const stopButton = document.getElementById("stop-btn");
const summary = document.getElementById("summary");
const logList = document.getElementById("log");

let stopFlag = false;

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
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
  stopButton.addEventListener("click", () => {
    stopFlag = true;
    log("Stopping after the current page...");
  });
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

async function start() {
  stopFlag = false;
  setRunning(true);
  logList.replaceChildren();
  summary.textContent = "";

  try {
    const mode = currentMode();
    const settings = await loadSettings();
    const captureOptions = {
      mode: settings.mode,
      scrollBeforeCapture: settings.scrollBeforeCapture,
      maxScrollMs: settings.maxScrollMs,
      scrollPauseMs: settings.scrollPauseMs,
      dropHidden: settings.dropHidden
    };
    const maxPages = clampInt(maxPagesInput.value, 1, 500, 25);

    let seeds = [];
    let followLinks = false;

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
      await requestOrigins(seeds);
    } else {
      const startUrl = startInput.value.trim();
      if (!/^https?:\/\//i.test(startUrl)) {
        throw new Error("Enter a start URL.");
      }
      seeds = [startUrl];
      followLinks = true;
      await requestOrigins(seeds);
    }

    log(`Capturing up to ${maxPages} page(s)...`);
    const pages = await crawlSite({
      seeds,
      captureOptions,
      maxPages,
      followLinks,
      sameHostOnly: sameHostInput.checked,
      onProgress: handleProgress,
      shouldStop: () => stopFlag
    });

    if (!pages.length) {
      throw new Error("No pages were captured.");
    }

    log(`Captured ${pages.length} page(s). Building output...`);
    await buildOutputs(pages, settings);
    summary.textContent = `Exported ${pages.length} page(s).`;
    log("Done.");
  } catch (error) {
    log(`Error: ${error && error.message ? error.message : error}`, true);
  } finally {
    setRunning(false);
  }
}

function handleProgress(event) {
  if (event.type === "start") {
    log(`Capturing: ${event.url}`);
  } else if (event.type === "done") {
    log(`  -> ${event.title || "(captured)"} [${event.count}]`);
  } else if (event.type === "error") {
    log(`  -> failed: ${event.error}`, true);
  }
}

async function buildOutputs(pages, settings) {
  const siteTitle = deriveSiteTitle(pages);
  const base = slugify(siteTitle, { fallback: "site-export" });
  const options = {
    metadataStyle: settings.metadataStyle,
    includeTitleHeading: settings.includeTitleHeading
  };
  const output = outputSelect.value;

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
  const granted = await chrome.permissions.request({ origins });
  if (!granted) {
    throw new Error("Permission to access those sites was declined.");
  }
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

function setRunning(running) {
  startButton.disabled = running;
  stopButton.disabled = !running;
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
