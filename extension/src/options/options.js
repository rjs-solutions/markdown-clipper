// Generic, schema-driven options page. All rendering, loading, and saving
// walks extension/src/lib/settings-schema.js -- there is no per-key mapping
// here, so adding a setting only requires adding a field to the schema.

import { DEFAULT_SETTINGS, loadSettings, saveSettings, resetSettings, clampNumber } from "../lib/settings.js";
import { SETTINGS_SCHEMA, schemaFields, findField } from "../lib/settings-schema.js";
import { applyTheme } from "../lib/theme.js";
import { saveHandle, loadHandle, clearHandle, ensurePermission } from "../lib/vault-handle.js";
import { loadRules, saveRules } from "../lib/tag-rules.js";
import { exportSettings, importSettings } from "../lib/settings-backup.js";
import { downloadText } from "../lib/download.js";
import { listClips } from "../lib/clip-log.js";

export function fieldId(key) {
  return `f-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

// Small inline icon set for "segmented" fields (theme + toolbar-icon action).
// Stroke-only, currentColor, so they follow the button's text color in every
// theme. Keyed by the `icon` name a schema option declares.
const ICONS = {
  system:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="1.5"></rect><path d="M8 20h8M12 17v3"></path></svg>',
  light:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z"></path></svg>',
  popup:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="7" width="12" height="10" rx="1.5"></rect></svg>',
  sidepanel:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M15 4v16"></path></svg>',
  inpage:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><rect x="12" y="12" width="7" height="5" rx="1"></rect></svg>'
};

// Builds nav items + panels for `schema` inside the given containers and
// returns { controls, fillForm, readForm, updateDependents } bound to the
// rendered DOM. Kept as a factory (rather than module-level state) so tests
// can render an isolated schema against throwaway containers.
//
// Sections flagged `header: true` (e.g. the persistent Appearance/theme
// control) render into `headerElement` instead of the nav+panels loop, but
// their fields still flow through the same controls map / fillForm / readForm
// as every other field.
export function createOptionsForm(schema, { navElement, panelsElement, headerElement, onThemeChange } = {}) {
  const controls = new Map();
  const allFields = schemaFields(schema);
  let loadedSettings = {};

  function getFieldValue(field) {
    const control = controls.get(field.key);
    if (field.type === "toggle") {
      return control.checked;
    }
    if (field.type === "number") {
      return clampNumber(control.value, field.min, field.max, DEFAULT_SETTINGS[field.key]);
    }
    return control.value;
  }

  // Segmented controls store their selected value on a hidden input (via
  // overridden value/disabled accessors, see renderField below), so they
  // round-trip through the same generic getFieldValue/setFieldValue path as
  // every other field type.

  function setFieldValue(field, value) {
    const control = controls.get(field.key);
    if (field.type === "toggle") {
      control.checked = Boolean(value);
    } else {
      control.value = value;
    }
  }

  function updateDependents() {
    for (const field of allFields) {
      if (!field.dependsOn) {
        continue;
      }
      const controllerField = findField(field.dependsOn.key, schema);
      const enabled = getFieldValue(controllerField) === field.dependsOn.value;
      const control = controls.get(field.key);
      control.disabled = !enabled;
      const wrapper = control.closest(".field");
      if (wrapper) {
        wrapper.classList.toggle("is-disabled", !enabled);
      }
    }
  }

  function renderSegmented(field, id) {
    const wrapper = document.createElement("div");
    wrapper.className = field.fullWidth ? "field segmented-field segmented-field-full" : "field segmented-field";
    wrapper.dataset.key = field.key;

    const label = document.createElement("span");
    label.className = "segmented-label";
    label.id = `${id}-label`;
    label.textContent = field.label;
    wrapper.append(label);

    const group = document.createElement("div");
    group.className = "segmented";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-labelledby", label.id);

    // A hidden input is the "control" every other field type already uses:
    // its value/disabled accessors are overridden below so the generic
    // getFieldValue/setFieldValue/updateDependents code (which just reads and
    // writes `control.value` / `control.disabled`) also drives the visible
    // segmented buttons.
    const control = document.createElement("input");
    control.type = "hidden";
    control.id = id;

    const buttons = [];
    let currentValue = field.default;
    let currentDisabled = false;

    function sync() {
      for (const button of buttons) {
        const active = button.dataset.value === currentValue;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-checked", String(active));
        button.disabled = currentDisabled;
      }
    }

    Object.defineProperty(control, "value", {
      get: () => currentValue,
      set(next) {
        currentValue = next;
        sync();
      }
    });
    Object.defineProperty(control, "disabled", {
      get: () => currentDisabled,
      set(next) {
        currentDisabled = Boolean(next);
        sync();
      }
    });

    for (const opt of field.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "segmented-option";
      button.dataset.value = opt.value;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");
      if (opt.icon && ICONS[opt.icon]) {
        button.insertAdjacentHTML("beforeend", ICONS[opt.icon]);
      }
      const optLabel = document.createElement("span");
      optLabel.textContent = opt.label;
      button.append(optLabel);
      button.addEventListener("click", () => {
        if (currentDisabled) {
          return;
        }
        control.value = opt.value;
        control.dispatchEvent(new Event("change", { bubbles: true }));
      });
      buttons.push(button);
      group.append(button);
    }

    sync();
    wrapper.append(control, group);
    return { wrapper, control };
  }

  function renderField(field) {
    const id = fieldId(field.key);
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    wrapper.dataset.key = field.key;

    let control;

    if (field.type === "segmented") {
      const segmented = renderSegmented(field, id);
      controls.set(field.key, segmented.control);
      segmented.control.addEventListener("change", () => {
        if (field.key === "theme" && onThemeChange) {
          onThemeChange(getFieldValue(field));
        }
        updateDependents();
      });
      return segmented.wrapper;
    }

    if (field.type === "toggle") {
      const label = document.createElement("label");
      label.className = "checkbox-field";
      control = document.createElement("input");
      control.type = "checkbox";
      control.id = id;
      const span = document.createElement("span");
      span.textContent = field.label;
      label.append(control, span);
      wrapper.append(label);
    } else {
      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = field.label;
      wrapper.append(label);

      if (field.type === "select") {
        control = document.createElement("select");
        control.id = id;
        for (const opt of field.options) {
          const optionElement = document.createElement("option");
          optionElement.value = opt.value;
          optionElement.textContent = opt.label;
          control.append(optionElement);
        }
        wrapper.append(control);
      } else if (field.type === "number") {
        control = document.createElement("input");
        control.type = "number";
        control.id = id;
        control.min = String(field.min);
        control.max = String(field.max);
        control.step = String(field.step);
        if (field.unit) {
          const unitWrap = document.createElement("span");
          unitWrap.className = "input-with-unit";
          const unitSpan = document.createElement("span");
          unitSpan.setAttribute("aria-hidden", "true");
          unitSpan.textContent = field.unit;
          unitWrap.append(control, unitSpan);
          wrapper.append(unitWrap);
        } else {
          wrapper.append(control);
        }
      } else if (field.type === "textarea") {
        control = document.createElement("textarea");
        control.id = id;
        control.rows = field.rows || 6;
        control.spellcheck = false;
        wrapper.append(control);
      } else {
        control = document.createElement("input");
        control.type = "text";
        control.id = id;
        wrapper.append(control);
      }
    }

    if (field.help) {
      const help = document.createElement(field.richHelp ? "div" : "p");
      help.className = "help-text";
      help.id = `${id}-help`;
      if (field.richHelp) {
        help.innerHTML = field.help;
      } else {
        help.textContent = field.help;
      }
      control.setAttribute("aria-describedby", help.id);
      wrapper.append(help);
    }

    controls.set(field.key, control);
    control.addEventListener("change", () => {
      if (field.key === "theme" && onThemeChange) {
        onThemeChange(getFieldValue(field));
      }
      updateDependents();
    });

    return wrapper;
  }

  let tabIndex = 0;
  for (const section of schema) {
    if (section.header) {
      // Always render (so the field's control exists and fillForm/readForm
      // keep working even in tests that don't pass a headerElement); only
      // attach it to the DOM when there's somewhere to put it.
      for (const field of section.fields) {
        const rendered = renderField(field);
        if (headerElement) {
          headerElement.append(rendered);
        }
      }
      continue;
    }

    const isFirstTab = tabIndex === 0;
    tabIndex += 1;

    if (navElement) {
      const navButton = document.createElement("button");
      navButton.type = "button";
      navButton.className = isFirstTab ? "nav-item is-active" : "nav-item";
      navButton.dataset.section = section.id;
      navButton.textContent = section.label;
      navElement.append(navButton);
    }

    if (panelsElement) {
      const panel = document.createElement("section");
      panel.className = "group panel";
      panel.dataset.section = section.id;
      panel.hidden = !isFirstTab;

      const heading = document.createElement("h2");
      heading.textContent = section.label;
      panel.append(heading);

      if (section.groups) {
        for (const group of section.groups) {
          const groupHeading = document.createElement("h3");
          groupHeading.className = "group-heading";
          groupHeading.textContent = group.label;
          panel.append(groupHeading);
          for (const field of group.fields) {
            panel.append(renderField(field));
          }
        }
      } else {
        for (const field of section.fields) {
          panel.append(renderField(field));
        }
      }
      panelsElement.append(panel);
    }
  }

  if (navElement && panelsElement) {
    wireSectionNav(navElement, panelsElement);
  }

  function fillForm(settings) {
    loadedSettings = settings;
    for (const field of allFields) {
      setFieldValue(field, settings[field.key]);
    }
    if (onThemeChange) {
      onThemeChange(settings.theme);
    }
    updateDependents();
  }

  function readForm() {
    const result = { ...loadedSettings };
    for (const field of allFields) {
      result[field.key] = getFieldValue(field);
    }
    return result;
  }

  return { controls, fillForm, readForm, updateDependents };
}

// Left-nav section switching. Every field stays in the DOM (just hidden), so
// Save still reads them all regardless of the active section.
function wireSectionNav(navElement, panelsElement) {
  const navItems = Array.from(navElement.querySelectorAll(".nav-item"));
  const panels = Array.from(panelsElement.querySelectorAll(".panel"));
  const show = (section) => {
    for (const item of navItems) {
      item.classList.toggle("is-active", item.dataset.section === section);
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.section !== section;
    }
  };
  for (const item of navItems) {
    item.addEventListener("click", () => show(item.dataset.section));
  }
}

// ---- Bespoke vault folder-picker control ---------------------------------
// This is the ONE control on the options page not driven by the schema loop:
// it triggers showDirectoryPicker() (needs a live user gesture) and stores a
// FileSystemDirectoryHandle in IndexedDB (via vault-handle.js), not a plain
// value in chrome.storage.sync, so it can't be a schema field.
function renderVaultControl(panel) {
  if (!panel) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "field vault-field";

  const label = document.createElement("p");
  label.className = "vault-label";
  label.textContent = "Vault folder";
  wrapper.append(label);

  const statusLine = document.createElement("p");
  statusLine.className = "help-text vault-status";
  wrapper.append(statusLine);

  const buttons = document.createElement("div");
  buttons.className = "vault-buttons";

  const chooseButton = document.createElement("button");
  chooseButton.type = "button";
  chooseButton.textContent = "Choose folder";

  const regrantButton = document.createElement("button");
  regrantButton.type = "button";
  regrantButton.textContent = "Re-grant access";
  regrantButton.hidden = true;

  const forgetButton = document.createElement("button");
  forgetButton.type = "button";
  forgetButton.textContent = "Forget folder";
  forgetButton.hidden = true;

  buttons.append(chooseButton, regrantButton, forgetButton);
  wrapper.append(buttons);
  panel.append(wrapper);

  async function refresh() {
    const handle = await loadHandle();
    if (!handle) {
      statusLine.textContent = "No vault folder chosen. Clips save to Downloads.";
      regrantButton.hidden = true;
      forgetButton.hidden = true;
      return;
    }
    const state = await ensurePermission(handle, { interactive: false });
    const name = handle.name || "(unnamed folder)";
    statusLine.textContent =
      state === "granted" ? `Vault folder: ${name} (access granted)` : `Vault folder: ${name} (access needed)`;
    regrantButton.hidden = state === "granted";
    forgetButton.hidden = false;
  }

  chooseButton.addEventListener("click", async () => {
    if (!window.showDirectoryPicker) {
      statusLine.textContent = "This browser doesn't support choosing a folder.";
      return;
    }
    try {
      const handle = await window.showDirectoryPicker();
      await saveHandle(handle);
      await refresh();
    } catch (error) {
      // The user cancelling the picker throws AbortError; nothing to report.
      if (error && error.name !== "AbortError") {
        console.error("Markdown Clipper vault folder pick failed:", error);
      }
    }
  });

  regrantButton.addEventListener("click", async () => {
    const handle = await loadHandle();
    if (!handle) {
      return;
    }
    await ensurePermission(handle, { interactive: true });
    await refresh();
  });

  forgetButton.addEventListener("click", async () => {
    await clearHandle();
    await refresh();
  });

  refresh();
}

// ---- Bespoke tag-rules editor ---------------------------------------------
// A second control on the options page not driven by the schema loop: the
// rules list persists under its own chrome.storage.sync key ("tagRules", via
// tag-rules.js) rather than a schema field, exactly like the vault folder
// control above -- see docs/llm-vault-design.md ("Clip routing -- tags over
// folders"). Auto-saves on every edit (mirrors the folder control's
// immediate persistence; no separate Save-rules button). This never touches
// the schema form's own Save/Reset, which keeps ignoring tagRules entirely.
const RULE_SCOPES = ["domain", "url", "title", "text", "any"];

function generateRuleId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderTagRulesControl(panel) {
  if (!panel) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "field rules-field";

  const label = document.createElement("p");
  label.className = "rules-label";
  label.textContent = "Tag rules";
  wrapper.append(label);

  const help = document.createElement("p");
  help.className = "help-text";
  help.textContent =
    "Deterministic rules that pre-fill tags at clip time. Every matching rule adds its tags (nothing is exclusive), and the popup always shows the result before saving so you can edit it. Rules never choose folders.";
  wrapper.append(help);

  const list = document.createElement("div");
  list.className = "rules-list";
  wrapper.append(list);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add rule";
  wrapper.append(addButton);

  panel.append(wrapper);

  let rules = [];

  function persist() {
    saveRules(rules).catch((error) => {
      console.error("Markdown Clipper tag rules save failed:", error);
    });
  }

  function renderRow(rule) {
    const row = document.createElement("div");
    row.className = "rule-row";

    const scopeSelect = document.createElement("select");
    scopeSelect.setAttribute("aria-label", "Rule scope");
    for (const scope of RULE_SCOPES) {
      const option = document.createElement("option");
      option.value = scope;
      option.textContent = scope;
      scopeSelect.append(option);
    }
    scopeSelect.value = RULE_SCOPES.includes(rule.scope) ? rule.scope : "domain";

    const patternInput = document.createElement("input");
    patternInput.type = "text";
    patternInput.placeholder = "Pattern";
    patternInput.setAttribute("aria-label", "Rule pattern");
    patternInput.value = rule.pattern || "";

    const regexLabel = document.createElement("label");
    regexLabel.className = "rule-regex";
    const regexCheckbox = document.createElement("input");
    regexCheckbox.type = "checkbox";
    regexCheckbox.checked = Boolean(rule.isRegex);
    const regexSpan = document.createElement("span");
    regexSpan.textContent = "Regex";
    regexLabel.append(regexCheckbox, regexSpan);

    const tagsInput = document.createElement("input");
    tagsInput.type = "text";
    tagsInput.placeholder = "Tags, comma-separated";
    tagsInput.setAttribute("aria-label", "Rule tags");
    tagsInput.value = Array.isArray(rule.tags) ? rule.tags.join(", ") : "";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", "Remove this rule");

    row.append(scopeSelect, patternInput, regexLabel, tagsInput, removeButton);
    list.append(row);

    scopeSelect.addEventListener("change", () => {
      rule.scope = scopeSelect.value;
      persist();
    });
    patternInput.addEventListener("input", () => {
      rule.pattern = patternInput.value;
      persist();
    });
    regexCheckbox.addEventListener("change", () => {
      rule.isRegex = regexCheckbox.checked;
      persist();
    });
    tagsInput.addEventListener("input", () => {
      rule.tags = tagsInput.value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      persist();
    });
    removeButton.addEventListener("click", () => {
      rules = rules.filter((existing) => existing !== rule);
      row.remove();
      persist();
    });
  }

  addButton.addEventListener("click", () => {
    const rule = { id: generateRuleId(), scope: "domain", pattern: "", isRegex: false, tags: [] };
    rules.push(rule);
    renderRow(rule);
    persist();
  });

  loadRules().then((loaded) => {
    rules = loaded;
    for (const rule of rules) {
      renderRow(rule);
    }
  });
}

// ---- Bespoke prompt-generator launcher ------------------------------------
// A third control on the options page not driven by the schema loop: it just
// opens the prompt-generator page (extension/src/prompt/index.html) in a new
// tab, mirroring how the popup used to open it via chrome.tabs.create. Lives
// here rather than the popup because generating a prompt analyzes the whole
// vault, not a single clip -- see docs/llm-vault-design.md.
function renderPromptGeneratorControl(panel) {
  if (!panel) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "field prompt-field";

  const label = document.createElement("p");
  label.className = "prompt-label";
  label.textContent = "Prompt generator";
  wrapper.append(label);

  const help = document.createElement("p");
  help.className = "help-text";
  help.textContent = "Build a prompt to analyze your clipped vault with an LLM.";
  wrapper.append(help);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open prompt generator";
  wrapper.append(openButton);

  panel.append(wrapper);

  openButton.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/prompt/index.html") });
  });
}

// ---- Bespoke Advanced-tab controls ----------------------------------------

// Export/import all settings + tag rules as one JSON file. Not schema-driven:
// it reads/writes several storage keys at once via settings-backup.js and
// needs to refill the whole form after an import.
function renderBackupControl(panel, { fillForm }) {
  if (!panel) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "field backup-field";

  const label = document.createElement("p");
  label.className = "backup-label";
  label.textContent = "Backup";
  wrapper.append(label);

  const help = document.createElement("p");
  help.className = "help-text";
  help.textContent = "Export every setting and tag rule to a file, or restore them from one.";
  wrapper.append(help);

  const buttons = document.createElement("div");
  buttons.className = "backup-buttons";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export";

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.textContent = "Import";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json";
  fileInput.hidden = true;

  const statusLine = document.createElement("p");
  statusLine.className = "help-text backup-status";
  statusLine.setAttribute("role", "status");
  statusLine.setAttribute("aria-live", "polite");

  buttons.append(exportButton, importButton, fileInput);
  wrapper.append(buttons, statusLine);
  panel.append(wrapper);

  exportButton.addEventListener("click", async () => {
    const backup = await exportSettings();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(JSON.stringify(backup, null, 2), `markdown-clipper-settings-${stamp}.json`, {
      type: "application/json"
    });
    statusLine.textContent = "Exported";
  });

  importButton.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("That file isn't valid JSON.");
      }
      await importSettings(parsed);
      fillForm(await loadSettings());
      statusLine.textContent = "Imported";
    } catch (error) {
      statusLine.textContent = `Import failed: ${error.message}`;
    }
  });
}

// Read-only clip count from the clip-history log (clip-log.js), so the
// Advanced tab shows how much has accumulated without opening the vault.
function renderActivityControl(panel) {
  if (!panel) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "field activity-field";

  const label = document.createElement("p");
  label.className = "activity-label";
  label.textContent = "Activity";
  wrapper.append(label);

  const statusLine = document.createElement("p");
  statusLine.className = "help-text activity-status";
  statusLine.textContent = "Loading clip history…";
  wrapper.append(statusLine);

  panel.append(wrapper);

  listClips()
    .then((clips) => {
      const count = clips.length;
      statusLine.textContent = count === 1 ? "1 clip saved" : `${count} clips saved`;
    })
    .catch(() => {
      statusLine.textContent = "Clip history isn't available.";
    });
}

// Reset to defaults, moved here from the page-wide footer since it now reads
// as an Advanced-tab action rather than something visible from every tab.
function renderResetControl(panel, { fillForm, statusElement }) {
  if (!panel) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "field reset-field";

  const label = document.createElement("p");
  label.className = "reset-label";
  label.textContent = "Reset";
  wrapper.append(label);

  const help = document.createElement("p");
  help.className = "help-text";
  help.textContent = "Restore every setting on this page to its default value.";
  wrapper.append(help);

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Reset to defaults";
  wrapper.append(resetButton);

  panel.append(wrapper);

  resetButton.addEventListener("click", async () => {
    fillForm(await resetSettings());
    flash(statusElement, "Reset");
  });
}

async function initialize() {
  const form = document.getElementById("options-form");
  const statusElement = document.getElementById("status");
  const navElement = document.getElementById("settings-nav");
  const panelsElement = document.getElementById("panels");
  const headerElement = document.getElementById("appearance-control");

  const { fillForm, readForm } = createOptionsForm(SETTINGS_SCHEMA, {
    navElement,
    panelsElement,
    headerElement,
    onThemeChange: applyTheme
  });

  const knowledgeBasePanel = panelsElement.querySelector('[data-section="knowledgeBase"]');
  renderVaultControl(knowledgeBasePanel);
  // The vault folder picker sets up everything else in this tab (the preset
  // writes into it, the index lives there), so move it right after the
  // vaultEnabled toggle and ahead of knowledgeBasePreset, which schema order
  // alone can't do since this is a bespoke control appended after the fields.
  const vaultField = knowledgeBasePanel.querySelector(".vault-field");
  const presetField = knowledgeBasePanel.querySelector('[data-key="knowledgeBasePreset"]');
  if (vaultField && presetField) {
    knowledgeBasePanel.insertBefore(vaultField, presetField);
  }
  renderTagRulesControl(knowledgeBasePanel);
  renderPromptGeneratorControl(knowledgeBasePanel);

  const advancedPanel = panelsElement.querySelector('[data-section="advanced"]');
  renderBackupControl(advancedPanel, { fillForm });
  renderActivityControl(advancedPanel);
  renderResetControl(advancedPanel, { fillForm, statusElement });

  fillForm(await loadSettings());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings(readForm());
    flash(statusElement, "Saved");
  });
}

function flash(statusElement, message) {
  statusElement.textContent = message;
  setTimeout(() => {
    statusElement.textContent = "";
  }, 1600);
}

document.addEventListener("DOMContentLoaded", initialize);
