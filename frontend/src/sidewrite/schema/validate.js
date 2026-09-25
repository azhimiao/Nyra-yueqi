import { APP_KEYS, SCHEMA_VERSION, defaultManifest } from "../constants.js";
import { emptyC5Payload, validateC5Payload } from "./c5-im.js";
import { emptyC4Payload, validateC4Payload } from "./c4-album.js";
import { emptyC8Payload, validateC8Payload } from "./c8-memo.js";
import { emptyC2Payload, validateC2Payload } from "./c2-sms.js";

const VALIDATORS = {
  c5: validateC5Payload,
  c4: validateC4Payload,
  c8: validateC8Payload,
  c2: validateC2Payload,
};

const EMPTY = {
  c5: emptyC5Payload,
  c4: emptyC4Payload,
  c8: emptyC8Payload,
  c2: emptyC2Payload,
};

/**
 * @param {unknown} raw
 * @param {string} [characterId]
 */
export function validateManifest(raw, characterId = "") {
  try {
    if (!raw || typeof raw !== "object") {
      return { ok: false, value: defaultManifest(characterId), reason: "not_object" };
    }
    const src = /** @type {Record<string, unknown>} */ (raw);
    const base = defaultManifest(String(src.characterId || characterId || ""));
    const desktopIn =
      src.desktop && typeof src.desktop === "object"
        ? /** @type {Record<string, unknown>} */ (src.desktop)
        : {};
    const appsIn =
      src.apps && typeof src.apps === "object"
        ? /** @type {Record<string, unknown>} */ (src.apps)
        : {};

    const iconOrder = Array.isArray(desktopIn.iconOrder)
      ? desktopIn.iconOrder.map(String).filter((k) => APP_KEYS.includes(k))
      : [...base.desktop.iconOrder];
    const dockOrder = Array.isArray(desktopIn.dockOrder)
      ? desktopIn.dockOrder.map((k) => (k == null ? null : String(k))).slice(0, 4)
      : [...base.desktop.dockOrder];
    while (dockOrder.length < 4) dockOrder.push(null);

    const apps = { ...base.apps };
    for (const key of APP_KEYS) {
      const row = appsIn[key] && typeof appsIn[key] === "object"
        ? /** @type {Record<string, unknown>} */ (appsIn[key])
        : {};
      const status = String(row.status || "empty");
      apps[key] = {
        status: ["empty", "generating", "ready", "failed"].includes(status) ? status : "empty",
        generatedAt: row.generatedAt == null ? null : String(row.generatedAt),
        checksum: row.checksum == null ? null : String(row.checksum),
        error: row.error == null ? null : String(row.error).slice(0, 200),
      };
    }

    const genStatus = String(src.generationStatus || "idle");
    return {
      ok: true,
      value: {
        schemaVersion: SCHEMA_VERSION,
        characterId: base.characterId,
        createdAt: String(src.createdAt || base.createdAt),
        updatedAt: String(src.updatedAt || base.updatedAt),
        generationStatus: ["idle", "generating", "ready", "partial", "failed"].includes(genStatus)
          ? genStatus
          : "idle",
        generationError: src.generationError == null
          ? null
          : String(src.generationError).slice(0, 200),
        desktop: {
          wallpaperId: String(desktopIn.wallpaperId || base.desktop.wallpaperId),
          wallpaperTone: String(desktopIn.wallpaperTone || base.desktop.wallpaperTone),
          iconOrder: iconOrder.length ? iconOrder : [...base.desktop.iconOrder],
          dockOrder,
          carrierLabel: String(desktopIn.carrierLabel || "栖网").slice(0, 8),
        },
        apps,
        pool: {
          seed: Number(
            src.pool && typeof src.pool === "object"
              ? /** @type {Record<string, unknown>} */ (src.pool).seed
              : base.pool.seed,
          ) || base.pool.seed,
          enabledApps: Array.isArray(
            src.pool && typeof src.pool === "object"
              ? /** @type {Record<string, unknown>} */ (src.pool).enabledApps
              : null,
          )
            ? /** @type {unknown[]} */ (
              /** @type {Record<string, unknown>} */ (src.pool).enabledApps
            ).map(String)
            : [],
        },
      },
    };
  } catch {
    return { ok: false, value: defaultManifest(characterId), reason: "validate_throw" };
  }
}

/**
 * @param {string} appKey
 * @param {unknown} raw
 */
export function validateSidewritePayload(appKey, raw) {
  const key = String(appKey || "").trim();
  const validator = VALIDATORS[key];
  if (!validator) {
    return { ok: false, value: null, reason: "unknown_app" };
  }
  return validator(raw);
}

/**
 * @param {string} appKey
 * @param {unknown} [raw]
 */
export function degradePayload(appKey, raw) {
  const key = String(appKey || "").trim();
  const result = validateSidewritePayload(key, raw);
  if (result.ok && result.value) return result.value;
  const empty = EMPTY[key];
  return empty ? empty() : { schemaVersion: SCHEMA_VERSION, appKey: key };
}
