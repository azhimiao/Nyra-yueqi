/**
 * Mode contributions — chat | pop | deskpet | immersive add context only.
 * Modes must not maintain a separate prompt source of truth (§6).
 * W5: pop / deskpet / phone may attach accepted-experience lines (best-effort).
 */

import { assembleAcceptedExperienceContribution } from "../experience/memory.js";

/** @typedef {"chat"|"pop"|"deskpet"|"immersive"} PromptMode */

export const PROMPT_MODES = Object.freeze(["chat", "pop", "deskpet", "immersive"]);

/**
 * Normalize mode aliases from appId / scene tags.
 * @param {string} modeOrAppId
 * @returns {PromptMode}
 */
export function normalizePromptMode(modeOrAppId = "chat") {
  const raw = String(modeOrAppId || "chat").trim().toLowerCase();
  if (raw === "pop" || raw === "chat-pop") return "pop";
  if (raw === "deskpet" || raw === "pet" || raw === "desktop") return "deskpet";
  if (raw === "immersive" || raw === "scenario" || raw === "theater" || raw === "experience") {
    return "immersive";
  }
  if (raw === "chat") return "chat";
  return "chat";
}

/**
 * Mode-specific context contribution (text only; assembler owns order).
 * @param {PromptMode|string} mode
 * @param {{
 *   appId?: string,
 *   sceneLabel?: string,
 *   experienceTitle?: string,
 *   openingLabel?: string,
 *   petBrief?: string,
 *   extras?: string,
 *   characterId?: string,
 *   firstSpokenTurn?: boolean,
 *   includeAcceptedExperiences?: boolean,
 *   acceptedQuery?: string,
 * }} [ctx]
 * @returns {{ id: string, text: string, source: string }}
 */
export function buildModeContribution(mode, ctx = {}) {
  const m = normalizePromptMode(mode);
  const parts = [];
  const firstSpokenTurn = ctx.firstSpokenTurn === true;

  if (m === "pop") {
    parts.push("场景：Pop 私密即时通讯。用户正在通过独立聊天入口与你相处。");
    if (firstSpokenTurn) {
      parts.push("这是这段对话里用户的第一句。不要编造正在听、刚播完、周围天气、未完成事项或共同经历；从这一句开场。");
    }
    // Later turns: the transcript is the continuity. Do not invent a leftover plot.
    // output form is owned by post_history / chat output contract.
  } else if (m === "deskpet") {
    parts.push(
      "场景：桌宠在场回应。优先回应正在发生的这一刻。",
      "可执行动作只通过运行标记表达。",
    );
    if (ctx.petBrief) parts.push(String(ctx.petBrief));
  } else if (m === "immersive") {
    parts.push("模式：沉浸情景。同一角色进入作品情境，保持身份连续。");
    if (ctx.experienceTitle) parts.push(`作品：${ctx.experienceTitle}`);
    if (ctx.openingLabel) parts.push(`开场：${ctx.openingLabel}`);
  } else {
    parts.push("场景：持续关系中的日常聊天。这里是主要对话入口。");
    if (firstSpokenTurn) {
      parts.push("这是这段对话里用户的第一句。不要编造正在听、刚播完、周围天气或未发生的共同经历；从这一句开场。");
    }
  }

  if (ctx.sceneLabel) parts.push(`场景标签：${ctx.sceneLabel}`);
  if (ctx.extras) parts.push(String(ctx.extras));

  // W5: Pop / deskpet / phone (chat) may recall accepted experiences only.
  const wantAccepted =
    ctx.includeAcceptedExperiences !== false
    && (m === "pop" || m === "deskpet" || m === "chat")
    && String(ctx.characterId || "").trim();
  if (wantAccepted) {
    try {
      const block = assembleAcceptedExperienceContribution({
        characterId: String(ctx.characterId).trim(),
        mode: m,
        query: ctx.acceptedQuery || "",
        limit: m === "deskpet" ? 2 : 4,
      });
      if (block.text) parts.push(block.text);
    } catch {
      /* never break mode assembly */
    }
  }

  return {
    id: "mode_context",
    text: parts.filter(Boolean).join("\n"),
    source: `mode:${m}`,
  };
}

/**
 * Which optional blocks a mode prefers to emphasize (does not change order).
 * @param {PromptMode|string} mode
 * @returns {{ preferExperience: boolean, preferSceneState: boolean, historyBias: "short"|"medium"|"long" }}
 */
export function modeAssemblyHints(mode) {
  const m = normalizePromptMode(mode);
  if (m === "immersive") {
    return { preferExperience: true, preferSceneState: true, historyBias: "medium" };
  }
  if (m === "deskpet") {
    return { preferExperience: false, preferSceneState: false, historyBias: "short" };
  }
  if (m === "pop") {
    return { preferExperience: false, preferSceneState: false, historyBias: "medium" };
  }
  return { preferExperience: false, preferSceneState: false, historyBias: "long" };
}
