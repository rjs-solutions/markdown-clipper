// Applies the user's theme choice by setting data-theme on the root element.
// theme.css resolves the actual tokens; "system" (or any unknown value) follows
// the OS via prefers-color-scheme. Shared by every extension page so theming is
// consistent and lives in one place.

export const THEMES = ["system", "light", "dark"];

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : "system";
  document.documentElement.dataset.theme = value;
  return value;
}
