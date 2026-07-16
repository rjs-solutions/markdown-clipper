// Generic, schema-driven options page. All rendering, loading, and saving
// walks extension/src/lib/settings-schema.js -- there is no per-key mapping
// here, so adding a setting only requires adding a field to the schema.

import { DEFAULT_SETTINGS, loadSettings, saveSettings, resetSettings, clampNumber } from "../lib/settings.js";
import { SETTINGS_SCHEMA, schemaFields, findField } from "../lib/settings-schema.js";
import { applyTheme } from "../lib/theme.js";
import {
  saveHandle,
  loadHandle,
  clearHandle,
  ensurePermission,
  saveCollectionLibraryHandle,
  loadCollectionLibraryHandle,
  clearCollectionLibraryHandle
} from "../lib/vault-handle.js";
import { loadRules, saveRules } from "../lib/tag-rules.js";
import { createCollectionFromUrl, loadCollections, saveCollections } from "../lib/collections.js";
import { discoverSitePages } from "../lib/sharepoint-fetch.js";
import { fetchSitemapPages } from "../lib/crawl.js";
import { parseSitemap } from "../lib/discover.js";
import { fetchLlmsPages } from "../lib/llms.js";
import {
  loadSiteInventory,
  loadSiteInventories,
  saveSiteInventory,
  removeSiteInventory,
  reconcileSitePages,
  pageIdentity
} from "../lib/sharepoint-inventory.js";
import { exportSettings, importSettings } from "../lib/settings-backup.js";
import { downloadText } from "../lib/download.js";
import { collectionsToCsv } from "../lib/collection-csv.js";
import { openCollectionWindow } from "../lib/window-placement.js";
import { collectionLibraryPath, normalizeLibraryPath, uniqueCollectionLibraryPath } from "../lib/collection-library.js";
import { slugify } from "../lib/slug.js";
import { listClips } from "../lib/clip-log.js";
import { TASK_PRESETS, buildPrompt } from "../lib/prompt-templates.js";

const loadSites = loadCollections;
const saveSites = saveCollections;

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
export function createOptionsForm(schema, { navElement, panelsElement, onThemeChange } = {}) {
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

  // Two-column variant of the segmented control (currently just
  // defaultAction/"Toolbar icon click"): a vertical option list on the left,
  // a live diagram on the right. Registers the identical hidden-input
  // control contract as renderSegmented above (value/disabled accessors,
  // change dispatch on click) so readForm/fillForm/dirty-state/save don't
  // need to know this variant exists; only the DOM layout differs.
  function renderBehaviorDiagram(field, id) {
    const wrapper = document.createElement("div");
    wrapper.className = "field segmented-field behavior-field";
    wrapper.dataset.key = field.key;

    const label = document.createElement("span");
    label.className = "segmented-label";
    label.id = `${id}-label`;
    label.textContent = field.label;
    wrapper.append(label);

    const behaviorControl = document.createElement("div");
    behaviorControl.className = "behavior-control";

    const group = document.createElement("div");
    group.className = "behavior-options";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-labelledby", label.id);

    const control = document.createElement("input");
    control.type = "hidden";
    control.id = id;

    const rows = [];
    let currentValue = field.default;
    let currentDisabled = false;

    function sync() {
      behaviorControl.dataset.value = currentValue;
      for (const row of rows) {
        const active = row.dataset.value === currentValue;
        row.classList.toggle("is-active", active);
        row.setAttribute("aria-checked", String(active));
        row.disabled = currentDisabled;
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
      const row = document.createElement("button");
      row.type = "button";
      row.className = "behavior-option";
      row.dataset.value = opt.value;
      row.setAttribute("role", "radio");
      row.setAttribute("aria-checked", "false");

      const icon = document.createElement("span");
      icon.className = "behavior-option-icon";
      if (opt.icon && ICONS[opt.icon]) {
        icon.insertAdjacentHTML("beforeend", ICONS[opt.icon]);
      }

      const text = document.createElement("span");
      text.className = "behavior-option-text";
      const optLabel = document.createElement("span");
      optLabel.className = "behavior-option-label";
      optLabel.textContent = opt.label;
      text.append(optLabel);
      if (opt.description) {
        const description = document.createElement("span");
        description.className = "behavior-option-description";
        description.textContent = opt.description;
        text.append(description);
      }

      row.append(icon, text);
      row.addEventListener("click", () => {
        if (currentDisabled) {
          return;
        }
        control.value = opt.value;
        control.dispatchEvent(new Event("change", { bubbles: true }));
      });
      rows.push(row);
      group.append(row);
    }

    sync();
    behaviorControl.append(group, renderBehaviorSchematic());
    wrapper.append(control, behaviorControl);
    return { wrapper, control };
  }

  // Inline SVG "browser window" schematic for the behavior diagram: a
  // rounded window frame with a toolbar strip, plus one highlight region per
  // defaultAction value. Which region is emphasized is driven purely by CSS
  // off `.behavior-control[data-value]` (see options/styles.css), so `sync`
  // above only ever needs to touch that one dataset attribute.
  function renderBehaviorSchematic() {
    const wrapper = document.createElement("div");
    wrapper.className = "behavior-diagram";
    wrapper.innerHTML =
      '<svg viewBox="0 0 200 140" aria-hidden="true">' +
      '<rect class="window-frame" x="4" y="4" width="192" height="132" rx="8"></rect>' +
      '<rect class="window-toolbar" x="4" y="4" width="192" height="20" rx="8"></rect>' +
      '<circle class="window-dot" cx="15" cy="14" r="2.5"></circle>' +
      '<circle class="window-dot" cx="23" cy="14" r="2.5"></circle>' +
      '<circle class="window-dot" cx="31" cy="14" r="2.5"></circle>' +
      '<rect class="region region-popup" x="148" y="28" width="42" height="30" rx="4"></rect>' +
      '<rect class="region region-sidepanel" x="154" y="26" width="38" height="104" rx="4"></rect>' +
      '<rect class="region region-inpage" x="118" y="40" width="44" height="80" rx="5"></rect>' +
      "</svg>";
    return wrapper;
  }

  function renderField(field) {
    const id = fieldId(field.key);
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    wrapper.dataset.key = field.key;

    let control;

    if (field.type === "segmented") {
      const segmented = field.variant === "diagram" ? renderBehaviorDiagram(field, id) : renderSegmented(field, id);
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
      const switchVisual = document.createElement("span");
      switchVisual.className = "switch-visual";
      switchVisual.setAttribute("aria-hidden", "true");
      const span = document.createElement("span");
      span.textContent = field.label;
      label.append(control, switchVisual, span);
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
// value in chrome.storage.sync, so it can't be a schema field. It is a
// nested sub-control of the vaultEnabled toggle (see initialize()), shown
// and hidden by wireVaultToggle below, but otherwise independent of it: the
// folder picker only ever opens from this control's own "Choose folder"
// button, so the click stays a live user gesture.
export function renderVaultControl(panel) {
  if (!panel) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "field vault-field";
  wrapper.hidden = true;

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
      statusLine.textContent = "No folder chosen yet. Clips save to Downloads until you choose one.";
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

  // Called synchronously from a click/change handler with no awaited call
  // ahead of window.showDirectoryPicker(), so the transient user activation
  // that opened the picker is still live. Returns { picked } rather than
  // throwing so callers (the vaultEnabled coupling in initialize()) can
  // react to a cancel without a try/catch of their own.
  async function promptForFolder() {
    if (!window.showDirectoryPicker) {
      statusLine.textContent = "This browser doesn't support choosing a folder.";
      return { picked: false };
    }
    try {
      const handle = await window.showDirectoryPicker();
      await saveHandle(handle);
      await refresh();
      return { picked: true };
    } catch (error) {
      // The user cancelling the picker throws AbortError; nothing to report.
      if (error && error.name !== "AbortError") {
        console.error("Markdown Clipper vault folder pick failed:", error);
      }
      return { picked: false };
    }
  }

  chooseButton.addEventListener("click", () => {
    promptForFolder();
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

  return {
    element: wrapper,
    refresh,
    setVisible: (visible) => {
      wrapper.hidden = !visible;
    },
    promptForFolder
  };
}

// Couples the vaultEnabled toggle to the vault folder control (returned by
// renderVaultControl above): purely shows/hides the nested folder control.
// Nothing here opens the picker -- showDirectoryPicker() does not reliably
// treat a checkbox's "change" event as a live user gesture, so the picker
// only ever opens from the folder control's own "Choose folder" button
// click. Kept separate from initialize() so it can be exercised directly in
// tests without the rest of the options page (chrome.storage, the About
// block, etc).
export function wireVaultToggle(vaultEnabledControl, vaultControl) {
  vaultEnabledControl.addEventListener("change", () => {
    vaultControl.setVisible(vaultEnabledControl.checked);
  });
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

  const heading = document.createElement("h3");
  heading.className = "group-heading";
  heading.textContent = "Tag rules";
  panel.append(heading);

  const wrapper = document.createElement("div");
  wrapper.className = "field rules-field";

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

// ---- Saved collections editor ----------------------------------------------
// Generalized from the original SharePoint-only list. Collection definitions
// sync through collections.js; larger page inventories remain local.
function collectionTypeLabel(type) {
  return ({ sharepoint: "SharePoint", confluence: "Confluence", website: "Website", custom: "Custom list" })[type] || "Collection";
}

function pageFromUrl(url) {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).at(-1) || parsed.hostname;
    return { url: parsed.href, title: decodeURIComponent(segment), modified: "" };
  } catch {
    return { url, title: url, modified: "" };
  }
}

async function discoverCollectionPages(collection) {
  if (collection.type === "sharepoint") return discoverSitePages(collection);
  if (collection.type === "custom") return { ok: true, pages: (collection.urls || []).map(pageFromUrl), sourceMode: "list" };
  const source = collection.sourceUrl || collection.webUrl || collection.url;
  const mode = collection.sourceMode || "auto";
  if (mode === "llms") return { ok: true, pages: (await fetchLlmsPages(source)).map(pageFromUrl), sourceMode: "llms" };
  if (mode === "sitemap") return { ok: true, pages: (await fetchSitemapPages(source, { parse: parseSitemap })).map(pageFromUrl), sourceMode: "sitemap" };
  if (mode === "crawl") return { ok: false, reason: "crawl-required" };

  const base = new URL(source);
  const llmsUrl = new URL("/llms.txt", base).href;
  try {
    const urls = await fetchLlmsPages(llmsUrl);
    if (urls.length) return { ok: true, pages: urls.map(pageFromUrl), sourceMode: "llms", sourceUrl: llmsUrl };
  } catch {
    // Fall through to the conventional sitemap location.
  }
  const sitemapUrl = new URL("/sitemap.xml", base).href;
  const urls = await fetchSitemapPages(sitemapUrl, { parse: parseSitemap });
  return urls.length
    ? { ok: true, pages: urls.map(pageFromUrl), sourceMode: "sitemap", sourceUrl: sitemapUrl }
    : { ok: false, reason: "crawl-required" };
}

function renderCollectionsControl(panel) {
  if (!panel) {
    return;
  }

  const heading = document.createElement("h3");
  heading.className = "group-heading";
  heading.textContent = "Add a collection";
  panel.append(heading);

  const wrapper = document.createElement("div");
  wrapper.className = "field sites-field";

  const help = document.createElement("p");
  help.className = "help-text";
  help.textContent = "Add a site once, refresh its page inventory, and reuse it for future exports.";
  wrapper.append(help);

  const toolbar = document.createElement("div");
  toolbar.className = "sites-toolbar";
  const importListButton = document.createElement("button");
  importListButton.type = "button";
  importListButton.textContent = "Import URL list…";
  const exportAllButton = document.createElement("button");
  exportAllButton.type = "button";
  exportAllButton.textContent = "Export all CSV";
  const refreshAllButton = document.createElement("button");
  refreshAllButton.type = "button";
  refreshAllButton.textContent = "Refresh all collections";
  refreshAllButton.disabled = true;
  toolbar.append(importListButton, exportAllButton, refreshAllButton);

  const list = document.createElement("div");
  list.className = "sites-list";

  const addRow = document.createElement("div");
  addRow.className = "sites-add-row";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.placeholder = "https://example.com or a sitemap / llms.txt URL";
  urlInput.setAttribute("aria-label", "Collection URL");

  const typeSelect = document.createElement("select");
  typeSelect.setAttribute("aria-label", "Collection platform");
  for (const [value, label] of [["auto", "Detect platform"], ["website", "Website"], ["confluence", "Confluence"], ["sharepoint", "SharePoint"]]) {
    typeSelect.append(new Option(label, value));
  }

  const sourceSelect = document.createElement("select");
  sourceSelect.setAttribute("aria-label", "Discovery method");
  for (const [value, label] of [["auto", "Auto discovery"], ["sitemap", "Sitemap"], ["llms", "llms.txt"], ["crawl", "Same-site crawl"]]) {
    sourceSelect.append(new Option(label, value));
  }

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add & discover";

  addRow.append(urlInput, typeSelect, sourceSelect, addButton);
  wrapper.append(addRow);

  const status = document.createElement("p");
  status.className = "sites-status";
  wrapper.append(status);

  const libraryHeading = document.createElement("h3");
  libraryHeading.className = "group-heading collection-library-heading";
  libraryHeading.textContent = "Local Collections Library";
  wrapper.append(libraryHeading);

  const libraryField = document.createElement("div");
  libraryField.className = "collection-library-field";
  const libraryDescription = document.createElement("p");
  libraryDescription.className = "help-text";
  libraryDescription.textContent = "Choose one local root folder. Each collection syncs into its own normal-file folder for LLMs, search, backup, or sharing.";
  const libraryStatus = document.createElement("p");
  libraryStatus.className = "sites-status";
  const libraryButtons = document.createElement("div");
  libraryButtons.className = "collection-library-buttons";
  const chooseLibraryButton = document.createElement("button");
  chooseLibraryButton.type = "button";
  chooseLibraryButton.textContent = "Choose library folder";
  const regrantLibraryButton = document.createElement("button");
  regrantLibraryButton.type = "button";
  regrantLibraryButton.textContent = "Re-grant access";
  const forgetLibraryButton = document.createElement("button");
  forgetLibraryButton.type = "button";
  forgetLibraryButton.textContent = "Forget folder";
  libraryButtons.append(chooseLibraryButton, regrantLibraryButton, forgetLibraryButton);
  libraryField.append(libraryDescription, libraryStatus, libraryButtons);
  wrapper.append(libraryField);

  const savedHeading = document.createElement("h3");
  savedHeading.className = "group-heading collection-saved-heading";
  savedHeading.textContent = "Saved collections";
  wrapper.append(savedHeading, toolbar, list);

  panel.append(wrapper);

  let sites = [];
  let libraryHandle = null;
  const rowControllers = new Map();

  async function refreshLibraryStatus() {
    try {
      libraryHandle = await loadCollectionLibraryHandle();
      if (!libraryHandle) {
        libraryStatus.textContent = "No library folder chosen. Snapshot downloads still work normally.";
        regrantLibraryButton.hidden = true;
        forgetLibraryButton.hidden = true;
        return;
      }
      const permission = await ensurePermission(libraryHandle);
      libraryStatus.textContent = `Library folder: ${libraryHandle.name || "(unnamed folder)"} (${permission === "granted" ? "access granted" : "access needed"})`;
      regrantLibraryButton.hidden = permission === "granted";
      forgetLibraryButton.hidden = false;
    } catch (error) {
      libraryStatus.textContent = `Could not read the library folder: ${error && error.message ? error.message : error}`;
    }
  }

  chooseLibraryButton.addEventListener("click", async () => {
    if (!window.showDirectoryPicker) {
      libraryStatus.textContent = "This browser does not support choosing a persistent folder.";
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await saveCollectionLibraryHandle(handle);
      libraryHandle = handle;
      await refreshLibraryStatus();
    } catch (error) {
      if (!error || error.name !== "AbortError") libraryStatus.textContent = `Could not choose the library folder: ${error && error.message ? error.message : error}`;
    }
  });

  regrantLibraryButton.addEventListener("click", async () => {
    if (!libraryHandle) return refreshLibraryStatus();
    try {
      await libraryHandle.requestPermission({ mode: "readwrite" });
      await refreshLibraryStatus();
    } catch (error) {
      libraryStatus.textContent = `Could not restore folder access: ${error && error.message ? error.message : error}`;
    }
  });

  forgetLibraryButton.addEventListener("click", async () => {
    await clearCollectionLibraryHandle();
    libraryHandle = null;
    await refreshLibraryStatus();
  });

  refreshLibraryStatus();

  function persist() {
    saveSites(sites).catch((error) => {
      console.error("Markdown Clipper collections save failed:", error);
    });
  }

  function renderRow(site, initialInventory = null) {
    const row = document.createElement("div");
    row.className = "site-row";

    const top = document.createElement("div");
    top.className = "site-row-top";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "site-toggle";
    toggleButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3"></path></svg>';

    const info = document.createElement("div");
    info.className = "site-info";
    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = site.name;
    const badge = document.createElement("span");
    badge.className = `collection-type is-${site.type || "sharepoint"}`;
    badge.textContent = collectionTypeLabel(site.type || "sharepoint");
    const url = document.createElement("span");
    url.className = "site-url";
    url.textContent = site.webUrl || site.url;
    const nameLine = document.createElement("span");
    nameLine.className = "collection-name-line";
    nameLine.append(name, badge);
    info.append(nameLine, url);

    const actions = document.createElement("div");
    actions.className = "site-actions";

    const discoverButton = document.createElement("button");
    discoverButton.type = "button";
    discoverButton.textContent = site.type === "custom" ? "Review URLs" : "Refresh";
    discoverButton.setAttribute("aria-label", `${site.type === "custom" ? "Review" : "Refresh"} ${site.name}`);

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.textContent = "Export";
    runButton.setAttribute("aria-label", `Export ${site.name} to Markdown`);

    const syncButton = document.createElement("button");
    syncButton.type = "button";
    syncButton.textContent = "Sync";
    syncButton.setAttribute("aria-label", `Sync ${site.name} to its local library folder`);

    const csvButton = document.createElement("button");
    csvButton.type = "button";
    csvButton.textContent = "CSV";
    csvButton.setAttribute("aria-label", `Export ${site.name} URL inventory as CSV`);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${site.name}`);

    actions.append(discoverButton, syncButton, runButton, csvButton, removeButton);
    top.append(toggleButton, info, actions);
    row.append(top);

    const details = document.createElement("div");
    details.className = "site-details";
    details.hidden = Boolean(site.collapsed);
    toggleButton.classList.toggle("is-collapsed", details.hidden);
    toggleButton.setAttribute("aria-expanded", String(!details.hidden));
    toggleButton.setAttribute("aria-label", `${details.hidden ? "Expand" : "Collapse"} ${site.name}`);

    const discoverStatus = document.createElement("p");
    discoverStatus.className = "site-discover-status";
    details.append(discoverStatus);

    const folderRow = document.createElement("div");
    folderRow.className = "collection-folder-row";
    const folderLabel = document.createElement("label");
    folderLabel.textContent = "Local folder";
    const folderInput = document.createElement("input");
    folderInput.type = "text";
    folderInput.value = collectionLibraryPath(site);
    folderInput.setAttribute("aria-label", `Local library path for ${site.name}`);
    const resetFolderButton = document.createElement("button");
    resetFolderButton.type = "button";
    resetFolderButton.textContent = "Use default";
    folderRow.append(folderLabel, folderInput, resetFolderButton);
    details.append(folderRow);

    const discoverResults = document.createElement("ul");
    discoverResults.className = "site-discover-results";
    details.append(discoverResults);
    row.append(details);

    list.append(row);

    toggleButton.addEventListener("click", () => {
      details.hidden = !details.hidden;
      site.collapsed = details.hidden;
      toggleButton.classList.toggle("is-collapsed", details.hidden);
      toggleButton.setAttribute("aria-expanded", String(!details.hidden));
      toggleButton.setAttribute("aria-label", `${details.hidden ? "Expand" : "Collapse"} ${site.name}`);
      persist();
    });

    removeButton.addEventListener("click", () => {
      const removedName = site.name;
      sites = sites.filter((existing) => existing !== site);
      rowControllers.delete(site.id);
      row.remove();
      persist();
      removeSiteInventory(site.id).catch((error) => {
        console.error("Markdown Clipper collection inventory removal failed:", error);
      });
      refreshAllButton.disabled = sites.length === 0;
      status.textContent = `Removed ${removedName} from saved collections. Any local library files were left in place.`;
    });

    runButton.addEventListener("click", () => openCollectionWindow(`collection=${encodeURIComponent(site.id)}`));
    syncButton.addEventListener("click", () => {
      if (!libraryHandle) {
        discoverStatus.textContent = "Choose a Local Collections Library folder above before syncing.";
        details.hidden = false;
        return;
      }
      openCollectionWindow(`collection=${encodeURIComponent(site.id)}&destination=library`);
    });
    folderInput.addEventListener("change", () => {
      const normalized = normalizeLibraryPath(folderInput.value);
      const defaultPath = collectionLibraryPath({ ...site, libraryPath: "" });
      const proposed = normalized === defaultPath ? "" : normalized;
      if (sites.some((item) => item.id !== site.id && collectionLibraryPath(item).toLowerCase() === collectionLibraryPath({ ...site, libraryPath: proposed }).toLowerCase())) {
        discoverStatus.textContent = "Another collection already uses that local folder.";
        folderInput.value = collectionLibraryPath(site);
        return;
      }
      site.libraryPath = proposed;
      folderInput.value = collectionLibraryPath(site);
      persist();
    });
    resetFolderButton.addEventListener("click", () => {
      site.libraryPath = "";
      folderInput.value = collectionLibraryPath(site);
      persist();
    });
    csvButton.addEventListener("click", async () => {
      const inventory = await loadSiteInventory(site.id);
      await downloadText(collectionsToCsv([site], { [site.id]: inventory }), `${slugify(site.name, { fallback: "collection" })}-urls.csv`, { type: "text/csv;charset=utf-8" });
    });

    async function refresh({ permissionGranted = false } = {}) {
      if (site.type === "custom" || site.sourceMode === "crawl") {
        openCollectionWindow(`collection=${encodeURIComponent(site.id)}`);
        return true;
      }
      discoverStatus.textContent = "Checking for page changes...";
      discoverButton.disabled = true;
      details.hidden = false;
      site.collapsed = false;
      toggleButton.classList.remove("is-collapsed");
      toggleButton.setAttribute("aria-expanded", "true");
      toggleButton.setAttribute("aria-label", `Collapse ${site.name}`);

      // Request host permission as the very first async op, before any other
      // await, so the click's user activation is still valid when
      // chrome.permissions.request runs (it requires a user gesture). The
      // synchronous status/disable updates above don't consume the gesture.
      let granted = permissionGranted;
      if (!granted) {
        try {
          granted = await chrome.permissions.request({ origins: [`${new URL(site.webUrl).origin}/*`] });
        } catch {
          granted = false;
        }
      }
      if (!granted) {
        discoverStatus.textContent = "Permission needed to read this site.";
        discoverButton.disabled = false;
        return false;
      }

      try {
        const result = await discoverCollectionPages(site);
        if (result.ok) {
          const previous = await loadSiteInventory(site.id);
          const comparison = reconcileSitePages(previous.pages, result.pages || []);
          const refreshedAt = Date.now();
          await saveSiteInventory(site.id, { pages: comparison.pages, lastRefreshedAt: refreshedAt });
          if (result.sourceMode && site.sourceMode === "auto") {
            site.sourceMode = result.sourceMode;
            site.sourceUrl = result.sourceUrl || site.sourceUrl;
          }
          discoverButton.textContent = site.type === "custom" ? "Review URLs" : "Refresh";
          discoverStatus.textContent = describeRefreshResult(comparison, previous.lastRefreshedAt, refreshedAt);
          renderDiscoveredPages(
            discoverResults,
            comparison.pages,
            previous.lastRefreshedAt ? comparison.changeTypes : {}
          );
          persist();
          return true;
        } else {
          discoverStatus.textContent = result.reason === "crawl-required"
            ? "No sitemap or llms.txt was found. Open Export to run a same-site crawl."
            : describeDiscoveryError(result);
        }
      } catch (error) {
        discoverStatus.textContent = describeDiscoveryError({ reason: "fetch-failed", message: error && error.message ? error.message : String(error) });
      } finally {
        discoverButton.disabled = false;
      }
      return false;
    }

    discoverButton.addEventListener("click", () => refresh());

    const controller = { refresh, discoverButton };
    rowControllers.set(site.id, controller);
    Promise.resolve(initialInventory || loadSiteInventory(site.id)).then((inventory) => {
      if (inventory.lastRefreshedAt) {
        discoverButton.textContent = "Refresh";
        discoverStatus.textContent = `Last checked ${formatDateTime(inventory.lastRefreshedAt)} · ${inventory.pages.length} page${inventory.pages.length === 1 ? "" : "s"}.`;
        renderDiscoveredPages(discoverResults, inventory.pages);
      } else if (site.urls?.length) {
        const pages = site.urls.map(pageFromUrl);
        discoverButton.textContent = "Review URLs";
        discoverStatus.textContent = `${pages.length} saved URL${pages.length === 1 ? "" : "s"}.`;
        renderDiscoveredPages(discoverResults, pages);
      }
    }).catch((error) => {
      console.error("Markdown Clipper collection inventory load failed:", error);
    });

    return controller;
  }

  importListButton.addEventListener("click", () => openCollectionWindow("mode=list&save=1"));

  exportAllButton.addEventListener("click", async () => {
    const inventories = await loadSiteInventories(sites.map((site) => site.id));
    await downloadText(collectionsToCsv(sites, inventories), "markdown-clipper-collections.csv", { type: "text/csv;charset=utf-8" });
  });

  addButton.addEventListener("click", async () => {
    const result = createCollectionFromUrl(urlInput.value, { type: typeSelect.value, sourceMode: sourceSelect.value });
    if (!result.ok) {
      status.textContent = result.reason;
      return;
    }
    const site = result.collection;
    if (sites.some((saved) => (saved.webUrl || saved.url).toLowerCase() === site.webUrl.toLowerCase())) {
      status.textContent = "That collection is already saved.";
      return;
    }
    const uniquePath = uniqueCollectionLibraryPath(site, sites);
    if (uniquePath !== collectionLibraryPath(site)) site.libraryPath = uniquePath;
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [`${new URL(site.webUrl).origin}/*`] });
    } catch {
      granted = false;
    }
    sites.push(site);
    const controller = renderRow(site);
    persist();
    refreshAllButton.disabled = false;
    exportAllButton.disabled = false;
    urlInput.value = "";
    status.textContent = granted ? `Added ${site.name}; discovering pages…` : `Added ${site.name}. Site permission is needed to discover pages.`;
    if (granted) await controller.refresh({ permissionGranted: true });
  });

  refreshAllButton.addEventListener("click", async () => {
    if (!sites.length) {
      return;
    }
    refreshAllButton.disabled = true;
    status.textContent = "Refreshing saved collections…";
    const refreshable = sites.filter((site) => site.type !== "custom" && site.sourceMode !== "crawl");
    const origins = Array.from(new Set(refreshable.flatMap((site) => {
      try {
        return [`${new URL(site.webUrl).origin}/*`];
      } catch {
        return [];
      }
    })));
    if (!origins.length) {
      status.textContent = "No saved collections can be refreshed automatically.";
      refreshAllButton.disabled = false;
      return;
    }
    let granted = false;
    try {
      // One permission request keeps the Refresh all click within Chrome's
      // user-gesture requirement, even when several tenants are saved.
      granted = await chrome.permissions.request({ origins });
    } catch {
      granted = false;
    }
    if (!granted) {
      status.textContent = "Permission is needed to refresh the saved collections.";
      refreshAllButton.disabled = false;
      return;
    }
    let refreshed = 0;
    for (const site of refreshable) {
      const controller = rowControllers.get(site.id);
      if (controller && await controller.refresh({ permissionGranted: true })) {
        refreshed += 1;
      }
    }
    status.textContent = `Refreshed ${refreshed} of ${refreshable.length} collection${refreshable.length === 1 ? "" : "s"}.`;
    refreshAllButton.disabled = false;
  });

  loadSites().then(async (loaded) => {
    sites = loaded;
    const inventories = await loadSiteInventories(sites.map((site) => site.id));
    for (const site of sites) {
      renderRow(site, inventories[site.id]);
    }
    refreshAllButton.disabled = sites.length === 0;
    exportAllButton.disabled = sites.length === 0;
  });
}

// Show up to 10 discovered pages: title (or FileRef basename) plus a
// readable Modified date, if present.
function renderDiscoveredPages(list, pages, changeTypes = {}) {
  list.replaceChildren();
  for (const page of pages.slice(0, 10)) {
    const item = document.createElement("li");
    const modified = page.modified ? new Date(page.modified) : null;
    const modifiedText = modified && !Number.isNaN(modified.getTime()) ? ` (${modified.toLocaleDateString()})` : "";
    const text = document.createElement("span");
    text.textContent = `${page.title}${modifiedText}`;
    item.append(text);
    const changeType = changeTypes[pageIdentity(page)];
    if (changeType) {
      const badge = document.createElement("span");
      badge.className = `site-change-badge is-${changeType}`;
      badge.textContent = changeType === "new" ? "New" : "Updated";
      item.append(badge);
    }
    list.append(item);
  }
  if (pages.length > 10) {
    const more = document.createElement("li");
    more.className = "site-results-more";
    more.textContent = `+ ${pages.length - 10} more page${pages.length - 10 === 1 ? "" : "s"}`;
    list.append(more);
  }
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleString();
}

function describeRefreshResult(result, previousRefresh, refreshedAt) {
  if (!result.pages.length) {
    return "No pages found (the site may have no modern pages, or the list is named differently).";
  }
  if (!previousRefresh) {
    return `Found ${result.pages.length} page${result.pages.length === 1 ? "" : "s"} · checked ${formatDateTime(refreshedAt)}.`;
  }
  const changes = [];
  if (result.newCount) changes.push(`${result.newCount} new`);
  if (result.updatedCount) changes.push(`${result.updatedCount} updated`);
  if (result.removedCount) changes.push(`${result.removedCount} removed`);
  return `${result.pages.length} page${result.pages.length === 1 ? "" : "s"} · ${changes.length ? changes.join(" · ") : "no changes"} · checked ${formatDateTime(refreshedAt)}.`;
}

// Translate a discoverSitePages() failure into a message a non-technical
// reader can act on.
function describeDiscoveryError(result) {
  if (result.status === 401 || result.status === 403) {
    return "Could not read this site. Make sure you are signed in to it in this browser.";
  }
  if (result.status === 404) {
    return "Could not find the Site Pages list. It may be named differently on this tenant.";
  }
  if (result.reason === "not-json") {
    return "Got a sign-in page instead of data. Open the site and sign in, then try again.";
  }
  return `Discovery failed${result.status ? ` (status ${result.status})` : ""}. Try again.`;
}

// ---- Bespoke prompt generator ----------------------------------------------
// A third control on the options page not driven by the schema loop: it
// builds a whole-vault LLM prompt from the clip log (lib/prompt-templates.js
// + lib/clip-log.js). Used to live at src/prompt/index.html as a standalone
// page opened via chrome.tabs.create; now renders inline here so it keeps the
// left nav and there's nothing to navigate back from. Bespoke because it
// reads the clip log and assembles a prompt string, neither of which is a
// schema-backed setting -- see docs/llm-vault-design.md.

// Friendly labels for the content types actually recorded in the clip log
// (clip.type is the capture mode -- see popup.js's own CONTENT_TYPE_LABELS
// for the sibling list used in the popup's preview). Any type not in this
// map (a future site adapter, for example) still gets a readable label via
// promptTypeLabel's capitalize fallback below.
const PROMPT_TYPE_LABELS = {
  article: "Article",
  sharepoint: "SharePoint",
  confluence: "Confluence",
  tweet: "Tweet",
  full: "Page",
  selection: "Selection"
};

function promptTypeLabel(type) {
  return PROMPT_TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

export function renderPromptGeneratorControl(panel) {
  if (!panel) {
    return;
  }

  const heading = document.createElement("h3");
  heading.className = "group-heading";
  heading.textContent = "Prompt generator";
  panel.append(heading);

  const intro = document.createElement("p");
  intro.className = "help-text";
  intro.textContent = "Build a prompt to analyze your clipped vault with an LLM.";
  panel.append(intro);

  const generator = document.createElement("div");
  generator.className = "prompt-generator";

  const taskField = document.createElement("div");
  taskField.className = "field";
  const taskLabel = document.createElement("label");
  taskLabel.setAttribute("for", "prompt-task");
  taskLabel.textContent = "What should the LLM do";
  const taskSelect = document.createElement("select");
  taskSelect.id = "prompt-task";
  taskSelect.setAttribute("aria-describedby", "prompt-task-description");
  for (const preset of TASK_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    taskSelect.append(option);
  }
  const taskDescription = document.createElement("p");
  taskDescription.className = "help-text";
  taskDescription.id = "prompt-task-description";
  taskField.append(taskLabel, taskSelect, taskDescription);

  const filtersRow = document.createElement("div");
  filtersRow.className = "prompt-filters-row";

  const typeField = document.createElement("div");
  typeField.className = "field";
  const typeLabel = document.createElement("label");
  typeLabel.setAttribute("for", "prompt-type-filter");
  typeLabel.textContent = "Content type";
  const typeSelect = document.createElement("select");
  typeSelect.id = "prompt-type-filter";
  const allTypesOption = document.createElement("option");
  allTypesOption.value = "";
  allTypesOption.textContent = "All types";
  typeSelect.append(allTypesOption);
  typeField.append(typeLabel, typeSelect);

  const sinceField = document.createElement("div");
  sinceField.className = "field";
  const sinceLabel = document.createElement("label");
  sinceLabel.setAttribute("for", "prompt-since-filter");
  sinceLabel.textContent = "Since";
  const sinceInput = document.createElement("input");
  sinceInput.type = "date";
  sinceInput.id = "prompt-since-filter";
  sinceField.append(sinceLabel, sinceInput);

  const limitField = document.createElement("div");
  limitField.className = "field";
  const limitLabel = document.createElement("label");
  limitLabel.setAttribute("for", "prompt-limit-filter");
  limitLabel.textContent = "Max items";
  const limitInput = document.createElement("input");
  limitInput.type = "number";
  limitInput.id = "prompt-limit-filter";
  limitInput.min = "1";
  limitInput.step = "1";
  limitInput.placeholder = "No limit";
  limitField.append(limitLabel, limitInput);

  filtersRow.append(typeField, sinceField, limitField);

  const buttons = document.createElement("div");
  buttons.className = "prompt-buttons";
  const generateButton = document.createElement("button");
  generateButton.type = "button";
  generateButton.textContent = "Generate";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.disabled = true;
  buttons.append(generateButton, copyButton);

  const summary = document.createElement("p");
  summary.className = "help-text prompt-summary";
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");

  const outputField = document.createElement("div");
  outputField.className = "field";
  const outputLabel = document.createElement("label");
  outputLabel.setAttribute("for", "prompt-output");
  outputLabel.textContent = "Generated prompt";
  const output = document.createElement("textarea");
  output.id = "prompt-output";
  output.rows = 14;
  output.spellcheck = false;
  output.readOnly = true;
  output.setAttribute("aria-label", "Generated prompt");
  outputField.append(outputLabel, output);

  const emptyState = document.createElement("p");
  emptyState.className = "help-text prompt-empty-state";
  emptyState.textContent = "No clips yet. Clip some pages, then generate a prompt.";
  emptyState.hidden = true;

  generator.append(taskField, filtersRow, buttons, summary, outputField, emptyState);
  panel.append(generator);

  let vaultName = null;

  function updateTaskDescription() {
    const preset = TASK_PRESETS.find((item) => item.id === taskSelect.value);
    taskDescription.textContent = preset ? preset.description : "";
  }
  taskSelect.addEventListener("change", updateTaskDescription);
  updateTaskDescription();

  function currentFilters() {
    const filters = {};
    if (typeSelect.value) {
      filters.type = typeSelect.value;
    }
    if (sinceInput.value) {
      filters.since = new Date(sinceInput.value).toISOString();
    }
    const limit = Number(limitInput.value);
    if (limitInput.value && Number.isFinite(limit) && limit > 0) {
      filters.limit = limit;
    }
    return filters;
  }

  async function generate() {
    generateButton.disabled = true;
    copyButton.disabled = true;
    summary.textContent = "Loading clip log…";
    try {
      const records = await listClips(currentFilters());
      const prompt = buildPrompt(taskSelect.value, records, { vaultName });
      output.value = prompt;
      summary.textContent = `${records.length} item${records.length === 1 ? "" : "s"} included`;
      copyButton.disabled = false;
    } catch (error) {
      console.error("Markdown Clipper prompt generation failed:", error);
      summary.textContent = "Could not generate the prompt.";
      output.value = "";
    } finally {
      generateButton.disabled = false;
    }
  }

  generateButton.addEventListener("click", generate);

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      const original = copyButton.textContent;
      copyButton.textContent = "Copied";
      setTimeout(() => {
        copyButton.textContent = original;
      }, 1400);
    } catch (error) {
      console.error("Markdown Clipper could not copy the prompt:", error);
    }
  });

  async function setup() {
    try {
      const handle = await loadHandle();
      vaultName = handle && handle.name ? handle.name : null;
    } catch (error) {
      console.error("Markdown Clipper could not read the vault handle:", error);
    }

    let allClips = [];
    try {
      allClips = await listClips();
    } catch (error) {
      console.error("Markdown Clipper could not read the clip log:", error);
    }

    // Content types come from the clips actually in the vault (rather than a
    // hardcoded list) so the filter always matches what's really there,
    // including modes like "tweet"/"full"/"selection" that the old
    // standalone page's hardcoded article/sharepoint/confluence list missed.
    const types = Array.from(new Set(allClips.map((clip) => clip.type).filter(Boolean))).sort();
    for (const type of types) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = promptTypeLabel(type);
      typeSelect.append(option);
    }

    if (!allClips.length) {
      generateButton.disabled = true;
      copyButton.disabled = true;
      summary.hidden = true;
      outputField.hidden = true;
      emptyState.hidden = false;
      return;
    }

    await generate();
  }

  setup();
}

// ---- Bespoke Advanced-tab controls ----------------------------------------

// Export/import all settings + tag rules as one JSON file. Not schema-driven:
// it reads/writes several storage keys at once via settings-backup.js and
// needs to refill the whole form after an import.
function renderBackupControl(panel, { fillForm }) {
  if (!panel) {
    return;
  }

  const heading = document.createElement("h3");
  heading.className = "group-heading";
  heading.textContent = "Backup & reset";
  panel.append(heading);

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

  const heading = document.createElement("h3");
  heading.className = "group-heading";
  heading.textContent = "Activity";
  panel.append(heading);

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

// ---- Bespoke About block ---------------------------------------------------
// A fourth control appended to a panel outside the schema loop: it just
// surfaces repo links, the live extension version, and license credit at the
// bottom of General. No storage involved, so it never touches fillForm/readForm.
const ABOUT_REPO_URL = "https://github.com/rjs-solutions/markdown-clipper";
const ABOUT_ISSUES_URL = "https://github.com/rjs-solutions/markdown-clipper/issues";
const ABOUT_LICENSE_URL = "https://github.com/rjs-solutions/markdown-clipper/blob/main/LICENSE.md";

const ABOUT_ICONS = {
  github:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
  issue:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
};

function renderAboutControl(panel) {
  if (!panel) {
    return;
  }

  const heading = document.createElement("h3");
  heading.className = "group-heading";
  heading.textContent = "About";
  panel.append(heading);

  const wrapper = document.createElement("div");
  wrapper.className = "field about-field";

  const description = document.createElement("p");
  description.className = "help-text";
  description.textContent =
    "Markdown Clipper captures any web page, including SharePoint, as clean Markdown. The source is public, so you can see how it works and adapt it for your own use.";
  wrapper.append(description);

  const links = document.createElement("div");
  links.className = "about-links";

  const githubLink = document.createElement("a");
  githubLink.className = "about-link";
  githubLink.href = ABOUT_REPO_URL;
  githubLink.target = "_blank";
  githubLink.rel = "noopener noreferrer";
  githubLink.insertAdjacentHTML("afterbegin", ABOUT_ICONS.github);
  const githubText = document.createElement("span");
  githubText.textContent = "GitHub";
  githubLink.append(githubText);

  const issueLink = document.createElement("a");
  issueLink.className = "about-link";
  issueLink.href = ABOUT_ISSUES_URL;
  issueLink.target = "_blank";
  issueLink.rel = "noopener noreferrer";
  issueLink.insertAdjacentHTML("afterbegin", ABOUT_ICONS.issue);
  const issueText = document.createElement("span");
  issueText.textContent = "Report an issue";
  issueLink.append(issueText);

  links.append(githubLink, issueLink);
  wrapper.append(links);

  const version = document.createElement("p");
  version.className = "about-version";
  let versionNumber = "dev";
  try {
    versionNumber = chrome.runtime.getManifest().version || "dev";
  } catch {
    // chrome.runtime isn't available outside the extension context; keep "dev".
  }
  const versionLink = document.createElement("a");
  versionLink.href = ABOUT_REPO_URL;
  versionLink.target = "_blank";
  versionLink.rel = "noopener noreferrer";
  versionLink.title = "View Markdown Clipper on GitHub";
  versionLink.textContent = `Version ${versionNumber}`;
  version.append(versionLink);
  wrapper.append(version);

  const credit = document.createElement("p");
  credit.className = "about-credit";
  const licenseLink = document.createElement("a");
  licenseLink.href = ABOUT_LICENSE_URL;
  licenseLink.target = "_blank";
  licenseLink.rel = "noopener noreferrer";
  licenseLink.textContent = "PolyForm Noncommercial 1.0.0";
  credit.append(licenseLink, document.createTextNode(" · © 2026 RJS Solutions"));
  wrapper.append(credit);

  panel.append(wrapper);
}

async function initialize() {
  const form = document.getElementById("options-form");
  const statusElement = document.getElementById("status");
  const saveButton = document.getElementById("save");
  const navElement = document.getElementById("settings-nav");
  const panelsElement = document.getElementById("panels");

  const { fillForm, readForm, controls } = createOptionsForm(SETTINGS_SCHEMA, {
    navElement,
    panelsElement,
    onThemeChange: applyTheme
  });

  const requestedSection = new URLSearchParams(location.search).get("section");
  const requestedNavItem = requestedSection
    ? Array.from(navElement.querySelectorAll(".nav-item")).find((item) => item.dataset.section === requestedSection)
    : null;
  if (requestedNavItem) {
    requestedNavItem.click();
  }

  // Baseline is the last-saved (or last-loaded) form snapshot. Save only
  // shows once the live form diverges from it, and hides again if the user
  // edits their way back to it. Re-synced after every programmatic fillForm
  // (initial load, reset, import) so those don't count as unsaved changes.
  let baseline = "";

  function syncBaseline() {
    baseline = JSON.stringify(readForm());
    saveButton.hidden = true;
  }

  function refreshDirty() {
    saveButton.hidden = JSON.stringify(readForm()) === baseline;
  }

  function fillFormAndSync(settings) {
    fillForm(settings);
    syncBaseline();
  }

  const generalPanel = panelsElement.querySelector('[data-section="general"]');
  renderAboutControl(generalPanel);

  const knowledgeBasePanel = panelsElement.querySelector('[data-section="knowledgeBase"]');
  const vaultEnabledControl = controls.get("vaultEnabled");

  const vaultControl = renderVaultControl(knowledgeBasePanel);

  // The vault folder picker is a nested sub-control of vaultEnabled (the
  // preset writes into it, the index lives there), so move it right after
  // the toggle and ahead of knowledgeBasePreset, which schema order alone
  // can't do since this is a bespoke control appended after the fields.
  const presetField = knowledgeBasePanel.querySelector('[data-key="knowledgeBasePreset"]');
  if (presetField) {
    knowledgeBasePanel.insertBefore(vaultControl.element, presetField);
  }

  wireVaultToggle(vaultEnabledControl, vaultControl);

  renderTagRulesControl(knowledgeBasePanel);
  renderPromptGeneratorControl(knowledgeBasePanel);

  const collectionsPanel = panelsElement.querySelector('[data-section="collections"]');
  renderCollectionsControl(collectionsPanel);

  const advancedPanel = panelsElement.querySelector('[data-section="advanced"]');
  renderBackupControl(advancedPanel, { fillForm: fillFormAndSync });
  renderResetControl(advancedPanel, { fillForm: fillFormAndSync, statusElement });
  renderActivityControl(advancedPanel);

  fillFormAndSync(await loadSettings());
  vaultControl.setVisible(vaultEnabledControl.checked);

  form.addEventListener("input", refreshDirty);
  form.addEventListener("change", refreshDirty);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const settings = readForm();
    await saveSettings(settings);
    baseline = JSON.stringify(settings);
    saveButton.textContent = "Saved";
    flash(statusElement, "Saved");
    setTimeout(() => {
      saveButton.textContent = "Save";
      // Don't force-hide: the user may have edited again during the "Saved"
      // window, in which case the button needs to stay visible.
      refreshDirty();
    }, 1000);
  });
}

function flash(statusElement, message) {
  statusElement.textContent = message;
  setTimeout(() => {
    statusElement.textContent = "";
  }, 1600);
}

document.addEventListener("DOMContentLoaded", initialize);
