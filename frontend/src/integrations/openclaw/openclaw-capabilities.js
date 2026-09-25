/**
 * Capability gates for workspace tools.
 */
export const TOOL_CAPABILITIES = Object.freeze({
  "character.inspect": ["workspace.read"],
  "workspace.read_text": ["workspace.read"],
  "workspace.write_text": ["workspace.write"],
});

/**
 * @param {string} toolName
 * @param {string[]} [granted]
 */
export function checkToolCapabilities(toolName, granted = ["workspace.read", "workspace.write"]) {
  const required = TOOL_CAPABILITIES[toolName] || ["*"];
  if (required.includes("*")) {
    return { ok: false, reason: `Unknown tool capability policy: ${toolName}` };
  }
  const missing = required.filter((c) => !granted.includes(c));
  if (missing.length) {
    return { ok: false, reason: `Missing capabilities: ${missing.join(", ")}` };
  }
  return { ok: true };
}

export const OPENCLAW_NODE_CAPABILITIES = Object.freeze({
  runtime: "node",
  openclawVersion: "2026.7.1-2",
  publicImport: "openclaw/plugin-sdk/agent-core",
  symbols: ["runAgentLoop", "convertToLlm"],
  webBundle: false,
  capacitorInProcess: false,
  sidecarRecommended: true,
});
