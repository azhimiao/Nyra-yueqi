/**
 * Director adapter — converts model/offline output into ScenarioTurn.
 * Single path for theater player; no parallel turn shapes.
 *
 * W0 telemetry: every production turn must stamp
 * `run.directorState.lastGenerationSource` ∈
 *   "model" | "offline_fixed" | "offline_fallback"
 * and emit `yueqi:director-generation`. W2 makes offline_fallback illegal.
 */

import { getCharacterSync } from "../../characters/store.js";
import { buildCastPromptBlock, normalizeCast } from "../cast.js";
import { getScript } from "../store.js";
import {
  getPresetBeatById,
  getPresetBeats,
  getPresetScriptMeta,
} from "../presets.js";
import {
  normalizeScenarioTurn,
  safeOfflineTurn,
  SCENARIO_TURN_SCHEMA_VERSION,
} from "./schema.js";
import { applyActionWhitelist } from "./action-mapper.js";
import { buildContextEnvelope, formatImplicitEnvelope } from "../../context/index.js";
import { buildLanguageContext, formatLanguageDirective } from "../../i18n/language-context.js";
import { renderPrompt } from "../../prompts/registry.js";

/** @typedef {"model"|"offline_fixed"|"offline_fallback"} DirectorGenerationSource */

export const DIRECTOR_GENERATION_EVENT = "yueqi:director-generation";

/**
 * Stamp run.directorState + dispatch/console structured generation source.
 * @param {object|null|undefined} run
 * @param {{
 *   source: DirectorGenerationSource,
 *   reason?: string,
 *   scriptId?: string,
 * }} detail
 * @returns {{ source: string, scriptId: string, reason: string, runId: string }}
 */
export function markDirectorGeneration(run, detail = {}) {
  const source = String(detail.source || "offline_fixed");
  const reason = String(detail.reason || "");
  const scriptId = String(detail.scriptId || run?.scriptId || "");
  const runId = String(run?.id || "");
  const payload = { source, scriptId, reason, runId };

  if (run && typeof run === "object") {
    if (!run.directorState || typeof run.directorState !== "object") {
      run.directorState = {};
    }
    run.directorState.lastGenerationSource = source;
    run.directorState.lastGenerationReason = reason;
  }

  if (source === "offline_fallback") {
    console.warn(`[${DIRECTOR_GENERATION_EVENT}]`, payload);
  } else {
    console.info(`[${DIRECTOR_GENERATION_EVENT}]`, payload);
  }

  try {
    if (typeof document !== "undefined" && typeof CustomEvent === "function") {
      document.dispatchEvent(new CustomEvent(DIRECTOR_GENERATION_EVENT, { detail: payload }));
    } else if (typeof document !== "undefined" && typeof document.dispatchEvent === "function") {
      document.dispatchEvent({ type: DIRECTOR_GENERATION_EVENT, detail: payload });
    }
  } catch {
    /* non-DOM / test hosts */
  }

  return payload;
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Load selected lore entry bodies for a run (worldbook store).
 * @param {object} run
 * @param {{ loreEntries?: object[] }} [options]
 * @returns {Promise<object[]>}
 */
export async function loadRunLoreEntries(run, options = {}) {
  if (Array.isArray(options.loreEntries)) {
    return options.loreEntries.filter(Boolean);
  }
  const ids = Array.isArray(run?.loreEntryIds)
    ? run.loreEntryIds.map(String).filter(Boolean)
    : [];
  if (!ids.length) return [];
  try {
    const { listWorldbookEntries } = await import("../../worldbook/store.js");
    const all = await listWorldbookEntries();
    const want = new Set(ids);
    return (all || []).filter((entry) => want.has(String(entry.id)));
  } catch {
    return [];
  }
}

async function loadConversationHistory(run) {
  try {
    const mod = await import("../../conversation/index.js");
    const sessionId = String(run?.conversationSessionId || run?.sessionId || "").trim();
    if (!sessionId || typeof mod.getSharedHistory !== "function") return "";
    const turns = mod.getSharedHistory(sessionId, { limit: 8 });
    if (!Array.isArray(turns) || !turns.length) return "";
    return turns
      .map((t) => {
        const role = t.role === "user" ? "用户" : t.role === "assistant" ? "对方" : "旁白";
        return `${role}：${t.content || t.text || ""}`;
      })
      .filter((line) => !line.endsWith("："))
      .join("\n");
  } catch {
    /* Conversation Runtime optional */
  }
  return "";
}

async function loadMemorySummary(run, userInput = "") {
  const script = getScript(run?.scriptId);
  const query = [script?.title, script?.premise, userInput].filter(Boolean).join(" ").trim()
    || "共同经历";
  const characterId = String(
    run?.cast?.leadId || run?.characterId || "",
  ).trim();

  // V0.5: prefer Context Graph retrieve (character-isolated)
  if (characterId) {
    try {
      const { retrieveContext, formatContextGraphBlock } = await import("../../context/index.js");
      const res = retrieveContext({
        characterId,
        query,
        limit: 3,
        forProactive: false,
        markUsed: false,
        includeFrozen: false,
      });
      if (res?.ok && res.items?.length) {
        const block = formatContextGraphBlock(res.items);
        if (block) {
          return block
            .replace(/^个人上下文图谱（仅本角色）：\n/, "")
            .trim();
        }
      }
    } catch {
      /* fall through to legacy RAG */
    }
  }

  try {
    const { searchMemories } = await import("../../memory/rag.js");
    const hits = await searchMemories(query, { topK: 3 });
    if (!Array.isArray(hits) || !hits.length) return "";
    return hits
      .slice(0, 3)
      .map((item) => `- ${String(item.summary || item.body || item.text || item.rawText || "").trim()}`)
      .filter((line) => line.length > 2)
      .join("\n");
  } catch {
    return "";
  }
}

function formatLoreBlock(entries) {
  if (!entries?.length) return "";
  return entries
    .map((entry) => {
      const title = entry.title || entry.name || entry.id || "设定";
      const body = String(entry.content || entry.body || "").trim();
      return body ? `【${title}】\n${body}` : `【${title}】`;
    })
    .join("\n\n");
}

/**
 * Build director chat messages. Injects lore (mandatory when loreEntryIds set),
 * optional conversation history, optional memory summary.
 * @param {object} run
 * @param {string} [userInput]
 * @param {{ loreEntries?: object[] }} [options]
 */
export async function buildDirectorMessages(run, userInput = "", options = {}) {
  const script = getScript(run.scriptId);
  const cast = normalizeCast(run.cast);
  const lead = getCharacterSync(cast.leadId);
  const leadName = lead?.name || "主演";
  const recent = (run.beats || []).slice(-12).map((beat) => {
    if (beat.kind === "user" || beat.kind === "choice") return `用户：${beat.text}`;
    if (beat.kind === "npc" || beat.kind === "dialogue") return `${leadName}：${beat.text}`;
    return `旁白：${beat.text}`;
  }).join("\n");

  const loreEntries = await loadRunLoreEntries(run, options);
  const loreBlock = formatLoreBlock(loreEntries);
  const participantIds = [...new Set([
    cast.leadId,
    ...(Array.isArray(cast.memberIds) ? cast.memberIds : []),
    ...(Array.isArray(cast.supportIds) ? cast.supportIds : []),
  ].map((id) => String(id || "").trim()).filter(Boolean))];
  const contextEnvelope = await buildContextEnvelope({
    purpose: "scenario",
    appId: "scenario",
    characterId: String(cast.leadId || run.characterId || "").trim(),
    chatSessionId: `scenario:${run.id || run.scriptId || "active"}`,
    conversationSessionId: String(run.conversationSessionId || ""),
    conversationKind: "scenario",
    participantIds,
    branchId: String(run.branchId || ""),
    currentInput: String(userInput || ""),
    turnIntent: String(userInput || "").trim() ? "user_message" : "continue",
    includeWorldbook: false,
    includePalace: false,
    includeStable: false,
    includeCohabit: false,
    additionalImplicitBlocks: [
      loreBlock ? {
        id: "scenario_lore",
        source: "scenario.selected_worldbook",
        priority: 95,
        text: `选中的世界书 / 设定（必须遵守）：\n${loreBlock}`,
      } : null,
      (cast.persona || cast.lead?.persona) ? {
        id: "scenario_cast_reset",
        source: "scenario.cast",
        priority: 96,
        text: `本场角色（与日常陪伴分离）：\n${cast.persona || cast.lead.persona}`,
      } : null,
    ].filter(Boolean),
  });
  const conversationBlock = (contextEnvelope.historyMessages || [])
    .map((turn) => `${turn.role === "user" ? "用户" : "对方"}：${turn.content}`)
    .join("\n");
  const managedContext = formatImplicitEnvelope(contextEnvelope, { excludeIds: [] });

  const system = [
    String(renderPrompt("scenario.director", { language: buildLanguageContext() })),
    "只输出 JSON，不要 markdown。",
    "契约：{",
    `  "schemaVersion": ${SCENARIO_TURN_SCHEMA_VERSION},`,
    '  "narration": "可选旁白",',
    '  "dialogue": "主演台上对白（必填）",',
    '  "emotion": "neutral|warm|shy|happy|sad",',
    '  "expressionId": "neutral|soft_smile|shy|comfort_look",',
    '  "actionId": "talking_default|greet|comfort|react_tap|lean_close|shy_look_away",',
    '  "backgroundId": "可选",',
    '  "choices": [{"id":"a","text":"...","intent":"..."}],',
    '  "stateDelta": {"tension":-1|0|1,"intimacy":-1|0|1,"trust":-1|0|1,"flags":[]},',
    '  "memoryCandidate": "可选一句可写日记的摘要",',
    '  "suggestEnding": false',
    "}",
    "choices 给 2～4 个短选项。对白使用当前对话语言，短而有戏。每回合最多一个主动作。",
    "用户选项与自由说必须改变后续节拍；禁止无视选择只推进同一条线。",
    buildCastPromptBlock(cast),
    script?.castHint ? `演技提示：${script.castHint}` : "",
    "所有场景事实、记忆和历史只以 Context Broker 给出的内容为准；不要补写未提供的共同经历。",
    formatLanguageDirective(buildLanguageContext()),
  ].filter(Boolean).join("\n");

  const user = [
    `剧本：${script?.title || run.scriptId}`,
    `设定：${script?.premise || ""}`,
    `张力：${run.directorState?.tension ?? 1}`,
    conversationBlock ? `会话历史：\n${conversationBlock}` : "",
    managedContext ? `本轮受管上下文：\n${managedContext}` : "",
    "近期节拍：",
    conversationBlock ? "（已由统一会话历史提供，不重复注入节拍）" : (recent || "（刚开幕）"),
    "",
    `本轮用户行动：${userInput || "（静静看着）"}`,
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Parse model output into ScenarioTurn.
 * W2: by default does NOT invent offline dialogue on parse failure.
 * Pass `{ allowSilentOffline: true }` only for explicit demo / legacy verify paths.
 */
export function parseDirectorOutput(raw, ctx = {}) {
  const allowSilentOffline = Boolean(ctx.allowSilentOffline);
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") {
    if (allowSilentOffline) {
      return finalizeTurn(safeOfflineTurn(ctx), ctx);
    }
    return {
      ok: false,
      offline: true,
      error: "unparseable_model_output",
      dialogue: "",
      narration: "",
      choices: [],
    };
  }

  const tension = Number(ctx.tension ?? 1) || 1;
  const delta = Number(parsed.stateDelta?.tension ?? parsed.tensionDelta);
  let nextTension = tension;
  if (delta === -1 || delta === 0 || delta === 1) {
    nextTension = Math.max(0, Math.min(3, tension + delta));
  }

  // Prefer Experience V2 envelope when present (display/performance).
  const display = parsed.display && typeof parsed.display === "object" ? parsed.display : null;
  const performance = parsed.performance && typeof parsed.performance === "object"
    ? parsed.performance
    : null;

  const normalized = normalizeScenarioTurn({
    ...parsed,
    dialogue: display?.dialogue || parsed.dialogue || parsed.reply,
    narration: display?.narration || parsed.narration,
    emotion: performance?.emotion || parsed.emotion,
    expressionId: performance?.expressionId || parsed.expressionId,
    actionId: performance?.actionId || parsed.actionId,
    backgroundId: performance?.backgroundId || parsed.backgroundId || ctx.backgroundId || "",
    soundId: performance?.soundId || parsed.soundId,
    camera: performance?.camera || parsed.camera,
    choices: parsed.suggestedActions || parsed.choices,
    sceneId: parsed.sceneId || ctx.sceneId || "",
    speakerId: parsed.speakerId || ctx.speakerId || "",
    stateDelta: {
      tension: Number.isFinite(delta) ? delta : 0,
      intimacy: Number(parsed.stateDelta?.intimacy) || 0,
      trust: Number(parsed.stateDelta?.trust) || 0,
      flags: parsed.stateDelta?.flags || parsed.scenePatch?.flags || [],
    },
  });

  if (!normalized.value) {
    if (allowSilentOffline) {
      return finalizeTurn(safeOfflineTurn(ctx), { ...ctx, tension: nextTension });
    }
    return {
      ok: false,
      offline: true,
      error: "invalid_model_turn",
      dialogue: "",
      narration: "",
      choices: [],
      _errors: normalized.errors || [],
    };
  }

  const turn = {
    ...normalized.value,
    _tension: nextTension,
    offline: false,
    ok: true,
  };
  return finalizeTurn(turn, ctx);
}

/**
 * True when caller may use offlineDirectorTurn (never default on production).
 * @param {{ devDemo?: boolean, forceOfflineFixed?: boolean, forceOffline?: boolean }} meta
 */
export function allowOfflineDirector(meta = {}) {
  return Boolean(meta.devDemo || meta.forceOfflineFixed);
}

function resolveChoiceKey(run, userInput = "", options = {}) {
  if (options.choiceId) return String(options.choiceId);
  const beats = run.beats || [];
  for (let i = beats.length - 1; i >= 0; i -= 1) {
    const beat = beats[i];
    if (beat?.kind === "choice" && beat.choiceId) return String(beat.choiceId);
    if (beat?.kind === "user" || beat?.kind === "choice") break;
  }
  const hint = String(userInput || "").trim();
  if (!hint) return "";
  if (/靠近|挤一|伞下/.test(hint)) return "lean-in";
  if (/问|多久|为什么|怎么/.test(hint)) return "ask";
  if (/沉默|不说话|静静|不说/.test(hint)) return "silence";
  if (/真心|坦白|说一句|告诉你/.test(hint)) return "share";
  if (/再站|再等|不急|停留/.test(hint)) return "stay";
  return "";
}

function resolveNextBeatId(currentBeat, choiceKey, hint) {
  if (!currentBeat) return "";
  const text = String(hint || "");
  if (Array.isArray(currentBeat.nextByKeyword) && text) {
    for (const rule of currentBeat.nextByKeyword) {
      const keys = rule.keys || [];
      if (keys.some((k) => text.includes(k))) return rule.beatId;
    }
  }
  const map = currentBeat.nextByChoice || {};
  if (choiceKey && map[choiceKey]) return map[choiceKey];
  if (map._default) return map._default;
  return "";
}

function applyChoiceVariant(beat, choiceKey) {
  if (!beat || !choiceKey || !beat.byChoice?.[choiceKey]) return beat;
  return { ...beat, ...beat.byChoice[choiceKey] };
}

function applyFreeSayFlavor(beat, hint, name) {
  if (!beat || !hint) return beat;
  const text = String(hint);
  let dialogue = String(beat.dialogue || "");
  let narration = String(beat.narration || "");
  let actionId = beat.actionId;
  let expressionId = beat.expressionId;
  let emotion = beat.emotion;

  if (/靠近|挤|伞/.test(text)) {
    dialogue = `${name}把伞又往你这边偏了偏：「……你说靠近，我就听。」`;
    actionId = "lean_close";
    expressionId = "soft_smile";
    emotion = "warm";
    narration = narration ? `${narration}雨丝更贴着肩了。` : narration;
  } else if (/问|多久|车/.test(text)) {
    dialogue = `${name}认真想了想：「你问的话……我答。误点还早，我们有时间。」`;
    actionId = "thinking";
    expressionId = "neutral";
    emotion = "neutral";
  } else if (/沉默|不说话|静/.test(text)) {
    dialogue = `${name}点点头，只把声音放低：「那就不说。雨替我们说。」`;
    actionId = "shy_look_away";
    expressionId = "shy";
    emotion = "shy";
  } else if (/真心|爱|喜欢|想你/.test(text)) {
    dialogue = `${name}耳尖微红：「……你把真心话说出来了。那我也不藏。」`;
    actionId = "lean_close";
    expressionId = "soft_smile";
    emotion = "warm";
  } else if (text.length >= 2) {
    // Distinct line that embeds free-say so different texts yield different output
    dialogue = `${name}听完，轻轻应道：「我听见了——「${text.slice(0, 24)}」。雨里这句话，我会记得。」`;
    narration = narration
      ? `${narration}（你：${text.slice(0, 40)}）`
      : `你说：「${text.slice(0, 40)}」`;
  }

  return {
    ...beat,
    dialogue,
    narration,
    actionId,
    expressionId,
    emotion,
  };
}

function fillBeatTemplates(beat, name, hint) {
  const dialogue = String(beat.dialogue || "").replace(/\{name\}/g, name);
  const narration = String(beat.narration || "")
    .replace(/\{name\}/g, name)
    .replace(/\{hint\}/g, hint || "静静看着");
  return { ...beat, dialogue, narration };
}

function beatToTurn(beat, run, cast, meta, { cursor, nodeId, tensionBase }) {
  const turn = normalizeScenarioTurn({
    schemaVersion: SCENARIO_TURN_SCHEMA_VERSION,
    sceneId: run.scriptId,
    beatId: beat.beatId || `beat-${cursor}`,
    narration: beat.narration,
    speakerId: cast.leadId,
    dialogue: beat.dialogue,
    emotion: beat.emotion || "warm",
    expressionId: beat.expressionId || "soft_smile",
    actionId: beat.actionId || "talking_default",
    backgroundId: beat.backgroundId || meta.backgroundId || "",
    voice: { enabled: true, style: beat.voiceStyle || "soft" },
    camera: beat.camera || { shot: "medium", focus: "lead", transition: "soft" },
    choices: (beat.choices || []).map((c) => ({
      id: c.id,
      text: c.text || c.label,
      intent: c.intent || "",
    })),
    stateDelta: beat.stateDelta || { tension: 0, intimacy: 0, trust: 0, flags: [] },
    memoryCandidate: beat.memoryCandidate || "",
    suggestEnding: Boolean(beat.suggestEnding),
    offline: true,
  }).value;

  const tension = Math.max(
    0,
    Math.min(3, tensionBase + Number(turn?.stateDelta?.tension || 0)),
  );
  return finalizeTurn({
    ...turn,
    _tension: tension,
    _beatCursor: cursor,
    _beatNodeId: nodeId || beat.beatId || "",
  }, {
    speakerId: cast.leadId,
    sceneId: run.scriptId,
    backgroundId: meta.backgroundId,
    characterId: cast.leadId,
  });
}

/**
 * Deterministic offline director for demos / verify / explicit forceOfflineFixed.
 * Graph scripts (夜雨车站): choiceId / free-say keywords change next content.
 *
 * W2: MUST NOT be used as silent model-failure fallback on the production
 * immersive path. Callers must pass `devDemo` or `forceOfflineFixed`.
 * Emitting `offline_fallback` as a successful formal advance is illegal.
 */
export function offlineDirectorTurn(run, userInput = "", options = {}) {
  if (options.requireExplicitFlag && !allowOfflineDirector(options)) {
    throw new Error("offlineDirectorTurn_requires_devDemo_or_forceOfflineFixed");
  }
  const cast = normalizeCast(run.cast);
  const lead = getCharacterSync(cast.leadId);
  const name = lead?.name || "TA";
  const script = getScript(run.scriptId);
  const meta = getPresetScriptMeta(run.scriptId) || {};
  const scripted = getPresetBeats(run.scriptId) || [];
  const hint = String(userInput || "").trim();
  const choiceKey = resolveChoiceKey(run, userInput, options);
  const tensionBase = Number(run.directorState?.tension) || 1;

  let turn;
  if (scripted.length && !options.forceGeneric) {
    if (meta.branchMode || scripted.some((b) => b.nextByChoice)) {
      turn = offlineGraphTurn(run, {
        scripted,
        meta,
        cast,
        name,
        hint,
        choiceKey,
        tensionBase,
        options,
      });
    } else {
      turn = offlineLinearTurn(run, {
        scripted,
        meta,
        cast,
        name,
        hint,
        choiceKey,
        tensionBase,
        options,
      });
    }
  } else {
    turn = offlineGenericTurn(run, {
      cast,
      name,
      hint,
      meta,
      script,
      tensionBase,
    });
  }

  const source = options.generationSource === "offline_fallback"
    ? "offline_fallback"
    : (options.generationSource === "model" ? "model" : "offline_fixed");
  const reason = String(
    options.generationReason
      || (source === "offline_fallback" ? "offline_fallback_unspecified" : "offline_director_turn"),
  );
  markDirectorGeneration(run, { source, reason, scriptId: run?.scriptId });
  if (turn && typeof turn === "object") {
    turn._generationSource = source;
    turn._generationReason = reason;
  }
  return turn;
}

function offlineGraphTurn(run, ctx) {
  const {
    scripted, meta, cast, name, hint, choiceKey, tensionBase, options,
  } = ctx;
  const currentId = run.directorState?.beatNodeId || "";
  let beat;

  if (!currentId) {
    const startId = meta.startBeatId || scripted[0]?.beatId;
    beat = getPresetBeatById(run.scriptId, startId) || scripted[0];
  } else {
    const current = getPresetBeatById(run.scriptId, currentId);
    let nextId = resolveNextBeatId(current, choiceKey, hint);
    if (!nextId && current?.nextByChoice?._default) {
      nextId = current.nextByChoice._default;
    }
    if (!nextId) {
      const idx = scripted.findIndex((b) => b.beatId === currentId);
      nextId = scripted[idx + 1]?.beatId || currentId;
    }
    beat = getPresetBeatById(run.scriptId, nextId) || scripted[0];
  }

  beat = fillBeatTemplates(beat, name, hint);
  beat = applyChoiceVariant(beat, choiceKey);

  // Free-say (no choiceId): keyword flavor must change dialogue
  if (hint && !options.choiceId && !choiceKey) {
    beat = applyFreeSayFlavor(beat, hint, name);
  } else if (hint && !options.choiceId && choiceKey) {
    // Keyword mapped to choice key — still ensure free text leaves a trace when echoHint
    if (beat.echoHint) {
      beat = {
        ...beat,
        narration: `${beat.narration}（你：${hint.slice(0, 40)}）`,
      };
    }
  } else if (hint && options.choiceId && beat.echoHint) {
    beat = {
      ...beat,
      narration: `${beat.narration}（你：${hint.slice(0, 40)}）`,
    };
  }

  // Pure free-say that didn't map to a known choice: still flavor
  if (hint && !options.choiceId && !["lean-in", "ask", "silence", "share", "stay"].includes(choiceKey)) {
    beat = applyFreeSayFlavor(beat, hint, name);
  }

  const cursor = Math.max(0, scripted.findIndex((b) => b.beatId === beat.beatId)) + 1;
  return beatToTurn(beat, run, cast, meta, {
    cursor,
    nodeId: beat.beatId,
    tensionBase,
  });
}

function offlineLinearTurn(run, ctx) {
  const {
    scripted, meta, cast, name, hint, choiceKey, tensionBase,
  } = ctx;
  const cursor = Number(run.directorState?.beatCursor ?? 0);
  if (cursor >= scripted.length) {
    return offlineGenericTurn(run, {
      cast, name, hint, meta, script: getScript(run.scriptId), tensionBase,
    });
  }

  let beat = fillBeatTemplates(scripted[cursor], name, hint);
  beat = applyChoiceVariant(beat, choiceKey);
  if (hint && !choiceKey) {
    beat = applyFreeSayFlavor(beat, hint, name);
  } else if (hint && beat.echoHint) {
    beat = {
      ...beat,
      narration: `${beat.narration}（你：${hint.slice(0, 40)}）`,
    };
  }

  return beatToTurn(beat, run, cast, meta, {
    cursor: cursor + 1,
    nodeId: beat.beatId,
    tensionBase,
  });
}

function offlineGenericTurn(run, { cast, name, hint, meta, script, tensionBase }) {
  const cursor = Number(run.directorState?.beatCursor ?? 0);
  const narration = hint
    ? `舞台灯光微微一顿。你选择了：${hint}`
    : "夜色更深了一点。";
  let dialogue;
  let actionId = "talking_default";
  let expressionId = "soft_smile";
  let emotion = "warm";
  if (hint.includes("靠近")) {
    dialogue = `${name}把声音放得很低：「我就在这儿。」`;
    actionId = "lean_close";
    expressionId = "soft_smile";
  } else if (hint.includes("问")) {
    dialogue = `${name}看着你：「……你想听真话，还是想听我陪你？」`;
    actionId = "thinking";
    expressionId = "neutral";
    emotion = "neutral";
  } else if (hint.includes("沉默") || hint.includes("不说话")) {
    dialogue = `${name}轻轻点头，把伞往你这边又偏了偏，什么也不说。`;
    actionId = "shy_look_away";
    expressionId = "shy";
    emotion = "shy";
  } else if (hint) {
    dialogue = `${name}听着你的话，轻轻应道：「「${hint.slice(0, 24)}」——我记下了。」`;
    actionId = "comfort";
    expressionId = "comfort_look";
  } else {
    dialogue = `${name}轻轻应了一声，像把伞又往你这边偏了偏。`;
    actionId = "comfort";
    expressionId = "comfort_look";
  }

  const turn = normalizeScenarioTurn({
    schemaVersion: SCENARIO_TURN_SCHEMA_VERSION,
    sceneId: run.scriptId,
    beatId: `offline-${Date.now().toString(36)}`,
    narration,
    speakerId: cast.leadId,
    dialogue,
    emotion,
    expressionId,
    actionId,
    backgroundId: meta.backgroundId || script?.backgroundId || "",
    voice: { enabled: true, style: "soft" },
    choices: [
      { id: "lean-in", text: "靠近一点", intent: "closeness" },
      { id: "ask", text: "轻轻问一句", intent: "curious" },
      { id: "silence", text: "先不说话", intent: "pause" },
    ],
    stateDelta: { tension: 0, intimacy: hint ? 1 : 0, trust: 0, flags: [] },
    memoryCandidate: "",
    suggestEnding: (run.beats || []).length > 10,
    offline: true,
  }).value;

  return finalizeTurn({
    ...turn,
    _tension: tensionBase,
    _beatCursor: cursor,
    _beatNodeId: run.directorState?.beatNodeId || "",
  }, { speakerId: cast.leadId, sceneId: run.scriptId, characterId: cast.leadId });
}

function finalizeTurn(turn, ctx = {}) {
  if (!turn) return applyActionWhitelist(safeOfflineTurn(ctx), ctx);
  const withDefaults = {
    ...turn,
    sceneId: turn.sceneId || ctx.sceneId || "",
    speakerId: turn.speakerId || ctx.speakerId || "",
    backgroundId: turn.backgroundId || ctx.backgroundId || "",
    choices: Array.isArray(turn.choices) && turn.choices.length >= 2
      ? turn.choices
      : [
          { id: "lean-in", text: "靠近一点", intent: "closeness" },
          { id: "ask", text: "轻轻问一句", intent: "curious" },
          { id: "silence", text: "先不说话", intent: "pause" },
        ],
  };
  return applyActionWhitelist(withDefaults, ctx);
}

/** Convert ScenarioTurn → store beats. */
export function beatsFromScenarioTurn(turn) {
  const at = Date.now();
  const beats = [];
  if (turn?.narration) {
    beats.push({
      id: `beat-${at}-n`,
      at,
      kind: "narration",
      text: turn.narration,
      beatId: turn.beatId,
    });
  }
  if (turn?.dialogue) {
    beats.push({
      id: `beat-${at}-d`,
      at: at + 1,
      kind: "npc",
      text: turn.dialogue,
      beatId: turn.beatId,
      actionId: turn.actionId,
      expressionId: turn.expressionId,
      emotion: turn.emotion,
    });
  }
  return beats;
}

/** @deprecated alias for older imports */
export function beatsFromDirectorTurn(turn) {
  if (turn?.reply && !turn?.dialogue) {
    return beatsFromScenarioTurn({ ...turn, dialogue: turn.reply });
  }
  return beatsFromScenarioTurn(turn);
}
