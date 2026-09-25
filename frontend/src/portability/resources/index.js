/**
 * Unified resource import surface (Book / Music).
 * .nybook / .nyplaylist are intentionally not implemented.
 */

export {
  RESOURCES_STORAGE_KEY,
  RESOURCE_INDEX_VERSION,
  __setResourcesStorageForTests,
  readResourceIndex,
  writeResourceIndex,
  buildResourceMetadata,
  mediaIdForSha256,
  findResourceById,
  listResources,
  storeOriginalMedia,
  registerResource,
  linkDerivative,
  assertOriginalImmutable,
  safeResourceFilename,
  normalizeMediaType,
} from "./registry.js";

export {
  BOOK_CURRENT_EXTENSIONS,
  BOOK_TARGET_EXTENSIONS,
  classifyBookFormat,
  assertBookFormatSupported,
  importBookResource,
} from "./books.js";

export {
  AUDIO_CURRENT_EXTENSIONS,
  classifyAudioFormat,
  assertAudioFormatSupported,
  importAudioResource,
} from "./audio.js";
