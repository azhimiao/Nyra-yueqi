/**
 * Generate a complete CharacterDayPack in one shot.
 * Forbidden as main path: inventing a separate story per App.
 */

import { dayPackId, localDateFromIso } from "./schema.js";
import { meetsDayPackScale, validateDayPack } from "./validate.js";
import {
  ensureXingliSeedPack,
  getDayPack,
  retainPreviousOnFailure,
  saveDayPack,
} from "./store.js";
import { getXingliDay001Clone, XINGLI_CHARACTER_ID } from "./fixtures/xingli-day-001.js";
import { BUILTIN_CHARACTER_ID } from "../constants.js";

/**
 * @typedef {{
 *   generateDayPack?: (ctx: object) => Promise<object>|object
 * }} DayPackProvider
 */

/**
 * @param {{
 *   characterId: string,
 *   localDate?: string,
 *   provider?: DayPackProvider|null,
 *   characterCard?: object,
 *   recentMemoryHints?: string[],
 *   forceSeed?: boolean,
 * }} input
 */
export async function generateCompleteDayPack(input = {}) {
  const characterId = String(input.characterId || "").trim();
  if (!characterId) {
    return { ok: false, reason: "missing_characterId", pack: null, retained: null };
  }

  const localDate =
    String(input.localDate || "").trim() ||
    localDateFromIso(new Date().toISOString()) ||
    "1970-01-01";

  // Offline / no provider → seed (Xingli) or retain previous
  if (input.forceSeed || !input.provider?.generateDayPack) {
    return loadSeedOrRetain({ characterId, localDate });
  }

  let raw;
  try {
    raw = await input.provider.generateDayPack({
      characterId,
      localDate,
      characterCard: input.characterCard || null,
      recentMemoryHints: Array.isArray(input.recentMemoryHints)
        ? input.recentMemoryHints
        : [],
      // Contract hint: one pack, not per-app stories
      mode: "complete_day_pack",
    });
  } catch (err) {
    const retained = retainPreviousOnFailure(characterId, localDate);
    return {
      ok: false,
      reason: "provider_throw",
      error: String(err?.message || err),
      pack: null,
      retained: retained.kept,
      message: "今天还没有更新",
    };
  }

  const validated = validateDayPack(raw, { characterId });
  if (!validated.ok || !validated.value) {
    const retained = retainPreviousOnFailure(characterId, localDate);
    return {
      ok: false,
      reason: validated.reason || "invalid_pack",
      pack: null,
      retained: retained.kept,
      message: "今天还没有更新",
    };
  }

  const scale = meetsDayPackScale(validated.value);
  if (!scale.ok) {
    const retained = retainPreviousOnFailure(characterId, localDate);
    return {
      ok: false,
      reason: "scale_insufficient",
      scale,
      pack: null,
      retained: retained.kept,
      message: "今天还没有更新",
    };
  }

  // Enforce date / id
  validated.value.localDate = localDate;
  validated.value.characterId = characterId;
  validated.value.id = dayPackId(characterId, localDate);
  // P0: never relabel seed/demo packs as lived "model" experience.
  if (validated.value.source === "seed" || validated.value.demo === true) {
    validated.value.source = "seed";
    validated.value.demo = true;
  }

  const saved = saveDayPack(validated.value);
  if (!saved.ok) {
    const retained = retainPreviousOnFailure(characterId, localDate);
    return {
      ok: false,
      reason: saved.reason || "save_failed",
      pack: null,
      retained: retained.kept,
      message: "今天还没有更新",
    };
  }

  return { ok: true, pack: saved.pack, retained: null };
}

/**
 * Deterministic provider for tests — returns a clone of Xingli day remapped to ids.
 */
export function createDeterministicDayPackProvider(basePack = null) {
  const template = basePack || getXingliDay001Clone();
  return {
    async generateDayPack({ characterId, localDate }) {
      const pack = JSON.parse(JSON.stringify(template));
      pack.characterId = characterId;
      pack.localDate = localDate;
      pack.id = dayPackId(characterId, localDate);
      pack.source = "model";
      pack.generatedAt = new Date().toISOString();
      for (const ev of pack.events || []) {
        ev.characterId = characterId;
        // Remap occurredAt date portion
        ev.occurredAt = String(ev.occurredAt).replace(/^\d{4}-\d{2}-\d{2}/, localDate);
      }
      for (const item of pack.evidence || []) {
        item.occurredAt = String(item.occurredAt).replace(/^\d{4}-\d{2}-\d{2}/, localDate);
      }
      return pack;
    },
  };
}

function loadSeedOrRetain({ characterId, localDate }) {
  const existing = getDayPack(characterId, localDate);
  if (existing) return { ok: true, pack: existing, retained: null, source: "existing" };

  if (characterId === XINGLI_CHARACTER_ID || characterId === BUILTIN_CHARACTER_ID) {
    // Prefer canonical first day when requesting that date or any first offline load
    const seed = ensureXingliSeedPack();
    // Only serve canonical seed for its own date — do not remap as lived days.
    if (localDate === seed.localDate) {
      return {
        ok: true,
        pack: { ...seed, source: "seed", demo: true },
        retained: null,
        source: "seed",
        demo: true,
        message: "演示日数据（非真实共同经历）",
      };
    }
    // Other dates without provider: retain previous or empty — never fake a new lived day.
  }

  const retained = retainPreviousOnFailure(characterId, localDate);
  return {
    ok: false,
    reason: "no_seed_for_character",
    pack: null,
    retained: retained.kept,
    message: "今天还没有更新",
  };
}
