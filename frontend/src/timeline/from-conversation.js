/**
 * Emit Relationship Timeline events from companion chat turns (M3).
 * Rule-first extraction; does not replace Conversation V2 transcript.
 *
 * ## W8 authority split (proposal producer vs write)
 *
 * Single regex producer: `produceLegacyTimelineProposalsFromTurn`.
 *
 * | `turnUnderstandingV1` | Behavior |
 * |---|---|
 * | **on** | Proposal-only. No `appendTimelineEvent`. Return value includes `proposals`
 *   for TurnUnderstanding / deterministic input. Chat must not treat this as timeline authority. |
 * | **off** | Legacy thin writer: same proposals are appended via `appendTimelineEvent`
 *   (fallback until product enables TurnUnderstanding). |
 *
 * Prefer TurnUnderstanding (`deterministic-fallback.js`) as the understanding path when the
 * flag is on. This module must never dual-write alongside executed proposals.
 */

import { appendTimelineEvent } from "./repository.js";
import { freezeCompanionScope, requireCompanionScope } from "../memory/companion-scope.js";
import { isFeatureEnabled } from "../features/flags.js";

const DEFENSE_RE = /答辩|面试|考试|开题|汇报|presentation|interview|exam/i;
const TOMORROW_RE = /明天|明早|明晚|tomorrow/i;
const WEEKEND_RE = /周末|周六|周日|saturday|sunday|weekend/i;
const MOVIE_RE = /电影|看电影|movie/i;
const CORRECT_RE = /不要说|别再说|不喜欢被|别叫我|don't say|stop saying|don't call/i;
const REMEMBER_RE = /记住|记得|please remember|记住了/i;
const ASSISTANT_FOLLOWUP_RE = /结束以后告诉我|回来告诉我|考完告诉我|tell me (when|after)/i;

/**
 * @typedef {{
 *   eventType: string,
 *   idempotencyKey: string,
 *   actor?: string,
 *   payload: object,
 * }} LegacyTimelineProposal
 */

/**
 * Deterministic proposal producer — no storage writes.
 * Safe to call when turnUnderstandingV1 is on (proposal-only input) or off (legacy write input).
 *
 * @param {{
 *   companionId: string,
 *   userId?: string,
 *   userText?: string,
 *   assistantText?: string,
 *   sourceTurnId?: string,
 *   realityNamespace?: string,
 *   relationshipId?: string,
 *   conversationId?: string,
 *   characterId?: string,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   scope?: object,
 *   proposals: LegacyTimelineProposal[],
 *   base?: object,
 * }}
 */
export function produceLegacyTimelineProposalsFromTurn(input = {}) {
  const scopeCheck = requireCompanionScope(freezeCompanionScope({
    userId: input.userId,
    companionId: input.companionId || input.characterId,
    relationshipId: input.relationshipId,
    conversationId: input.conversationId || input.sourceTurnId,
  }));
  if (!scopeCheck.ok) {
    return { ok: false, reason: scopeCheck.reason, proposals: [] };
  }
  const scope = scopeCheck.scope;
  const companionId = scope.companionId;
  const userId = scope.userId;
  const userText = String(input.userText || "").trim();
  const assistantText = String(input.assistantText || "").trim();
  const sourceTurnId = String(input.sourceTurnId || "").trim();
  const realityNamespace = input.realityNamespace || "reality";
  if (!userText) return { ok: false, reason: "incomplete", proposals: [], scope };

  /** @type {LegacyTimelineProposal[]} */
  const proposals = [];
  const base = {
    companionId,
    userId,
    relationshipId: scope.relationshipId,
    actor: userId,
    principal: userId,
    source: "conversation_turn",
    sourceId: sourceTurnId,
    realityNamespace,
    evidenceRefs: [sourceTurnId].filter(Boolean),
  };

  if (DEFENSE_RE.test(userText) && (TOMORROW_RE.test(userText) || /今[天日]|today|下午|晚上/.test(userText))) {
    proposals.push({
      eventType: "schedule_commitment",
      idempotencyKey: `rel:schedule:${companionId}:${hashSlice(userText)}`,
      payload: {
        summary: summarizeSchedule(userText),
        needsFollowUp: true,
        followUpHint: "ask_result",
        raw: userText.slice(0, 200),
      },
    });
  }

  if (WEEKEND_RE.test(userText) && MOVIE_RE.test(userText)) {
    proposals.push({
      eventType: "shared_plan",
      idempotencyKey: `rel:plan_movie:${companionId}:${hashSlice(userText)}`,
      payload: {
        summary: "约好一起看电影",
        needsFollowUp: true,
        raw: userText.slice(0, 200),
      },
    });
  }

  if (CORRECT_RE.test(userText)) {
    proposals.push({
      eventType: "preference_correction",
      idempotencyKey: `rel:preference_correct:${companionId}:${hashSlice(userText)}`,
      payload: {
        summary: userText.slice(0, 120),
        needsFollowUp: false,
      },
    });
  }

  if (REMEMBER_RE.test(userText) && userText.length >= 4) {
    proposals.push({
      eventType: "user_remember_request",
      idempotencyKey: `rel:user_remember:${companionId}:${hashSlice(userText)}`,
      payload: {
        summary: userText.slice(0, 160),
        needsFollowUp: false,
      },
    });
  }

  if (ASSISTANT_FOLLOWUP_RE.test(assistantText)) {
    proposals.push({
      eventType: "followup_promise",
      idempotencyKey: `rel:assistant_followup:${companionId}:${hashSlice(userText || assistantText)}`,
      actor: companionId,
      payload: {
        summary: assistantText.slice(0, 160),
        needsFollowUp: true,
        relatedUserText: userText.slice(0, 120),
      },
    });
  }

  return { ok: true, proposals, scope, base };
}

/**
 * @param {{
 *   companionId: string,
 *   userId?: string,
 *   userText?: string,
 *   assistantText?: string,
 *   sourceTurnId?: string,
 *   realityNamespace?: string,
 * }} input
 */
export function emitRelationshipEventsFromTurn(input = {}) {
  const produced = produceLegacyTimelineProposalsFromTurn(input);

  // W3/W8: flag on → proposal-only; never append (TurnUnderstanding owns authority).
  if (isFeatureEnabled("turnUnderstandingV1")) {
    return {
      ok: true,
      events: [],
      proposals: produced.ok ? produced.proposals : [],
      skipped: "turnUnderstandingV1_proposal_only",
      note: "from-conversation is proposal-only when turnUnderstandingV1 is on; no timeline authority write",
      produceOk: produced.ok,
      produceReason: produced.reason,
    };
  }

  if (!produced.ok) {
    return { ok: false, reason: produced.reason, events: [], proposals: [] };
  }

  // Legacy fallback writer (flag off only): materialize proposals into timeline.
  const events = [];
  const base = produced.base;
  for (const proposal of produced.proposals) {
    const result = appendTimelineEvent({
      ...base,
      actor: proposal.actor || base.actor,
      eventType: proposal.eventType,
      idempotencyKey: proposal.idempotencyKey,
      payload: proposal.payload,
    });
    if (result.ok) events.push(result.value);
  }

  return {
    ok: true,
    events,
    proposals: produced.proposals,
    legacyWrite: true,
  };
}

function summarizeSchedule(text) {
  if (DEFENSE_RE.test(text)) {
    if (/答辩/.test(text)) return "用户有答辩安排，需要后续回访";
    if (/面试|interview/i.test(text)) return "用户有面试安排，需要后续回访";
    if (/考试|exam/i.test(text)) return "用户有考试安排，需要后续回访";
  }
  return `用户日程：${text.slice(0, 80)}`;
}

function hashSlice(text) {
  const s = String(text || "").replace(/\s+/g, " ").slice(0, 80);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `${Math.abs(h).toString(36)}_${s.length}`;
}
