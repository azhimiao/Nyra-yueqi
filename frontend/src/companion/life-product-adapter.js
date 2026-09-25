import { requestCompanionDiary } from "./diary-action.js";
import { getLifeState, saveLifeState } from "./life-state.js";
import { postMomentForCharacter } from "../moments/auto-post.js";
import { runProactiveAction } from "../proactive/pipeline.js";
import { assertAutonomyAllowed, recordAutonomyProactiveUse } from "./autonomy-prefs.js";
import { appendCohabitEvent } from "../life/bridge.js";
import { appendActivity } from "./activity-log.js";

function completePendingAction(companionId, planner, projection = {}) {
  const eventId = planner?.event?.id;
  if (!eventId) return;
  const state = getLifeState(companionId);
  state.pendingActions = (state.pendingActions || []).filter((item) => item.id !== eventId);
  state.recentLifeEvents = [{
    ...(planner.event || {}),
    status: "completed",
    projectedAt: new Date().toISOString(),
    projection: {
      action: planner.action,
      diaryId: projection.diaryId || "",
      momentId: projection.momentId || "",
      messageId: projection.messageId || "",
      artifactId: projection.artifactId || "",
    },
  }, ...(state.recentLifeEvents || [])].slice(0, 40);
  saveLifeState(companionId, state);
}

function baseResult(action, extra = {}) {
  return { ok: false, action, projected: false, ...extra };
}

/** Project a planner decision onto an existing product surface. */
export async function projectLifePlannerDecision(lifeResult, deps = {}) {
  const planner = lifeResult?.planner || {};
  const action = String(planner.action || "NO_OP");
  const companionId = String(
    deps.companionId || deps.getActiveCharacterId?.() || lifeResult?.state?.characterId || "",
  ).trim();

  if (!planner.ok || action === "NO_OP") {
    return baseResult(action, { reason: planner.reason || "no_projection_required" });
  }
  if (!companionId) return baseResult(action, { reason: "missing_companion" });

  const character = deps.collectCharacterProfile?.() || { id: companionId };
  character.id ||= companionId;
  let result;
  if (action === "WRITE_DIARY") {
    const gate = assertAutonomyAllowed("diary", deps.resourcePolicyEnv || {});
    if (!gate.ok) return baseResult(action, { reason: gate.reason });
    const diaryProducer = deps.diaryProducer || requestCompanionDiary;
    result = await diaryProducer({
      ...(deps.buildDiaryDeps?.() || {}),
      companionId,
      characterProfile: character,
      collectProviderConfig: deps.collectProviderConfig,
      overwrite: false,
    });
  } else if (action === "POST_MOMENT") {
    const gate = assertAutonomyAllowed("feed", deps.resourcePolicyEnv || {});
    if (!gate.ok) return baseResult(action, { reason: gate.reason });
    const momentProducer = deps.momentProducer || postMomentForCharacter;
    const moment = await momentProducer(character, {
      hint: planner.summary,
      shareWithCompanion: true,
      requireModel: true,
    });
    result = moment ? { ok: true, momentId: moment.id } : { ok: false, reason: "moment_not_created" };
  } else if (action === "SEND_PROACTIVE_MESSAGE") {
    const gate = assertAutonomyAllowed("message", deps.resourcePolicyEnv || {});
    if (!gate.ok) return baseResult(action, { reason: gate.reason });
    const proactiveProducer = deps.proactiveProducer || runProactiveAction;
    result = await proactiveProducer({
      id: planner.event?.id || `life-message-${Date.now()}`,
      kind: "character_wake",
      wakeOnce: true,
      sourceId: planner.event?.id || "",
    }, {
      ...deps,
      targetCompanionId: companionId,
      gateContinuity: false,
      wakeSource: "life_planner",
    });
  } else if (action === "CREATE_ARTIFACT") {
    return baseResult(action, { reason: "artifact_producer_required", retainedPending: true });
  } else {
    return { ok: true, action, projected: false, reason: "internal_life_state_only" };
  }

  if (!result?.ok) return baseResult(action, { reason: result?.reason || "projection_failed", result });
  completePendingAction(companionId, planner, result);
  appendCohabitEvent({
    appId: "life",
    kind: String(action).toLowerCase(),
    summary: planner.summary,
    characterId: companionId,
    visibility: "shared",
    meta: {
      lifeEventId: planner.event?.id || "",
      plannerAction: action,
      evidenceRefs: planner.evidenceRefs || [],
      projection: result,
      provenance: planner.event?.provenance || { source: "model_life_planner" },
    },
  });
  appendActivity({
    title: planner.title || "Companion life action completed",
    reason: planner.motivation || `life projection: ${action}`,
    capability: `life.${String(action).toLowerCase()}`,
    resourcesRead: planner.evidenceRefs || [],
    changes: [planner.summary || action],
    usedModel: true,
    source: "life_product_adapter",
    characterId: companionId,
  });
  if (["WRITE_DIARY", "POST_MOMENT"].includes(action)) {
    recordAutonomyProactiveUse(1);
  }
  return { ok: true, action, projected: true, result };
}
