/**
 * Backup privacy scrubbing and selective local wipe.
 */

import { LIFE_STATE_KEY, importCompanionLifeBag } from "../companion/life-state.js";
import {
  APP_EVENTS_STORAGE_KEY,
  clearAppEventsRing,
  importAppEventsBag,
} from "../world/app-events.js";
import {
  exportGamesBag as exportYeosGamesBag,
  importGamesBag as importYeosGamesBag,
} from "../yeos/registry-games.js";
import { importYeosSavesBag } from "../yeos/saves.js";


export const BACKUP_INCLUDED_MODULES = Object.freeze([
  "profile", "messages", "conversations", "conversationV2", "contextGraph",
  "memories", "characters", "scenario", "cohabitTimeline", "life", "wallet",
  "companionLife", "appEvents", "yeosGames", "yeosSaves", "skillPlatform",
  "settings (no API keys)", "gatePrefs (session token redacted)",
]);

export const BACKUP_EXCLUDED = Object.freeze([
  "provider.apiKey / BYOK tokens (yueqi.provider.v1)",
  "ecosystem.session token",
  "gateSessionToken (redacted placeholder only)",
  "voice ttsApiKey / sttApiKey",
  "Capacitor secure storage secrets",
]);

const SENSITIVE_KEY_RE = /^(api[_-]?key|secret|token|password|authorization|gateSessionToken|ttsApiKey|sttApiKey)$/i;
const SECRET_VALUE_RE = /sk-[a-zA-Z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+/;

/**
 * Deep-clone payload and strip secrets before export / cloud upload.
 * @param {object} payload
 */
export function scrubExportPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const next = structuredClone(payload);

  if (next.profile?.provider) delete next.profile.provider;
  if (next.ecosystem) next.ecosystem.token = "";

  if (next.settings?.voice) {
    delete next.settings.voice.ttsApiKey;
    delete next.settings.voice.sttApiKey;
  }

  if (next.gatePrefs?.gateSessionToken && next.gatePrefs.gateSessionToken !== "[redacted]") {
    next.gatePrefs.gateSessionToken = next.gatePrefs.gateSessionToken ? "[redacted]" : "";
  }

  const scrubbed = scrubSecretsDeep(next);
  if (scrubbed.ecosystem) scrubbed.ecosystem.token = "";
  return scrubbed;
}

/**
 * @param {unknown} value
 * @param {string} [key]
 * @param {number} [depth]
 */
function scrubSecretsDeep(value, key = "", depth = 0) {
  if (depth > 12) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY_RE.test(key)) return "[redacted]";
    if (SECRET_VALUE_RE.test(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubSecretsDeep(item, key, depth + 1));
  }
  if (typeof value !== "object") return value;
  const out = {};
  for (const [k, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = scrubSecretsDeep(nested, k, depth + 1);
    }
  }
  return out;
}

/** Modules that can be wiped independently (privacy affordance). */
export const CLEARABLE_LOCAL_MODULES = Object.freeze([
  { id: "appEvents", label: "应用事件缓冲", storageKey: APP_EVENTS_STORAGE_KEY },
  { id: "companionLife", label: "陪伴生活状态", storageKey: LIFE_STATE_KEY },
]);

/**
 * Wipe selected local-only modules without touching chat / IDB.
 * @param {string[]} moduleIds
 * @param {{ storage?: Storage }} [opts]
 */
export function clearLocalModules(moduleIds = [], opts = {}) {
  const storage = opts.storage || (typeof window !== "undefined" ? window.localStorage : null);
  const cleared = [];

  for (const id of moduleIds) {
    switch (id) {
      case "appEvents":
        clearAppEventsRing();
        cleared.push("appEvents");
        break;
      case "companionLife":
        storage?.removeItem?.(LIFE_STATE_KEY);
        cleared.push("companionLife");
        break;
      default:
        break;
    }
  }
  return { ok: true, cleared };
}

/**
 * Assert exported JSON string contains no live secret patterns (tests / verify).
 * @param {object} payload
 */
export function assertNoSecretsInExport(payload) {
  const blob = JSON.stringify(payload);
  if (/sk-[a-zA-Z0-9_-]{12,}/.test(blob)) {
    throw new Error("export_contains_api_key_pattern");
  }
  if (/"gateSessionToken"\s*:\s*"(?!(\[redacted\]|)"|$)/.test(blob)) {
    throw new Error("export_contains_gate_session_token");
  }
  if (/"token"\s*:\s*"(local-|mock-)?[a-zA-Z0-9._-]{8,}"/.test(blob) && payload?.ecosystem?.token) {
    throw new Error("export_contains_ecosystem_token");
  }
  if (/"ttsApiKey"|"sttApiKey"/.test(blob)) {
    throw new Error("export_contains_voice_api_key_field");
  }
  return true;
}

export {
  exportYeosGamesBag,
  importYeosGamesBag,
  importYeosSavesBag,
  importCompanionLifeBag,
  importAppEventsBag,
};
