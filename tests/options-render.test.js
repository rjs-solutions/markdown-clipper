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

test("renderSchema builds one nav item and one panel per non-header section", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();

  createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });

  const tabSections = SETTINGS_SCHEMA.filter((section) => !section.header);
  assert.equal(navElement.querySelectorAll(".nav-item").length, tabSections.length);
  assert.equal(panelsElement.querySelectorAll(".panel").length, tabSections.length);
});

test("a header-flagged section's fields render into headerElement, not the nav/panels", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();
  const headerElement = document.createElement("div");
  document.body.append(headerElement);

  createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement, headerElement });

  assert.ok(headerElement.querySelector('[data-key="theme"]'));
  assert.equal(panelsElement.querySelector('[data-key="theme"]'), null);
  assert.equal(navElement.querySelector('[data-section="appearance"]'), null);
});

test("a segmented field (theme) round-trips through fillForm -> readForm and updates on click", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();
  const headerElement = document.createElement("div");
  document.body.append(headerElement);

  const { fillForm, readForm, controls } = createOptionsForm(SETTINGS_SCHEMA, {
    navElement,
    panelsElement,
    headerElement
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

test("the full-width segmented defaultAction field renders inside the Clipping panel", async () => {
  const { createOptionsForm } = await loadModule();
  const { navElement, panelsElement } = makeContainers();

  createOptionsForm(SETTINGS_SCHEMA, { navElement, panelsElement });

  const field = panelsElement.querySelector('[data-key="defaultAction"]');
  assert.ok(field);
  assert.ok(field.classList.contains("segmented-field-full"));
  assert.ok(field.closest('[data-section="clipping"]'));
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
