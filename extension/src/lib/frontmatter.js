// Minimal YAML front-matter emitter for a flat properties object whose values
// are strings or string arrays. Pure -- unit-tested.

function needsQuoting(value) {
  const s = String(value);
  if (s === "") {
    return true;
  }
  if (/^\s|\s$/.test(s)) {
    return true;
  }
  if (/[:#[\]{}&*!|>'"%@`,]/.test(s)) {
    return true;
  }
  if (/^[-?]/.test(s)) {
    return true;
  }
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) {
    return true;
  }
  if (/^-?\d/.test(s)) {
    // Could be misread as a number or date.
    return true;
  }
  return false;
}

function scalar(value) {
  const s = String(value).replace(/\r?\n/g, " ");
  if (needsQuoting(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
  }
  return s;
}

// Build a `---` delimited YAML block. Empty/blank values are skipped; returns
// "" when there is nothing to emit.
export function buildFrontmatter(props) {
  const entries = Object.entries(props || {}).filter(([, value]) => {
    if (value === undefined || value === null || value === "") {
      return false;
    }
    if (Array.isArray(value) && value.length === 0) {
      return false;
    }
    return true;
  });
  if (entries.length === 0) {
    return "";
  }
  const lines = ["---"];
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${scalar(item)}`);
      }
    } else {
      lines.push(`${key}: ${scalar(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
