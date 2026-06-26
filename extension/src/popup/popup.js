const DEFAULT_OPTIONS = {
  includeSource: true,
  maxScrollMs: 12000,
  scrollBeforeCapture: true,
  scrollPauseMs: 450
};

const statusElement = document.getElementById("status");
const actionButtons = Array.from(document.querySelectorAll("[data-action]"));
const optionsButton = document.getElementById("open-options");

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  for (const button of actionButtons) {
    button.addEventListener("click", () => runAction(button.dataset.action));
  }
}

async function runAction(action) {
  setBusy(true);
  setStatus(action === "copy" ? "Preparing clipboard..." : "Collecting page...");

  try {
    const payload = await collectMarkdown();

    if (action === "download") {
      await downloadMarkdown(payload);
      setStatus(`Downloaded ${payload.filename}`);
      return;
    }

    if (action === "open") {
      await openMarkdownTab(payload);
      setStatus("Opened Markdown tab");
      return;
    }

    if (action === "copy") {
      await copyMarkdown(payload.markdown);
      setStatus("Copied Markdown to clipboard");
      return;
    }

    throw new Error("Unknown action.");
  } catch (error) {
    setStatus(error && error.message ? error.message : String(error), true);
  } finally {
    setBusy(false);
  }
}

async function collectMarkdown() {
  const [tab] = await chromeCall((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));

  if (!tab || !tab.id) {
    throw new Error("Open a SharePoint page first.");
  }

  if (!/^https?:\/\//i.test(tab.url || "")) {
    throw new Error("This extension can only capture regular web pages.");
  }

  const options = await getOptions();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/collector.js"]
  });

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "SPMD_COLLECT",
    options
  });

  if (!response || !response.ok) {
    throw new Error(response && response.error ? response.error : "The page could not be captured.");
  }

  const title = response.title || tab.title || "SharePoint page";
  const filename = `${slugify(title)}.md`;

  return {
    filename,
    markdown: response.markdown,
    stats: response.stats,
    title,
    url: response.url || tab.url
  };
}

async function downloadMarkdown(payload) {
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(payload.markdown)}`;
  await chrome.downloads.download({
    url,
    filename: payload.filename,
    saveAs: false
  });
}

async function openMarkdownTab(payload) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = `export:${id}`;
  await chrome.storage.session.set({ [key]: payload });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`src/report/index.html?id=${encodeURIComponent(id)}`)
  });
}

async function copyMarkdown(markdown) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(markdown);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = markdown;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function getOptions() {
  return chromeCall((done) => chrome.storage.sync.get(DEFAULT_OPTIONS, done));
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

function chromeCall(invoke) {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

function slugify(value) {
  const slug = String(value || "sharepoint-page")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "sharepoint-page";
}
