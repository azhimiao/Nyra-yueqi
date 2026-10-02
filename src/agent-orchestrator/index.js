/**
 * Open-source tree: tool routing and multi-step orchestration are removed.
 * Every turn stays on ordinary companion chat.
 */

export const ROUTE_KINDS = Object.freeze(["companion_chat"]);

export function routeUserInput(input = {}) {
  return {
    ok: true,
    route: "companion_chat",
    agentId: "",
    skillId: "",
    createTask: false,
    text: String(input.text || "").trim(),
  };
}

export function normalizeAgentSessionPolicy() {
  return {
    mode: "isolated_copy",
    readGlobalMemory: false,
    writeBackCandidates: false,
    writeBackMode: "none",
  };
}
