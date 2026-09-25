/**
 * Bridge F0 cohabit timeline ↔ life ledger.
 * Keeps appendCohabitEvent compatible; dual-writes a short shared life summary.
 *
 * M5: when unifiedMemoryAdaptersV1 is on, classify via life adapter and never
 * project privateFacts into Timeline / palace helpers.
 */

import { isFeatureEnabled } from "../features/flags.js";
import {
  appendCohabitEvent as appendCohabitEventCore,
  listCohabitEvents,
  formatCohabitTimelineBlock,
} from "../memory/cohabit-timeline.js";
import {
  assertLifeFactShareable,
  classifyLifeShareClass,
  ensureLifeAdapterRegistered,
  isLifeAdapterEnabled,
} from "../memory/adapters/life.js";
import { projectCohabitIntoLife } from "./cohabit-sync.js";
import { listLifeEvents } from "./store.js";
import { formatLifePromptSummary } from "./prompt.js";

let dualWriteEnabled = true;

export function setLifeBridgeDualWrite(enabled) {
  dualWriteEnabled = Boolean(enabled);
}

export { projectCohabitIntoLife };

/**
 * Compatible wrapper: writes cohabit timeline, optionally projects into life day pack.
 */
export function appendCohabitEvent(input = {}) {
  const event = appendCohabitEventCore(input);
  if (!event || !dualWriteEnabled) return event;

  const characterId = String(input.characterId || event.characterId || "").trim();
  if (!characterId) return event;

  try {
    if (isLifeAdapterEnabled() || isFeatureEnabled("unifiedMemoryAdaptersV1") === true) {
      ensureLifeAdapterRegistered();
      // Light touch: refuse privateFacts / private class before dual-write projection.
      const shareClass = classifyLifeShareClass({
        visibility: input.visibility || input.meta?.visibility || "shared",
        discoverable: input.discoverable,
        privateFacts: input.privateFacts,
      });
      if (shareClass === "private") {
        return event;
      }
      for (const pf of input.privateFacts || []) {
        const gate = assertLifeFactShareable({
          text: pf,
          isPrivateFact: true,
          sourceField: "privateFacts",
        });
        if (!gate.ok) {
          /* strip — never project privateFacts into life confluence */
          input = { ...input, privateFacts: [] };
          break;
        }
      }
    }
    projectCohabitIntoLife(characterId, event);
  } catch {
    /* never break callers */
  }
  return event;
}

/**
 * Project recent life shared events back into cohabit-shaped rows (read model).
 */
export function projectLifeToCohabitRows(characterId, { limit = 12 } = {}) {
  const events = listLifeEvents(characterId).filter((e) => e.visibility === "shared");
  return events.slice(0, Math.max(1, Number(limit) || 12)).map((e) => ({
    id: `life-${e.id}`,
    at: e.occurredAt,
    appId: "life",
    kind: e.type || "note",
    summary: e.summary,
    characterId: e.characterId,
    meta: { source: "life", visibility: e.visibility },
  }));
}

/**
 * Combined prompt block: life limited summary preferred, cohabit as fallback supplement.
 */
export function formatBridgedTimelineBlock({ characterId = "", limit = 12 } = {}) {
  const lifeBlock = formatLifePromptSummary({ characterId, maxLines: limit });
  if (lifeBlock) return lifeBlock;
  return formatCohabitTimelineBlock({ characterId, limit });
}

export { listCohabitEvents, formatCohabitTimelineBlock };
