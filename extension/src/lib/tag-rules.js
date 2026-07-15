// Deterministic clip-time tag rules. See docs/llm-vault-design.md
// ("Clip routing -- tags over folders"). Rules NEVER decide folders, only
// tags -- and they are additive: every matching rule's tags are unioned in,
// never a single winner-takes-all match.
//
// applyTagRules is pure and fully unit-tested (tests/tag-rules.test.js). The
// storage helpers below are a thin, untested wrapper around chrome.storage.sync
// under the rules' OWN key ("tagRules") -- deliberately kept separate from
// settings.js / settings-schema.js so the rules list never becomes a schema
// field (see options.js's bespoke rules editor for why).

const STORAGE_KEY = "tagRules";

// Rule: { id, scope: "domain"|"url"|"title"|"text"|"any", pattern, isRegex, tags }
// context: { url, domain, title, text }
function fieldsForScope(scope, context) {
  if (scope === "domain") {
    return [context.domain];
  }
  if (scope === "url") {
    return [context.url];
  }
  if (scope === "title") {
    return [context.title];
  }
  if (scope === "text") {
    return [context.text];
  }
  // "any" (and any unrecognized scope) checks url + title + text.
  return [context.url, context.title, context.text];
}

function matches(rule, context) {
  const fields = fieldsForScope(rule.scope, context).map((value) => String(value || ""));
  const pattern = String(rule.pattern || "");
  if (!pattern) {
    return false;
  }
  if (rule.isRegex) {
    let regex;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      // An invalid regex is skipped, never thrown -- one bad rule must never
      // abort the clip or block other rules from matching.
      return false;
    }
    return fields.some((field) => regex.test(field));
  }
  const needle = pattern.toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(needle));
}

// Pure: applies every rule to the context and returns the union of tags from
// all matching rules, deduped, first-seen order preserved, trimmed, empties
// dropped. No rules / no matches -> [].
export function applyTagRules(rules, context = {}) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return [];
  }
  const seen = new Set();
  const result = [];
  for (const rule of rules) {
    if (!rule || !matches(rule, context)) {
      continue;
    }
    for (const rawTag of rule.tags || []) {
      const tag = String(rawTag || "").trim();
      if (!tag || seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}

export async function loadRules() {
  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: [] });
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

export async function saveRules(rules) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: Array.isArray(rules) ? rules : [] });
}
