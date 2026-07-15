// Single source of truth for the options page: an ordered list of section
// descriptors, each holding an ordered list of field descriptors. The options
// page renders itself from this array (nav + panels + fillForm/readForm), and
// DEFAULT_SETTINGS in settings.js is derived from it, so a new setting only
// needs to be added HERE to show up everywhere and round-trip through
// chrome.storage.sync.
//
// Field shape:
//   key         storage key (must match nowhere else but here)
//   label       visible label text
//   type        "select" | "toggle" | "number" | "text" | "textarea"
//   default     the default value
//   help        optional help text rendered under the control
//   options     required for "select": [{ value, label }]
//   min/max/step  required for "number"
//   rows        optional for "textarea"
//   dependsOn   optional { key, value }: field is only enabled when another
//               field in the same schema currently equals `value`

import { DEFAULT_TEMPLATE, DEFAULT_FILENAME_TEMPLATE } from "./template.js";

export const SETTINGS_SCHEMA = [
  {
    id: "general",
    label: "General",
    fields: [
      {
        key: "theme",
        label: "Theme",
        type: "select",
        default: "system",
        options: [
          { value: "system", label: "System default" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" }
        ]
      },
      {
        key: "defaultAction",
        label: "Toolbar icon click",
        type: "select",
        default: "popup",
        options: [
          { value: "popup", label: "Open the popup" },
          { value: "sidepanel", label: "Open the side panel" },
          { value: "inpage", label: "Open in the page" }
        ]
      }
    ]
  },
  {
    id: "capture",
    label: "Capture",
    fields: [
      {
        key: "mode",
        label: "Capture mode",
        type: "select",
        default: "auto",
        options: [
          { value: "auto", label: "Auto (SharePoint when detected, else article)" },
          { value: "sharepoint", label: "SharePoint content region" },
          { value: "confluence", label: "Confluence content region" },
          { value: "article", label: "Article (Readability)" },
          { value: "full", label: "Full page" }
        ]
      },
      {
        key: "scrollBeforeCapture",
        label: "Complete SharePoint capture",
        type: "toggle",
        default: true,
        help: "Loads virtualized content when you export."
      },
      {
        key: "dropHidden",
        label: "Skip hidden elements",
        type: "toggle",
        default: true
      },
      {
        key: "maxScrollMs",
        label: "Maximum scroll time",
        type: "number",
        default: 12000,
        min: 3000,
        max: 45000,
        step: 500,
        unit: "ms",
        dependsOn: { key: "scrollBeforeCapture", value: true }
      },
      {
        key: "scrollPauseMs",
        label: "Pause after each scroll",
        type: "number",
        default: 450,
        min: 150,
        max: 2500,
        step: 50,
        unit: "ms",
        dependsOn: { key: "scrollBeforeCapture", value: true }
      },
      {
        key: "includeTweetThread",
        label: "Include the author's follow-up replies when clipping a tweet",
        type: "toggle",
        default: true
      }
    ]
  },
  {
    id: "output",
    label: "Output",
    fields: [
      {
        key: "metadataStyle",
        label: "Metadata",
        type: "select",
        default: "frontmatter",
        options: [
          { value: "frontmatter", label: "YAML front matter" },
          { value: "list", label: "Plain list at top" },
          { value: "none", label: "None" }
        ],
        dependsOn: { key: "useTemplate", value: false }
      },
      {
        key: "includeTitleHeading",
        label: "Add the page title as an H1 heading",
        type: "toggle",
        default: true,
        dependsOn: { key: "useTemplate", value: false }
      }
    ]
  },
  {
    id: "knowledgeBase",
    label: "Knowledge Base",
    fields: [
      {
        key: "vaultEnabled",
        label: "Save clips to a vault folder",
        type: "toggle",
        default: false,
        help:
          "When on and a folder is chosen below, clips write directly into that folder instead of your Downloads folder."
      },
      {
        key: "knowledgeBasePreset",
        label: "Use LLM-friendly frontmatter and keep an index",
        type: "toggle",
        default: false,
        help:
          "Adds content-type frontmatter (article, SharePoint, Confluence), fills in a description when the page has none, and keeps an index.md manifest of every clip in your vault folder."
      },
      {
        key: "dedupeOnReclip",
        label: "Update instead of duplicate when re-clipping",
        type: "toggle",
        default: true,
        help:
          "Update an existing clip instead of duplicating when you re-clip the same URL (vault only)."
      }
    ]
  },
  {
    id: "template",
    label: "Template",
    fields: [
      {
        key: "useTemplate",
        label: "Use a custom template instead of the Output settings above",
        type: "toggle",
        default: false
      },
      {
        key: "template",
        label: "Note template",
        type: "textarea",
        default: DEFAULT_TEMPLATE,
        rows: 10,
        dependsOn: { key: "useTemplate", value: true },
        richHelp: true,
        help:
          '<details class="variables-help"><summary>Available variables &amp; filters</summary>' +
          "<p>Use <code>{{name}}</code>, optionally with filters, e.g. " +
          "<code>{{title|slug}}</code> or <code>{{published|date:YYYY-MM-DD}}</code>.</p>" +
          "<ul>" +
          "<li><code>{{content}}</code> &mdash; the converted Markdown body</li>" +
          "<li><code>{{title}}</code>, <code>{{author}}</code>, <code>{{published}}</code>, " +
          "<code>{{modified}}</code>, <code>{{date}}</code>, <code>{{description}}</code></li>" +
          "<li><code>{{url}}</code>, <code>{{domain}}</code>, <code>{{path}}</code>, " +
          "<code>{{site}}</code>, <code>{{captured}}</code>, <code>{{today}}</code>, " +
          "<code>{{time}}</code></li>" +
          "<li><code>{{meta:NAME}}</code> &mdash; any page meta tag (e.g. <code>{{meta:og:image}}</code>)</li>" +
          "<li><code>{{schema:KEY}}</code> &mdash; JSON-LD field (e.g. <code>{{schema:datePublished}}</code>)</li>" +
          "<li><code>{{selector:CSS}}</code> &mdash; text of the first match (e.g. <code>{{selector:.byline}}</code>)</li>" +
          "</ul>" +
          "<p>Filters: <code>lower</code>, <code>upper</code>, <code>trim</code>, <code>slug</code>, " +
          "<code>default:x</code>, <code>replace:a,b</code>, <code>truncate:120</code>, " +
          "<code>date:FORMAT</code>.</p></details>"
      },
      {
        key: "filenameTemplate",
        label: "Filename template",
        type: "text",
        default: DEFAULT_FILENAME_TEMPLATE,
        dependsOn: { key: "useTemplate", value: true }
      }
    ]
  }
];

export function schemaFields(schema = SETTINGS_SCHEMA) {
  return schema.flatMap((section) => section.fields);
}

export function defaultsFromSchema(schema = SETTINGS_SCHEMA) {
  const defaults = {};
  for (const field of schemaFields(schema)) {
    defaults[field.key] = field.default;
  }
  return defaults;
}

export function findField(key, schema = SETTINGS_SCHEMA) {
  return schemaFields(schema).find((field) => field.key === key);
}
