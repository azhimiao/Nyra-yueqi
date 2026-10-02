/**
 * Turn interpreter — model stub + deterministic fallback (plan §7.1).
 * understandTurn is the public entry; never blocks chat first token (caller fire-and-forget).
 */

import { createTurnUnderstandingV1 } from "../contracts/turn-understanding-v1.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";
import { freezeCompanionScope } from "../memory/companion-scope.js";
import { interpretDeterministic } from "./deterministic-fallback.js";
import { validateUnderstanding } from "./validator.js";
import { applyActionPolicyToAll } from "./action-policy.js";
import { summarizeUnderstanding } from "./inspector.js";

/**
 * Optional model path. If no modelInterpreter or it fails/returns empty, use deterministic.
 *
 * @param {{
 *   text?: string,
 *   turnId?: string,
 *   snapshot?: object,
 *   scope?: object,
 *   modelInterpreter?: (input: object) => Promise<object|null>|object|null,
 * }} input
 */
export async function interpretTurn(input = {}) {
  const text = String(input.text || "");
  if (typeof input.modelInterpreter === "function") {
    try {
      const modelResult = await input.modelInterpreter({
        text,
        turnId: input.turnId,
        snapshot: input.snapshot,
        scope: input.scope,
      });
      if (modelResult && typeof modelResult === "object") {
        return {
          ...modelResult,
          interpreter: "model",
        };
      }
    } catch {
      // fall through to deterministic
    }
  }
  return interpretDeterministic({
    text,
    turnId: input.turnId,
    snapshot: input.snapshot,
    scope: input.scope,
  });
}

/**
 * Full understand → validate → policy normalize pipeline.
 *
 * @param {{
 *   text?: string,
 *   turnId?: string,
 *   snapshot?: object,
 *   scope?: object,
 *   timezone?: string,
 *   locale?: string,
 *   modelInterpreter?: Function,
 *   clock?: object,
 * }} input
 */
export async function understandTurn(input = {}) {
  const text = String(input.text || "");
  const scope = freezeCompanionScope(input.scope || {});
  const snapshot =
    input.snapshot && typeof input.snapshot === "object"
      ? input.snapshot
      : createTemporalSnapshotV1(
        {
          timezone: input.timezone || scope.timezone,
          locale: input.locale || "zh-CN",
        },
        { clock: input.clock },
      );

  const turnId = String(input.turnId || "").trim()
    || `turn_${scope.companionId || "x"}_${stableTextKey(text)}`;

  const rawParts = await interpretTurn({
    text,
    turnId,
    snapshot,
    scope,
    modelInterpreter: input.modelInterpreter,
  });

  const draft = createTurnUnderstandingV1(
    {
      turnId,
      scope,
      temporalSnapshot: snapshot,
      conversationalIntent: rawParts.conversationalIntent,
      memoryCandidates: rawParts.memoryCandidates,
      temporalMentions: rawParts.temporalMentions,
      eventProposals: rawParts.eventProposals,
      actionProposals: rawParts.actionProposals,
      relationshipSignals: rawParts.relationshipSignals,
      webRequests: rawParts.webRequests,
      evidenceRefs: rawParts.evidenceRefs,
      interpreter: rawParts.interpreter || "deterministic",
    },
    { clock: input.clock },
  );

  const validated = validateUnderstanding(draft, text);
  const understanding = validated.understanding;
  understanding.actionProposals = applyActionPolicyToAll(understanding.actionProposals);

  return {
    ok: true,
    understanding,
    dropped: validated.dropped,
    summary: summarizeUnderstanding(understanding, { dropped: validated.dropped }),
  };
}

function stableTextKey(text) {
  const s = String(text || "").replace(/\s+/g, " ").slice(0, 80);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `${Math.abs(h).toString(36)}_${s.length}`;
}
