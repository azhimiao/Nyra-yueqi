/**
 * Data portability runtime — unified .nyra / .nychar / resource imports.
 */

export {
  PortabilityError,
  messageForPortabilityError,
  PORTABILITY_ERRORS,
} from "./errors.js";

export {
  buildNyraArchive,
  parseNyraArchive,
  prepareNyraImport,
  buildImportPlan,
  commitNyraImport,
  importNyraArchive,
  detectLegacyBackup,
  migrateLegacyBackup,
  mergeUserWorld,
  looksLikeNyraEnvelope,
  NYRA_EXTENSION,
  NYRA_ARCHIVE_MIME,
} from "./nyra/index.js";

export { sha256Hex, sha256ResourceId } from "./hash.js";

export {
  NYCHAR_FORMAT_VERSION,
  NYCHAR_EXTENSION,
  NYCHAR_MIME,
  NYCHAR_LIMITS,
  buildNycharPackage,
  buildNycharComponents,
  parseNycharPackage,
  prepareCharacterImport,
  installCharacterImport,
  detectCharacterPackage,
  exportCharacterAsGenericCard,
  assertNycharPrivacy,
} from "./nychar/index.js";

export {
  RESOURCES_STORAGE_KEY,
  registerResource,
  importBookResource,
  importAudioResource,
  findResourceById,
  listResources,
  linkDerivative,
  assertOriginalImmutable,
} from "./resources/index.js";
