import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTagRules } from "../extension/src/lib/tag-rules.js";

const context = {
  url: "https://example.com/blog/ai-visibility-notes",
  domain: "example.com",
  title: "Notes on AI Visibility",
  text: "This article covers search engines and large language models."
};

test("no rules -> []", () => {
  assert.deepEqual(applyTagRules([], context), []);
  assert.deepEqual(applyTagRules(undefined, context), []);
});

test("no matching rule -> []", () => {
  const rules = [{ id: "1", scope: "domain", pattern: "notarealdomain.com", isRegex: false, tags: ["x"] }];
  assert.deepEqual(applyTagRules(rules, context), []);
});

test("substring match per scope is case-insensitive", () => {
  assert.deepEqual(
    applyTagRules([{ id: "1", scope: "domain", pattern: "EXAMPLE.COM", isRegex: false, tags: ["web"] }], context),
    ["web"]
  );
  assert.deepEqual(
    applyTagRules([{ id: "1", scope: "url", pattern: "AI-VISIBILITY", isRegex: false, tags: ["ai"] }], context),
    ["ai"]
  );
  assert.deepEqual(
    applyTagRules([{ id: "1", scope: "title", pattern: "notes on ai", isRegex: false, tags: ["notes"] }], context),
    ["notes"]
  );
  assert.deepEqual(
    applyTagRules([{ id: "1", scope: "text", pattern: "LARGE LANGUAGE", isRegex: false, tags: ["llm"] }], context),
    ["llm"]
  );
});

test("scope any matches when any of url/title/text matches", () => {
  const byUrl = [{ id: "1", scope: "any", pattern: "ai-visibility", isRegex: false, tags: ["a"] }];
  const byTitle = [{ id: "1", scope: "any", pattern: "Notes on AI", isRegex: false, tags: ["b"] }];
  const byText = [{ id: "1", scope: "any", pattern: "search engines", isRegex: false, tags: ["c"] }];
  const none = [{ id: "1", scope: "any", pattern: "not-present-anywhere", isRegex: false, tags: ["d"] }];
  assert.deepEqual(applyTagRules(byUrl, context), ["a"]);
  assert.deepEqual(applyTagRules(byTitle, context), ["b"]);
  assert.deepEqual(applyTagRules(byText, context), ["c"]);
  assert.deepEqual(applyTagRules(none, context), []);
});

test("valid regex matches", () => {
  const rules = [{ id: "1", scope: "text", pattern: "search\\s+engines?", isRegex: true, tags: ["seo"] }];
  assert.deepEqual(applyTagRules(rules, context), ["seo"]);
});

test("invalid regex is skipped without throwing and does not block other rules", () => {
  const rules = [
    { id: "1", scope: "text", pattern: "(unclosed(", isRegex: true, tags: ["broken"] },
    { id: "2", scope: "domain", pattern: "example.com", isRegex: false, tags: ["ok"] }
  ];
  assert.doesNotThrow(() => applyTagRules(rules, context));
  assert.deepEqual(applyTagRules(rules, context), ["ok"]);
});

test("additive: two matching rules union tags, deduped, order preserved", () => {
  const rules = [
    { id: "1", scope: "domain", pattern: "example.com", isRegex: false, tags: ["web", "notes"] },
    { id: "2", scope: "title", pattern: "AI Visibility", isRegex: false, tags: ["notes", "ai"] }
  ];
  assert.deepEqual(applyTagRules(rules, context), ["web", "notes", "ai"]);
});

test("tags are trimmed and empties dropped", () => {
  const rules = [{ id: "1", scope: "domain", pattern: "example.com", isRegex: false, tags: [" web ", "", "  ", "ai"] }];
  assert.deepEqual(applyTagRules(rules, context), ["web", "ai"]);
});
