// Site-adapter registry. Each adapter bundles everything that is specific to
// one host/platform: how to find the content root, how to get its title, and
// which selectors to strip/read for chrome, metadata, and scroll regions. The
// capture pipeline (collect.js, clean.js, metadata.js, scroll.js) stays
// generic and only consumes the active adapter's data.

import { findSharePointRoot, getSharePointPageType, getSharePointTitle, isSharePoint } from "./sharepoint.js";
import { findConfluenceRoot, getConfluenceSpace, getConfluenceTitle, isConfluence } from "./confluence.js";

const sharepointAdapter = {
  id: "sharepoint",
  match: isSharePoint,
  findRoot: findSharePointRoot,
  getTitle: getSharePointTitle,
  unwantedSelectors: [
    "[data-automation-id='pageCommandBar']",
    "[data-automation-id='SiteHeader']",
    "[data-automation-id='SuiteNavWrapper']",
    ".ms-CommandBar",
    ".ms-Nav"
  ],
  metadataSelectors: {
    author: [
      "[data-automation-id='pageAuthor']",
      "[data-automation-id='newsAuthor']",
      "[data-automation-id='AuthorByline']",
      "[data-automation-id='authorByline']",
      "[data-automation-id='author']"
    ],
    published: [
      "[data-automation-id='pagePublishedDate']",
      "[data-automation-id='pageModifiedDate']",
      "[data-automation-id='newsDate']",
      "[data-automation-id='modifiedDate']"
    ]
  },
  scrollTargets: [
    "[data-automation-id='contentScrollRegion']",
    "[data-automation-id='pageScrollRegion']"
  ],
  needsScroll: true,
  extraMetadata: () => ({ page_type: getSharePointPageType() })
};

const confluenceAdapter = {
  id: "confluence",
  match: isConfluence,
  findRoot: findConfluenceRoot,
  getTitle: getConfluenceTitle,
  unwantedSelectors: [
    "#navigation",
    "#breadcrumb-section",
    ".aui-header",
    "#header",
    "#footer",
    ".page-metadata",
    "#likes-and-labels-container",
    "#comments-section",
    ".recently-updated",
    "#sidebar",
    "[data-testid='page-header-actions']",
    ".ak-editor-toolbar"
  ],
  metadataSelectors: {
    author: [".author", ".page-metadata .author a", "[data-testid='page-author']", "a[href*='/display/~']"],
    published: [".page-metadata time", "time.livesearch-time", "[data-testid='page-created-date']", ".last-modified"]
  },
  scrollTargets: ["#content", "#main"],
  needsScroll: false,
  extraMetadata: () => {
    const space = getConfluenceSpace();
    return space ? { space } : {};
  }
};

const genericAdapter = {
  id: "generic",
  match: () => true,
  findRoot: () => null,
  getTitle: () => null,
  unwantedSelectors: [],
  metadataSelectors: { author: [], published: [] },
  scrollTargets: [],
  needsScroll: false
};

const REGISTRY = [sharepointAdapter, confluenceAdapter, genericAdapter];

export function resolveAdapter() {
  return REGISTRY.find((adapter) => adapter.match()) || genericAdapter;
}

export function getAdapterById(id) {
  return REGISTRY.find((adapter) => adapter.id === id) || null;
}
