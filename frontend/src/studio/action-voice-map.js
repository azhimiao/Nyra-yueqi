/**
 * Action/voice mapping for chat / task / waiting / success / failure.
 */

import { ACTION_CONTEXTS } from "./schema.js";

/**
 * @typedef {{
 *   actionId: string,
 *   expressionId?: string,
 *   voiceLineId?: string,
 * }} ContextMapping
 */

/**
 * @typedef {Record<string, ContextMapping>} ActionVoiceMap
 */

/**
 * @param {unknown} raw
 * @param {{ actionIds: Set<string>, expressionIds: Set<string>, voiceIds: Set<string> }} catalog
 * @returns {{ ok: true, value: ActionVoiceMap } | { ok: false, reason: string, errors: string[] }}
 */
export function normalizeActionVoiceMap(raw, catalog) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "action_voice_map_not_object", errors: ["actionVoiceMap required"] };
  }
  const errors = [];
  /** @type {ActionVoiceMap} */
  const value = {};

  for (const ctx of ACTION_CONTEXTS) {
    const entry = raw[ctx];
    if (!entry || typeof entry !== "object") {
      errors.push(`missing_context:${ctx}`);
      continue;
    }
    const actionId = String(entry.actionId || "").trim();
    if (!actionId) {
      errors.push(`missing_action:${ctx}`);
      continue;
    }
    if (catalog.actionIds.size && !catalog.actionIds.has(actionId)) {
      errors.push(`unknown_action:${ctx}:${actionId}`);
    }
    const expressionId = entry.expressionId
      ? String(entry.expressionId).trim()
      : undefined;
    if (expressionId && catalog.expressionIds.size && !catalog.expressionIds.has(expressionId)) {
      errors.push(`unknown_expression:${ctx}:${expressionId}`);
    }
    const voiceLineId = entry.voiceLineId
      ? String(entry.voiceLineId).trim()
      : undefined;
    if (voiceLineId && catalog.voiceIds.size && !catalog.voiceIds.has(voiceLineId)) {
      errors.push(`unknown_voice:${ctx}:${voiceLineId}`);
    }
    value[ctx] = { actionId, expressionId, voiceLineId };
  }

  if (errors.length) {
    return { ok: false, reason: "invalid_action_voice_map", errors };
  }
  return { ok: true, value };
}

/**
 * Resolve presentation for a runtime context.
 * @param {ActionVoiceMap} map
 * @param {string} context
 * @param {{ fallbackActionId?: string }} [opts]
 */
export function resolveContextPresentation(map, context, opts = {}) {
  const ctx = String(context || "").trim();
  const hit = map?.[ctx];
  if (hit) return { ok: true, context: ctx, ...hit };
  const fallback = String(opts.fallbackActionId || map?.waiting?.actionId || "idle").trim();
  return {
    ok: true,
    context: ctx || "unknown",
    actionId: fallback,
    expressionId: map?.waiting?.expressionId,
    voiceLineId: map?.waiting?.voiceLineId,
    degraded: true,
  };
}
