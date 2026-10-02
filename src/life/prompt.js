/**
 * Limited life summaries for Pop / scenario prompts.
 * Never dump all privateFacts; respect visibility + observation rules.
 *
 * M5: when unifiedMemoryAdaptersV1 is on, route through life adapter prompt bag
 * (privateFacts blocked; discoverable unobserved excluded).
 */

import { isFeatureEnabled } from "../features/flags.js";
import { buildLifePromptBag } from "../memory/adapters/life.js";
import { getLatestDayPack, listObservations } from "./store.js";

const PROMPT_LINE_LIMIT = 8;

function adaptersOn() {
  try {
    return isFeatureEnabled("unifiedMemoryAdaptersV1") === true;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   characterId: string,
 *   pack?: object|null,
 *   maxLines?: number,
 * }} opts
 */
export function formatLifePromptSummary(opts = {}) {
  const characterId = String(opts.characterId || "").trim();
  if (!characterId) return "";

  const pack = opts.pack || getLatestDayPack(characterId);
  if (!pack) return "";

  const observations = listObservations(characterId, { limit: 200 });
  const observedIds = new Set(observations.map((o) => o.evidenceId));
  const maxLines = Math.max(1, Number(opts.maxLines) || PROMPT_LINE_LIMIT);

  if (adaptersOn()) {
    const bag = buildLifePromptBag({
      characterId,
      pack,
      observedIds,
      maxLines,
    });
    if (!bag.lines.length) return "";
    return ["角色近况（有限摘要，勿复述未共享私密）：", ...bag.lines].join("\n");
  }

  const eligibleOrUsed = new Set(
    observations
      .filter((o) => o.reactionState === "eligible" || o.reactionState === "used")
      .map((o) => o.evidenceId),
  );

  const lines = [];

  for (const ev of pack.events || []) {
    if (lines.length >= maxLines) break;
    if (ev.visibility === "private") continue;
    if (ev.visibility === "discoverable") {
      // Only if user has observed at least one linked evidence
      const linked = (ev.evidenceIds || []).some((id) => observedIds.has(id));
      if (!linked) continue;
    }
    // shared always allowed — do not dump privateFacts
    const when = String(ev.occurredAt || "").slice(0, 16).replace("T", " ");
    lines.push(`- [${when}] ${ev.summary}`);
  }

  // Discoverable evidence reactions — only observed & not yet used preferably
  for (const item of pack.evidence || []) {
    if (lines.length >= maxLines) break;
    if (!item.discoverable) continue;
    if (!observedIds.has(item.id)) continue;
    if (eligibleOrUsed.has(item.id) && observations.find((o) => o.evidenceId === item.id)?.reactionState === "used") {
      continue;
    }
    lines.push(`- 用户看过「${item.title}」：${String(item.content || "").slice(0, 40)}`);
  }

  if (!lines.length) return "";
  return ["角色近况（有限摘要，勿复述未共享私密）：", ...lines].join("\n");
}

/**
 * Guard: ensure a text block does not contain raw privateFacts dumps.
 * @param {string} block
 * @param {object|null} pack
 */
export function assertNoPrivateLeak(block, pack) {
  const text = String(block || "");
  const secrets = [];
  for (const ev of pack?.events || []) {
    if (ev.visibility === "private") {
      for (const f of ev.privateFacts || []) {
        if (f && text.includes(f)) secrets.push(f);
      }
    }
  }
  return { ok: secrets.length === 0, leaked: secrets };
}
