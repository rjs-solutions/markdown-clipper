import { listClips } from "../lib/clip-log.js";
import { loadHandle } from "../lib/vault-handle.js";
import { TASK_PRESETS, buildPrompt } from "../lib/prompt-templates.js";
import { loadSettings } from "../lib/settings.js";
import { applyTheme } from "../lib/theme.js";

const el = {
  form: document.getElementById("prompt-form"),
  task: document.getElementById("task"),
  taskDescription: document.getElementById("task-description"),
  typeFilter: document.getElementById("type-filter"),
  sinceFilter: document.getElementById("since-filter"),
  limitFilter: document.getElementById("limit-filter"),
  generateBtn: document.getElementById("generate-btn"),
  copyBtn: document.getElementById("copy-btn"),
  summary: document.getElementById("summary"),
  output: document.getElementById("output")
};

let vaultName = null;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  loadSettings().then((settings) => applyTheme(settings.theme));
  populateTaskOptions();
  el.task.addEventListener("change", updateTaskDescription);
  updateTaskDescription();

  el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    generate();
  });
  el.copyBtn.addEventListener("click", copyOutput);

  try {
    const handle = await loadHandle();
    vaultName = handle && handle.name ? handle.name : null;
  } catch (error) {
    console.error("Markdown Clipper could not read the vault handle:", error);
  }

  await generate();
}

function populateTaskOptions() {
  el.task.replaceChildren();
  for (const preset of TASK_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    el.task.append(option);
  }
}

function updateTaskDescription() {
  const preset = TASK_PRESETS.find((item) => item.id === el.task.value);
  el.taskDescription.textContent = preset ? preset.description : "";
}

async function generate() {
  el.generateBtn.disabled = true;
  el.copyBtn.disabled = true;
  el.summary.textContent = "Loading clip log…";
  try {
    const records = await listClips(currentFilters());
    const prompt = buildPrompt(el.task.value, records, { vaultName });
    el.output.value = prompt;
    el.summary.textContent = `${records.length} item${records.length === 1 ? "" : "s"} included`;
    el.copyBtn.disabled = false;
  } catch (error) {
    console.error("Markdown Clipper prompt generation failed:", error);
    el.summary.textContent = "Could not generate the prompt.";
    el.output.value = "";
  } finally {
    el.generateBtn.disabled = false;
  }
}

function currentFilters() {
  const filters = {};
  if (el.typeFilter.value) {
    filters.type = el.typeFilter.value;
  }
  if (el.sinceFilter.value) {
    filters.since = new Date(el.sinceFilter.value).toISOString();
  }
  const limit = Number(el.limitFilter.value);
  if (el.limitFilter.value && Number.isFinite(limit) && limit > 0) {
    filters.limit = limit;
  }
  return filters;
}

async function copyOutput() {
  await navigator.clipboard.writeText(el.output.value);
  const original = el.copyBtn.textContent;
  el.copyBtn.textContent = "Copied";
  setTimeout(() => {
    el.copyBtn.textContent = original;
  }, 1400);
}
