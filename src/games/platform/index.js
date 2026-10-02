/**
 * Games platform public exports.
 */

export { createRng, hashSeed, pick, shuffle } from "./rng.js";
export { validateGamePackage, DUO_KIND, GROUP_KIND } from "./package.js";
export { createGameEvent, isVisibleTo } from "./events.js";
export {
  createGameSessionSkeleton,
  normalizeSessionStatus,
  buildGameResult,
} from "./session.js";
export { createLocalPersistence, PLATFORM_STORE_KEY } from "./persistence.js";
export {
  listAllGameDefinitions,
  resolveGameDefinition,
  listLegacyYeosDefinitions,
  registerExternalPackage,
} from "./registry.js";
