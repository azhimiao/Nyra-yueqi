/** Frozen .nychar package constants  */

export const NYCHAR_FORMAT_VERSION = 1;
export const NYCHAR_EXTENSION = ".nychar";
export const NYCHAR_MIME = "application/vnd.nyra.character+zip";

export const NYCHAR_MANIFEST_SCHEMA = "nyra.character-package.manifest";
export const NYCHAR_CHARACTER_SCHEMA = "nyra.character";
export const NYCHAR_WORLDBOOK_SCHEMA = "nyra.character.worldbook";
export const NYCHAR_RELATIONSHIP_SCHEMA = "nyra.character.relationship";
export const NYCHAR_APPEARANCE_SCHEMA = "nyra.character.appearance";
export const NYCHAR_ACTIONS_SCHEMA = "nyra.character.actions";
export const NYCHAR_VOICE_SCHEMA = "nyra.character.voice";
export const NYCHAR_SKILLS_SCHEMA = "nyra.character.skills";

export const NYCHAR_COMPONENT_PATHS = Object.freeze({
  character: "character.json",
  worldbook: "worldbook.json",
  relationship: "relationship.json",
  appearance: "appearance.json",
  actions: "actions.json",
  voice: "voice.json",
  skills: "skills.json",
});

export const NYCHAR_REQUIRED_COMPONENTS = Object.freeze(Object.keys(NYCHAR_COMPONENT_PATHS));

export const NYCHAR_LIMITS = Object.freeze({
  maxPackageBytes: 128 * 1024 * 1024,
  maxEntries: 256,
  maxAssetBytes: 64 * 1024 * 1024,
  maxComponentJsonBytes: 256 * 1024,
  maxPathLength: 240,
  maxCompressionRatio: 100,
});

export const NYCHAR_RELATIONSHIP_TYPES = Object.freeze([
  "companion",
  "friend",
  "lover",
  "partner",
  "family",
  "mentor",
  "colleague",
  "custom",
]);

/** Asset path pattern from nychar-manifest-v1.schema.json */
export const NYCHAR_ASSET_PATH_RE =
  /^assets\/(avatar\.png|portrait\.png|pet\/[A-Za-z0-9._-]+|voice\/[A-Za-z0-9._-]+)$/;

export const NYCHAR_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
