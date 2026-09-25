/**
 * Appearance, action state machine, expressions, lip-sync hooks, voice + fallbacks.
 */

/** Minimum gate counts for a shippable character template */
export const MIN_ACTIONS = 6;
export const MIN_EXPRESSIONS = 8;

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   assetRef: string,
 *   loop?: boolean,
 *   next?: string,
 *   aspect?: string,
 *   transparentBg?: boolean,
 *   characterId?: string,
 * }} ActionDef
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   assetRef: string,
 *   aspect?: string,
 *   transparentBg?: boolean,
 *   characterId?: string,
 * }} ExpressionDef
 */

/**
 * @typedef {{
 *   portraitRef: string,
 *   actions: ActionDef[],
 *   expressions: ExpressionDef[],
 *   actionStateMachine: { initial: string, transitions: { from: string, to: string, on: string }[] },
 *   lipSync: { enabled: boolean, visemeMap: Record<string, string>, hookId: string },
 *   voice: { defaultVoiceId: string, mapping: Record<string, string>, fallbackVoiceId: string },
 *   fallbackAssets: { idle: string, portrait: string, silentVoice: string },
 * }} CharacterAppearance
 */

/**
 * @param {unknown} raw
 * @param {{ characterId?: string }} [opts]
 * @returns {{ ok: true, value: CharacterAppearance } | { ok: false, reason: string, errors: string[] }}
 */
export function normalizeAppearance(raw, opts = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "appearance_not_object", errors: ["appearance required"] };
  }
  const errors = [];
  const o = /** @type {Record<string, unknown>} */ (raw);
  const characterId = String(opts.characterId || o.characterId || "").trim();

  const portraitRef = String(o.portraitRef || "").trim();
  if (!portraitRef) errors.push("portraitRef required");

  const actions = Array.isArray(o.actions)
    ? o.actions.map((a) => normalizeAction(a, characterId)).filter(Boolean)
    : [];
  if (actions.length < MIN_ACTIONS) {
    errors.push(`actions_min_${MIN_ACTIONS}`);
  }

  const expressions = Array.isArray(o.expressions)
    ? o.expressions.map((e) => normalizeExpression(e, characterId)).filter(Boolean)
    : [];
  if (expressions.length < MIN_EXPRESSIONS) {
    errors.push(`expressions_min_${MIN_EXPRESSIONS}`);
  }

  const actionIds = new Set(actions.map((a) => a.id));
  const smRaw =
    o.actionStateMachine && typeof o.actionStateMachine === "object"
      ? o.actionStateMachine
      : {};
  const initial = String(smRaw.initial || actions[0]?.id || "idle").trim();
  if (actions.length && !actionIds.has(initial)) {
    errors.push("state_machine_initial_missing");
  }
  const transitions = Array.isArray(smRaw.transitions)
    ? smRaw.transitions
        .map((t) => ({
          from: String(t?.from || "").trim(),
          to: String(t?.to || "").trim(),
          on: String(t?.on || "").trim(),
        }))
        .filter((t) => t.from && t.to && t.on)
    : [];

  const lipRaw = o.lipSync && typeof o.lipSync === "object" ? o.lipSync : {};
  const lipSync = {
    enabled: Boolean(lipRaw.enabled),
    visemeMap:
      lipRaw.visemeMap && typeof lipRaw.visemeMap === "object" && !Array.isArray(lipRaw.visemeMap)
        ? Object.fromEntries(
            Object.entries(lipRaw.visemeMap).map(([k, v]) => [String(k), String(v)]),
          )
        : {},
    hookId: String(lipRaw.hookId || "lipsync.default").trim() || "lipsync.default",
  };

  const voiceRaw = o.voice && typeof o.voice === "object" ? o.voice : {};
  const defaultVoiceId = String(voiceRaw.defaultVoiceId || "").trim();
  const fallbackVoiceId = String(voiceRaw.fallbackVoiceId || defaultVoiceId || "").trim();
  if (!defaultVoiceId) errors.push("voice.defaultVoiceId required");
  const voiceMapping =
    voiceRaw.mapping && typeof voiceRaw.mapping === "object" && !Array.isArray(voiceRaw.mapping)
      ? Object.fromEntries(
          Object.entries(voiceRaw.mapping).map(([k, v]) => [String(k), String(v)]),
        )
      : {};

  const fbRaw = o.fallbackAssets && typeof o.fallbackAssets === "object" ? o.fallbackAssets : {};
  const fallbackAssets = {
    idle: String(fbRaw.idle || actions.find((a) => a.id === "idle")?.assetRef || "").trim(),
    portrait: String(fbRaw.portrait || portraitRef || "").trim(),
    silentVoice: String(fbRaw.silentVoice || fallbackVoiceId || "").trim(),
  };
  if (!fallbackAssets.idle) errors.push("fallbackAssets.idle required");
  if (!fallbackAssets.portrait) errors.push("fallbackAssets.portrait required");

  if (errors.length) {
    return { ok: false, reason: "invalid_appearance", errors };
  }

  return {
    ok: true,
    value: {
      portraitRef,
      actions,
      expressions,
      actionStateMachine: { initial, transitions },
      lipSync,
      voice: {
        defaultVoiceId,
        mapping: voiceMapping,
        fallbackVoiceId: fallbackVoiceId || defaultVoiceId,
      },
      fallbackAssets,
    },
  };
}

/**
 * @param {unknown} a
 * @param {string} characterId
 * @returns {ActionDef|null}
 */
function normalizeAction(a, characterId) {
  if (!a || typeof a !== "object") return null;
  const id = String(a.id || "").trim();
  const assetRef = String(a.assetRef || "").trim();
  if (!id || !assetRef) return null;
  return {
    id,
    label: String(a.label || id).trim(),
    assetRef,
    loop: Boolean(a.loop),
    next: a.next ? String(a.next).trim() : undefined,
    aspect: a.aspect ? String(a.aspect).trim() : undefined,
    transparentBg: a.transparentBg !== false,
    characterId: String(a.characterId || characterId || "").trim() || undefined,
  };
}

/**
 * @param {unknown} e
 * @param {string} characterId
 * @returns {ExpressionDef|null}
 */
function normalizeExpression(e, characterId) {
  if (!e || typeof e !== "object") return null;
  const id = String(e.id || "").trim();
  const assetRef = String(e.assetRef || "").trim();
  if (!id || !assetRef) return null;
  return {
    id,
    label: String(e.label || id).trim(),
    assetRef,
    aspect: e.aspect ? String(e.aspect).trim() : undefined,
    transparentBg: e.transparentBg !== false,
    characterId: String(e.characterId || characterId || "").trim() || undefined,
  };
}

/**
 * Advance action state machine.
 * @param {CharacterAppearance["actionStateMachine"]} sm
 * @param {string} current
 * @param {string} event
 */
export function transitionAction(sm, current, event) {
  const from = String(current || sm?.initial || "");
  const on = String(event || "");
  const hit = (sm?.transitions || []).find((t) => t.from === from && t.on === on);
  if (!hit) return { ok: false, reason: "no_transition", state: from };
  return { ok: true, state: hit.to };
}
