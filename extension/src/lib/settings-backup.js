// Export/import all user settings as one JSON file, for the Advanced tab's
// backup control (extension/src/options/options.js). Bundles the schema-
// driven settings (settings.js) together with tag rules (tag-rules.js),
// which live under their own chrome.storage.sync key and are never a schema
// field -- see tag-rules.js for why. Kept deliberately small: this is a
// snapshot/restore pair, not a migration system.

import { loadSettings, saveSettings } from "./settings.js";
import { loadRules, saveRules } from "./tag-rules.js";

export const BACKUP_VERSION = 1;

export async function exportSettings() {
  const [settings, tagRules] = await Promise.all([loadSettings(), loadRules()]);
  return { version: BACKUP_VERSION, settings, tagRules };
}

// Accepts a parsed backup object (as produced by exportSettings, or hand-
// edited JSON). Ignores unknown top-level keys, and throws a plain Error
// with a clear message if the shape isn't a usable backup -- no secrets are
// ever stored in settings, so the only risk here is a bad restore, not a
// leak.
export async function importSettings(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new Error("That file doesn't look like a Markdown Clipper settings backup.");
  }
  if (!backup.settings || typeof backup.settings !== "object" || Array.isArray(backup.settings)) {
    throw new Error("That file doesn't look like a Markdown Clipper settings backup (missing settings).");
  }

  await saveSettings(backup.settings);
  await saveRules(Array.isArray(backup.tagRules) ? backup.tagRules : []);
}
