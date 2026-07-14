import { slugify, sanitizeFilename } from "../lib/slug.js";
import { loadSettings } from "../lib/settings.js";
import { applyTemplate, extractSelectorRefs } from "../lib/template.js";
import { assembleOutput } from "../lib/assemble.js";
import { capturePage } from "../lib/capture.js";
import { downloadText } from "../lib/download.js";
import { applyTheme } from "../lib/theme.js";

const el = {
  optionsButton: document.getElementById("open-options"),
  expand: document.getElementById("do-expand"),
  sidepanel: document.getElementById("do-sidepanel"),
  panel: document.getElementById("do-panel"),
  loading: document.getElementById("loading"),
  empty: document.getElementById("empty"),
  emptyMessage: document.getElementById("empty-message"),
  card: document.getElementById("card"),
  title: document.getElementById("f-title"),
  props: document.getElementById("props"),
  filename: document.getElementById("f-filename"),
  tags: document.getElementById("f-tags"),
  description: document.getElementById("f-description"),
  charCount: document.getElementById("char-count"),
  previewBody: document.getElementById("preview-body"),
  actions: document.getElementById("actions"),
  download: document.getElementById("do-download"),
  copy: document.getElementById("do-copy"),
  open: document.getElementById("do-open"),
  export: document.getElementById("do-export"),
  status: document.getElementById("status")
};

const MODE_LABELS = {
  sharepoint: "SharePoint",
  confluence: "Confluence",
  article: "Article",
  readability: "Article",
  full: "Full page"
};

let settings = null;
let tab = null;
let inPanel = false; // shown in the native side panel (manifest ?panel=1)
let inIframe = false; // shown in the in-page overlay panel (?context=iframe)
let preview = null; // fast (no-scroll) capture used to populate the card
let fullResult = null; // cached full-settings capture, once produced
let fullResultPromise = null; // in-flight full capture (deduped / pre-warmed)
let busy = false;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  wireEvents();
  const params = new URLSearchParams(location.search);
  inPanel = params.get("panel") === "1";
  inIframe = params.get("context") === "iframe";
  if (inPanel) {
    document.body.classList.add("in-panel");
  }
  if (inIframe) {
    document.body.classList.add("in-iframe");
  }
  try {
    settings = await loadSettings();
    applyTheme(settings.theme);
    await loadPreview();
    // The native side panel and the in-page overlay are separate, mutually
    // exclusive surfaces from the plain popup. Neither offers the other.
    if (!inPanel && !inIframe) {
      el.panel.hidden = false;
      el.panel.addEventListener("click", openInPagePanel);
      try {
        await setupSidePanel();
      } catch (error) {
        // Side-panel setup is optional; never take down the main clipper UI.
        console.error("Markdown Clipper side-panel setup failed:", error);
      }
    }
  } catch (error) {
    console.error("Markdown Clipper popup failed to initialize:", error);
    showEmpty(messageFrom(error) || "Something went wrong opening the clipper.");
  }
}

function wireEvents() {
  el.optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  el.expand.addEventListener("click", openEditor);
  el.download.addEventListener("click", () => run("download"));
  el.copy.addEventListener("click", () => run("copy"));
  el.open.addEventListener("click", () => run("open"));
  el.export.addEventListener("click", exportWholeSite);

  // Keep the filename in sync with the title until the user edits it directly.
  el.title.addEventListener("input", () => {
    if (!el.filename.dataset.edited) {
      el.filename.value = slugify(el.title.value, { fallback: "page" });
    }
  });
  el.filename.addEventListener("input", () => {
    el.filename.dataset.edited = "1";
  });
  // Mark the body as user-edited so background/full captures stop overwriting it.
  el.previewBody.addEventListener("input", () => {
    el.previewBody.dataset.edited = "1";
    el.charCount.textContent = `${el.previewBody.value.length.toLocaleString()} chars`;
  });
}

async function loadPreview() {
  // In the in-page overlay, the tab we must capture is the host page the
  // panel was opened on, not whatever tab happens to be focused (the iframe
  // itself has no "active tab" of its own). The id travels in via the query
  // string, set by panel-host.js from the tabId the popup passed at inject
  // time — see openInPagePanel().
  tab = inIframe ? await hostTab() : await activeTab();
  if (!tab || !tab.id || !/^https?:\/\//i.test(tab.url || "")) {
    showEmpty("This page can’t be captured. Open a normal web page and try again.");
    return;
  }
  try {
    // Fast preview: skip scrolling so the card appears immediately.
    preview = await withTimeout(
      capturePage(tab.id, { ...captureOptions(), scrollBeforeCapture: false }),
      12000,
      "Timed out reading this page. It may block extension scripts (CSP)."
    );
    populateCard(preview);
  } catch (error) {
    console.error("Markdown Clipper preview capture failed:", error);
    showEmpty(messageFrom(error) || "This page could not be captured.");
  }
}

function populateCard(result) {
  el.loading.hidden = true;
  el.empty.hidden = true;
  el.card.hidden = false;
  el.actions.hidden = false;

  el.title.value = result.title || "";
  el.tags.value = Array.isArray(result.metadata.tags) ? result.metadata.tags.join(", ") : "";
  el.description.value = result.metadata.description || "";
  el.filename.value = deriveFilename(result);
  el.previewBody.value = result.markdown || "";
  delete el.filename.dataset.edited;
  delete el.previewBody.dataset.edited;

  renderProps(result);
  updateCharCount(result);
  setStatus("");

}

function updateCharCount(result) {
  const mode = MODE_LABELS[result.mode];
  const length = el.previewBody.value.length;
  el.charCount.textContent = `${mode ? `${mode} · ` : ""}${length.toLocaleString()} chars`;
}

// Scrolling to load lazy content only helps virtualized SharePoint pages; for
// everything else the DOM is already complete and the preview is the result.
function needsFullCapture(result) {
  return settings.scrollBeforeCapture && !!result && result.mode === "sharepoint";
}

// Once the full SharePoint capture lands, refresh the body — unless the user has
// already started editing it.
function syncBodyFromFull(result) {
  if (!el.previewBody.dataset.edited) {
    el.previewBody.value = result.markdown || "";
    updateCharCount(result);
  }
}

// Derive the default filename base (without .md).
function deriveFilename(result) {
  if (settings.useTemplate && settings.filenameTemplate) {
    const values = { ...result.variables, content: result.markdown };
    const rawName = applyTemplate(settings.filenameTemplate, values).trim();
    const base = sanitizeFilename(rawName, { fallback: "" }).replace(/\.md$/i, "");
    if (base) {
      return base;
    }
  }
  return slugify(result.title, { fallback: "page" });
}

function renderProps(result) {
  const m = result.metadata || {};
  const rows = [
    ["Source", result.url, true],
    ["Author", m.author],
    ["Published", m.published || m.pageDate],
    ["Modified", m.modified && m.modified !== m.published ? m.modified : ""],
    ["Site", m.site]
  ];
  el.props.replaceChildren();
  for (const [label, value, isLink] of rows) {
    if (!value) {
      continue;
    }
    const row = document.createElement("div");
    row.className = "prop-row";
    const key = document.createElement("span");
    key.className = "prop-label";
    key.textContent = label;
    const val = document.createElement("span");
    val.className = "prop-value";
    val.title = value;
    if (isLink) {
      const a = document.createElement("a");
      a.href = value;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = value;
      val.appendChild(a);
    } else {
      val.textContent = value;
    }
    row.append(key, val);
    el.props.append(row);
  }
}

// Fields currently entered in the card.
function currentFields() {
  return {
    title: el.title.value,
    body: el.previewBody.value,
    tags: el.tags.value,
    description: el.description.value,
    filenameBase: el.filename.value
  };
}

function buildPayload(result) {
  return assembleOutput({ result, fields: currentFields(), settings });
}

async function run(action) {
  if (busy) {
    return;
  }
  busy = true;
  setBusy(true);
  try {
    const result = await ensureFullResult();
    if (!el.previewBody.dataset.edited) {
      syncBodyFromFull(result);
    }
    const payload = buildPayload(result);

    if (action === "copy") {
      await navigator.clipboard.writeText(payload.markdown);
      setStatus(`Copied ${payload.markdown.length.toLocaleString()} characters`);
    } else if (action === "open") {
      await openInTab(payload);
      setStatus("Opened Markdown tab");
    } else {
      await downloadText(payload.markdown, payload.filename);
      setStatus(`Downloaded ${payload.filename}`);
    }
  } catch (error) {
    console.error("Markdown Clipper action failed:", error);
    setStatus(messageFrom(error), true);
  } finally {
    busy = false;
    setBusy(false);
  }
}

// Open the full-screen editor in a tab, seeded with the current capture + edits.
async function openEditor() {
  if (busy) {
    return;
  }
  busy = true;
  setBusy(true);
  setStatus("Opening editor…");
  try {
    const result = await ensureFullResult();
    if (!el.previewBody.dataset.edited) {
      syncBodyFromFull(result);
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await chrome.storage.session.set({
      [`edit:${id}`]: { result, fields: currentFields(), settings }
    });
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`src/editor/index.html?id=${encodeURIComponent(id)}`)
    });
    // The overlay panel stays open after handing off to the editor tab; the
    // plain popup and native side panel close as before.
    if (!inIframe) {
      window.close();
    }
  } catch (error) {
    console.error("Markdown Clipper open-editor failed:", error);
    setStatus(messageFrom(error), true);
  } finally {
    busy = false;
    setBusy(false);
  }
}

function startFullCapture() {
  if (!fullResultPromise) {
    fullResultPromise = withTimeout(
      capturePage(tab.id, captureOptions()),
      settings.maxScrollMs + 15000,
      "Timed out capturing the full page."
    )
      .then((result) => {
        fullResult = result;
        return result;
      })
      .catch((error) => {
        fullResultPromise = null;
        throw error;
      });
  }
  return fullResultPromise;
}

async function ensureFullResult() {
  if (!needsFullCapture(preview)) {
    return preview;
  }
  if (fullResult) {
    return fullResult;
  }
  setStatus("Loading complete SharePoint page…");
  const result = await startFullCapture();
  if (el.status.textContent === "Loading complete SharePoint page…") {
    setStatus("");
  }
  return result;
}

function captureOptions() {
  const selectors = settings.useTemplate
    ? extractSelectorRefs(settings.template, settings.filenameTemplate)
    : [];
  return {
    mode: settings.mode,
    scrollBeforeCapture: settings.scrollBeforeCapture,
    maxScrollMs: settings.maxScrollMs,
    scrollPauseMs: settings.scrollPauseMs,
    dropHidden: settings.dropHidden,
    selectors
  };
}

// The same popup card is reused as the side panel (manifest side_panel path).
// When shown there we tag the body so CSS can go full-width; the "open in side
// panel" button is only offered from the popup, on browsers that support it.
async function setupSidePanel() {
  if (!chrome.sidePanel || !chrome.sidePanel.open || !tab || tab.id == null) {
    return;
  }
  // Configure the tab-specific path before exposing the button. The click
  // handler can then call open() immediately while its user gesture is active.
  // Disable the manifest's global fallback first: otherwise Chrome keeps a
  // second, contextless panel open when the user switches to another tab.
  if (chrome.sidePanel.setOptions) {
    await chrome.sidePanel.setOptions({ enabled: false });
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: "src/popup/index.html?panel=1",
      enabled: true
    });
  }
  el.sidepanel.hidden = false;
  el.sidepanel.addEventListener("click", openSidePanel);
}

function openSidePanel() {
  if (!tab || tab.id == null) {
    return;
  }
  // sidePanel.open() must be invoked directly from the click gesture.
  chrome.sidePanel.open({ tabId: tab.id }).then(() => {
    window.close();
  }).catch((error) => {
    console.error("Markdown Clipper open-side-panel failed:", error);
    setStatus(messageFrom(error), true);
  });
}

async function exportWholeSite() {
  const seedUrl = tab && /^https?:\/\//i.test(tab.url || "") ? tab.url : "";
  const suffix = seedUrl ? `?seed=${encodeURIComponent(seedUrl)}` : "";
  await chrome.windows.create({
    url: chrome.runtime.getURL(`src/crawl/index.html${suffix}`),
    type: "popup",
    width: 560,
    height: 760
  });
  if (!inIframe) {
    window.close();
  }
}

// Injects the overlay-panel mounter into the active tab. Mirrors capturePage
// (capture.js): a tiny serializable function dynamically imports the
// web-accessible module in the page's isolated world, since executeScript
// can't otherwise tell panel-host.js which tab it was launched from.
async function injectedTogglePanel(moduleUrl, tabId) {
  const mod = await import(moduleUrl);
  return mod.togglePanel(tabId);
}

async function openInPagePanel() {
  if (!tab || tab.id == null) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedTogglePanel,
      args: [chrome.runtime.getURL("src/content/panel-host.js"), tab.id]
    });
    window.close();
  } catch (error) {
    console.error("Markdown Clipper open-in-page failed:", error);
    setStatus(messageFrom(error), true);
  }
}

async function openInTab(payload) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await chrome.storage.session.set({ [`export:${id}`]: payload });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`src/report/index.html?id=${encodeURIComponent(id)}`)
  });
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function activeTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active;
}

async function hostTab() {
  const tabId = Number(new URLSearchParams(location.search).get("tabId"));
  if (!Number.isFinite(tabId)) {
    return null;
  }
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    console.error("Markdown Clipper could not resolve the host tab:", error);
    return null;
  }
}

function showEmpty(message) {
  el.loading.hidden = true;
  el.card.hidden = true;
  el.actions.hidden = true;
  el.empty.hidden = false;
  el.emptyMessage.textContent = message;
}

function setBusy(isBusy) {
  for (const button of [el.download, el.copy, el.open, el.expand]) {
    button.disabled = isBusy;
  }
}

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("is-error", isError);
}

function messageFrom(error) {
  return error && error.message ? error.message : String(error);
}
