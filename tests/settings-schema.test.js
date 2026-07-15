// Anti-drift guarantee: DEFAULT_SETTINGS and the schema must describe exactly
// the same set of keys, and every field descriptor must be internally valid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTINGS_SCHEMA, schemaFields, defaultsFromSchema } from "../extension/src/lib/settings-schema.js";
import { DEFAULT_SETTINGS } from "../extension/src/lib/settings.js";

const VALID_TYPES = new Set(["select", "toggle", "number", "text", "textarea", "segmented"]);

test("every DEFAULT_SETTINGS key appears in exactly one schema field, and vice versa", () => {
  const fields = schemaFields(SETTINGS_SCHEMA);
  const fieldKeys = fields.map((field) => field.key);

  assert.deepEqual(new Set(fieldKeys).size, fieldKeys.length, "no duplicate field keys in schema");

  const defaultKeys = Object.keys(DEFAULT_SETTINGS).sort();
  assert.deepEqual(fieldKeys.slice().sort(), defaultKeys, "schema keys and DEFAULT_SETTINGS keys match 1:1");
});

test("DEFAULT_SETTINGS is derived from the schema's field defaults", () => {
  assert.deepEqual(DEFAULT_SETTINGS, defaultsFromSchema(SETTINGS_SCHEMA));
});

test("every field has a valid type", () => {
  for (const field of schemaFields(SETTINGS_SCHEMA)) {
    assert.ok(VALID_TYPES.has(field.type), `${field.key} has an invalid type: ${field.type}`);
  }
});

test("number fields have min <= default <= max", () => {
  for (const field of schemaFields(SETTINGS_SCHEMA)) {
    if (field.type !== "number") {
      continue;
    }
    assert.ok(typeof field.min === "number" && typeof field.max === "number", `${field.key} missing min/max`);
    assert.ok(field.min <= field.default && field.default <= field.max, `${field.key} default out of range`);
  }
});

test("select fields' default is one of their own options", () => {
  for (const field of schemaFields(SETTINGS_SCHEMA)) {
    if (field.type !== "select") {
      continue;
    }
    const values = field.options.map((opt) => opt.value);
    assert.ok(values.includes(field.default), `${field.key} default "${field.default}" not in its options`);
  }
});

test("mode option list preserves confluence alongside the other capture modes", () => {
  const modeField = schemaFields(SETTINGS_SCHEMA).find((field) => field.key === "mode");
  const values = modeField.options.map((opt) => opt.value);
  assert.deepEqual(values, ["auto", "sharepoint", "confluence", "article", "full"]);
});

test("each section descriptor has an id, a label, and either a fields array or a groups array", () => {
  for (const section of SETTINGS_SCHEMA) {
    assert.ok(section.id, "section missing id");
    assert.ok(section.label, "section missing label");
    if (section.groups) {
      assert.ok(section.groups.length > 0, `${section.id} has no groups`);
      for (const group of section.groups) {
        assert.ok(group.label, `${section.id} has a group missing a label`);
        assert.ok(Array.isArray(group.fields) && group.fields.length > 0, `${section.id} has a group with no fields`);
      }
    } else {
      assert.ok(Array.isArray(section.fields), `${section.id} has no fields array`);
    }
  }
});

test("the Advanced section has no schema fields (it's entirely bespoke controls)", () => {
  const advanced = SETTINGS_SCHEMA.find((section) => section.id === "advanced");
  assert.ok(advanced, "Advanced section missing");
  assert.deepEqual(advanced.fields, []);
});

test("theme and defaultAction live in the General section, which is first", () => {
  assert.equal(SETTINGS_SCHEMA[0].id, "general");
  const general = SETTINGS_SCHEMA.find((section) => section.id === "general");
  assert.ok(general, "General section missing");
  const fields = general.groups.flatMap((group) => group.fields);
  assert.ok(fields.some((field) => field.key === "theme"));
  assert.ok(fields.some((field) => field.key === "defaultAction"));
});

test("segmented fields' default is one of their own options", () => {
  for (const field of schemaFields(SETTINGS_SCHEMA)) {
    if (field.type !== "segmented") {
      continue;
    }
    const values = field.options.map((opt) => opt.value);
    assert.ok(values.includes(field.default), `${field.key} default "${field.default}" not in its options`);
  }
});

test("dependsOn references an existing field key in the schema", () => {
  const keys = new Set(schemaFields(SETTINGS_SCHEMA).map((field) => field.key));
  for (const field of schemaFields(SETTINGS_SCHEMA)) {
    if (!field.dependsOn) {
      continue;
    }
    assert.ok(keys.has(field.dependsOn.key), `${field.key} dependsOn unknown field ${field.dependsOn.key}`);
  }
});
