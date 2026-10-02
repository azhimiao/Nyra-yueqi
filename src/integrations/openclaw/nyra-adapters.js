/**
 * Nyra-facing aliases — same modules as OpenClaw* adapters.
 * Product code may import either naming; both wrap OpenClaw, never reimplement the loop.
 */
export { createNyraModelAdapter as NyraModelAdapter } from "./OpenClawModelAdapter.js";
export { toOpenClawTools as NyraToolAdapter, createSpikeNyraTools } from "./OpenClawToolAdapter.js";
export { OpenClawWorkspaceAdapter as NyraWorkspaceAdapter } from "./OpenClawWorkspaceAdapter.js";
export {
  OpenClawEventAdapter as NyraRuntimeEventAdapter,
  toNyraRuntimeError,
} from "./OpenClawEventAdapter.js";
export { OpenClawCancellationAdapter as NyraCancellationAdapter } from "./OpenClawCancellationAdapter.js";
export { OpenClawRuntimeAdapter } from "./OpenClawRuntimeAdapter.js";
