import { downloadText } from "../lib/download.js";
import { loadSettings } from "../lib/settings.js";
import { applyTheme } from "../lib/theme.js";

const titleElement = document.getElementById("title");
const metaElement = document.getElementById("meta");
const markdownElement = document.getElementById("markdown");
const copyButton = document.getElementById("copy");
const downloadButton = document.getElementById("download");

let currentPayload = null;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  loadSettings().then((settings) => applyTheme(settings.theme));
  currentPayload = await loadPayload();

  if (!currentPayload) {
    titleElement.textContent = "Markdown Export";
    metaElement.textContent = "The export data is no longer available.";
    markdownElement.textContent = "Open the extension popup and capture the page again.";
    copyButton.disabled = true;
    downloadButton.disabled = true;
    return;
  }

  document.title = currentPayload.title || "Markdown Export";
  titleElement.textContent = currentPayload.title || "Markdown Export";
  metaElement.textContent = currentPayload.url || "";
  markdownElement.textContent = currentPayload.markdown || "";

  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(currentPayload.markdown || "");
    copyButton.textContent = "Copied";
    setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1400);
  });

  downloadButton.addEventListener("click", () => {
    downloadText(currentPayload.markdown || "", currentPayload.filename || "page.md");
  });
}

async function loadPayload() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    return null;
  }
  const key = `export:${id}`;
  const data = await chrome.storage.session.get(key);
  return data[key] || null;
}
