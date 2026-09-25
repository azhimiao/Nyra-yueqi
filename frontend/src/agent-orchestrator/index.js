/**
 * Agent Orchestrator (R4) — single routing entry for user input.
 */

import { detectSelfieIntent } from "../companion/selfie.js";
import { detectDiaryIntent } from "../companion/diary-action.js";
import { detectListenPlayIntent } from "../companion/listen-action.js";
import { detectCapabilityIntent } from "../companion/capability-intents.js";

export const ROUTE_KINDS = Object.freeze([
  "companion_chat",
  "direct_action",
  "agent_session",
  "unified_task",
  "experience",
]);

/**
 * @param {{
 *   text?: string,
 *   agentId?: string,
 *   skillId?: string,
 *   experienceId?: string,
 *   intent?: string,
 *   action?: string,
 *   requiresTools?: boolean,
 *   multiStep?: boolean,
 * }} input
 */
export function routeUserInput(input = {}) {
  const text = String(input.text || "").trim();
  const agentId = String(input.agentId || "").trim();
  const skillId = String(input.skillId || "").trim();
  const experienceId = String(input.experienceId || "").trim();
  const intent = String(input.intent || "").trim();

  if (experienceId || intent === "experience") {
    return { ok: true, route: "experience", experienceId, agentId, skillId };
  }
  if (intent === "direct_action" && input.action === "selfie") {
    return { ok: true, route: "direct_action", action: "selfie", agentId: "", skillId: "" };
  }
  if (intent === "direct_action" && input.action === "diary") {
    return { ok: true, route: "direct_action", action: "diary", agentId: "", skillId: "" };
  }
  if (intent === "direct_action" && input.action === "listen") {
    return { ok: true, route: "direct_action", action: "listen", agentId: "", skillId: "" };
  }
  if (detectSelfieIntent(text)) {
    return { ok: true, route: "direct_action", action: "selfie", reason: "selfie_intent" };
  }
  if (detectDiaryIntent(text)) {
    return { ok: true, route: "direct_action", action: "diary", reason: "diary_intent" };
  }
  if (detectListenPlayIntent(text)) {
    return { ok: true, route: "direct_action", action: "listen", reason: "listen_intent" };
  }
  if (intent === "companion_chat") {
    return {
      ok: true,
      route: "companion_chat",
      agentId: "",
      skillId: "",
      createTask: false,
      text,
    };
  }
  const capability = detectCapabilityIntent(text);
  if (capability) {
    return {
      ok: true,
      route: "direct_action",
      action: "capability",
      capabilityId: capability.id,
      capability,
      reason: "capability_intent",
    };
  }
  if (input.multiStep || input.requiresTools || intent === "unified_task") {
    return { ok: true, route: "unified_task", agentId, skillId, reason: "multi_step_or_tools" };
  }
  // Heuristic: explicit multi-step tool requests (Assist / OpenClaw), not ordinary chat.
  if (
    /帮我(检查|整理|修改|生成|安装|修复).{0,24}(角色|文件|材料|skill|技能包)/i.test(text)
    || /检查这个角色包|生成修改方案|多步骤任务/.test(text)
  ) {
    return { ok: true, route: "unified_task", agentId, skillId, reason: "tool_task_heuristic" };
  }
  if (agentId || skillId) {
    return { ok: true, route: "agent_session", agentId, skillId };
  }
  if (intent === "direct_action") {
    return { ok: true, route: "direct_action", agentId: "", skillId: "" };
  }
  return {
    ok: true,
    route: "companion_chat",
    agentId: "",
    skillId: "",
    createTask: false,
    text,
  };
}

export function normalizeAgentSessionPolicy(input = {}) {
  return {
    mode: ["isolated_copy", "shared_session"].includes(input.mode) ? input.mode : "isolated_copy",
    readGlobalMemory: input.readGlobalMemory !== false,
    writeBackCandidates: Boolean(input.writeBackCandidates),
    writeBackMode: ["none", "summary", "candidates"].includes(input.writeBackMode)
      ? input.writeBackMode
      : (input.writeBackCandidates ? "candidates" : "none"),
  };
}
