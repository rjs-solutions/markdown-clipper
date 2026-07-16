import { applyTheme } from "../lib/theme.js";
import { assembleOutput } from "../lib/assemble.js";
import { downloadText } from "../lib/download.js";

const params = new URLSearchParams(location.search);

const el = {
  missing: document.getElementById("missing"),
  app: document.getElementById("app"),
  title: document.getElementById("f-title"),
  filename: document.getElementById("f-filename"),
  tags: document.getElementById("f-tags"),
  description: document.getElementById("f-description"),
  author: document.getElementById("f-author"),
  published: document.getElementById("f-published"),
  modified: document.getElementById("f-modified"),
  site: document.getElementById("f-site"),
  url: document.getElementById("f-url"),
  body: document.getElementById("f-body"),
  vars: document.getElementById("vars"),
  output: document.getElementById("output"),
  outputName: document.getElementById("output-name"),
  copy: document.getElementById("do-copy"),
  copyFull: document.getElementById("do-copy-full"),
  download: document.getElementById("do-download"),
  downloadLocation: document.getElementById("do-download-location"),
  close: document.getElementById("do-close"),
  status: document.getElementById("status")
};

let clip = null;
// "dirty" = edited since load and not yet copied or downloaded.
let dirty = false;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  clip = await loadClip();
  if (!clip || !clip.result) {
    el.app.hidden = true;
    el.missing.hidden = false;
    return;
  }
  applyTheme((clip.settings && clip.settings.theme) || "system");
  el.missing.hidden = true;
  el.app.hidden = false;

  fill();
  renderVariables(clip.result.variables || {});
  wire();
  refresh();
  window.addEventListener("beforeunload", onBeforeUnload);
}

// Native guard for the tab's own close / reload when there are unsaved edits.
function onBeforeUnload(event) {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
}

async function loadClip() {
  const id = params.get("id");
  if (!id) {
    return null;
  }
  const key = `edit:${id}`;
  const data = await chrome.storage.session.get(key);
  return data[key] || null;
}

function fill() {
  const m = clip.result.metadata || {};
  const f = clip.fields || {};
  el.title.value = f.title != null ? f.title : clip.result.title || "";
  el.filename.value = f.filenameBase || "";
  el.tags.value = f.tags != null ? f.tags : Array.isArray(m.tags) ? m.tags.join(", ") : "";
  el.description.value = f.description != null ? f.description : m.description || "";
  el.author.value = m.author || "";
  el.published.value = m.published || m.pageDate || "";
  el.modified.value = m.modified || "";
  el.site.value = m.site || "";
  el.url.value = f.url != null ? f.url : clip.result.url || "";
  el.body.value = f.body != null ? f.body : clip.result.markdown || "";
  document.title = `${el.title.value || "Untitled"} — Markdown editor`;
}

function gatherFields() {
  return {
    title: el.title.value,
    filenameBase: el.filename.value,
    tags: el.tags.value,
    description: el.description.value,
    author: el.author.value,
    published: el.published.value,
    modified: el.modified.value,
    site: el.site.value,
    url: el.url.value,
    body: el.body.value
  };
}

function assemble() {
  return assembleOutput({ result: clip.result, fields: gatherFields(), settings: clip.settings });
}

function refresh() {
  const out = assemble();
  el.output.textContent = out.markdown;
  el.outputName.textContent = out.filename;
}

function wire() {
  const inputs = [
    el.title, el.filename, el.tags, el.description, el.author,
    el.published, el.modified, el.site, el.url, el.body
  ];
  for (const input of inputs) {
    input.addEventListener("input", () => {
      dirty = true;
      refresh();
    });
  }

  el.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el.body.value);
      dirty = false;
      showCopySuccess(el.copy);
    } catch (error) {
      flash(messageFrom(error), true);
    }
  });

  el.copyFull.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(assemble().markdown);
      dirty = false;
      showCopySuccess(el.copyFull);
    } catch (error) {
      flash(messageFrom(error), true);
    }
  });

  async function download(saveAs = false) {
    try {
      const out = assemble();
      await downloadText(out.markdown, out.filename, { saveAs });
      dirty = false;
      flash(saveAs ? `Downloaded ${out.filename} to the selected location` : `Downloaded ${out.filename}`);
    } catch (error) {
      flash(messageFrom(error), true);
    }
  }

  el.download.addEventListener("click", () => download(false));
  el.downloadLocation.addEventListener("click", () => download(true));

  el.close.addEventListener("click", closeEditor);
}

async function closeEditor() {
  if (dirty && !confirm("You have edits that haven't been copied or downloaded. Close the editor anyway?")) {
    return;
  }
  window.removeEventListener("beforeunload", onBeforeUnload);
  try {
    const current = await chrome.tabs.getCurrent();
    if (current && current.id != null) {
      await chrome.tabs.remove(current.id);
      return;
    }
  } catch (error) {
    console.error("Markdown Clipper editor close failed:", error);
  }
  window.close();
}

function renderVariables(variables) {
  const entries = Object.entries(variables)
    .filter(([, value]) => value != null && String(value) !== "")
    .sort((a, b) => a[0].localeCompare(b[0]));
  el.vars.replaceChildren();
  if (!entries.length) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "No variables captured.";
    el.vars.appendChild(note);
    return;
  }
  for (const [key, value] of entries) {
    const row = document.createElement("div");
    row.className = "var-row";
    const name = document.createElement("code");
    name.className = "var-key";
    name.textContent = key;
    const val = document.createElement("span");
    val.className = "var-value";
    const text = String(value);
    val.textContent = text.length > 400 ? `${text.slice(0, 400)}…` : text;
    val.title = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
    row.append(name, val);
    el.vars.appendChild(row);
  }
}

function flash(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("is-error", isError);
  setTimeout(() => {
    el.status.textContent = "";
    el.status.classList.remove("is-error");
  }, 2200);
}

function showCopySuccess(button) {
  const label = button.querySelector(".btn-label");
  button.classList.add("is-success");
  if (label) label.textContent = "Copied";
  setTimeout(() => {
    button.classList.remove("is-success");
    if (label) label.textContent = "Copy";
  }, 1200);
}

function messageFrom(error) {
  return error && error.message ? error.message : String(error);
}
