// Unit tests for the schema-driven options page renderer
// (extension/src/options/options.js). Verifies nav/panel generation,
// fillForm/readForm round-tripping, dependsOn enable/disable behavior, and
// forward-compat preservation of settings keys the schema doesn't know about.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { SETTINGS_SCHEMA, defaultsFromSchema } from "../extension/src/lib/settings-schema.js";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://example.com/options.html"
  });
  globalThis.window = dom.window;
  globalThis.Event = dom.window.Event;
  globalThis.document = dom.window.document;
  return dom;
}

async function loadModule() {
  installDom();
  return import(`../extension/src/options/options.js?case=${Math.random()}`);
}

function makeContainers() {
  const navElement = document.createElement("nav");
  const panelsElement = document.createElement("div");
  document.body.append(navElement, panelsElement);
  return { navElement, panelsElement };
}

test("renderSchema builds one nav item and one panel per section", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();

  createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });

  assert.equal(navElement.querySelectorAll(".nav-item").length, SETTINGS_SCHEMA.length);
  assert.equal(panelsElement.querySelectorAll(".panel").length, SETTINGS_SCHEMA.length);
});

test("every settings panel introduces its contents before the first subsection", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();

  createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });

  for (const section of SETTINGS_SCHEMA) {
    const panel = panelsElement.querySelector(`[data-section="${section.id}"]`);
    const description = panel.querySelector(".panel-description");
    assert.equal(description.textContent, section.description);
    assert.equal(description.previousElementSibling.tagName, "H2");
  }
});

test("the theme field renders inside the General panel and is the first nav item", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();

  createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });

  const themeField = panelsElement.querySelector('[data-key="theme"]');
  assert.ok(themeField);
  assert.ok(themeField.closest('[data-section="general"]'));
  assert.equal(navElement.querySelectorAll(".nav-item")[0].dataset.section, "general");
});

test("a segmented field (theme) round-trips through fillForm -> readForm and updates on click", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();

  const { fillForm, readForm, controls } = createOptionsForm(SETTINGS_SCHEMA, {
    navElement,
    panelsElement
  });

  const defaults = defaultsFromSchema(SETTINGS_SCHEMA);
  fillForm(defaults);
  assert.equal(readForm().theme, "system");

  const themeControl = controls.get("theme");
  const darkButton = themeControl.closest(".segmented-field").querySelector('[data-value="dark"]');
  darkButton.click();

  assert.equal(readForm().theme, "dark");
  assert.equal(darkButton.classList.contains("is-active"), true);
  assert.equal(darkButton.getAttribute("aria-checked"), "true");
});

test("the diagram-variant defaultAction field renders inside the General panel", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();

  createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });

  const field = panelsElement.querySelector('[data-key="defaultAction"]');
  assert.ok(field);
  assert.ok(field.classList.contains("behavior-field"));
  assert.ok(field.closest('[data-section="general"]'));

  const behaviorControl = field.querySelector(".behavior-control");
  assert.ok(behaviorControl, "renders the two-column behavior-control wrapper");
  assert.equal(field.querySelectorAll(".behavior-option").length, 3);
  assert.ok(field.querySelector(".behavior-diagram svg"), "renders the browser-window diagram");
});

test("selecting a defaultAction option updates the row highlight, the diagram, and the control value", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();

  const { fillForm, readForm, controls } = createOptionsForm(SETTINGS_SCHEMA, {
    navElement,
    panelsElement
  });

  const defaults = defaultsFromSchema(SETTINGS_SCHEMA);
  fillForm(defaults);
  assert.equal(readForm().defaultAction, "popup");

  const behaviorControl = controls.get("defaultAction").closest(".behavior-field").querySelector(".behavior-control");
  assert.equal(behaviorControl.dataset.value, "popup");

  const sidepanelRow = behaviorControl.querySelector('[data-value="sidepanel"]');
  sidepanelRow.click();

  assert.equal(readForm().defaultAction, "sidepanel");
  assert.equal(sidepanelRow.classList.contains("is-active"), true);
  assert.equal(sidepanelRow.getAttribute("aria-checked"), "true");
  assert.equal(behaviorControl.dataset.value, "sidepanel");
});

test("readForm round-trips fillForm(defaults)", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();
  const { fillForm, readForm } = createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });

  const defaults = defaultsFromSchema(SETTINGS_SCHEMA);
  fillForm(defaults);
  assert.deepEqual(readForm(), defaults);
});

test("a dependsOn field is disabled when its controller is off and enabled when on", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();
  const { fillForm, controls, updateDependents } = createOptionsForm(SETTINGS_SCHEMA, {
    navElement,
    panelsElement
  });

  const defaults = defaultsFromSchema(SETTINGS_SCHEMA);
  fillForm({ ...defaults, scrollBeforeCapture: false });
  updateDependents();

  const maxScrollMs = controls.get("maxScrollMs");
  assert.equal(maxScrollMs.disabled, true);
  assert.equal(maxScrollMs.closest(".field").classList.contains("is-disabled"), true);

  fillForm({ ...defaults, scrollBeforeCapture: true });
  updateDependents();
  assert.equal(maxScrollMs.disabled, false);
  assert.equal(maxScrollMs.closest(".field").classList.contains("is-disabled"), false);
});

test("knowledgeBasePreset is disabled when vaultEnabled is off and enabled when on", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();
  const { fillForm, controls, updateDependents } = createOptionsForm(SETTINGS_SCHEMA, {
    navElement,
    panelsElement
  });

  const defaults = defaultsFromSchema(SETTINGS_SCHEMA);
  fillForm({ ...defaults, vaultEnabled: false });
  updateDependents();

  const knowledgeBasePreset = controls.get("knowledgeBasePreset");
  assert.equal(knowledgeBasePreset.disabled, true);
  assert.equal(knowledgeBasePreset.closest(".field").classList.contains("is-disabled"), true);

  fillForm({ ...defaults, vaultEnabled: true });
  updateDependents();
  assert.equal(knowledgeBasePreset.disabled, false);
  assert.equal(knowledgeBasePreset.closest(".field").classList.contains("is-disabled"), false);
});

test("unknown storage keys survive a fillForm -> readForm round trip", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();
  const { fillForm, readForm } = createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });

  const defaults = defaultsFromSchema(SETTINGS_SCHEMA);
  fillForm({ ...defaults, futureFeatureFlag: true, someLaterSetting: "abc" });

  const result = readForm();
  assert.equal(result.futureFeatureFlag, true);
  assert.equal(result.someLaterSetting, "abc");
});
