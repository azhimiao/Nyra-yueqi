/**
 * Project open Relationship Timeline commitments into Broker implicit blocks.
 */

import { isFeatureEnabled } from "../features/flags.js";
import { listTimelineEvents } from "../timeline/repository.js";
import { isEventEligibleForTodayContext } from "../temporal/contract.js";
import { applyExpiry } from "../temporal/expiry.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";

/**
 * @param {{
 *   characterId?: string,
 *   companionId?: string,
 *   relationshipId?: string,
 *   limit?: number,
 *   temporalSnapshot?: object,
 * }} input
 */
export function projectOpenTimelineCommitments(input = {}) {
  const companionId = String(input.companionId || input.characterId || "").trim();
  if (!companionId) return [];
  const relationshipId = String(input.relationshipId || "").trim();
  const limit = Math.max(1, Math.min(12, Number(input.limit) || 6));
  const temporalOn = isFeatureEnabled("temporalContextV1");
  const events = listTimelineEvents({
    companionId,
    relationshipId,
    limit: 40,
    ...(temporalOn ? { statusFilter: "today_context" } : {}),
  });

  const snapshot = input.temporalSnapshot || (temporalOn ? createTemporalSnapshotV1() : null);

  const open = events.filter((raw) => {
    if (!raw || raw.tombstone) return false;
    let event = raw;
    if (temporalOn && snapshot) {
      event = applyExpiry(raw, snapshot).event;
      if (!isEventEligibleForTodayContext(event, { allowProposed: false })) return false;
    }
    const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
    return payload.needsFollowUp === true
      || ["schedule_commitment", "shared_plan", "followup_promise"].includes(event.eventType);
  }).slice(0, limit);

  if (!open.length) return [];

  const lines = open.map((e) => {
    const summary = e.payload?.summary || e.eventType;
    return `- [${e.eventType}] ${summary}`;
  });

  return [{
    id: "relationship_timeline_open",
    title: "未完成共同约定 / 待回访",
    text: lines.join("\n"),
    source: "relationship.timeline",
    priority: 0.82,
  }];
}
