// Single source of truth for the options page: an ordered list of section
// descriptors. The options page renders itself from this array (header +
// nav + panels + fillForm/readForm), and DEFAULT_SETTINGS in settings.js is
// derived from it, so a new setting only needs to be added HERE to show up
// everywhere and round-trip through chrome.storage.sync.
//
// A section holds fields directly (a flat list) OR groups (an ordered list
// of { label, fields }, rendered as labeled sub-groups inside the section's
// panel).
//
// Field shape:
//   key         storage key (must match nowhere else but here)
//   label       visible label text
//   type        "select" | "toggle" | "number" | "text" | "textarea" | "segmented"
//   default     the default value
//   help        optional help text rendered under the control
//   options     required for "select"/"segmented": [{ value, label, icon? }]
//               ("icon" is a name looked up in options.js's icon set)
//   min/max/step  required for "number"
//   rows        optional for "textarea"
//   fullWidth   optional, "segmented" only: render as a full-width row
//               instead of a narrow labeled field
//   variant     optional, "segmented" only: "diagram" renders a vertical
//               option list with a live diagram instead of the horizontal
//               pill (see options.js renderBehaviorDiagram). Options can
//               then carry a `description` shown under the option label.
//   dependsOn   optional { key, value }: field is only enabled when another
//               field in the same schema currently equals `value`

import { DEFAULT_TEMPLATE, DEFAULT_FILENAME_TEMPLATE } from "./template.js";

export const SETTINGS_SCHEMA = [
  {
    id: "general",
    label: "General",
    groups: [
      {
        label: "Appearance",
        fields: [
          {
            key: "theme",
            label: "Theme",
            type: "segmented",
            default: "system",
            fullWidth: true,
            options: [
              { value: "system", label: "System", icon: "system" },
              { value: "light", label: "Light", icon: "light" },
              { value: "dark", label: "Dark", icon: "dark" }
            ]
          }
        ]
      },
      {
        label: "Behavior",
        fields: [
          {
            key: "defaultAction",
            label: "Toolbar icon click",
            type: "segmented",
            variant: "diagram",
            default: "popup",
            options: [
              {
                value: "popup",
                label: "Popup",
                icon: "popup",
                description: "Opens in a small popup from the toolbar icon."
              },
              {
                value: "sidepanel",
                label: "Side panel",
                icon: "sidepanel",
                description: "Docks a panel on the side of the browser window."
              },
              {
                value: "inpage",
                label: "Open in page",
                icon: "inpage",
                description: "Floats a movable panel over the current page."
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "clipping",
    label: "Clipping",
    groups: [
      {
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
            help: "Loads virtualized SharePoint sections only when you copy, save, edit, or export; opening the preview stays immediate."
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
            key: "dropHidden",
            label: "Skip hidden elements",
            type: "toggle",
            default: true
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
        label: "Format & save",
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
          },
          {
            key: "useTemplate",
            label: "Use a custom template instead of the settings above",
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
          },
          {
            key: "dedupeOnReclip",
            label: "Update instead of duplicate when re-clipping",
            type: "toggle",
            default: true,
            help: "Update an existing clip instead of duplicating when you re-clip the same URL (vault only)."
          }
        ]
      }
    ]
  },
  {
    id: "knowledgeBase",
    label: "Knowledge base",
    groups: [
      {
        label: "Vault",
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
              "Adds content-type frontmatter (article, SharePoint, Confluence), fills in a description when the page has none, and keeps an index.md manifest of every clip in your vault folder.",
            dependsOn: { key: "vaultEnabled", value: true }
          }
        ]
      }
    ]
  },
  {
    id: "collections",
    label: "Collections",
    fields: []
  },
  {
    id: "advanced",
    label: "Advanced",
    fields: []
  }
];

export function schemaFields(schema = SETTINGS_SCHEMA) {
  return schema.flatMap((section) => (section.groups ? section.groups.flatMap((group) => group.fields) : section.fields));
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
