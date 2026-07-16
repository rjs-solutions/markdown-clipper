import { test } from "node:test";
import assert from "node:assert/strict";
import { compareMarkdownFingerprint, fingerprintMarkdown, normalizeFingerprintContent } from "../extension/src/lib/content-fingerprint.js";

test("fingerprints ignore line-ending and trailing-space noise", () => {
  assert.equal(fingerprintMarkdown("# Title\r\n\r\nBody  \r\n"), fingerprintMarkdown("# Title\n\nBody"));
});

test("fingerprints change when meaningful Markdown changes", () => {
  assert.notEqual(fingerprintMarkdown("Original body"), fingerprintMarkdown("Updated body"));
});

test("fingerprint normalization preserves ordinary internal spacing", () => {
  assert.equal(normalizeFingerprintContent("  indented text\n\n\nnext"), "  indented text\n\nnext");
});

test("fingerprint comparison distinguishes unknown, current, and changed", () => {
  const stored = fingerprintMarkdown("Saved body");
  assert.equal(compareMarkdownFingerprint("", "Saved body"), "unknown");
  assert.equal(compareMarkdownFingerprint(stored, "Saved body\n"), "current");
  assert.equal(compareMarkdownFingerprint(stored, "Changed body"), "changed");
});
