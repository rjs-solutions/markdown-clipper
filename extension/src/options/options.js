// Generic, schema-driven options page. All rendering, loading, and saving
// walks extension/src/lib/settings-schema.js -- there is no per-key mapping
// here, so adding a setting only requires adding a field to the schema.

import { DEFAULT_SETTINGS, loadSettings, saveSettings, resetSettings, clampNumber } from "../lib/settings.js";
import { SETTINGS_SCHEMA, schemaFields, findField } from "../lib/settings-schema.js";
import { applyTheme } from "../lib/theme.js";

export function fieldId(key) {
  return `f-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
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

  function renderField(field) {
    const id = fieldId(field.key);
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    wrapper.dataset.key = field.key;

    let control;

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

  schema.forEach((section, index) => {
    if (navElement) {
      const navButton = document.createElement("button");
      navButton.type = "button";
      navButton.className = index === 0 ? "nav-item is-active" : "nav-item";
      navButton.dataset.section = section.id;
      navButton.textContent = section.label;
      navElement.append(navButton);
    }

    if (panelsElement) {
      const panel = document.createElement("section");
      panel.className = "group panel";
      panel.dataset.section = section.id;
      panel.hidden = index !== 0;

      const heading = document.createElement("h2");
      heading.textContent = section.label;
      panel.append(heading);

      for (const field of section.fields) {
        panel.append(renderField(field));
      }
      panelsElement.append(panel);
    }
  });

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

async function initialize() {
  const form = document.getElementById("options-form");
  const statusElement = document.getElementById("status");
  const navElement = document.getElementById("settings-nav");
  const panelsElement = document.getElementById("panels");

  const { fillForm, readForm } = createOptionsForm(SETTINGS_SCHEMA, {
    navElement,
    panelsElement,
    onThemeChange: applyTheme
  });

  fillForm(await loadSettings());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings(readForm());
    flash(statusElement, "Saved");
  });

  document.getElementById("reset").addEventListener("click", async () => {
    fillForm(await resetSettings());
    flash(statusElement, "Reset");
  });
}

function flash(statusElement, message) {
  statusElement.textContent = message;
  setTimeout(() => {
    statusElement.textContent = "";
  }, 1600);
}

document.addEventListener("DOMContentLoaded", initialize);
