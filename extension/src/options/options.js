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
import {
  collectionLibraryPath,
  loadCollectionLibraryManifest,
  moveCollectionLibraryFolder,
  normalizeLibraryPath,
  reviewRemovedCollectionFile,
  uniqueCollectionLibraryPath,
  writeCollectionLibraryCatalog
} from "../lib/collection-library.js";
import { loadCollectionSchedule, saveCollectionSchedule } from "../lib/collection-schedule.js";
import { loadCollectionHealth, removeCollectionHealth } from "../lib/collection-health.js";
import { slugify } from "../lib/slug.js";
import { listClips } from "../lib/clip-log.js";
import { TASK_PRESETS, buildPrompt, recordsFromCollectionManifest } from "../lib/prompt-templates.js";
import { summarizeActivity } from "../lib/activity-summary.js";

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

const ACTION_ICONS = {
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path></svg>',
  access: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"></circle><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2"></path></svg>',
  forget: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path><path d="m9 11 6 6m0-6-6 6"></path></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  discover: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"></circle><path d="m14.5 14.5 5 5M10 7v6M7 10h6"></path></svg>',
  sync: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"></path><path d="M20 4v6h-6"></path></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.34-5.66"></path><path d="M4 4v6h6"></path></svg>',
  generate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"></path><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z"></path></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1"></path></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4"></path><path d="M4 17v3h16v-3"></path></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4"></path><path d="M4 17v3h16v-3"></path></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h6M5 5v14h14v-6"></path><path d="M13 5h6v6M19 5l-9 9"></path></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v12H4Z"></path><path d="M3 4h18v4H3ZM9 13h6"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>'
};

function configureLabeledButton(button, label, icon, title = label) {
  button.classList.add("button-with-icon");
  button.title = title;
  button.replaceChildren();
  button.insertAdjacentHTML("afterbegin", icon);
  const labelElement = document.createElement("span");
  labelElement.className = "button-label";
  labelElement.textContent = label;
  button.append(labelElement);
}

function setLabeledButtonText(button, text) {
  const label = button.querySelector(".button-label");
  if (label) label.textContent = text;
  else button.textContent = text;
}

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

      if (section.description) {
        const description = document.createElement("p");
        description.className = "panel-description";
        description.textContent = section.description;
        panel.append(description);
      }

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
  configureLabeledButton(chooseButton, "Choose vault folder", ACTION_ICONS.folder, "Choose where individual Markdown clips are saved");

  const regrantButton = document.createElement("button");
  regrantButton.type = "button";
  configureLabeledButton(regrantButton, "Restore folder access", ACTION_ICONS.access, "Allow Markdown Clipper to write to the selected vault folder again");
  regrantButton.hidden = true;

  const forgetButton = document.createElement("button");
  forgetButton.type = "button";
  configureLabeledButton(forgetButton, "Forget vault folder", ACTION_ICONS.forget, "Stop using this folder; existing files are not deleted");
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
  configureLabeledButton(addButton, "Add tag rule", ACTION_ICONS.add, "Add a rule that suggests tags when a page matches");
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
    configureLabeledButton(removeButton, "Remove", ACTION_ICONS.trash, "Remove this tag rule");

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

function configureCollectionIcon(button, label, paths, className = "") {
  button.className = `collection-icon-action ${className}`.trim();
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
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
  help.textContent = "Save a site once, keep its page list current, and reuse it for future Markdown exports or local syncs.";
  wrapper.append(help);

  const toolbar = document.createElement("div");
  toolbar.className = "sites-toolbar";
  const importListButton = document.createElement("button");
  importListButton.type = "button";
  configureLabeledButton(importListButton, "Import URL list…", ACTION_ICONS.upload, "Create a collection from URLs in a TXT, CSV, or XLSX file");
  const exportAllButton = document.createElement("button");
  exportAllButton.type = "button";
  configureLabeledButton(exportAllButton, "Export all URLs", ACTION_ICONS.download, "Download every saved collection's URL inventory as one CSV file");
  const refreshAllButton = document.createElement("button");
  refreshAllButton.type = "button";
  configureCollectionIcon(
    refreshAllButton,
    "Refresh all saved collection inventories",
    '<path d="M20 12a8 8 0 1 1-2.34-5.66"></path><path d="M20 4v6h-6"></path>'
  );
  refreshAllButton.disabled = true;
  const utilityActions = document.createElement("div");
  utilityActions.className = "collection-utility-actions";
  utilityActions.append(exportAllButton, refreshAllButton);
  toolbar.append(importListButton, utilityActions);

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
  for (const [value, label] of [["auto", "Detect automatically"], ["website", "Website"], ["confluence", "Confluence"], ["sharepoint", "SharePoint"]]) {
    typeSelect.append(new Option(label, value));
  }

  const sourceSelect = document.createElement("select");
  sourceSelect.setAttribute("aria-label", "Discovery method");
  for (const [value, label] of [["auto", "Discover automatically"], ["sitemap", "Sitemap"], ["llms", "llms.txt"], ["crawl", "Same-site crawl"]]) {
    sourceSelect.append(new Option(label, value));
  }

  const addButton = document.createElement("button");
  addButton.type = "button";
  configureLabeledButton(addButton, "Add & discover pages", ACTION_ICONS.discover, "Save this collection and find its pages now");
  addButton.disabled = true;

  const updateAddButtonState = () => {
    const isReady = Boolean(urlInput.value.trim());
    addButton.disabled = !isReady;
    addButton.classList.toggle("is-primary-action", isReady);
  };
  urlInput.addEventListener("input", updateAddButtonState);

  const addControls = document.createElement("div");
  addControls.className = "sites-add-controls";
  addControls.append(typeSelect, sourceSelect, addButton);
  addRow.append(urlInput, addControls);
  wrapper.append(addRow);

  const status = document.createElement("p");
  status.className = "sites-status";
  wrapper.append(status);

  const libraryHeading = document.createElement("h3");
  libraryHeading.className = "group-heading collection-library-heading";
  libraryHeading.textContent = "Local Collections Library";
  const libraryDescription = document.createElement("p");
  libraryDescription.className = "help-text";
  libraryDescription.textContent = "Choose one local root folder. Each saved collection syncs to its own subfolder as ordinary Markdown files for LLMs, search, backup, or sharing.";
  wrapper.append(libraryHeading, libraryDescription);

  const libraryField = document.createElement("div");
  libraryField.className = "collection-library-field";
  const libraryStatus = document.createElement("p");
  libraryStatus.className = "sites-status";
  const libraryButtons = document.createElement("div");
  libraryButtons.className = "collection-library-buttons";
  const chooseLibraryButton = document.createElement("button");
  chooseLibraryButton.type = "button";
  configureLabeledButton(chooseLibraryButton, "Choose library folder", ACTION_ICONS.folder, "Choose the root folder that will contain all locally synced collections");
  const regrantLibraryButton = document.createElement("button");
  regrantLibraryButton.type = "button";
  configureLabeledButton(regrantLibraryButton, "Restore folder access", ACTION_ICONS.access, "Allow Markdown Clipper to write to the selected Collections Library again");
  const forgetLibraryButton = document.createElement("button");
  forgetLibraryButton.type = "button";
  configureLabeledButton(forgetLibraryButton, "Forget library folder", ACTION_ICONS.forget, "Stop using this library folder; existing files are not deleted");
  const syncAllLibraryButton = document.createElement("button");
  syncAllLibraryButton.type = "button";
  configureLabeledButton(syncAllLibraryButton, "Sync all collections", ACTION_ICONS.sync, "Update every saved collection in the Local Collections Library");
  libraryButtons.append(chooseLibraryButton, regrantLibraryButton, forgetLibraryButton, syncAllLibraryButton);
  libraryField.append(libraryStatus, libraryButtons);
  const scheduleRow = document.createElement("div");
  scheduleRow.className = "collection-schedule-row";
  const scheduleLabel = document.createElement("span");
  scheduleLabel.id = "collection-sync-reminder-label";
  scheduleLabel.textContent = "Sync due reminder";
  const scheduleOptions = document.createElement("div");
  scheduleOptions.className = "segmented collection-schedule-options";
  scheduleOptions.setAttribute("role", "radiogroup");
  scheduleOptions.setAttribute("aria-labelledby", scheduleLabel.id);
  const scheduleButtons = new Map();
  for (const [value, label] of [["off", "Off"], ["weekly", "Weekly"], ["monthly", "Monthly"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segmented-option";
    button.dataset.value = value;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.textContent = label;
    scheduleButtons.set(value, button);
    scheduleOptions.append(button);
  }
  const scheduleStatus = document.createElement("span");
  scheduleStatus.className = "help-text collection-schedule-status";
  scheduleRow.append(scheduleLabel, scheduleOptions, scheduleStatus);
  libraryField.append(scheduleRow);
  wrapper.append(libraryField);

  const savedHeading = document.createElement("h3");
  savedHeading.className = "group-heading collection-saved-heading";
  savedHeading.textContent = "Saved collections";
  const savedDescription = document.createElement("p");
  savedDescription.className = "help-text";
  savedDescription.textContent = "Refresh, sync, move, export, or remove collections you have already saved.";
  wrapper.append(savedHeading, savedDescription, toolbar, list);

  panel.append(wrapper);

  let sites = [];
  let libraryHandle = null;
  let libraryPermissionGranted = false;
  const requestedCollectionId = new URLSearchParams(location.search).get("collection") || "";
  const rowControllers = new Map();

  function showLibraryFolderStatus(handle, permission) {
    const folderName = document.createElement("strong");
    folderName.className = "library-folder-name";
    folderName.textContent = handle.name || "(unnamed folder)";
    const access = permission === "granted" ? "access granted" : "access needed";
    libraryStatus.replaceChildren("Library folder: ", folderName, ` (${access})`);
    libraryStatus.classList.add("has-library");
  }

  async function refreshLibraryStatus() {
    try {
      libraryHandle = await loadCollectionLibraryHandle();
      if (!libraryHandle) {
        libraryPermissionGranted = false;
        libraryStatus.classList.remove("has-library");
        libraryStatus.textContent = "No library folder chosen. Snapshot downloads still work normally.";
        regrantLibraryButton.hidden = true;
        forgetLibraryButton.hidden = true;
        return;
      }
      const permission = await ensurePermission(libraryHandle);
      libraryPermissionGranted = permission === "granted";
      showLibraryFolderStatus(libraryHandle, permission);
      regrantLibraryButton.hidden = permission === "granted";
      forgetLibraryButton.hidden = false;
      for (const controller of rowControllers.values()) controller.reviewHealth();
    } catch (error) {
      libraryStatus.classList.remove("has-library");
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

  syncAllLibraryButton.addEventListener("click", async () => {
    if (!sites.length) {
      libraryStatus.textContent = "Add at least one collection before syncing.";
      return;
    }
    if (!libraryHandle || !libraryPermissionGranted) {
      libraryStatus.textContent = "Choose or re-grant the Local Collections Library folder first.";
      return;
    }
    const urls = sites.flatMap((site) => site.type === "custom" ? site.urls || [] : [site.webUrl || site.sourceUrl || site.url]);
    const origins = Array.from(new Set(urls.flatMap((value) => {
      try { const parsed = new URL(value); return [`${parsed.protocol}//${parsed.host}/*`]; } catch { return []; }
    })));
    let granted = origins.length === 0;
    try {
      granted = origins.length ? await chrome.permissions.request({ origins }) : true;
    } catch {
      granted = false;
    }
    if (!granted) {
      libraryStatus.textContent = "Site access is needed before all collections can be synced.";
      return;
    }
    const queue = sites.map((site) => site.id).join(",");
    openCollectionWindow(`destination=library&syncQueue=${encodeURIComponent(queue)}`);
  });

  refreshLibraryStatus();
  const selectSchedule = (frequency) => {
    for (const [value, button] of scheduleButtons) {
      const active = value === frequency;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
    }
  };
  loadCollectionSchedule().then((schedule) => {
    selectSchedule(schedule.frequency);
    scheduleStatus.textContent = schedule.lastCompletedAt ? `Last full sync: ${formatDateTime(schedule.lastCompletedAt)}` : "Shows a SYNC badge when a manual sync is due.";
  });
  for (const [frequency, button] of scheduleButtons) {
    button.addEventListener("click", async () => {
      selectSchedule(frequency);
      await saveCollectionSchedule(frequency);
      scheduleStatus.textContent = frequency === "off" ? "Reminder disabled." : "Shows a SYNC badge when a manual sync is due.";
    });
  }

  function persist() {
    return saveSites(sites).catch((error) => {
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

    const info = document.createElement("button");
    info.type = "button";
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
    configureCollectionIcon(
      discoverButton,
      `${site.type === "custom" ? "Review URLs in" : "Refresh"} ${site.name}`,
      '<path d="M20 12a8 8 0 1 1-2.34-5.66"></path><path d="M20 4v6h-6"></path>'
    );

    const inventoryExport = document.createElement("details");
    inventoryExport.className = "collection-action-menu";
    const inventorySummary = document.createElement("summary");
    inventorySummary.className = "collection-icon-action";
    inventorySummary.title = `Export or sync ${site.name}`;
    inventorySummary.setAttribute("aria-label", `Export or sync ${site.name}`);
    inventorySummary.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4"></path><path d="M4 17v3h16v-3"></path></svg>';
    const inventoryMenu = document.createElement("div");
    inventoryMenu.className = "collection-action-menu-popover";
    const markdownButton = document.createElement("button");
    markdownButton.type = "button";
    markdownButton.textContent = "Download Markdown snapshot";
    const syncMenuButton = document.createElement("button");
    syncMenuButton.type = "button";
    syncMenuButton.textContent = "Sync Markdown files to library";
    const csvButton = document.createElement("button");
    csvButton.type = "button";
    csvButton.textContent = "CSV spreadsheet";
    const txtButton = document.createElement("button");
    txtButton.type = "button";
    txtButton.textContent = "TXT URL list";
    inventoryMenu.append(syncMenuButton, markdownButton, csvButton, txtButton);
    inventoryExport.append(inventorySummary, inventoryMenu);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    configureCollectionIcon(removeButton, `Remove ${site.name}`, '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path>', "is-danger");

    actions.append(discoverButton, inventoryExport, removeButton);
    top.append(toggleButton, info, actions);
    row.append(top);

    const details = document.createElement("div");
    details.className = "site-details";
    details.hidden = site.id === requestedCollectionId ? false : Boolean(site.collapsed);
    toggleButton.classList.toggle("is-collapsed", details.hidden);
    toggleButton.setAttribute("aria-expanded", String(!details.hidden));
    toggleButton.setAttribute("aria-label", `${details.hidden ? "Expand" : "Collapse"} ${site.name}`);
    toggleButton.title = `${details.hidden ? "Expand" : "Collapse"} ${site.name}`;
    info.setAttribute("aria-expanded", String(!details.hidden));
    info.setAttribute("aria-label", `${details.hidden ? "Expand" : "Collapse"} ${site.name}`);
    info.title = `${details.hidden ? "Expand" : "Collapse"} collection details`;

    const discoverStatus = document.createElement("p");
    discoverStatus.className = "site-discover-status";
    details.append(discoverStatus);

    const folderRow = document.createElement("div");
    folderRow.className = "collection-folder-row";
    const folderLabel = document.createElement("label");
    folderLabel.textContent = "Library subfolder";
    const folderInput = document.createElement("input");
    folderInput.type = "text";
    folderInput.value = collectionLibraryPath(site);
    folderInput.setAttribute("aria-label", `Local library path for ${site.name}`);
    const folderActions = document.createElement("div");
    folderActions.className = "collection-folder-actions";
    const resetFolderButton = document.createElement("button");
    resetFolderButton.type = "button";
    configureLabeledButton(resetFolderButton, "Default", ACTION_ICONS.reset, "Use the default type and collection-name subfolder");
    const moveFolderButton = document.createElement("button");
    moveFolderButton.type = "button";
    configureLabeledButton(moveFolderButton, "Apply change…", ACTION_ICONS.folder, "Edit the subfolder path first, then apply it to future syncs or move existing files");
    moveFolderButton.disabled = true;
    folderActions.append(resetFolderButton, moveFolderButton);
    folderRow.append(folderLabel, folderInput, folderActions);
    const folderHelp = document.createElement("p");
    folderHelp.className = "help-text collection-folder-help";
    folderHelp.textContent = "Edit the path to change where this collection syncs. Existing files can be moved after its first local sync.";

    const moveChoice = document.createElement("div");
    moveChoice.className = "collection-move-choice";
    moveChoice.hidden = true;
    const moveSummary = document.createElement("p");
    const moveChoiceActions = document.createElement("div");
    moveChoiceActions.className = "collection-move-actions";
    const moveExistingButton = document.createElement("button");
    moveExistingButton.type = "button";
    configureLabeledButton(moveExistingButton, "Move existing files", ACTION_ICONS.folder, "Copy and verify the collection in its new folder, then remove the old folder");
    moveExistingButton.classList.add("is-primary-action");
    const futureFolderButton = document.createElement("button");
    futureFolderButton.type = "button";
    futureFolderButton.textContent = "Future syncs only";
    futureFolderButton.title = "Leave existing files where they are and use the new folder on the next sync";
    const cancelMoveButton = document.createElement("button");
    cancelMoveButton.type = "button";
    cancelMoveButton.textContent = "Cancel";
    moveChoiceActions.append(moveExistingButton, futureFolderButton, cancelMoveButton);
    moveChoice.append(moveSummary, moveChoiceActions);
    details.append(folderRow, folderHelp, moveChoice);

    const discoverResults = document.createElement("ul");
    discoverResults.className = "site-discover-results";
    details.append(discoverResults);
    const healthReview = document.createElement("div");
    healthReview.className = "collection-health-review";
    healthReview.hidden = true;
    details.append(healthReview);
    row.append(details);

    list.append(row);

    if (site.id === requestedCollectionId) {
      row.classList.add("is-requested");
      requestAnimationFrame(() => row.scrollIntoView({ block: "center", behavior: "smooth" }));
    }

    const toggleDetails = () => {
      details.hidden = !details.hidden;
      site.collapsed = details.hidden;
      toggleButton.classList.toggle("is-collapsed", details.hidden);
      toggleButton.setAttribute("aria-expanded", String(!details.hidden));
      toggleButton.setAttribute("aria-label", `${details.hidden ? "Expand" : "Collapse"} ${site.name}`);
      toggleButton.title = `${details.hidden ? "Expand" : "Collapse"} ${site.name}`;
      info.setAttribute("aria-expanded", String(!details.hidden));
      info.setAttribute("aria-label", `${details.hidden ? "Expand" : "Collapse"} ${site.name}`);
      info.title = `${details.hidden ? "Expand" : "Collapse"} collection details`;
      persist();
    };
    toggleButton.addEventListener("click", toggleDetails);
    info.addEventListener("click", toggleDetails);

    removeButton.addEventListener("click", () => {
      const removedName = site.name;
      sites = sites.filter((existing) => existing !== site);
      rowControllers.delete(site.id);
      row.remove();
      persist();
      removeSiteInventory(site.id).catch((error) => {
        console.error("Markdown Clipper collection inventory removal failed:", error);
      });
      removeCollectionHealth(site.id).catch((error) => console.error("Markdown Clipper collection health removal failed:", error));
      refreshAllButton.disabled = sites.length === 0;
      status.textContent = `Removed ${removedName} from saved collections. Any local library files were left in place.`;
    });

    markdownButton.addEventListener("click", () => {
      inventoryExport.open = false;
      openCollectionWindow(`collection=${encodeURIComponent(site.id)}`);
    });
    syncMenuButton.addEventListener("click", () => {
      inventoryExport.open = false;
      if (!libraryHandle) {
        discoverStatus.textContent = "Choose a Local Collections Library folder above before syncing.";
        details.hidden = false;
        return;
      }
      openCollectionWindow(`collection=${encodeURIComponent(site.id)}&destination=library`);
    });
    const defaultFolderPath = () => collectionLibraryPath({ ...site, libraryPath: "" });
    const proposedFolderPath = () => normalizeLibraryPath(folderInput.value) || defaultFolderPath();
    const folderPathUsedByAnotherCollection = (candidate) => sites.some((item) => (
      item.id !== site.id && collectionLibraryPath(item).toLowerCase() === candidate.toLowerCase()
    ));
    const updateMoveButton = () => {
      moveChoice.hidden = true;
      const ready = proposedFolderPath().toLowerCase() !== collectionLibraryPath(site).toLowerCase();
      moveFolderButton.disabled = !ready;
      moveFolderButton.classList.toggle("is-primary-action", ready);
      folderHelp.textContent = ready
        ? "Apply this path to future syncs, or move existing files if this collection was already synced."
        : "Edit the path to change where this collection syncs. Existing files can be moved after its first local sync.";
    };
    const applyFolderPath = async (candidate) => {
      site.libraryPath = candidate === defaultFolderPath() ? "" : candidate;
      folderInput.value = collectionLibraryPath(site);
      await saveSites(sites);
      moveFolderButton.disabled = true;
      moveFolderButton.classList.remove("is-primary-action");
      moveChoice.hidden = true;
      folderHelp.textContent = "Edit the path to change where this collection syncs. Existing files can be moved after its first local sync.";
      if (libraryHandle && libraryPermissionGranted) {
        try { await writeCollectionLibraryCatalog(libraryHandle, sites); } catch (error) {
          console.error("Markdown Clipper library catalog refresh failed:", error);
        }
      }
    };

    folderInput.addEventListener("input", updateMoveButton);
    folderInput.addEventListener("change", () => {
      folderInput.value = proposedFolderPath();
      updateMoveButton();
    });
    moveFolderButton.addEventListener("click", async () => {
      const candidate = proposedFolderPath();
      const current = collectionLibraryPath(site);
      if (folderPathUsedByAnotherCollection(candidate)) {
        discoverStatus.textContent = "Another collection already uses that local folder.";
        folderInput.value = current;
        updateMoveButton();
        return;
      }
      moveSummary.textContent = `Change ${current} to ${candidate}.`;
      moveExistingButton.disabled = !libraryHandle || !libraryPermissionGranted;
      if (!libraryHandle || !libraryPermissionGranted) {
        moveSummary.textContent += " Library access is needed to move existing files; you can still use the new path for future syncs.";
        moveChoice.hidden = false;
        return;
      }
      try {
        const manifest = await loadCollectionLibraryManifest(libraryHandle, site);
        if (!manifest) {
          await applyFolderPath(candidate);
          discoverStatus.textContent = `Future syncs will use ${candidate}. No existing synced folder needed to be moved.`;
          return;
        }
        moveChoice.hidden = false;
      } catch (error) {
        discoverStatus.textContent = `Could not inspect the current folder: ${error && error.message ? error.message : error}`;
      }
    });
    moveExistingButton.addEventListener("click", async () => {
      const candidate = proposedFolderPath();
      moveExistingButton.disabled = true;
      futureFolderButton.disabled = true;
      cancelMoveButton.disabled = true;
      discoverStatus.textContent = `Moving ${site.name}…`;
      try {
        const result = await moveCollectionLibraryFolder(libraryHandle, site, candidate);
        await applyFolderPath(candidate);
        discoverStatus.textContent = `Moved ${result.fileCount} files from ${result.from} to ${result.to}.`;
      } catch (error) {
        discoverStatus.textContent = `Could not move the collection: ${error && error.message ? error.message : error}`;
        moveChoice.hidden = false;
      } finally {
        futureFolderButton.disabled = false;
        cancelMoveButton.disabled = false;
        moveExistingButton.disabled = !libraryHandle || !libraryPermissionGranted;
      }
    });
    futureFolderButton.addEventListener("click", async () => {
      const previous = collectionLibraryPath(site);
      const candidate = proposedFolderPath();
      try {
        await applyFolderPath(candidate);
        discoverStatus.textContent = `Future syncs will use ${candidate}. Existing files remain in ${previous}.`;
      } catch (error) {
        discoverStatus.textContent = `Could not update the collection folder: ${error && error.message ? error.message : error}`;
      }
    });
    cancelMoveButton.addEventListener("click", () => {
      folderInput.value = collectionLibraryPath(site);
      updateMoveButton();
    });
    resetFolderButton.addEventListener("click", () => {
      folderInput.value = defaultFolderPath();
      updateMoveButton();
      folderInput.focus();
    });
    csvButton.addEventListener("click", async () => {
      const inventory = await loadSiteInventory(site.id);
      await downloadText(collectionsToCsv([site], { [site.id]: inventory }), `${slugify(site.name, { fallback: "collection" })}-urls.csv`, { type: "text/csv;charset=utf-8" });
      inventoryExport.open = false;
    });
    txtButton.addEventListener("click", async () => {
      const inventory = await loadSiteInventory(site.id);
      const urls = [...new Set([...(inventory.pages || []).map((page) => page.url), ...(site.urls || [])].filter(Boolean))];
      await downloadText(`${urls.join("\n")}\n`, `${slugify(site.name, { fallback: "collection" })}-urls.txt`, { type: "text/plain;charset=utf-8" });
      inventoryExport.open = false;
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
      toggleButton.title = `Collapse ${site.name}`;
      info.setAttribute("aria-expanded", "true");
      info.setAttribute("aria-label", `Collapse ${site.name}`);
      info.title = "Collapse collection details";

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
            ? "No sitemap or llms.txt was found. Open Capture Collection to run a same-site crawl."
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

    async function reviewHealth() {
      healthReview.replaceChildren();
      const health = await loadCollectionHealth(site.id);
      const failures = (health.pages || []).filter((page) => page.status === "error");
      let removedFiles = [];
      if (libraryHandle && libraryPermissionGranted) {
        const manifest = await loadCollectionLibraryManifest(libraryHandle, site);
        removedFiles = manifest?.removedFromPreviousSync || [];
      }
      if (!health.checkedAt && !removedFiles.length) {
        healthReview.hidden = true;
        return;
      }
      healthReview.hidden = false;
      const heading = document.createElement("div");
      heading.className = "collection-health-heading";
      const okCount = (health.pages || []).filter((page) => page.status === "ok").length;
      heading.textContent = `Page health · ${okCount} passed · ${failures.length + removedFiles.length} need review`;
      healthReview.append(heading);
      const listElement = document.createElement("ul");
      listElement.className = "collection-health-list";
      for (const page of failures) {
        const item = document.createElement("li");
        item.className = "is-error";
        const text = document.createElement("span");
        text.textContent = `${page.url} — ${page.error}`;
        item.append(text);
        const openButton = document.createElement("button");
        openButton.type = "button";
        configureLabeledButton(openButton, "Open page", ACTION_ICONS.open, "Open this failed page to review or fix it");
        openButton.addEventListener("click", () => chrome.tabs.create({ url: page.url }));
        item.append(openButton);
        if (site.type === "custom") {
          const removeUrlButton = document.createElement("button");
          removeUrlButton.type = "button";
          configureLabeledButton(removeUrlButton, "Remove URL", ACTION_ICONS.trash, "Remove this failed URL from the custom collection");
          removeUrlButton.addEventListener("click", () => {
            site.urls = (site.urls || []).filter((url) => url !== page.url);
            persist();
            item.remove();
          });
          item.append(removeUrlButton);
        }
        listElement.append(item);
      }
      for (const path of removedFiles) {
        const item = document.createElement("li");
        item.className = "is-removed";
        const text = document.createElement("span");
        text.textContent = `${path} — no longer present in the latest sync`;
        const archiveButton = document.createElement("button");
        archiveButton.type = "button";
        configureLabeledButton(archiveButton, "Archive file", ACTION_ICONS.archive, "Move this stale local file into the collection's _archive folder");
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        configureLabeledButton(deleteButton, "Delete file", ACTION_ICONS.trash, "Permanently delete this stale local file");
        const review = async (action) => {
          try {
            await reviewRemovedCollectionFile(libraryHandle, site, path, action);
            item.remove();
          } catch (error) {
            discoverStatus.textContent = error && error.message ? error.message : String(error);
          }
        };
        archiveButton.addEventListener("click", () => review("archive"));
        deleteButton.addEventListener("click", () => review("delete"));
        item.append(text, archiveButton, deleteButton);
        listElement.append(item);
      }
      healthReview.append(listElement);
    }

    const controller = { refresh, discoverButton, reviewHealth };
    rowControllers.set(site.id, controller);
    Promise.resolve(initialInventory || loadSiteInventory(site.id)).then((inventory) => {
      if (inventory.lastRefreshedAt) {
        discoverStatus.textContent = `Last checked ${formatDateTime(inventory.lastRefreshedAt)} · ${inventory.pages.length} page${inventory.pages.length === 1 ? "" : "s"}.`;
        renderDiscoveredPages(discoverResults, inventory.pages);
      } else if (site.urls?.length) {
        const pages = site.urls.map(pageFromUrl);
        discoverStatus.textContent = `${pages.length} saved URL${pages.length === 1 ? "" : "s"}.`;
        renderDiscoveredPages(discoverResults, pages);
      }
    }).catch((error) => {
      console.error("Markdown Clipper collection inventory load failed:", error);
    });
    reviewHealth().catch((error) => console.error("Markdown Clipper collection health load failed:", error));

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
    updateAddButtonState();
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

  async function renderSavedRows() {
    list.replaceChildren();
    rowControllers.clear();
    const inventories = await loadSiteInventories(sites.map((site) => site.id));
    for (const site of sites) {
      renderRow(site, inventories[site.id]);
    }
    refreshAllButton.disabled = sites.length === 0;
    exportAllButton.disabled = sites.length === 0;
  }

  loadSites().then(async (loaded) => {
    sites = loaded;
    await renderSavedRows();
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
  intro.textContent = "Build a prompt from your saved clip history for use with an LLM.";
  panel.append(intro);

  const generator = document.createElement("div");
  generator.className = "prompt-generator";

  const scopeField = document.createElement("div");
  scopeField.className = "field";
  const scopeLabel = document.createElement("label");
  scopeLabel.setAttribute("for", "prompt-scope");
  scopeLabel.textContent = "Clip scope";
  const scopeSelect = document.createElement("select");
  scopeSelect.id = "prompt-scope";
  scopeSelect.setAttribute("aria-describedby", "prompt-scope-description");
  const historyScopeOption = document.createElement("option");
  historyScopeOption.value = "history";
  historyScopeOption.textContent = "All saved clips — Clip history across sites";
  scopeSelect.append(historyScopeOption);
  const scopeDescription = document.createElement("p");
  scopeDescription.className = "help-text";
  scopeDescription.id = "prompt-scope-description";
  scopeField.append(scopeLabel, scopeSelect, scopeDescription);

  const taskField = document.createElement("div");
  taskField.className = "field";
  const taskLabel = document.createElement("label");
  taskLabel.setAttribute("for", "prompt-task");
  taskLabel.textContent = "What should the LLM do?";
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
  configureLabeledButton(generateButton, "Generate prompt", ACTION_ICONS.generate, "Build a prompt from the selected clips and task");
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  configureLabeledButton(copyButton, "Copy prompt", ACTION_ICONS.copy, "Copy the generated prompt to the clipboard");
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

  generator.append(scopeField, taskField, filtersRow, buttons, summary, outputField, emptyState);
  panel.append(generator);

  let vaultName = null;
  let collectionLibraryName = null;
  const collectionScopes = new Map();

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

  function updateScopeControls() {
    const collectionScope = collectionScopes.get(scopeSelect.value);
    typeField.hidden = Boolean(collectionScope);
    sinceField.hidden = Boolean(collectionScope);
    scopeDescription.textContent = collectionScope
      ? `Uses the last locally synced Markdown files for ${collectionScope.collection.name}.`
      : "Uses individual clips recorded in clip history; downloaded files may be in different folders.";
  }

  function recordsForCollectionScope(scope) {
    const records = recordsFromCollectionManifest(scope.collection, scope.manifest);
    const limit = Number(limitInput.value);
    return limitInput.value && Number.isFinite(limit) && limit > 0 ? records.slice(0, limit) : records;
  }

  async function generate() {
    generateButton.disabled = true;
    copyButton.disabled = true;
    summary.textContent = "Loading selected clips…";
    try {
      const collectionScope = collectionScopes.get(scopeSelect.value);
      const records = collectionScope ? recordsForCollectionScope(collectionScope) : await listClips(currentFilters());
      const promptOptions = collectionScope
        ? {
            sourceLabel: `Saved collection — ${collectionScope.collection.name}`,
            folderReference: `${collectionLibraryName}/${collectionScope.manifest.folder}`,
            folderNote: "The first segment is the selected Collections Library folder name; Chrome does not expose its full operating-system path."
          }
        : {
            vaultName,
            sourceLabel: "All saved clips — Clip history across sites",
            folderNote: vaultName
              ? "Chrome exposes only the selected clip-folder name. Clip-history entries saved with Download may be elsewhere."
              : "No common clip folder is configured; these records may refer to files in different download locations."
          };
      const prompt = buildPrompt(taskSelect.value, records, promptOptions);
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
  scopeSelect.addEventListener("change", () => {
    updateScopeControls();
    generate();
  });

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      const original = copyButton.querySelector(".button-label")?.textContent || "Copy prompt";
      setLabeledButtonText(copyButton, "Copied");
      setTimeout(() => {
        setLabeledButtonText(copyButton, original);
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

    try {
      const [collections, libraryHandle] = await Promise.all([loadSites(), loadCollectionLibraryHandle()]);
      collectionLibraryName = libraryHandle && libraryHandle.name ? libraryHandle.name : "Collections Library";
      if (collections.length) {
        const group = document.createElement("optgroup");
        group.label = "Saved collections";
        for (const collection of collections) {
          const manifest = libraryHandle ? await loadCollectionLibraryManifest(libraryHandle, collection) : null;
          const option = document.createElement("option");
          option.value = `collection:${collection.id}`;
          option.textContent = manifest && manifest.files?.length
            ? `${collection.name} — ${manifest.files.length} synced page${manifest.files.length === 1 ? "" : "s"}`
            : `${collection.name} — Sync locally to enable`;
          option.disabled = !manifest || !manifest.files?.length;
          if (!option.disabled) collectionScopes.set(option.value, { collection, manifest });
          group.append(option);
        }
        scopeSelect.append(group);
      }
    } catch (error) {
      console.error("Markdown Clipper could not load collection prompt scopes:", error);
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

    if (!allClips.length && collectionScopes.size) {
      scopeSelect.value = collectionScopes.keys().next().value;
    }
    updateScopeControls();

    if (!allClips.length && !collectionScopes.size) {
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
  label.textContent = "Settings backup";
  wrapper.append(label);

  const help = document.createElement("p");
  help.className = "help-text";
  help.textContent = "Download every setting and tag rule as a JSON backup, or restore them from a previous backup.";
  wrapper.append(help);

  const buttons = document.createElement("div");
  buttons.className = "backup-buttons";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  configureLabeledButton(exportButton, "Download backup", ACTION_ICONS.download, "Download all settings and tag rules as JSON");

  const importButton = document.createElement("button");
  importButton.type = "button";
  configureLabeledButton(importButton, "Restore backup", ACTION_ICONS.upload, "Restore settings and tag rules from a Markdown Clipper JSON backup");

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
    statusLine.textContent = "Backup downloaded.";
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
      statusLine.textContent = "Backup restored.";
    } catch (error) {
      statusLine.textContent = `Import failed: ${error.message}`;
    }
  });
}

// Compact aggregate activity summary. It deliberately does not render the
// underlying clip log, which could grow indefinitely.
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
  label.textContent = "Saved content summary";
  wrapper.append(label);

  const description = document.createElement("p");
  description.className = "help-text";
  description.textContent = "Aggregate counts only; this does not display an expanding activity log.";
  const stats = document.createElement("dl");
  stats.className = "activity-stats";
  stats.setAttribute("aria-label", "Saved content activity summary");
  wrapper.append(description, stats);

  panel.append(wrapper);

  Promise.all([
    listClips().catch(() => []),
    loadSites().catch(() => [])
  ])
    .then(([clips, collections]) => {
      const summary = summarizeActivity(clips, collections);
      const items = [
        ["Clips", String(summary.clips)],
        ["Clip source sites", String(summary.sourceSites)],
        ["Saved collections", String(summary.collections)],
        ["Last clipped", summary.lastClipped ? formatDateTime(summary.lastClipped) : "None yet"]
      ];
      for (const [term, value] of items) {
        const item = document.createElement("div");
        const name = document.createElement("dt");
        name.textContent = term;
        const result = document.createElement("dd");
        result.textContent = value;
        item.append(name, result);
        stats.append(item);
      }
    })
    .catch(() => {
      stats.textContent = "Activity summary isn't available.";
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
  label.textContent = "Reset settings";
  wrapper.append(label);

  const help = document.createElement("p");
  help.className = "help-text";
  help.textContent = "Restore configurable settings to their defaults. Saved clips, collections, tag rules, and chosen folders are not deleted.";
  wrapper.append(help);

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  configureLabeledButton(resetButton, "Reset settings", ACTION_ICONS.reset, "Restore configurable settings to defaults without deleting saved data");
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
