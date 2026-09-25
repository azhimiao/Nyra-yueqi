/**
 * Hosted / BYOK tool-calling negotiation and argument normalization.
 */

export const TOOL_PROVIDER_MODES = Object.freeze([
  "openai_tools",
  "openai_tools_stream",
  "no_tools",
]);

export function negotiateToolProvider(capabilities = {}) {
  const supportsTools = capabilities.supportsTools === true || capabilities.tools === true;
  const supportsStreamTools = capabilities.supportsStreamTools === true;
  const supportsToolRole = capabilities.supportsToolRole !== false && supportsTools;
  if (!supportsTools) {
    return {
      mode: "no_tools",
      supportsTools: false,
      supportsStreamTools: false,
      supportsToolRole: false,
      reason: "provider_unsupported",
    };
  }
  return {
    mode: supportsStreamTools ? "openai_tools_stream" : "openai_tools",
    supportsTools: true,
    supportsStreamTools: Boolean(supportsStreamTools),
    supportsToolRole,
    reason: "ok",
  };
}

export function normalizeToolCall(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };
  const fn = raw.function && typeof raw.function === "object" ? raw.function : raw;
  const name = String(fn.name || raw.name || "").trim();
  if (!name) return { ok: false, reason: "missing_name" };
  let args = fn.arguments ?? raw.arguments ?? {};
  if (typeof args === "string") {
    const trimmed = args.trim();
    if (!trimmed) args = {};
    else {
      try {
        args = JSON.parse(trimmed);
      } catch {
        return { ok: false, reason: "malformed_args", name };
      }
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, reason: "malformed_args", name };
  }
  return {
    ok: true,
    id: String(raw.id || ""),
    name,
    arguments: args,
  };
}

export function normalizeToolCalls(list) {
  return (Array.isArray(list) ? list : []).map(normalizeToolCall);
}

export function boundPlanner(options = {}) {
  return {
    maxRounds: Math.max(1, Number(options.maxRounds) || 2),
    maxCalls: Math.max(1, Number(options.maxCalls) || 4),
    timeoutMs: Math.max(250, Number(options.timeoutMs) || 12000),
  };
}

export function toolsForNegotiation(tools, negotiation) {
  if (!negotiation?.supportsTools) return [];
  return Array.isArray(tools) ? tools : [];
}
