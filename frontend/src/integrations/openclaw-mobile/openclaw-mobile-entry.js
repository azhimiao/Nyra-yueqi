/**
 * Mobile-safe OpenClaw entry — re-exports vendored narrow upstream chunks.
 *
 * Upstream: OpenClaw 2026.7.1-2
 * Route: B_ALIAS + D_VENDOR_NARROW
 * Symbols: runAgentLoop, convertToLlm, createAssistantMessageEventStream
 */
export {
  runAgentLoop,
  convertToLlm,
  createAssistantMessageEventStream,
  OPENCLAW_MOBILE_CHUNK_META,
} from "./generated-chunk-bindings.js";

export const OPENCLAW_MOBILE_SLICE = {
  version: "2026.7.1-2",
  route: "B_ALIAS_PLUS_D_VENDOR_NARROW",
  publicExportsDocumented: [
    "openclaw/plugin-sdk/agent-core",
    "openclaw/plugin-sdk/llm",
  ],
  symbols: ["runAgentLoop", "convertToLlm", "createAssistantMessageEventStream"],
};
