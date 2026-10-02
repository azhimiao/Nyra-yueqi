/**
 * Adventure V2 contracts and deterministic state reducer.
 * The model may propose effects; only this module is allowed to apply them.
 */

export const ADVENTURE_SCHEMA_VERSION = 2;
export const ADVENTURE_ACTION_MODES = Object.freeze(["do", "say", "story"]);
export const ADVENTURE_EFFECT_TYPES = Object.freeze([
  "set_flag",
  "add_item",
  "remove_item",
  "adjust_stat",
  "set_condition",
  "advance_quest",
  "move",
  "advance_time",
  "set_npc",
]);

const EFFECT_SET = new Set(ADVENTURE_EFFECT_TYPES);
const ACTION_MODE_SET = new Set(ADVENTURE_ACTION_MODES);

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeActionInput(input = {}) {
  const mode = ACTION_MODE_SET.has(input.mode) ? input.mode : "do";
  return {
    mode,
    text: clean(input.text, 1600),
  };
}

/** Validate an AdventurePackage without mutating it. */
export function validateAdventurePackage(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["package_not_object"] };
  const id = clean(raw.id, 100);
  if (!id) errors.push("missing_id");
  if (!clean(raw.title, 120)) errors.push("missing_title");
  if (!Array.isArray(raw.openings) || raw.openings.length < 1) errors.push("openings_empty");
  if (!Array.isArray(raw.locations) || raw.locations.length < 1) errors.push("locations_empty");
  const locationIds = new Set((raw.locations || []).map((item) => clean(item?.id, 100)).filter(Boolean));
  for (const opening of raw.openings || []) {
    if (!clean(opening?.id, 100)) errors.push("opening_missing_id");
    if (!locationIds.has(clean(opening?.startLocationId, 100))) {
      errors.push(`opening_location:${clean(opening?.id, 100) || "unknown"}`);
    }
  }
  for (const location of raw.locations || []) {
    const locationId = clean(location?.id, 100);
    if (!locationId) errors.push("location_missing_id");
    if (!clean(location?.name, 120)) errors.push(`location_name:${locationId}`);
    for (const exit of location?.exits || []) {
      if (!locationIds.has(clean(exit?.to, 100))) errors.push(`exit_unknown:${locationId}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function getLocation(pkg, locationId) {
  return (pkg?.locations || []).find((item) => item.id === locationId) || null;
}

export function getOpening(pkg, openingId) {
  return (pkg?.openings || []).find((item) => item.id === openingId) || null;
}

export function getQuestDefinition(pkg, questId) {
  return (pkg?.quests || []).find((item) => item.id === questId) || null;
}

export function getAvailableExits(pkg, state) {
  const location = getLocation(pkg, state?.locationId);
  return (location?.exits || []).filter((exit) => {
    const required = clean(exit?.requiresFlag, 100);
    return !required || Boolean(state?.flags?.[required]);
  });
}

function normalizeEffect(raw, pkg, runState) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "effect_not_object" };
  const type = clean(raw.type, 40);
  if (!EFFECT_SET.has(type)) return { ok: false, reason: `effect_type:${type || "missing"}` };

  if (type === "set_flag") {
    const key = clean(raw.key, 100);
    return key ? { ok: true, effect: { type, key, value: raw.value ?? true } } : { ok: false, reason: "flag_key" };
  }
  if (type === "add_item") {
    const item = raw.item && typeof raw.item === "object" ? raw.item : {};
    const id = clean(item.id || raw.itemId || item.name, 100);
    const name = clean(item.name || raw.name || id, 80);
    if (!id || !name) return { ok: false, reason: "item_invalid" };
    return {
      ok: true,
      effect: {
        type,
        item: { id, name, description: clean(item.description, 240), qty: Math.floor(clamp(item.qty ?? raw.qty, 1, 99, 1)) },
      },
    };
  }
  if (type === "remove_item") {
    const itemId = clean(raw.itemId, 100);
    return itemId
      ? { ok: true, effect: { type, itemId, qty: Math.floor(clamp(raw.qty, 1, 99, 1)) } }
      : { ok: false, reason: "item_id" };
  }
  if (type === "adjust_stat") {
    const stat = clean(raw.stat, 60);
    if (!stat || !Object.prototype.hasOwnProperty.call(runState?.stats || {}, stat)) {
      return { ok: false, reason: `stat_unknown:${stat}` };
    }
    return { ok: true, effect: { type, stat, delta: clamp(raw.delta, -20, 20, 0) } };
  }
  if (type === "set_condition") {
    const condition = clean(raw.condition, 80);
    return condition
      ? { ok: true, effect: { type, condition, active: raw.active !== false } }
      : { ok: false, reason: "condition" };
  }
  if (type === "advance_quest") {
    const questId = clean(raw.questId, 100);
    const objectiveId = clean(raw.objectiveId, 100);
    const status = ["active", "complete", "failed"].includes(raw.status) ? raw.status : "complete";
    const quest = (runState?.quests || []).find((item) => item.id === questId);
    if (!quest) return { ok: false, reason: `quest_unknown:${questId}` };
    if (objectiveId && !(quest.objectives || []).some((item) => item.id === objectiveId)) {
      return { ok: false, reason: `objective_unknown:${objectiveId}` };
    }
    return { ok: true, effect: { type, questId, objectiveId, status } };
  }
  if (type === "move") {
    const locationId = clean(raw.locationId, 100);
    return getLocation(pkg, locationId)
      ? { ok: true, effect: { type, locationId } }
      : { ok: false, reason: `location_unknown:${locationId}` };
  }
  if (type === "advance_time") {
    return { ok: true, effect: { type, hours: Math.floor(clamp(raw.hours, 1, 12, 1)) } };
  }
  const npcId = clean(raw.npcId, 100);
  if (!(pkg?.npcs || []).some((npc) => npc.id === npcId)) return { ok: false, reason: `npc_unknown:${npcId}` };
  return {
    ok: true,
    effect: {
      type,
      npcId,
      attitude: raw.attitude == null ? undefined : Math.floor(clamp(raw.attitude, -100, 100, 0)),
      note: clean(raw.note, 240),
    },
  };
}

function normalizeEffects(rawEffects, pkg, runState, errors, prefix) {
  const effects = [];
  for (const [index, raw] of (Array.isArray(rawEffects) ? rawEffects : []).slice(0, 20).entries()) {
    const normalized = normalizeEffect(raw, pkg, runState);
    if (!normalized.ok) errors.push(`${prefix || "effect"}:${index}:${normalized.reason}`);
    else effects.push(normalized.effect);
  }
  return effects;
}

/** Parse and validate the only model response shape Adventure V2 accepts. */
export function validateDmCandidate(raw, pkg, runState) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, value: null, errors: ["candidate_not_object"] };
  const narration = clean(raw.narration, 6000);
  if (!narration) errors.push("narration_empty");
  const choices = (Array.isArray(raw.choices) ? raw.choices : [])
    .slice(0, 4)
    .map((choice, index) => ({
      id: clean(choice?.id, 80) || `choice-${index + 1}`,
      label: clean(choice?.label || choice?.text, 160),
      mode: ACTION_MODE_SET.has(choice?.mode) ? choice.mode : "do",
      actionText: clean(choice?.actionText || choice?.label || choice?.text, 600),
    }))
    .filter((choice) => choice.label && choice.actionText);
  const effects = normalizeEffects(raw.effects, pkg, runState, errors, "effect");
  const checks = (Array.isArray(raw.checks) ? raw.checks : []).slice(0, 3).map((check, index) => {
    const stat = clean(check?.stat, 60);
    const id = clean(check?.id, 80) || `check-${index + 1}`;
    if (!Object.prototype.hasOwnProperty.call(runState?.stats || {}, stat)) errors.push(`check:${id}:stat_unknown`);
    return {
      id,
      label: clean(check?.label, 160) || "风险检定",
      stat,
      dc: Math.floor(clamp(check?.dc, 4, 24, 10)),
      successText: clean(check?.successText, 800) || "检定成功。",
      failureText: clean(check?.failureText, 800) || "检定失败，局势发生变化。",
      successEffects: normalizeEffects(check?.successEffects, pkg, runState, errors, `check:${id}:success`),
      failureEffects: normalizeEffects(check?.failureEffects, pkg, runState, errors, `check:${id}:failure`),
    };
  });
  return {
    ok: errors.length === 0,
    value: errors.length ? null : {
      id: clean(raw.id, 100) || `candidate-${Date.now().toString(36)}`,
      narration,
      choices,
      checks,
      effects,
      source: raw.source === "tutorial" ? "tutorial" : "model",
    },
    errors,
  };
}

function advanceClock(clock, hours) {
  let day = Math.max(1, Math.floor(Number(clock?.day) || 1));
  let hour = Math.max(0, Math.min(23, Math.floor(Number(clock?.hour) || 8)));
  hour += Math.max(1, Math.floor(Number(hours) || 1));
  while (hour >= 24) {
    hour -= 24;
    day += 1;
  }
  return { day, hour };
}

/** Apply already validated effects. Unknown effects are rejected, never partially guessed. */
export function applyAdventureEffects(pkg, currentState, rawEffects = []) {
  let state = clone(currentState || {});
  state.flags = { ...(state.flags || {}) };
  state.stats = { ...(state.stats || {}) };
  state.conditions = [...(state.conditions || [])];
  state.inventory = [...(state.inventory || [])];
  state.quests = clone(state.quests || []);
  state.npcs = { ...(state.npcs || {}) };
  const applied = [];
  const rejected = [];

  for (const raw of rawEffects) {
    const normalized = normalizeEffect(raw, pkg, state);
    if (!normalized.ok) {
      rejected.push(normalized.reason);
      continue;
    }
    const effect = normalized.effect;
    if (effect.type === "set_flag") state.flags[effect.key] = effect.value;
    if (effect.type === "add_item") {
      const existing = state.inventory.find((item) => item.id === effect.item.id);
      if (existing) existing.qty = Math.min(99, Number(existing.qty || 1) + effect.item.qty);
      else state.inventory.push(clone(effect.item));
    }
    if (effect.type === "remove_item") {
      state.inventory = state.inventory.flatMap((item) => {
        if (item.id !== effect.itemId) return [item];
        const qty = Number(item.qty || 1) - effect.qty;
        return qty > 0 ? [{ ...item, qty }] : [];
      });
    }
    if (effect.type === "adjust_stat") state.stats[effect.stat] = clamp(Number(state.stats[effect.stat]) + effect.delta, 0, 20, 0);
    if (effect.type === "set_condition") {
      state.conditions = effect.active
        ? [...new Set([...state.conditions, effect.condition])]
        : state.conditions.filter((item) => item !== effect.condition);
    }
    if (effect.type === "advance_quest") {
      state.quests = state.quests.map((quest) => {
        if (quest.id !== effect.questId) return quest;
        const objectives = (quest.objectives || []).map((objective) => (
          effect.objectiveId && objective.id === effect.objectiveId
            ? { ...objective, status: effect.status }
            : objective
        ));
        const complete = objectives.length > 0 && objectives.every((objective) => objective.status === "complete");
        return { ...quest, objectives, status: complete ? "complete" : effect.status === "failed" ? "failed" : quest.status || "active" };
      });
    }
    if (effect.type === "move") state.locationId = effect.locationId;
    if (effect.type === "advance_time") state.clock = advanceClock(state.clock, effect.hours);
    if (effect.type === "set_npc") {
      const previous = state.npcs[effect.npcId] || { attitude: 0, notes: [] };
      state.npcs[effect.npcId] = {
        ...previous,
        attitude: effect.attitude == null ? previous.attitude : effect.attitude,
        notes: effect.note ? [...(previous.notes || []), effect.note].slice(-8) : (previous.notes || []),
      };
    }
    applied.push(effect);
  }
  return { state, applied, rejected };
}

/** Resolve checks locally; inject rng for deterministic verification. */
export function resolveAdventureChecks(pkg, state, checks = [], rng = Math.random) {
  let nextState = clone(state);
  const resolutions = [];
  const applied = [];
  const rejected = [];
  for (const check of checks) {
    const roll = Math.floor(clamp(rng(), 0, 0.999999, 0) * 20) + 1;
    const statValue = Number(nextState.stats?.[check.stat] || 0);
    const total = roll + statValue;
    const success = total >= check.dc;
    const result = applyAdventureEffects(pkg, nextState, success ? check.successEffects : check.failureEffects);
    nextState = result.state;
    applied.push(...result.applied);
    rejected.push(...result.rejected);
    resolutions.push({
      id: check.id,
      label: check.label,
      stat: check.stat,
      dc: check.dc,
      roll,
      statValue,
      total,
      success,
      text: success ? check.successText : check.failureText,
    });
  }
  return { state: nextState, resolutions, applied, rejected };
}

// V1 compatibility exports used by older imports.
export const validateWorld = validateAdventurePackage;
export const getNode = getLocation;
export function visibleExits(node, flags = {}) {
  return (node?.exits || []).filter((exit) => !exit.hideWithoutFlag || !exit.requiresFlag || Boolean(flags[exit.requiresFlag]));
}
export function exitAvailable(exit, flags = {}) {
  return !exit?.requiresFlag || Boolean(flags[exit.requiresFlag]);
}
export function eventActive(event, flags = {}) {
  if (!event) return false;
  if (event.requiresFlag && !flags[event.requiresFlag]) return false;
  return !(event.once && flags[`event_done:${event.id || "default"}`]);
}
