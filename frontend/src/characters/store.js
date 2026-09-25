import {
  BUILTIN_CHARACTER_ID,
  BUILTIN_COMPANION_PROMPT_DEVELOPER,
  BUILTIN_COMPANION_PROMPT_SYSTEM,
  CHARACTERS_MIGRATED_KEY,
  DEFAULT_SESSION_ID,
  LOCAL_KEYS,
  defaultProfile,
} from "../constants.js";
import {
  DEFAULT_PET_ID,
  normalizePetId,
  SELECTED_PET_KEY,
  bindCharacterPetBridge,
} from "../avatar/pet-catalog.js";
import {
  deleteRecord,
  getAllRecords,
  openMemoryDb,
  storeRecord,
} from "../storage/db.js";
import { createCharacterId, dmSessionId } from "./ids.js";
import { isRealCharacterAvatar } from "./avatar.js";
import { BUILTIN_NYRA_NAME } from "./builtin-nyra-prompt.js";
import { annotateCharacterV2 } from "./migration-v2.js";
import { hashPromptText, isStockCharacterPrompt } from "./prompt-stock.js";

export const CHARACTERS_CHANGED_EVENT = "yueqi:characters-changed";
export const COMPANION_CHANGED_EVENT = "yueqi:companion-changed";

/** @type {Map<string, object>} */
const cache = new Map();
let cacheReady = false;
let migratePromise = null;

function nowIso() {
  return new Date().toISOString();
}

function readLocalJson(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function cloneProfile(profile) {
  const base = profile && typeof profile === "object" ? profile : {};
  return {
    ...defaultProfile,
    ...base,
    fields: Array.isArray(base.fields)
      ? [...defaultProfile.fields.map((v, i) => base.fields[i] ?? v)]
      : [...defaultProfile.fields],
    ranges: Array.isArray(base.ranges)
      ? [...defaultProfile.ranges.map((v, i) => base.ranges[i] ?? v)]
      : [...defaultProfile.ranges],
    tokens: Array.isArray(base.tokens) ? [...base.tokens] : [...defaultProfile.tokens],
    status: { ...defaultProfile.status, ...(base.status || {}) },
    promptSystem: base.promptSystem ?? defaultProfile.promptSystem,
    promptDeveloper: base.promptDeveloper ?? defaultProfile.promptDeveloper,
    anniversaryDate: base.anniversaryDate ?? defaultProfile.anniversaryDate ?? "",
  };
}

function withBuiltinCompanionIdentity(profile) {
  const next = cloneProfile(profile);
  const builtinContext = { characterId: BUILTIN_CHARACTER_ID, source: "builtin" };
  if (isStockCharacterPrompt(next.promptSystem, builtinContext)) {
    next.promptSystem = BUILTIN_COMPANION_PROMPT_SYSTEM;
  }
  if (isStockCharacterPrompt(next.promptDeveloper, builtinContext)) {
    next.promptDeveloper = BUILTIN_COMPANION_PROMPT_DEVELOPER;
  }
  return next;
}

function needsBuiltinPromptRepair(value, expected) {
  const builtinContext = { characterId: BUILTIN_CHARACTER_ID, source: "builtin" };
  return isStockCharacterPrompt(value, builtinContext)
    && hashPromptText(value) !== hashPromptText(expected);
}

/**
 * @param {Partial<object>} raw
 * @returns {object}
 */
/** Deprecated placeholder names from early demos — never ship as live companion labels. */
const DEPRECATED_DEMO_NAMES = new Set(["沈既白", "既白"]);
const DEPRECATED_BUILTIN_NAMES = new Set(["林星梨", "星梨", "小栖"]);
const STOCK_BUILTIN_NAMES = new Set(["", "未命名", ...DEPRECATED_BUILTIN_NAMES]);

function scrubDeprecatedDemoName(value, fallback = "未命名") {
  const raw = String(value || "").trim();
  if (!raw || DEPRECATED_DEMO_NAMES.has(raw)) return fallback;
  return raw;
}

function seedBuiltinName(value, fallback = BUILTIN_NYRA_NAME) {
  const raw = String(value || "").trim();
  if (DEPRECATED_DEMO_NAMES.has(raw) || STOCK_BUILTIN_NAMES.has(raw)) return fallback;
  return raw;
}

export function normalizeCharacter(raw = {}) {
  const profile = cloneProfile(raw.profile);
  const builtin = String(raw.id || "").trim() === BUILTIN_CHARACTER_ID || raw.source === "builtin";
  const scrubName = (value, fallback) => {
    const normalized = scrubDeprecatedDemoName(value, fallback);
    return builtin && DEPRECATED_BUILTIN_NAMES.has(normalized) ? fallback : normalized;
  };
  const name = scrubName(raw.name || profile.fields[0], "未命名");
  const alias = scrubName(raw.alias || profile.fields[1], name);
  profile.fields[0] = name;
  profile.fields[1] = alias;
  const id = String(raw.id || "").trim() || createCharacterId();
  return annotateCharacterV2({
    ...raw,
    id,
    name,
    alias,
    avatarUrl: isRealCharacterAvatar(raw.avatarUrl) ? String(raw.avatarUrl).trim() : "",
    profile,
    petId: normalizePetId(raw.petId),
    loreEntryIds: Array.isArray(raw.loreEntryIds)
      ? raw.loreEntryIds.map((item) => String(item)).filter(Boolean)
      : [],
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
    source: raw.source === "builtin" || raw.source === "import" || raw.source === "user" ? raw.source : "user",
  });
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  if (value === undefined) return '"[undefined]"';
  return JSON.stringify(value);
}

function characterContentFingerprint(record) {
  const {
    profileV2: _profileV2,
    schemaVersion: _schemaVersion,
    revision: _revision,
    updatedAt: _updatedAt,
    v2MigrationError: _v2MigrationError,
    ...content
  } = record || {};
  return stableSerialize(content);
}

function dispatch(name, detail = {}) {
  try {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* non-DOM (verify scripts) */
  }
}

function syncCacheFromList(list) {
  cache.clear();
  for (const item of list) {
    const normalized = normalizeCharacter(item);
    cache.set(normalized.id, normalized);
  }
  cacheReady = true;
}

async function refreshCache() {
  await openMemoryDb();
  const rows = await getAllRecords("characters");
  syncCacheFromList(rows);
  return listCharactersSync();
}

/**
 * Update the synchronous character view after an external transaction writes
 * a character record (for example First Light V2). The transaction remains
 * authoritative; this only prevents the UI from reading a stale mirror.
 */
export function syncCharacterCacheRecord(record) {
  if (!record || typeof record !== "object") return null;
  const normalized = normalizeCharacter(record);
  cache.set(normalized.id, normalized);
  cacheReady = true;
  dispatch(CHARACTERS_CHANGED_EVENT, { characterId: normalized.id, action: "update" });
  return normalized;
}

/** Keep legacy profile consumers aligned with the canonical character record. */
export function syncLegacyProfileMirror(character) {
  if (!character?.profile || typeof character.profile !== "object") return null;
  writeLocalJson(LOCAL_KEYS.profileKey, character.profile);
  return character.profile;
}

/** Sync list from memory cache (empty until migrate/refresh). */
export function listCharactersSync() {
  return [...cache.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function getCharacterSync(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return cache.get(key) || null;
}

export async function listCharacters() {
  if (!cacheReady) await refreshCache();
  return listCharactersSync();
}

export async function getCharacter(id) {
  if (!cacheReady) await refreshCache();
  return getCharacterSync(id);
}

/**
 * @param {Partial<object>} partial
 * @param {{ expectedRevision?: number }} [options]
 */
export async function upsertCharacter(partial, { expectedRevision } = {}) {
  await openMemoryDb();
  if (!cacheReady) await refreshCache();
  const id = String(partial?.id || "").trim();
  const prev = id ? cache.get(id) : null;
  const hasExpectedRevision = Number.isFinite(expectedRevision)
    && Number.isInteger(expectedRevision);
  const actualRevision = prev?.revision;
  if (hasExpectedRevision && actualRevision !== expectedRevision) {
    const error = new Error("revision_conflict");
    error.code = "revision_conflict";
    error.expectedRevision = expectedRevision;
    error.actualRevision = actualRevision;
    error.current = prev || null;
    throw error;
  }
  const previousRevision = Number.isInteger(Number(prev?.revision)) && Number(prev.revision) >= 1
    ? Number(prev.revision)
    : 1;
  const candidate = normalizeCharacter({
    ...(prev || {}),
    ...partial,
    id: id || partial?.id || createCharacterId(),
    profile: partial?.profile
      ? cloneProfile({ ...(prev?.profile || {}), ...partial.profile })
      : prev?.profile || partial?.profile,
    createdAt: prev?.createdAt || partial?.createdAt || nowIso(),
    updatedAt: nowIso(),
    revision: prev ? previousRevision : 1,
  });
  const contentChanged = !prev
    || characterContentFingerprint(prev) !== characterContentFingerprint(candidate);
  const next = normalizeCharacter({
    ...candidate,
    revision: prev && contentChanged ? previousRevision + 1 : previousRevision,
    updatedAt: prev && !contentChanged ? prev.updatedAt : candidate.updatedAt,
  });
  await storeRecord("characters", next);
  cache.set(next.id, next);
  cacheReady = true;
  dispatch(CHARACTERS_CHANGED_EVENT, { characterId: next.id, action: prev ? "upsert" : "create" });
  return next;
}

/**
 * @param {{ name?: string, copyFromId?: string, petId?: string }} [options]
 */
export async function createCharacter(options = {}) {
  const copyFrom = options.copyFromId
    ? await getCharacter(options.copyFromId)
    : null;
  const profile = copyFrom
    ? cloneProfile(copyFrom.profile)
    : cloneProfile({
      ...defaultProfile,
      // Blank card: do not seed the platform kernel or the builtin Nyra prompt.
      promptSystem: "",
      promptDeveloper: "",
    });
  if (options.name) {
    profile.fields[0] = String(options.name).trim() || profile.fields[0];
  }
  return upsertCharacter({
    id: createCharacterId(),
    name: profile.fields[0],
    alias: profile.fields[1],
    avatarUrl: copyFrom?.avatarUrl || "",
    profile,
    petId: options.petId || copyFrom?.petId || DEFAULT_PET_ID,
    loreEntryIds: copyFrom?.loreEntryIds ? [...copyFrom.loreEntryIds] : [],
    source: "user",
  });
}

export async function deleteCharacter(id) {
  await openMemoryDb();
  if (!cacheReady) await refreshCache();
  const key = String(id || "").trim();
  const all = listCharactersSync();
  if (all.length <= 1) {
    throw new Error("cannot_delete_last_character");
  }
  const target = cache.get(key);
  if (!target) return false;
  await deleteRecord("characters", key);
  cache.delete(key);
  try {
    const { clearCharacterLife } = await import("../life/store.js");
    clearCharacterLife(key);
  } catch {
    /* life module optional during early boot */
  }
  if (getActiveCharacterId() === key) {
    const fallback = listCharactersSync()[0];
    if (fallback) setActiveCharacterId(fallback.id);
  }
  dispatch(CHARACTERS_CHANGED_EVENT, { characterId: key, action: "delete" });
  return true;
}

export function getActiveCharacterId() {
  try {
    const saved = String(window.localStorage.getItem(LOCAL_KEYS.activeCharacterKey) || "").trim();
    if (saved && (!cacheReady || cache.has(saved))) return saved;
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  return BUILTIN_CHARACTER_ID;
}

export function setActiveCharacterId(id) {
  const next = String(id || "").trim() || BUILTIN_CHARACTER_ID;
  if (cacheReady && cache.size && !cache.has(next)) {
    throw new Error("unknown_character");
  }
  try {
    window.localStorage.setItem(LOCAL_KEYS.activeCharacterKey, next);
  } catch {
    /* ignore */
  }
  dispatch(COMPANION_CHANGED_EVENT, { characterId: next });
  return next;
}

function readLegacyPetId() {
  try {
    return normalizePetId(window.localStorage.getItem(SELECTED_PET_KEY));
  } catch {
    return DEFAULT_PET_ID;
  }
}

async function migrateMessagesToDm(characterId) {
  const targetSession = dmSessionId(characterId);
  const messages = await getAllRecords("messages");
  let moved = 0;
  for (const message of messages) {
    if (message.sessionId !== DEFAULT_SESSION_ID) continue;
    await storeRecord("messages", { ...message, sessionId: targetSession });
    moved += 1;
  }

  const conversations = await getAllRecords("conversations");
  const legacy = conversations.find((item) => item.id === DEFAULT_SESSION_ID);
  const existingDm = conversations.find((item) => item.id === targetSession);
  const character = cache.get(characterId);
  const title = character?.name || "角色";

  if (legacy && !existingDm) {
    await storeRecord("conversations", {
      ...legacy,
      id: targetSession,
      kind: "dm",
      characterId,
      title: legacy.title || title,
      updatedAt: nowIso(),
    });
    await deleteRecord("conversations", DEFAULT_SESSION_ID);
  } else if (!existingDm) {
    await storeRecord("conversations", {
      id: targetSession,
      kind: "dm",
      characterId,
      title,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  } else if (existingDm && !existingDm.kind) {
    await storeRecord("conversations", {
      ...existingDm,
      kind: "dm",
      characterId: existingDm.characterId || characterId,
      title: existingDm.title || title,
      updatedAt: nowIso(),
    });
  }

  return moved;
}

/**
 * Idempotent bootstrap: legacy profile → char-xingli, default-session → char:char-xingli.
 */
export async function ensureCharactersMigrated() {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    await openMemoryDb();
    await refreshCache();

    const migratedFlag = (() => {
      try {
        return window.localStorage.getItem(CHARACTERS_MIGRATED_KEY) === "1";
      } catch {
        return false;
      }
    })();

    if (cache.size > 0 && migratedFlag) {
      const builtin = cache.get(BUILTIN_CHARACTER_ID);
      const builtinNeedsRepair = builtin && (
        !builtin.petId
        || builtin.petId === "bubble"
        || STOCK_BUILTIN_NAMES.has(String(builtin.name || "").trim())
        || STOCK_BUILTIN_NAMES.has(String(builtin.profile?.fields?.[0] || "").trim())
        || DEPRECATED_DEMO_NAMES.has(String(builtin.name || "").trim())
        || DEPRECATED_BUILTIN_NAMES.has(String(builtin.name || "").trim())
        || DEPRECATED_DEMO_NAMES.has(String(builtin.alias || "").trim())
        || DEPRECATED_BUILTIN_NAMES.has(String(builtin.alias || "").trim())
        || DEPRECATED_DEMO_NAMES.has(String(builtin.profile?.fields?.[0] || "").trim())
        || DEPRECATED_BUILTIN_NAMES.has(String(builtin.profile?.fields?.[0] || "").trim())
        || needsBuiltinPromptRepair(
          builtin.profile?.promptSystem,
          BUILTIN_COMPANION_PROMPT_SYSTEM,
        )
        || needsBuiltinPromptRepair(
          builtin.profile?.promptDeveloper,
          BUILTIN_COMPANION_PROMPT_DEVELOPER,
        )
      );
      if (!getActiveCharacterId() || (cacheReady && !cache.has(getActiveCharacterId()))) {
        setActiveCharacterId(listCharactersSync()[0]?.id || BUILTIN_CHARACTER_ID);
      }
      if (!builtinNeedsRepair) {
        const activeCharacter = cache.get(getActiveCharacterId());
        if (activeCharacter?.profile) syncLegacyProfileMirror(activeCharacter);
        return { skipped: true, characters: listCharactersSync() };
      }
    }

    let xingli = cache.get(BUILTIN_CHARACTER_ID);
    if (!xingli) {
      const legacyProfile = readLocalJson(LOCAL_KEYS.profileKey, null);
      const profile = withBuiltinCompanionIdentity(cloneProfile(legacyProfile));
      // Seed the official name only when the legacy value is still stock.
      profile.fields[0] = seedBuiltinName(profile.fields[0]);
      profile.fields[1] = seedBuiltinName(profile.fields[1], profile.fields[0]);
      xingli = await upsertCharacter({
        id: BUILTIN_CHARACTER_ID,
        name: profile.fields[0],
        alias: profile.fields[1],
        profile,
        petId: DEFAULT_PET_ID,
        source: "builtin",
      });
    } else {
      const needsPet = !xingli.petId || xingli.petId === "bubble";
      const needsNameScrub = DEPRECATED_DEMO_NAMES.has(String(xingli.name || "").trim())
        || STOCK_BUILTIN_NAMES.has(String(xingli.name || "").trim())
        || STOCK_BUILTIN_NAMES.has(String(xingli.profile?.fields?.[0] || "").trim())
        || DEPRECATED_BUILTIN_NAMES.has(String(xingli.name || "").trim())
        || DEPRECATED_DEMO_NAMES.has(String(xingli.alias || "").trim())
        || DEPRECATED_BUILTIN_NAMES.has(String(xingli.alias || "").trim())
        || DEPRECATED_DEMO_NAMES.has(String(xingli.profile?.fields?.[0] || "").trim())
        || DEPRECATED_BUILTIN_NAMES.has(String(xingli.profile?.fields?.[0] || "").trim());
      const needsBuiltinIdentity = needsBuiltinPromptRepair(
        xingli.profile?.promptSystem,
        BUILTIN_COMPANION_PROMPT_SYSTEM,
      ) || needsBuiltinPromptRepair(
        xingli.profile?.promptDeveloper,
        BUILTIN_COMPANION_PROMPT_DEVELOPER,
      );
      if (needsPet || needsNameScrub || needsBuiltinIdentity) {
        const profile = withBuiltinCompanionIdentity(cloneProfile(xingli.profile));
        profile.fields[0] = seedBuiltinName(profile.fields[0]);
        profile.fields[1] = seedBuiltinName(profile.fields[1], profile.fields[0]);
        xingli = await upsertCharacter({
          ...xingli,
          name: profile.fields[0],
          alias: profile.fields[1],
          profile,
          petId: !xingli.petId || xingli.petId === "bubble"
            ? DEFAULT_PET_ID
            : xingli.petId,
          source: xingli.source || "builtin",
        });
      }
    }

    const active = getActiveCharacterId();
    if (!active || !cache.has(active)) {
      setActiveCharacterId(BUILTIN_CHARACTER_ID);
    }

    await migrateMessagesToDm(BUILTIN_CHARACTER_ID);

    // Keep legacy UI consumers aligned with the currently active character.
    const activeCharacter = cache.get(getActiveCharacterId()) || xingli;
    syncLegacyProfileMirror(activeCharacter);

    try {
      window.localStorage.setItem(CHARACTERS_MIGRATED_KEY, "1");
    } catch {
      /* ignore */
    }

    return { skipped: false, characters: listCharactersSync() };
  })();

  try {
    return await migratePromise;
  } finally {
    migratePromise = null;
  }
}

/** Test helper: clear in-memory cache (does not wipe IndexedDB). */
export function resetCharacterCacheForTests() {
  cache.clear();
  cacheReady = false;
  migratePromise = null;
}

function patchActivePetId(petId) {
  const id = getActiveCharacterId();
  const prev = cache.get(id);
  if (!prev) return id;
  const next = normalizeCharacter({
    ...prev,
    petId: normalizePetId(petId),
    updatedAt: nowIso(),
  });
  cache.set(id, next);
  void storeRecord("characters", next).catch(() => {});
  return id;
}

bindCharacterPetBridge({
  readPetId() {
    if (!cacheReady || !cache.size) return "";
    const character = cache.get(getActiveCharacterId());
    return character?.petId || "";
  },
  writePetId(petId) {
    return patchActivePetId(petId);
  },
});
