/**
 * Request Inspector — draft / saved / last-sent views over PreparedModelRequest.
 * Sensitive values are masked by default. Sandbox compile is preview-only.
 */

import { stableHash } from "../contracts/companion-v2-shared.js";
import { prepareModelRequestV1 } from "./finalize.js";

const SENSITIVE_RE = /(api[_-]?key|token|password|authorization|bearer\s+\S+)/i;

export function maskSensitiveText(text) {
  return String(text || "").replace(SENSITIVE_RE, "[redacted]");
}

export function hashPreparedRequest(prepared) {
  if (!prepared || typeof prepared !== "object") return "";
  const { requestId, ...rest } = prepared;
  return stableHash(rest);
}

export function inspectPreparedRequest(prepared, { view = "saved", mask = true } = {}) {
  const messages = Array.isArray(prepared?.messages) ? prepared.messages : [];
  return {
    view,
    requestId: prepared?.requestId || "",
    snapshotHash: prepared?.snapshotHash || "",
    requestHash: hashPreparedRequest(prepared),
    providerMode: prepared?.providerMode || "",
    tools: Array.isArray(prepared?.tools) ? prepared.tools : [],
    outputReserveTokens: prepared?.outputReserveTokens || 0,
    budgetLedger: Array.isArray(prepared?.budgetLedger) ? prepared.budgetLedger : [],
    protectedBlockIds: Array.isArray(prepared?.protectedBlockIds) ? prepared.protectedBlockIds : [],
    messages: messages.map((item) => ({
      role: item.role,
      provenance: item.provenance || "",
      content: mask ? maskSensitiveText(item.content) : item.content,
    })),
  };
}

export function compareInspectorHashes(inspectorHash, networkHash) {
  return String(inspectorHash || "") === String(networkHash || "") && Boolean(inspectorHash);
}

/**
 * Preview compile helper: caller must pass assemble with preview:true.
 * This function only hashes a prepared object and never writes repositories.
 */
export function sandboxPreparedFromMessages(messages, options = {}) {
  const prepared = options.prepared
    || prepareModelRequestV1({
      messages,
      tools: options.tools || [],
      snapshotHash: options.snapshotHash || "sandbox",
      providerMode: options.providerMode || "sandbox",
    });
  return inspectPreparedRequest(prepared, { view: "draft", mask: options.mask !== false });
}
