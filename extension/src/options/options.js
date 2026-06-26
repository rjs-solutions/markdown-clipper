const DEFAULT_OPTIONS = {
  includeSource: true,
  maxScrollMs: 12000,
  scrollBeforeCapture: true,
  scrollPauseMs: 450
};

const form = document.getElementById("options-form");
const scrollBeforeCapture = document.getElementById("scroll-before-capture");
const includeSource = document.getElementById("include-source");
const maxScrollMs = document.getElementById("max-scroll-ms");
const scrollPauseMs = document.getElementById("scroll-pause-ms");
const resetButton = document.getElementById("reset");
const statusElement = document.getElementById("status");

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  fillForm(await getOptions());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.sync.set(readForm());
    setStatus("Saved");
  });

  resetButton.addEventListener("click", async () => {
    await chrome.storage.sync.set(DEFAULT_OPTIONS);
    fillForm(DEFAULT_OPTIONS);
    setStatus("Reset");
  });
}

function fillForm(options) {
  scrollBeforeCapture.checked = options.scrollBeforeCapture;
  includeSource.checked = options.includeSource;
  maxScrollMs.value = options.maxScrollMs;
  scrollPauseMs.value = options.scrollPauseMs;
}

function readForm() {
  return {
    includeSource: includeSource.checked,
    maxScrollMs: clampNumber(maxScrollMs.value, 3000, 45000, DEFAULT_OPTIONS.maxScrollMs),
    scrollBeforeCapture: scrollBeforeCapture.checked,
    scrollPauseMs: clampNumber(scrollPauseMs.value, 150, 2500, DEFAULT_OPTIONS.scrollPauseMs)
  };
}

function getOptions() {
  return chrome.storage.sync.get(DEFAULT_OPTIONS);
}

function setStatus(message) {
  statusElement.textContent = message;
  setTimeout(() => {
    statusElement.textContent = "";
  }, 1600);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}
