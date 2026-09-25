/** Adventure V2 DM protocol. This module never writes game state. */

import {
  ADVENTURE_EFFECT_TYPES,
  getAvailableExits,
  getLocation,
  normalizeActionInput,
  validateDmCandidate,
} from "./schema.js";
import { buildContextEnvelope, formatImplicitEnvelope } from "../context/index.js";
import { buildLanguageContext } from "../i18n/language-context.js";
import { renderPrompt } from "../prompts/registry.js";
import { t } from "../i18n/index.js";

export class AdventureDmError extends Error {
  constructor(code, message, { retryable = false, cause = null } = {}) {
    super(message);
    this.name = "AdventureDmError";
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

function clean(value, max = 6000) {
  return String(value ?? "").trim().slice(0, max);
}

function safeJsonParse(text) {
  const raw = clean(text, 20000);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try { return JSON.parse(fenced); } catch { /* continue */ }
    }
    const object = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!object) return null;
    try { return JSON.parse(object); } catch { return null; }
  }
}

function activeLore(pkg, run, inputText) {
  const recent = (run.turns || []).slice(-6).map((turn) => `${turn.input?.text || ""} ${turn.candidate?.narration || ""}`).join(" ");
  const haystack = `${inputText} ${recent} ${run.state.storySummary || ""}`.toLocaleLowerCase();
  return (pkg.loreEntries || []).filter((entry) => (
    (entry.triggers || []).some((trigger) => haystack.includes(String(trigger).toLocaleLowerCase()))
  )).slice(0, 6);
}

function compactRunState(pkg, run) {
  const location = getLocation(pkg, run.state.locationId);
  return {
    player: {
      name: run.character.name,
      archetype: run.character.archetypeLabel,
      stats: run.state.stats,
      conditions: run.state.conditions,
    },
    location: {
      id: location?.id,
      name: location?.name,
      description: location?.description,
      exits: getAvailableExits(pkg, run.state).map((exit) => ({ to: exit.to, label: exit.label })),
    },
    clock: run.state.clock,
    inventory: run.state.inventory.map((item) => ({ id: item.id, name: item.name, qty: item.qty })),
    quests: run.state.quests,
    npcState: run.state.npcs,
    flags: run.state.flags,
  };
}

function recentHistory(run) {
  return (run.turns || [])
    .filter((turn) => turn.status === "accepted")
    .slice(-12)
    .map((turn) => ({
      sequence: turn.sequence,
      input: turn.input || null,
      narration: clean(turn.candidate?.narration, 1200),
      checks: (turn.resolution?.checks || []).map((check) => ({ label: check.label, success: check.success, text: check.text })),
      appliedEffects: (turn.resolution?.appliedEffects || []).map((effect) => effect.type),
    }));
}

/** Exported for contract verification. */
export function buildDmMessages(pkg, run, rawInput, options = {}) {
  const input = normalizeActionInput(rawInput);
  if (!input.text) {
    throw new AdventureDmError("empty_action", t("errors.generic"), { retryable: false });
  }
  const lore = activeLore(pkg, run, input.text);
  const state = compactRunState(pkg, run);
  const statIds = Object.keys(run.state.stats || {});
  const questIds = (run.state.quests || []).map((quest) => ({ id: quest.id, objectives: quest.objectives.map((item) => item.id) }));
  const locationIds = (pkg.locations || []).map((item) => item.id);
  const npcIds = (pkg.npcs || []).map((item) => item.id);
  const itemIds = (run.state.inventory || []).map((item) => item.id);
  const lang = buildLanguageContext(options.languageOverride || {});
  const en = lang.conversationLanguage === "en-US";

  const system = [
    String(renderPrompt("adventure.scene.advance", {
      language: lang,
      packageTitle: pkg.title,
    })),
    en
      ? "On failure, push the situation forward with an understandable cost — never only say “try again”."
      : "失败必须推动局势并产生可理解的代价，不能只说失败后要求重试。",
    en
      ? "Output exactly one JSON object — no markdown, no extra commentary."
      : "严格只输出一个 JSON 对象，不要 markdown，不要附加解释。",
    "Output shape:",
    JSON.stringify({
      narration: en ? "Scene and NPC reactions this turn" : "本回合发生的场景与 NPC 反应",
      choices: [{ id: "next-1", label: en ? "Suggested next step" : "给玩家看的建议", mode: "do|say|story", actionText: en ? "Submitable next action" : "可直接提交的下一步" }],
      checks: [{
        id: "check-1", label: en ? "Check name" : "检定名", stat: statIds[0] || "insight", dc: 10,
        successText: en ? "Success narration" : "成功后的补充叙事", failureText: en ? "Failure narration" : "失败后的补充叙事",
        successEffects: [], failureEffects: [],
      }],
      effects: [],
    }),
    `effects.type allowed: ${ADVENTURE_EFFECT_TYPES.join(", ")}.`,
    "Effect fields: set_flag(key,value); add_item(item{id,name,description,qty}); remove_item(itemId,qty); adjust_stat(stat,delta); set_condition(condition,active); advance_quest(questId,objectiveId,status); move(locationId); advance_time(hours); set_npc(npcId,attitude,note).",
    "Only reference stats, quests, objectives, locations, npcs, and item IDs listed in context. New items only via add_item.",
    "Checks are resolved locally with d20 — do not invent dice rolls. Ordinary narration may omit checks; high-risk actions should include one.",
    "choices are suggestions for the next turn, not state changes. Provide 2–4; the player may still type freely.",
    `World principles: ${(pkg.rules?.principles || []).join(en ? "; " : "；")}`,
  ].join("\n");

  const payload = {
    actionMode: input.mode,
    action: input.text,
    package: { id: pkg.id, version: pkg.version, title: pkg.title, premise: pkg.summary },
    storySummary: run.state.storySummary,
    recentAcceptedTurns: options.contextEnvelope ? [] : recentHistory(run),
    managedConversationHistory: (options.contextEnvelope?.historyMessages || []).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    managedContext: options.contextEnvelope
      ? formatImplicitEnvelope(options.contextEnvelope, { excludeIds: [] })
      : "",
    currentState: state,
    activeLore: lore.map((entry) => ({ id: entry.id, title: entry.title, content: entry.content })),
    availableIds: { stats: statIds, quests: questIds, locations: locationIds, npcs: npcIds, currentItems: itemIds },
  };
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

function assertProvider(providerConfig, callModel) {
  if (!providerConfig?.baseUrl || !providerConfig?.apiKey || !providerConfig?.model || typeof callModel !== "function") {
    throw new AdventureDmError(
      "model_not_configured",
      t("errors.noApiKey"),
      { retryable: false },
    );
  }
}

export async function requestDmCandidate({ pkg, run, input, callModel, providerConfig }) {
  if (pkg?.tutorial || run?.mode === "tutorial") return buildTutorialCandidate(pkg, run, input);
  assertProvider(providerConfig, callModel);
  const sourceMessages = [];
  for (const turn of (run.turns || []).filter((item) => item.status === "accepted")) {
    if (turn.input?.text) {
      sourceMessages.push({
        id: `${turn.id}:user`,
        role: "user",
        content: turn.input.text,
        createdAt: turn.acceptedAt || turn.createdAt || "",
        meta: { source: "adventure_run", turnId: turn.id },
      });
    }
    const narration = clean(turn.candidate?.narration, 1800);
    if (narration) {
      sourceMessages.push({
        id: `${turn.id}:assistant`,
        role: "assistant",
        content: narration,
        createdAt: turn.acceptedAt || turn.createdAt || "",
        meta: { source: "adventure_dm", turnId: turn.id },
      });
    }
  }
  const contextEnvelope = await buildContextEnvelope({
    purpose: "adventure",
    appId: "adventure",
    characterId: `__adventure__:${run.id}`,
    workspaceId: `adventure:${run.packageId}`,
    chatSessionId: `project:adventure:${run.id}`,
    conversationKind: "project",
    branchId: String(run.branchId || ""),
    currentInput: String(input?.text || ""),
    turnIntent: "user_message",
    sourceMessages,
    reconcileLegacy: false,
    includeCohabit: false,
    includeMoments: false,
    includeContextGraph: false,
    includeWorldbook: false,
  });
  const messages = buildDmMessages(pkg, run, input, { contextEnvelope });
  let response;
  try {
    response = await callModel(providerConfig, messages, {
      temperature: 0.78,
      stream: false,
      businessPurpose: "creative.adventure_dm",
      capability: "chat",
      companionId: run?.state?.characterId || run?.characterId || "",
    });
  } catch (cause) {
    throw new AdventureDmError("model_request_failed", "DM 暂时没有回应。本回合没有写入存档，可以重试。", { retryable: true, cause });
  }
  const parsed = safeJsonParse(response?.content);
  if (!parsed) {
    throw new AdventureDmError("model_invalid_json", "DM 返回了无法解析的内容。本回合没有写入存档。", { retryable: true });
  }
  const checked = validateDmCandidate({ ...parsed, source: "model" }, pkg, run.state);
  if (!checked.ok) {
    throw new AdventureDmError(
      "model_contract_invalid",
      `DM 尝试了不受支持的状态变化：${checked.errors.join("、")}。本回合没有写入存档。`,
      { retryable: true },
    );
  }
  return checked.value;
}

/** Explicitly static local tutorial, never used by formal packages. */
export function buildTutorialCandidate(pkg, run, rawInput) {
  if (!pkg?.tutorial || run?.mode !== "tutorial") {
    throw new AdventureDmError("tutorial_not_allowed", "正式冒险不能使用本地教程结果。", { retryable: false });
  }
  const input = normalizeActionInput(rawInput);
  if (!input.text) throw new AdventureDmError("empty_action", "请先写下你的行动。", { retryable: false });
  const acceptedSteps = Math.max(0, (run.turns || []).filter((turn) => turn.status === "accepted").length - 1);
  let raw;
  if (acceptedSteps === 0) {
    raw = {
      narration: "你靠近配电盒。回形针可以顶住回弹的锁片，但动作稍有偏差就会划伤手。阿澄把灯光稳稳压在锁孔上。",
      choices: [
        { id: "say-guide", label: "问阿澄下一段路线", mode: "say", actionText: "我打开门后该往哪里走？" },
        { id: "do-panel", label: "先检查配电盒", mode: "do", actionText: "我仔细检查配电盒和门锁之间的线路。" },
      ],
      checks: [{
        id: "open-lock", label: "稳定撬锁", stat: "洞察", dc: 7,
        successText: "你找到锁片的受力点，安全门无声弹开。",
        failureText: "锁片划过手背，但你在它回弹前顶住了门。",
        successEffects: [
          { type: "set_flag", key: "door_open", value: true },
          { type: "advance_quest", questId: "tutorial-exit", objectiveId: "open-door", status: "complete" },
          { type: "move", locationId: "service-corridor" },
        ],
        failureEffects: [
          { type: "adjust_stat", stat: "体魄", delta: -1 },
          { type: "set_condition", condition: "手背擦伤", active: true },
          { type: "set_flag", key: "door_open", value: true },
          { type: "advance_quest", questId: "tutorial-exit", objectiveId: "open-door", status: "complete" },
          { type: "move", locationId: "service-corridor" },
        ],
      }],
      effects: [{ type: "advance_time", hours: 1 }],
      source: "tutorial",
    };
  } else if (acceptedSteps === 1) {
    raw = {
      narration: input.mode === "say"
        ? `阿澄听完你的话，把应急灯转向楼梯：“路线没塌，但地面门需要从里面推。你来决定我们怎么过去。”`
        : "阿澄顺着你的视线检查标识，确认楼梯仍可通行。她没有替你迈出下一步，只把路线记在你们之间。",
      choices: [
        { id: "story-light", label: "接管环境：让应急灯恢复", mode: "story", actionText: "走廊尽头的应急灯忽然恢复，照亮通往地面的箭头。" },
        { id: "do-stairs", label: "沿楼梯前进", mode: "do", actionText: "我和阿澄保持距离，沿楼梯向地面出口移动。" },
      ],
      checks: [],
      effects: [
        { type: "set_flag", key: "route_confirmed", value: true },
        { type: "set_npc", npcId: "guide-chen", attitude: 20, note: "玩家主动确认了撤离路线。" },
        { type: "advance_quest", questId: "tutorial-exit", objectiveId: "ask-guide", status: "complete" },
        { type: "move", locationId: "street-exit" },
        { type: "advance_time", hours: 1 },
      ],
      source: "tutorial",
    };
  } else {
    raw = {
      narration: "卷帘门被你从里面推开。阳光落进服务走廊，阿澄关掉应急灯：“行动、说话和接管叙事都会改变同一份世界状态。正式冒险不会替你编一个离线答案。”",
      choices: [],
      checks: [],
      effects: [
        { type: "advance_quest", questId: "tutorial-exit", objectiveId: "reach-exit", status: "complete" },
        { type: "set_flag", key: "tutorial_complete", value: true },
      ],
      source: "tutorial",
    };
  }
  const checked = validateDmCandidate(raw, pkg, run.state);
  if (!checked.ok) throw new AdventureDmError("tutorial_contract_invalid", checked.errors.join("、"));
  return checked.value;
}

export async function loadCallModel() {
  try {
    const mod = await import("../model/client.js");
    return typeof mod.callModel === "function" ? mod.callModel : null;
  } catch (cause) {
    throw new AdventureDmError("model_client_unavailable", "模型客户端不可用。", { retryable: true, cause });
  }
}

export async function resolveCallModel(provider) {
  if (!provider?.baseUrl || !provider?.apiKey || !provider?.model) return null;
  return loadCallModel();
}

// Compatibility name retained for imports; V2 callers receive a staged candidate only.
export async function runDmBeat(params) {
  const candidate = await requestDmCandidate({
    pkg: params.pkg || params.world,
    run: params.run,
    input: params.input || { mode: "do", text: params.userAction || "" },
    callModel: params.callModel,
    providerConfig: params.providerConfig,
  });
  return { result: candidate, run: params.run };
}
