import { DEFAULT_SETTINGS, loadSettings, saveSettings, resetSettings } from "../lib/settings.js";

const form = document.getElementById("options-form");
const statusElement = document.getElementById("status");

const fields = {
  mode: document.getElementById("mode"),
  metadataStyle: document.getElementById("metadata-style"),
  includeTitleHeading: document.getElementById("include-title-heading"),
  scrollBeforeCapture: document.getElementById("scroll-before-capture"),
  dropHidden: document.getElementById("drop-hidden"),
  maxScrollMs: document.getElementById("max-scroll-ms"),
  scrollPauseMs: document.getElementById("scroll-pause-ms"),
  useTemplate: document.getElementById("use-template"),
  template: document.getElementById("template"),
  filenameTemplate: document.getElementById("filename-template")
};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  fillForm(await loadSettings());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings(readForm());
    flash("Saved");
  });

  document.getElementById("reset").addEventListener("click", async () => {
    fillForm(await resetSettings());
    flash("Reset");
  });

  fields.useTemplate.addEventListener("change", reflectTemplateMode);
}

function fillForm(settings) {
  fields.mode.value = settings.mode;
  fields.metadataStyle.value = settings.metadataStyle;
  fields.includeTitleHeading.checked = settings.includeTitleHeading;
  fields.scrollBeforeCapture.checked = settings.scrollBeforeCapture;
  fields.dropHidden.checked = settings.dropHidden;
  fields.maxScrollMs.value = settings.maxScrollMs;
  fields.scrollPauseMs.value = settings.scrollPauseMs;
  fields.useTemplate.checked = settings.useTemplate;
  fields.template.value = settings.template;
  fields.filenameTemplate.value = settings.filenameTemplate;
  reflectTemplateMode();
}

// When a custom template is active, the simple Output settings no longer apply.
function reflectTemplateMode() {
  const on = fields.useTemplate.checked;
  fields.metadataStyle.disabled = on;
  fields.includeTitleHeading.disabled = on;
}

function readForm() {
  return {
    mode: fields.mode.value,
    metadataStyle: fields.metadataStyle.value,
    includeTitleHeading: fields.includeTitleHeading.checked,
    scrollBeforeCapture: fields.scrollBeforeCapture.checked,
    dropHidden: fields.dropHidden.checked,
    maxScrollMs: clampNumber(fields.maxScrollMs.value, 3000, 45000, DEFAULT_SETTINGS.maxScrollMs),
    scrollPauseMs: clampNumber(fields.scrollPauseMs.value, 150, 2500, DEFAULT_SETTINGS.scrollPauseMs),
    useTemplate: fields.useTemplate.checked,
    template: fields.template.value,
    filenameTemplate: fields.filenameTemplate.value
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function flash(message) {
  statusElement.textContent = message;
  setTimeout(() => {
    statusElement.textContent = "";
  }, 1600);
}
