const titleElement = document.getElementById("title");
const metaElement = document.getElementById("meta");
const markdownElement = document.getElementById("markdown");
const copyButton = document.getElementById("copy");
const downloadButton = document.getElementById("download");

let currentPayload = null;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  currentPayload = await loadPayload();

  if (!currentPayload) {
    titleElement.textContent = "Markdown Export";
    metaElement.textContent = "The export data is no longer available.";
    markdownElement.textContent = "Open the extension popup and export the page again.";
    copyButton.disabled = true;
    downloadButton.disabled = true;
    return;
  }

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

  downloadButton.addEventListener("click", async () => {
    await chrome.downloads.download({
      url: `data:text/markdown;charset=utf-8,${encodeURIComponent(currentPayload.markdown || "")}`,
      filename: currentPayload.filename || "sharepoint-page.md",
      saveAs: false
    });
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
