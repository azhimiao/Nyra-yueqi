/**
 * Public surface for OpenClaw integration adapters.
 *
 * Upstream: OpenClaw 2026.7.1-2
 * Public export: openclaw/plugin-sdk/agent-core
 * Symbols: runAgentLoop / convertToLlm (via OpenClawRuntimeAdapter)
 *
 * Product code should depend on NyraAgentRuntime shapes, not OpenClaw types.
 */
export { OpenClawRuntimeAdapter } from "./OpenClawRuntimeAdapter.js";
export { OpenClawWorkspaceAdapter } from "./OpenClawWorkspaceAdapter.js";
export { OpenClawEventAdapter, toNyraRuntimeError } from "./OpenClawEventAdapter.js";
export { OpenClawCancellationAdapter } from "./OpenClawCancellationAdapter.js";
export {
  createNyraModelAdapter,
  createOpenClawModelAdapter,
  nyraProviderResponseToAssistant,
} from "./OpenClawModelAdapter.js";
export {
  toOpenClawTools,
  createSpikeNyraTools,
} from "./OpenClawToolAdapter.js";
export {
  checkToolCapabilities,
  OPENCLAW_NODE_CAPABILITIES,
  TOOL_CAPABILITIES,
} from "./openclaw-capabilities.js";
export {
  importOpenClaw,
  readOpenClawPackageMeta,
  resolveOpenClawAppRoot,
} from "./resolve-openclaw.js";
export {
  NyraModelAdapter,
  NyraToolAdapter,
  NyraWorkspaceAdapter,
  NyraRuntimeEventAdapter,
  NyraCancellationAdapter,
} from "./nyra-adapters.js";
