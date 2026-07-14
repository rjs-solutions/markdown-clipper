import { test } from "node:test";
import assert from "node:assert/strict";
import { composeDocument, buildProperties, contentTypeFromMode } from "../extension/src/lib/compose.js";

const META = {
  title: "My Page",
  url: "https://site.sharepoint.com/x",
  author: "Jane",
  published: "2026-01-01",
  site: "Intranet",
  capturedAt: "2026-06-26 10:00"
};

test("composeDocument emits front matter + H1 + body by default", () => {
  const out = composeDocument({ title: "My Page", body: "Hello body.", metadata: META });
  assert.match(out, /^---\n/);
  assert.match(out, /title: My Page/);
  assert.match(out, /source: "https:\/\/site\.sharepoint\.com\/x"/);
  assert.match(out, /\n# My Page\n/);
  assert.match(out, /Hello body\./);
});

test("composeDocument list style emits a metadata block, no front matter", () => {
  const out = composeDocument({ title: "My Page", body: "Body", metadata: META, options: { metadataStyle: "list" } });
  assert.equal(out.startsWith("---"), false);
  assert.match(out, /Source: https:\/\/site\.sharepoint\.com\/x/);
  assert.match(out, /Author: Jane/);
});

test("composeDocument none style is title + body only", () => {
  const out = composeDocument({ title: "My Page", body: "Body", metadata: META, options: { metadataStyle: "none" } });
  assert.equal(out.includes("source:"), false);
  assert.equal(out.includes("Source:"), false);
  assert.match(out, /# My Page/);
});

test("composeDocument drops a duplicate leading heading from the body", () => {
  const out = composeDocument({ title: "My Page", body: "# My Page\n\nReal content", metadata: META, options: { metadataStyle: "none" } });
  assert.equal((out.match(/# My Page/g) || []).length, 1);
});

test("composeDocument can omit the title heading", () => {
  const out = composeDocument({ title: "My Page", body: "Body", metadata: META, options: { metadataStyle: "none", includeTitleHeading: false } });
  assert.equal(out.includes("# My Page"), false);
});

test("buildProperties merges extra properties", () => {
  const props = buildProperties(META, { extraProperties: { tags: ["clip"] } });
  assert.deepEqual(props.tags, ["clip"]);
  assert.equal(props.author, "Jane");
});

test("contentTypeFromMode maps capture modes to Knowledge Base content types", () => {
  assert.equal(contentTypeFromMode("sharepoint"), "sharepoint");
  assert.equal(contentTypeFromMode("confluence"), "confluence");
  assert.equal(contentTypeFromMode("article"), "article");
  assert.equal(contentTypeFromMode("full"), "article");
  assert.equal(contentTypeFromMode(undefined), "article");
});

test("Knowledge Base preset OFF reproduces today's compose output exactly (golden)", () => {
  const withoutPreset = composeDocument({ title: "My Page", body: "Hello body.", metadata: META });
  const withPresetFlagOffExplicitly = composeDocument({
    title: "My Page",
    body: "Hello body.",
    metadata: { ...META, type: "sharepoint" },
    options: { knowledgeBasePreset: false }
  });
  assert.equal(withPresetFlagOffExplicitly, withoutPreset);
  assert.match(withoutPreset, /source: "https:\/\/site\.sharepoint\.com\/x"/);
  assert.equal(withoutPreset.includes("source_url:"), false);
  assert.equal(withoutPreset.includes("type:"), false);
});

test("Knowledge Base preset ON emits the article profile with auto-description", () => {
  const props = buildProperties(
    { title: "My Page", url: "https://example.com/a", author: "Jane", published: "2026-01-01", tags: ["ai"], type: "article" },
    { knowledgeBasePreset: true, body: "This is the body text used as a description fallback when nothing else is set." }
  );
  assert.equal(props.title, "My Page");
  assert.equal(props.source_url, "https://example.com/a");
  assert.equal(props.author, "Jane");
  assert.equal(props.published, "2026-01-01");
  assert.deepEqual(props.tags, ["ai"]);
  assert.equal(props.type, "article");
  assert.ok(props.clipped, "clipped should be auto-populated");
  assert.match(props.description, /This is the body text used as a description fallback/);
  assert.equal("site" in props, false, "article profile has no site field");
});

test("Knowledge Base preset ON leaves an existing description alone", () => {
  const props = buildProperties(
    { title: "My Page", url: "https://example.com/a", description: "Already has one.", type: "article" },
    { knowledgeBasePreset: true, body: "Body text that would otherwise become the description." }
  );
  assert.equal(props.description, "Already has one.");
});

test("Knowledge Base preset ON falls back to twitter:description before the body", () => {
  const props = buildProperties(
    { title: "My Page", url: "https://example.com/a", twitterDescription: "From twitter.", type: "article" },
    { knowledgeBasePreset: true, body: "Body text fallback that should not be used here." }
  );
  assert.equal(props.description, "From twitter.");
});

test("Knowledge Base preset ON emits the sharepoint profile", () => {
  const props = buildProperties(
    {
      title: "Team Plan",
      url: "https://x.sharepoint.com/sites/team/SitePages/Plan.aspx",
      site: "Intranet",
      modified: "2026-02-01",
      capturedAt: "2026-06-26 10:00",
      author: "Jane",
      type: "sharepoint"
    },
    { knowledgeBasePreset: true }
  );
  assert.equal(props.title, "Team Plan");
  assert.equal(props.source_url, "https://x.sharepoint.com/sites/team/SitePages/Plan.aspx");
  assert.equal(props.site, "Intranet");
  assert.equal(props.path, "sites/team/SitePages/Plan.md");
  assert.equal(props.last_modified, "2026-02-01");
  assert.equal(props.captured, "2026-06-26 10:00");
  assert.equal(props.author, "Jane");
  assert.equal(props.type, "sharepoint");
  assert.equal("clipped" in props, false, "sharepoint profile uses captured, not clipped");
  assert.equal("description" in props, false, "sharepoint profile has no description field");
});

test("Knowledge Base preset ON emits the confluence profile (article fields + path)", () => {
  const props = buildProperties(
    {
      title: "Runbook",
      url: "https://team.atlassian.net/wiki/spaces/OPS/pages/Runbook",
      author: "Jane",
      description: "How we run things.",
      type: "confluence"
    },
    { knowledgeBasePreset: true }
  );
  assert.equal(props.type, "confluence");
  assert.equal(props.source_url, "https://team.atlassian.net/wiki/spaces/OPS/pages/Runbook");
  assert.equal(props.description, "How we run things.");
  assert.ok(props.path);
  assert.ok(props.clipped);
});

test("Knowledge Base preset ON omits genuinely unavailable fields instead of emitting blanks", () => {
  const props = buildProperties(
    { title: "No Author Page", url: "https://example.com/a", type: "article" },
    { knowledgeBasePreset: true, body: "" }
  );
  assert.equal("author" in props, false);
  assert.equal("published" in props, false);
  assert.equal("description" in props, false, "no description source anywhere -> omitted, not blank");
});
