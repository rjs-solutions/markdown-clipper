import { composeDocument } from "../lib/compose.js";
import { slugify, sanitizeFilename, withMarkdownExtension } from "../lib/slug.js";
import { DEFAULT_SETTINGS, loadSettings } from "../lib/settings.js";
import { applyTemplate, extractSelectorRefs } from "../lib/template.js";
import { capturePage } from "../lib/capture.js";
import { downloadText } from "../lib/download.js";

const statusElement = document.getElementById("status");
const actionButtons = Array.from(document.querySelectorAll("[data-action]"));
const optionsButton = document.getElementById("open-options");

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  for (const button of actionButtons) {
    button.addEventListener("click", () => runAction(button.dataset.action));
  }
}

async function runAction(action) {
  if (action === "export") {
    const tab = await activeTab();
    const seedUrl = tab && /^https?:\/\//i.test(tab.url || "") ? tab.url : "";
    const suffix = seedUrl ? `?seed=${encodeURIComponent(seedUrl)}` : "";
    await chrome.tabs.create({ url: chrome.runtime.getURL(`src/crawl/index.html${suffix}`) });
    window.close();
    return;
  }

  setBusy(true);
  setStatus(action === "copy" ? "Preparing clipboard..." : "Capturing page...");
  try {
    const settings = await loadSettings();
    const payload = await buildPayload(settings);

    if (action === "copy") {
      await navigator.clipboard.writeText(payload.markdown);
      setStatus(`Copied ${payload.markdown.length.toLocaleString()} characters`);
    } else if (action === "open") {
      await openInTab(payload);
      setStatus("Opened Markdown tab");
    } else if (action === "download") {
      await downloadMarkdown(payload);
      setStatus(`Downloaded ${payload.filename}`);
    } else {
      throw new Error("Unknown action.");
    }
  } catch (error) {
    setStatus(error && error.message ? error.message : String(error), true);
  } finally {
    setBusy(false);
  }
}

async function buildPayload(settings) {
  const tab = await activeTab();
  if (!tab || !tab.id) {
    throw new Error("Open a page first.");
  }
  if (!/^https?:\/\//i.test(tab.url || "")) {
    throw new Error("This extension can only capture regular web pages.");
  }

  const selectors = settings.useTemplate
    ? extractSelectorRefs(settings.template, settings.filenameTemplate)
    : [];
  const result = await capturePage(tab.id, { ...captureOptions(settings), selectors });

  let markdown;
  let filename;
  if (settings.useTemplate) {
    const values = { ...result.variables, content: result.markdown };
    markdown = ensureTrailingNewline(applyTemplate(settings.template, values));
    const rawName = applyTemplate(settings.filenameTemplate, values).trim();
    filename = withMarkdownExtension(sanitizeFilename(rawName || result.title, { fallback: "page" }));
  } else {
    markdown = composeDocument({
      title: result.title,
      body: result.markdown,
      metadata: result.metadata,
      options: {
        metadataStyle: settings.metadataStyle,
        includeTitleHeading: settings.includeTitleHeading
      }
    });
    filename = withMarkdownExtension(slugify(result.title, { fallback: "page" }));
  }

  return {
    title: result.title,
    url: result.url,
    mode: result.mode,
    markdown,
    filename
  };
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function captureOptions(settings) {
  return {
    mode: settings.mode,
    scrollBeforeCapture: settings.scrollBeforeCapture,
    maxScrollMs: settings.maxScrollMs,
    scrollPauseMs: settings.scrollPauseMs,
    dropHidden: settings.dropHidden
  };
}

async function openInTab(payload) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await chrome.storage.session.set({ [`export:${id}`]: payload });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`src/report/index.html?id=${encodeURIComponent(id)}`)
  });
}

async function downloadMarkdown(payload) {
  await downloadText(payload.markdown, payload.filename);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setBusy(isBusy) {
  for (const button of actionButtons) {
    button.disabled = isBusy;
  }
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

// Re-export so the constant is reachable for debugging in the popup console.
export { DEFAULT_SETTINGS };
