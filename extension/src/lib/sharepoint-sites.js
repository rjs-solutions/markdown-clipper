// Compatibility aliases for older imports. New code should use collections.js.
export {
  loadCollections as loadSites,
  saveCollections as saveSites,
  generateCollectionId as generateSiteId
} from "./collections.js";
