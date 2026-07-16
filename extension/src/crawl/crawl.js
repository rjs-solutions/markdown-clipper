import { loadSettings } from "../lib/settings.js";
import { parseUrlList, parseSitemap } from "../lib/discover.js";
import { fetchSitemapPages } from "../lib/crawl.js";
import { fetchLlmsPages } from "../lib/llms.js";
import { readCollectionFile } from "../lib/collection-import.js";
import { buildPageFiles, buildIndexMarkdown, buildAggregateMarkdown } from "../lib/aggregate.js";
import { createZip } from "../lib/zip.js";
import { downloadBlob, downloadText } from "../lib/download.js";
import { slugify } from "../lib/slug.js";
import { applyTheme } from "../lib/theme.js";
import { loadJob, saveJob, getJobBodies } from "../lib/crawl-state.js";
import { createCustomCollection, loadCollections, saveCollections } from "../lib/collections.js";
import { loadSiteInventories } from "../lib/sharepoint-inventory.js";
import { collectionExportPreset, matchSavedCollection } from "../lib/collection-export.js";
import { syncCollectionToLibrary, writeCollectionLibraryCatalog } from "../lib/collection-library.js";
import { loadCollectionLibraryHandle, ensurePermission } from "../lib/vault-handle.js";
import { markCollectionSyncCompleted } from "../lib/collection-schedule.js";
import { saveCollectionHealth } from "../lib/collection-health.js";
import { formatClock, getJobProgress } from "../lib/job-progress.js";

const CURRENT_JOB_KEY = "crawl-ui-current-job";
const SYNC_QUEUE_KEY = "crawl-ui-sync-queue";
const POLL_MS = 700;

const form = document.getElementById("crawl-form");
const urlsInput = document.getElementById("urls");
const urlCount = document.getElementById("url-count");
const fileInput = document.getElementById("url-file");
const importFileButton = document.getElementById("import-file");
const importStatus = document.getElementById("import-status");
const collectionNameInput = document.getElementById("collection-name");
const saveCollectionButton = document.getElementById("save-collection");
const startInput = document.getElementById("start");
const startLabel = document.getElementById("start-label");
const maxPagesInput = document.getElementById("max-pages");
const maxDepthInput = document.getElementById("max-depth");
const includePatternsInput = document.getElementById("include-patterns");
const excludePatternsInput = document.getElementById("exclude-patterns");
const outputSelect = document.getElementById("output");
const destinationSelect = document.getElementById("destination");
const outputHint = document.getElementById("output-hint");
const startButton = document.getElementById("start-btn");
const pauseButton = document.getElementById("pause-btn");
const resumeButton = document.getElementById("resume-btn");
const stopButton = document.getElementById("stop-btn");
const summary = document.getElementById("summary");
const logList = document.getElementById("log");
const progressSection = document.getElementById("progress-section");
const progressSummary = document.getElementById("progress-summary");
const savedCollectionSelect = document.getElementById("saved-collection");
const savedCollectionHint = document.getElementById("saved-collection-hint");
const manageCollectionsButton = document.getElementById("manage-collections");

let pollTimer = null;
let renderedLogLines = 0;
let currentSettings = null;
let savedCollectionEntries = [];
let cachedJobId = null;
let syncQueue = [];
let progressWasAutoRevealed = false;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  currentSettings = await loadSettings();
  applyTheme(currentSettings.theme);
  const params = new URLSearchParams(location.search);
  syncQueue = await restoreSyncQueue(String(params.get("syncQueue") || ""));
  const seed = params.get("seed") || "";
  if (seed) {
    urlsInput.value = seed;
    startInput.value = seed;
  }

  manageCollectionsButton.addEventListener("click", openCollectionsSettings);
  savedCollectionSelect.addEventListener("change", () => applySavedCollection(savedCollectionSelect.value));
  importFileButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", importSelectedFile);
  saveCollectionButton.addEventListener("click", saveUrlListCollection);
  urlsInput.addEventListener("input", updateUrlCount);
  collectionNameInput.addEventListener("input", updateCollectionSaveState);
  await populateSavedCollections(seed, syncQueue[0] || params.get("collection"));

  const requestedMode = params.get("mode");
  const requestedRadio = requestedMode && form.querySelector(`input[name="mode"][value="${requestedMode}"]`);
  if (requestedRadio) requestedRadio.checked = true;
  for (const radio of form.querySelectorAll("input[name='mode']")) radio.addEventListener("change", reflectMode);
  reflectMode();
  const requestedDestination = params.get("destination");
  if (requestedDestination === "library" || requestedDestination === "download") {
    destinationSelect.value = requestedDestination;
  } else if (selectedCollection()) {
    const libraryHandle = await loadCollectionLibraryHandle();
    if (libraryHandle && await ensurePermission(libraryHandle) === "granted") destinationSelect.value = "library";
  }
  destinationSelect.addEventListener("change", reflectDestination);
  outputSelect.addEventListener("change", reflectDestination);
  reflectDestination();
  updateUrlCount();

  form.addEventListener("submit", (event) => { event.preventDefault(); start(); });
  pauseButton.addEventListener("click", () => sendMessage({ type: "crawl:pause", id: getCurrentJobId() }));
  resumeButton.addEventListener("click", () => sendMessage({ type: "crawl:resume", id: getCurrentJobId() }));
  stopButton.addEventListener("click", () => sendMessage({ type: "crawl:cancel", id: getCurrentJobId() }));

  await sendMessage({ type: "crawl:resume-check" });
  const existingId = await getStoredJobId();
  let handledExisting = false;
  if (existingId) {
    const job = await loadJob(existingId);
    if (job && !["done", "cancelled", "failed"].includes(job.status)) {
      handledExisting = true;
      setCurrentJobId(existingId);
      showProgress(true);
      setRunning(job.status);
      startPolling(existingId);
    } else if (job && !job.exported) {
      handledExisting = true;
      showProgress(true);
      renderJobSnapshot(job);
      if (job.status === "done" && !job.exported) await exportJob(job);
    }
  }
  if (syncQueue.length && !handledExisting) {
    setPrimaryActionLabel(`Sync all (${syncQueue.length})`);
    await start();
  }
}

async function populateSavedCollections(seed = "", selectedId = "") {
  const collections = await loadCollections();
  const inventories = await loadSiteInventories(collections.map((collection) => collection.id));
  savedCollectionEntries = collections.map((collection) => ({ collection, inventory: inventories[collection.id] }));
  savedCollectionSelect.replaceChildren(new Option("Choose a saved collection…", ""));
  for (const entry of savedCollectionEntries) {
    const count = collectionExportPreset(entry.collection, entry.inventory).inventoryCount;
    savedCollectionSelect.append(new Option(`${entry.collection.name} · ${typeLabel(entry.collection.type)} · ${count} page${count === 1 ? "" : "s"}`, entry.collection.id));
  }
  savedCollectionSelect.disabled = savedCollectionEntries.length === 0;
  if (!savedCollectionEntries.length) {
    savedCollectionHint.textContent = "No saved collections yet. Import a URL list here or add a site in Manage Collections.";
    return;
  }
  const matched = selectedId
    ? collections.find((collection) => collection.id === selectedId)
    : matchSavedCollection(collections, seed);
  if (matched) {
    savedCollectionSelect.value = matched.id;
    applySavedCollection(matched.id);
  }
}

function applySavedCollection(collectionId) {
  if (!collectionId) {
    savedCollectionHint.textContent = "";
    return;
  }
  const entry = savedCollectionEntries.find((candidate) => candidate.collection.id === collectionId);
  if (!entry) return;
  const preset = collectionExportPreset(entry.collection, entry.inventory);
  const radio = form.querySelector(`input[name="mode"][value="${preset.mode}"]`);
  if (radio) radio.checked = true;
  urlsInput.value = preset.urls.join("\n");
  startInput.value = preset.startUrl;
  maxPagesInput.value = String(preset.maxPages);
  includePatternsInput.value = preset.includePatterns || "";
  collectionNameInput.value = entry.collection.name;
  reflectMode();
  updateUrlCount();
  savedCollectionHint.textContent = preset.inventoryCount
    ? `Loaded ${preset.inventoryCount} saved page${preset.inventoryCount === 1 ? "" : "s"}.`
    : `Using ${sourceLabel(preset.mode)} discovery for this ${typeLabel(entry.collection.type).toLowerCase()} collection.`;
}

async function importSelectedFile() {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  importStatus.textContent = `Reading ${file.name}…`;
  importFileButton.disabled = true;
  try {
    const urls = await readCollectionFile(file);
    urlsInput.value = urls.join("\n");
    if (!collectionNameInput.value) collectionNameInput.value = file.name.replace(/\.(txt|csv|xlsx)$/i, "");
    updateUrlCount();
    importStatus.textContent = urls.length ? `Imported ${urls.length} unique URL${urls.length === 1 ? "" : "s"}.` : "No HTTP or HTTPS URLs were found in that file.";
  } catch (error) {
    importStatus.textContent = error && error.message ? error.message : String(error);
  } finally {
    importFileButton.disabled = false;
    fileInput.value = "";
  }
}

async function saveUrlListCollection() {
  const urls = parseUrlList(urlsInput.value);
  if (!urls.length) {
    importStatus.textContent = "Paste or import at least one URL before saving a collection.";
    return;
  }
  const collection = createCustomCollection(collectionNameInput.value, urls);
  const collections = await loadCollections();
  const duplicate = collections.find((item) => item.name.toLowerCase() === collection.name.toLowerCase());
  if (duplicate) {
    duplicate.urls = collection.urls;
    duplicate.updatedAt = Date.now();
  } else {
    collections.push(collection);
  }
  await saveCollections(collections);
  await populateSavedCollections("", duplicate ? duplicate.id : collection.id);
  importStatus.textContent = duplicate ? `Updated ${duplicate.name}.` : `Saved ${collection.name} to Collections.`;
}

function openCollectionsSettings() {
  return chrome.tabs.create({ url: chrome.runtime.getURL("src/options/index.html?section=collections") });
}

function currentMode() {
  return form.querySelector("input[name='mode']:checked").value;
}

function reflectMode() {
  const mode = currentMode();
  for (const field of form.querySelectorAll("[data-mode]")) {
    field.style.display = field.getAttribute("data-mode").split(" ").includes(mode) ? "" : "none";
  }
  startLabel.textContent = mode === "sitemap" ? "Sitemap URL" : mode === "llms" ? "llms.txt URL" : "Start URL";
}

function updateUrlCount() {
  const count = parseUrlList(urlsInput.value).length;
  urlCount.textContent = `${count} URL${count === 1 ? "" : "s"}`;
  updateCollectionSaveState();
}

function updateCollectionSaveState() {
  const isReady = Boolean(collectionNameInput.value.trim() && parseUrlList(urlsInput.value).length);
  saveCollectionButton.classList.toggle("is-primary-action", isReady);
}

function reflectDestination() {
  const library = destinationSelect.value === "library";
  outputSelect.disabled = library;
  if (library) {
    outputHint.textContent = "Writes unpacked page files, index.md, collection.json, and a sync report directly into this collection's library subfolder.";
  } else if (outputSelect.value === "aggregate") {
    outputHint.textContent = "Downloads one combined Markdown file through Chrome Downloads; no extraction needed.";
  } else if (outputSelect.value === "zip") {
    outputHint.textContent = "Downloads separate page files and index.md in a ZIP archive.";
  } else {
    outputHint.textContent = "Downloads both the combined Markdown file and the ZIP archive.";
  }
  updatePrimaryActionLabel();
}

function updatePrimaryActionLabel() {
  if (syncQueue.length) return;
  setPrimaryActionLabel(destinationSelect.value === "library" ? "Sync collection" : "Export Markdown");
}

function setPrimaryActionLabel(text) {
  const label = startButton.querySelector("span");
  if (label) label.textContent = text;
}

function selectedCollection() {
  const id = savedCollectionSelect.value;
  return savedCollectionEntries.find((entry) => entry.collection.id === id)?.collection || null;
}

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response)));
}

function getCurrentJobId() { return cachedJobId; }
function setCurrentJobId(id) { cachedJobId = id; chrome.storage.local.set({ [CURRENT_JOB_KEY]: id }); }
async function getStoredJobId() { const stored = await chrome.storage.local.get(CURRENT_JOB_KEY); cachedJobId = stored[CURRENT_JOB_KEY] || null; return cachedJobId; }

async function restoreSyncQueue(requestedValue) {
  const requested = requestedValue.split(",").map((value) => value.trim()).filter(Boolean);
  if (!requested.length) return [];
  const signature = requested.join(",");
  const stored = await chrome.storage.local.get(SYNC_QUEUE_KEY);
  const previous = stored[SYNC_QUEUE_KEY];
  if (previous?.signature === signature && Array.isArray(previous.remaining) && previous.remaining.length) {
    return previous.remaining.filter((id) => requested.includes(id));
  }
  await saveSyncQueue(requested, signature);
  return requested;
}

async function saveSyncQueue(remaining, signature = null) {
  if (!remaining.length) {
    await chrome.storage.local.remove(SYNC_QUEUE_KEY);
    return;
  }
  const stored = signature ? null : await chrome.storage.local.get(SYNC_QUEUE_KEY);
  const previous = stored && stored[SYNC_QUEUE_KEY];
  await chrome.storage.local.set({
    [SYNC_QUEUE_KEY]: {
      signature: signature || previous?.signature || remaining.join(","),
      remaining,
      updatedAt: Date.now()
    }
  });
}

function parsePatterns(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function start() {
  logList.replaceChildren();
  renderedLogLines = 0;
  summary.textContent = "";
  progressWasAutoRevealed = false;
  showProgress(true);
  showPreparingAction();
  try {
    const mode = currentMode();
    const maxPages = clampInt(maxPagesInput.value, 1, 500, 25);
    const maxDepth = clampInt(maxDepthInput.value, 0, 20, 5);
    let seeds = [];
    let followLinks = false;
    const destination = destinationSelect.value;
    const collection = selectedCollection();

    if (destination === "library" && !collection) {
      throw new Error("Select or save a collection before syncing to the Local Collections Library.");
    }

    if (mode === "list") {
      seeds = parseUrlList(urlsInput.value);
      if (!seeds.length) throw new Error("Enter or import at least one HTTP(S) URL.");
      await requestOrigins(seeds);
    } else if (mode === "sitemap" || mode === "llms") {
      const sourceUrl = startInput.value.trim();
      if (!/^https?:\/\//i.test(sourceUrl)) throw new Error(`Enter a valid ${mode === "sitemap" ? "sitemap" : "llms.txt"} URL.`);
      await requestOrigins([sourceUrl]);
      log(`Loading ${sourceUrl}`);
      seeds = mode === "sitemap"
        ? await fetchSitemapPages(sourceUrl, { maxPages, parse: parseSitemap })
        : await fetchLlmsPages(sourceUrl, { maxPages });
      if (!seeds.length) throw new Error(`No page URLs found in that ${mode === "sitemap" ? "sitemap" : "llms.txt"}.`);
      const permitted = await keepPermittedUrls(seeds);
      if (permitted.length !== seeds.length) log(`Skipped ${seeds.length - permitted.length} URL(s) on unapproved origins.`, true);
      seeds = permitted;
      if (!seeds.length) throw new Error("No discovered pages were on an approved origin.");
    } else {
      const startUrl = startInput.value.trim();
      if (!/^https?:\/\//i.test(startUrl)) throw new Error("Enter a start URL.");
      seeds = [startUrl];
      followLinks = true;
      await requestOrigins(seeds);
    }

    if (destination === "library") {
      const handle = await loadCollectionLibraryHandle();
      if (!handle) throw new Error("Choose a Local Collections Library folder in Manage Collections first.");
      if (await ensurePermission(handle) !== "granted") {
        throw new Error("Folder access is needed. Use Re-grant access in Manage Collections, then try again.");
      }
    }

    currentSettings = await loadSettings();
    const captureOptions = {
      mode: currentSettings.mode,
      scrollBeforeCapture: currentSettings.scrollBeforeCapture,
      maxScrollMs: currentSettings.maxScrollMs,
      scrollPauseMs: currentSettings.scrollPauseMs,
      dropHidden: currentSettings.dropHidden
    };
    log(`Capturing up to ${maxPages} page(s)…`);
    const response = await sendMessage({
      type: "crawl:start",
      seeds,
      options: {
        captureOptions,
        maxPages,
        maxDepth,
        followLinks,
        sameHostOnly: true,
        includePatterns: parsePatterns(includePatternsInput.value),
        excludePatterns: parsePatterns(excludePatternsInput.value),
        retries: 2,
        retryDelayMs: 500,
        outputMode: outputSelect.value,
        destination,
        collectionId: collection && collection.id
      }
    });
    if (!response || !response.id) throw new Error(response && response.error || "Could not start the crawl.");
    setCurrentJobId(response.id);
    setRunning("running");
    startPolling(response.id);
  } catch (error) {
    log(`Error: ${error && error.message ? error.message : error}`, true);
    clearProgressAction();
    setRunning("done");
  }
}

function showProgress(reveal = false) {
  progressSection.hidden = false;
  progressSection.open = true;
  if (reveal && !progressWasAutoRevealed) {
    progressWasAutoRevealed = true;
    requestAnimationFrame(() => {
      progressSection.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }
}

function startPolling(jobId) { stopPolling(); pollTimer = setInterval(() => pollJob(jobId), POLL_MS); pollJob(jobId); }
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

async function pollJob(jobId) {
  const job = await loadJob(jobId);
  if (!job) return;
  renderJobSnapshot(job);
  setRunning(job.status);
  if (job.status === "done" || job.status === "failed") {
    stopPolling();
    if (job.status === "done" && !job.exported) await exportJob(job);
  }
}

function renderJobSnapshot(job) {
  const lines = job.log || [];
  for (let index = renderedLogLines; index < lines.length; index += 1) log(lines[index], /failed/i.test(lines[index]));
  renderedLogLines = lines.length;
  const message = `${job.status} — ${job.results.length} captured, ${job.errors.length} error(s), ${job.queue.length} queued.`;
  summary.textContent = message;
  progressSummary.textContent = message;
  if (["queued", "running", "paused"].includes(job.status)) {
    showJobProgress(job);
  } else if (job.status === "done" && !job.exported) {
    showFinalizingAction(job);
  } else {
    clearProgressAction();
  }
}

async function exportJob(job) {
  try {
    showFinalizingAction(job);
    log(`Captured ${job.results.length} page(s). Building output…`);
    const bodies = await getJobBodies(job.id);
    const bodyByUrl = new Map(bodies.map((body) => [body.url, body]));
    const pages = job.results.map((meta) => bodyByUrl.get(meta.url)).filter(Boolean)
      .map((body) => ({ url: body.url, title: body.title, markdown: body.markdown, metadata: body.metadata }));
    if (!pages.length) throw new Error("No pages were captured.");
    const collections = await loadCollections();
    const collection = collections.find((item) => item.id === job.options.collectionId) || null;
    if (collection) await saveCollectionHealth(collection.id, { results: job.results, errors: job.errors });
    await buildOutputs(pages, currentSettings, job.options.outputMode, {
      destination: job.options.destination || "download",
      collection
    });
    const synced = job.options.destination === "library";
    summary.textContent = `${synced ? "Synced" : "Exported"} ${pages.length} page(s).`;
    progressSummary.textContent = synced ? "Local sync complete" : "Export complete";
    log("Done.");
    await saveJob({ ...job, exported: true });
    if (syncQueue.length) {
      if (syncQueue[0] === job.options.collectionId) syncQueue.shift();
      await saveSyncQueue(syncQueue);
      if (syncQueue.length) {
        setPrimaryActionLabel(`Sync all (${syncQueue.length} remaining)`);
        await populateSavedCollections("", syncQueue[0]);
        await start();
      } else {
        syncQueue = [];
        updatePrimaryActionLabel();
        await markCollectionSyncCompleted();
        try { await chrome.action.setBadgeText({ text: "" }); } catch { /* Optional badge surface. */ }
      }
    }
  } catch (error) {
    log(`Error: ${error && error.message ? error.message : error}`, true);
  } finally {
    // Sync all can start the next queued job before this export finishes.
    // Do not erase that new job's progress state from the previous job's cleanup.
    if (getCurrentJobId() === job.id) clearProgressAction();
  }
}

async function buildOutputs(pages, settings, outputMode, { destination = "download", collection = null } = {}) {
  const siteTitle = collection && collection.name || deriveSiteTitle(pages);
  const base = slugify(siteTitle, { fallback: "site-export" });
  const options = { metadataStyle: settings.metadataStyle, includeTitleHeading: settings.includeTitleHeading };
  if (destination === "library") {
    const handle = await loadCollectionLibraryHandle();
    if (!handle || await ensurePermission(handle) !== "granted") {
      throw new Error("Local Collections Library access is unavailable. Re-grant it in Manage Collections.");
    }
    const result = await syncCollectionToLibrary(handle, collection, pages, settings);
    await writeCollectionLibraryCatalog(handle, await loadCollections());
    log(`Synced ${result.pageCount} page(s) to ${result.folder}: ${result.updatedCount} updated, ${result.unchangedCount} unchanged.`);
    if (result.removed.length) log(`${result.removed.length} previously synced file(s) need review; none were deleted.`, true);
    return;
  }
  if (outputMode === "zip" || outputMode === "both" || !outputMode) {
    const files = buildPageFiles(pages, options);
    const entries = files.map((file) => ({ name: file.path, data: file.content }));
    entries.push({ name: "index.md", data: buildIndexMarkdown(files, { siteTitle }) });
    await downloadBlob(createZip(entries), `${base}.zip`);
    log(`Wrote ${files.length} file(s) + index.md to ${base}.zip`);
  }
  if (outputMode === "aggregate" || outputMode === "both") {
    await downloadText(buildAggregateMarkdown(pages, { siteTitle }), `${base}.md`);
    log(`Wrote ${base}.md`);
  }
}

function deriveSiteTitle(pages) { try { return new URL(pages[0].url).hostname; } catch { return "site-export"; } }

async function requestOrigins(urls) {
  const origins = [...new Set(urls.map(originPattern).filter(Boolean))];
  if (!origins.length) return;
  if (await chrome.permissions.contains({ origins })) return;
  if (!await chrome.permissions.request({ origins })) throw new Error("Permission to access those sites was declined.");
}

async function keepPermittedUrls(urls) {
  const allowed = [];
  for (const url of urls) {
    const origin = originPattern(url);
    if (origin && await chrome.permissions.contains({ origins: [origin] })) allowed.push(url);
  }
  return allowed;
}

function originPattern(url) { try { const parsed = new URL(url); return `${parsed.protocol}//${parsed.host}/*`; } catch { return ""; } }
function clampInt(value, min, max, fallback) { const number = Math.floor(Number(value)); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }
function typeLabel(type) { return ({ sharepoint: "SharePoint", confluence: "Confluence", website: "Website", custom: "Custom list" })[type] || "Collection"; }
function sourceLabel(mode) { return ({ list: "saved URL", sitemap: "sitemap", llms: "llms.txt", crawl: "same-site crawl" })[mode] || "automatic"; }

function setRunning(status) {
  const running = status === "running" || status === "queued";
  const paused = status === "paused";
  startButton.disabled = running || paused || startButton.classList.contains("is-progress");
  pauseButton.disabled = !running;
  resumeButton.disabled = !paused;
  stopButton.disabled = !(running || paused);
}

function showPreparingAction() {
  startButton.classList.add("is-progress");
  startButton.setAttribute("aria-busy", "true");
  startButton.style.setProperty("--progress-percent", "0%");
  startButton.disabled = true;
  startButton.title = "Preparing the collection capture.";
  setPrimaryActionLabel("Preparing capture…");
}

function showJobProgress(job) {
  const progress = getJobProgress(job);
  const paused = job.status === "paused";
  const eta = progress.etaMs == null ? "estimating…" : formatClock(progress.etaMs);
  const label = paused
    ? `Paused ${progress.completed} / ${progress.total}`
    : `Processing ${progress.completed} / ${progress.total} · ETA ${eta}`;
  startButton.classList.add("is-progress");
  startButton.setAttribute("aria-busy", "true");
  startButton.style.setProperty("--progress-percent", `${progress.percent}%`);
  startButton.disabled = true;
  startButton.title = `${progress.captured} captured, ${progress.failed} failed · Elapsed ${formatClock(progress.elapsedMs)}`;
  setPrimaryActionLabel(label);
}

function showFinalizingAction(job) {
  const progress = getJobProgress(job);
  startButton.classList.add("is-progress");
  startButton.setAttribute("aria-busy", "true");
  startButton.style.setProperty("--progress-percent", "100%");
  startButton.disabled = true;
  startButton.title = `${progress.captured} captured, ${progress.failed} failed. Building the selected output.`;
  setPrimaryActionLabel("Preparing Markdown…");
}

function clearProgressAction() {
  startButton.classList.remove("is-progress");
  startButton.removeAttribute("aria-busy");
  startButton.style.removeProperty("--progress-percent");
  startButton.removeAttribute("title");
  updatePrimaryActionLabel();
}

function log(message, isError = false) {
  showProgress();
  const item = document.createElement("li");
  item.textContent = message;
  if (isError) item.classList.add("is-error");
  logList.append(item);
  logList.scrollTop = logList.scrollHeight;
}
