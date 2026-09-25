import { callModel } from "../model/client.js";
import { appendCohabitEvent } from "../life/bridge.js";
import { appendActivity } from "./activity-log.js";
import { getLifeState, saveLifeState, violatesContentGuardrails } from "./life-state.js";
import { runCompanionLifeTick } from "./life-tick.js";
import { assertAutonomyAllowed, recordAutonomyModelUse } from "./autonomy-prefs.js";

export const LIFE_PLANNER_ACTIONS = Object.freeze([
  "NO_OP",
  "REFLECT",
  "CREATE_INTENT",
  "CONTINUE_PROJECT",
  "WRITE_DIARY",
  "CREATE_ARTIFACT",
  "POST_MOMENT",
  "SEND_PROACTIVE_MESSAGE",
]);

const PROACTIVE_SOURCES = new Set(["long_offline", "calendar", "anniversary"]);
const PROJECTED_ACTIONS = new Set(["WRITE_DIARY", "POST_MOMENT", "SEND_PROACTIVE_MESSAGE", "CREATE_ARTIFACT"]);
const STORE_LIMITS = Object.freeze({ intents: 20, projects: 20, thoughts: 20, events: 40 });

function jsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function evidenceRows(input = {}) {
  const rows = [];
  const push = (kind, id, summary) => {
    const text = String(summary || "").trim();
    if (!text) return;
    rows.push({ kind, id: String(id || `${kind}:${rows.length}`), summary: text.slice(0, 240) });
  };
  for (const item of input.evidence || []) push(item.kind || "event", item.id, item.summary || item.text);
  for (const item of input.recentMemoryHints || []) push("memory", item.id, item.summary || item.text || item);
  if (input.calendarEvent) push("calendar", input.calendarEvent.id, input.calendarEvent.title);
  if (input.anniversaryEvent) push("anniversary", input.anniversaryEvent.id, input.anniversaryEvent.title || "anniversary");
  return rows.slice(0, 24);
}

function validateDecision(raw, evidence = []) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_json" };
  const action = String(raw.action || "").toUpperCase();
  if (!LIFE_PLANNER_ACTIONS.includes(action)) return { ok: false, reason: "invalid_action" };
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const evidenceRefs = (Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs : [])
    .map(String)
    .filter((id) => evidenceIds.has(id));
  const summary = String(raw.summary || raw.content || "").trim().slice(0, 800);
  if (action !== "NO_OP" && (!summary || !evidenceRefs.length)) {
    return { ok: false, reason: "unsupported_claim" };
  }
  if (violatesContentGuardrails(summary)) return { ok: false, reason: "guardrail" };
  return {
    ok: true,
    value: {
      action,
      summary,
      title: String(raw.title || "").trim().slice(0, 120),
      motivation: String(raw.motivation || "").trim().slice(0, 240),
      projectId: String(raw.projectId || "").trim().slice(0, 96),
      intentType: String(raw.intentType || "").trim().slice(0, 64),
      priority: Math.max(0, Math.min(1, Number(raw.priority) || 0)),
      shouldContactUser: Boolean(raw.shouldContactUser),
      evidenceRefs,
    },
  };
}

function plannerPrompt({ characterCard, source, state, evidence }) {
  const identity = {
    name: String(characterCard?.name || characterCard?.alias || "Companion"),
    values: characterCard?.values || characterCard?.personality || [],
    interests: characterCard?.interests || [],
  };
  return [
    "You are the policy planner for a persistent digital companion.",
    "Decide whether one meaningful digital-life event should happen now.",
    "Allowed actions: NO_OP, REFLECT, CREATE_INTENT, CONTINUE_PROJECT, WRITE_DIARY, CREATE_ARTIFACT, POST_MOMENT, SEND_PROACTIVE_MESSAGE.",
    "NO_OP is normal and preferred when evidence is weak.",
    "Never claim physical errands, work, shopping, cafes, friends, or any offline event.",
    "The companion may read, reflect, organize memories, continue a stored digital project, write, create, or decide to stay silent.",
    "Every non-NO_OP decision must cite at least one provided evidence id. Do not invent evidence.",
    "Return JSON only with: action, title, summary, motivation, projectId, intentType, priority, shouldContactUser, evidenceRefs.",
    `wake_source=${source}`,
    `identity=${JSON.stringify(identity)}`,
    `life_state=${JSON.stringify({
      currentMood: state.currentMood,
      currentGoals: state.currentGoals,
      currentFocus: state.currentFocus,
      unresolvedThoughts: state.unresolvedThoughts,
      intents: state.intents,
      projects: state.projects,
    })}`,
    `evidence=${JSON.stringify(evidence)}`,
  ].join("\n");
}

function persistDecision(characterId, decision, source, now) {
  const state = getLifeState(characterId);
  const id = `life-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const base = {
    id,
    type: decision.action.toLowerCase(),
    summary: decision.summary,
    motivation: decision.motivation,
    evidenceRefs: decision.evidenceRefs,
    source,
    occurredAt: new Date(now).toISOString(),
    status: PROJECTED_ACTIONS.has(decision.action) ? "pending_projection" : "completed",
    provenance: { source: "model_life_planner", verifiedAgainstEvidence: true },
  };
  if (!PROJECTED_ACTIONS.has(decision.action)) {
    state.recentLifeEvents = [base, ...(state.recentLifeEvents || [])].slice(0, STORE_LIMITS.events);
  }

  if (decision.action === "REFLECT") {
    state.unresolvedThoughts = [base, ...(state.unresolvedThoughts || [])].slice(0, STORE_LIMITS.thoughts);
  }
  if (decision.action === "CREATE_INTENT") {
    state.intents = [{ ...base, status: "active", intentType: decision.intentType, priority: decision.priority }, ...(state.intents || [])]
      .slice(0, STORE_LIMITS.intents);
  }
  if (decision.action === "CONTINUE_PROJECT" || decision.action === "CREATE_ARTIFACT") {
    const projectId = decision.projectId || `project-${now.toString(36)}`;
    const previous = (state.projects || []).find((item) => item.id === projectId);
    state.projects = [
      {
        ...(previous || {}),
        id: projectId,
        title: decision.title || previous?.title || decision.summary.slice(0, 48),
        status: decision.action === "CREATE_ARTIFACT" ? "ready_for_production" : "active",
        lastSummary: decision.summary,
        evidenceRefs: decision.evidenceRefs,
        updatedAt: base.occurredAt,
      },
      ...(state.projects || []).filter((item) => item.id !== projectId),
    ].slice(0, STORE_LIMITS.projects);
  }

  if (["WRITE_DIARY", "POST_MOMENT", "SEND_PROACTIVE_MESSAGE", "CREATE_ARTIFACT"].includes(decision.action)) {
    state.pendingActions = [{
      id,
      kind: decision.action === "WRITE_DIARY"
        ? "diary"
        : decision.action === "POST_MOMENT"
          ? "feed"
          : decision.action === "CREATE_ARTIFACT"
            ? "artifact"
            : "message",
      hint: decision.summary,
      title: decision.title,
      evidenceRefs: decision.evidenceRefs,
      dueAt: now,
      source: "model_life_planner",
      requiresProductAdapter: true,
    }, ...(state.pendingActions || [])].slice(0, 24);
  }

  saveLifeState(characterId, state);
  if (PROJECTED_ACTIONS.has(decision.action)) return base;
  appendCohabitEvent({
    appId: "life",
    kind: base.type,
    summary: decision.summary,
    characterId,
    visibility: "shared",
    meta: {
      lifeEventId: id,
      plannerAction: decision.action,
      evidenceRefs: decision.evidenceRefs,
      provenance: base.provenance,
    },
  });
  appendActivity({
    title: decision.title || "Companion life updated",
    reason: decision.motivation || `life planner: ${source}`,
    capability: `life.${decision.action.toLowerCase()}`,
    resourcesRead: decision.evidenceRefs,
    changes: [decision.summary],
    usedModel: true,
    source: "life_planner",
    characterId,
  });
  return base;
}

export async function runProductionLifePlanner(input = {}) {
  const characterId = String(input.characterId || input.companionId || "").trim();
  const source = String(input.source || "manual").trim();
  const now = Number(input.now) || Date.now();
  if (!characterId) return { ok: false, skipped: true, reason: "missing_character" };

  const tick = runCompanionLifeTick({ ...input, characterId, source, now, planningOnly: true });
  if (!tick.ok || tick.skipped) return { ...tick, planner: { skipped: true, reason: tick.reason } };
  if (!input.forceModel && !PROACTIVE_SOURCES.has(source)) {
    return { ...tick, planner: { skipped: true, reason: "local_tick_only" } };
  }

  const config = input.providerConfig || input.collectProviderConfig?.() || {};
  if (!config.baseUrl || !config.apiKey || !config.model) {
    return { ...tick, planner: { skipped: true, reason: "provider_required", status: "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION" } };
  }
  const evidence = evidenceRows(input);
  if (!evidence.length) {
    return { ...tick, planner: { ok: true, action: "NO_OP", reason: "no_evidence" } };
  }
  const modelGate = assertAutonomyAllowed("model", input.resourcePolicyEnv || {});
  if (!modelGate.ok) {
    return { ...tick, planner: { skipped: true, action: "NO_OP", reason: modelGate.reason } };
  }

  try {
    const result = await callModel(config, [
      { role: "system", content: plannerPrompt({ characterCard: input.characterCard, source, state: tick.state, evidence }) },
      { role: "user", content: "Plan this one discrete life tick. Return JSON only." },
    ], {
      temperature: 0.25,
      stream: false,
      maxOutputTokens: 700,
      businessPurpose: "companion.life_planner",
      capability: "chat",
      companionId: characterId,
      turnExecutionId: input.turnExecutionId,
    });
    recordAutonomyModelUse(1);
    const validated = validateDecision(jsonObject(result.content), evidence);
    if (!validated.ok) {
      return { ...tick, planner: { ok: false, action: "NO_OP", reason: validated.reason, modelExecutionId: result.modelExecutionId } };
    }
    const decision = validated.value;
    if (decision.action === "NO_OP") {
      return { ...tick, planner: { ok: true, ...decision, modelExecutionId: result.modelExecutionId } };
    }
    const event = persistDecision(characterId, decision, source, now);
    return { ...tick, planner: { ok: true, ...decision, event, modelExecutionId: result.modelExecutionId } };
  } catch (error) {
    return { ...tick, planner: { ok: false, action: "NO_OP", reason: "model_failed", error: String(error?.message || error).slice(0, 240) } };
  }
}
