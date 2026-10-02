/**
 * Local Context Inspector trace store.
 *
 * The inspector records the exact managed context selected by the broker, but
 * deliberately excludes provider configuration, API keys and attachment bytes.
 * It is local-only, bounded, and can be cleared by the user.
 */

import { formatSourceRefForInspector } from "../contracts/source-ref-v1.js";

export const CONTEXT_INSPECTOR_KEY = "yueqi.context.inspector.v1";
export const CONTEXT_INSPECTOR_LIMIT = 30;

export { formatSourceRefForInspector };

let testStorage = null;

export function __setContextInspectorStorageForTests(storage) {
  testStorage = storage;
}

function storage() {
  if (testStorage) return testStorage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function emptyBag() {
  return { schemaVersion: 1, traces: [] };
}

function readBag() {
  try {
    const parsed = JSON.parse(storage()?.getItem(CONTEXT_INSPECTOR_KEY) || "null");
    if (parsed && Array.isArray(parsed.traces)) {
      return { schemaVersion: 1, traces: parsed.traces.slice(0, CONTEXT_INSPECTOR_LIMIT) };
    }
  } catch {
    /* corrupt trace data must never block a model request */
  }
  return emptyBag();
}

function writeBag(bag) {
  try {
    storage()?.setItem(CONTEXT_INSPECTOR_KEY, JSON.stringify(bag));
  } catch {
    /* diagnostics are best-effort */
  }
  return bag;
}

function clip(value, max = 1600) {
  return String(value ?? "").slice(0, max);
}

function sanitizeEnvelope(envelope = {}) {
  const request = envelope.request || {};
  return {
    id: String(envelope.trace?.requestId || request.requestId || `ctx-${Date.now()}`),
    createdAt: String(envelope.createdAt || new Date().toISOString()),
    request: {
      purpose: String(request.purpose || "chat"),
      appId: String(request.appId || ""),
      turnIntent: String(request.turnIntent || ""),
      characterId: String(request.characterId || ""),
      chatSessionId: String(request.chatSessionId || ""),
      conversationSessionId: String(envelope.authority?.conversationSessionId || request.conversationSessionId || ""),
      branchId: String(envelope.authority?.branchId || request.branchId || ""),
      budgetProfile: String(request.profile?.id || ""),
    },
    trace: {
      totalBudget: Number(envelope.trace?.totalBudget) || 0,
      outputReserve: Number(envelope.trace?.outputReserve) || 0,
      historyTokens: Number(envelope.trace?.historyTokens) || 0,
      blockTokens: Number(envelope.trace?.blockTokens) || 0,
      currentTokens: Number(envelope.trace?.currentTokens) || 0,
      worldbookTokens: Number(envelope.trace?.worldbookTokens) || 0,
      managedCapacity: Number(envelope.trace?.managedCapacity) || 0,
      totalManagedTokens: Number(envelope.trace?.totalManagedTokens) || 0,
      withinBudget: envelope.trace?.withinBudget !== false,
      historyAuthority: String(envelope.authority?.history || ""),
      selectedHistoryCount: Number(envelope.trace?.history?.selectedCount) || 0,
    },
    history: (envelope.historyMessages || []).slice(-24).map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: clip(item.content, 800),
      messageId: String(item.messageId || item.id || ""),
    })),
    blocks: (envelope.blocks || []).map((item) => ({
      id: String(item.id || ""),
      source: String(item.source || ""),
      tokens: Number(item.tokens) || 0,
      truncated: Boolean(item.truncated),
      text: clip(item.text),
    })),
    worldbook: {
      activated: (envelope.worldbook?.activated || []).map((item) => ({
        id: String(item.id || ""),
        title: clip(item.title || item.name || "", 160),
        insertPosition: String(item.insertPosition || ""),
      })),
      trimmed: (envelope.worldbook?.trimmed || []).map((item) => ({
        id: String(item.id || ""),
        reason: String(item.reason || "budget"),
      })),
    },
    provenance: (envelope.provenance || []).slice(0, 80).map((item) => {
      const sourceRef =
        item.sourceRef && typeof item.sourceRef === "object"
          ? item.sourceRef
          : null;
      return {
        source: String(item.source || ""),
        sourceId: String(item.sourceId || sourceRef?.sourceId || ""),
        characterId: String(item.characterId || ""),
        tokens: Number(item.tokens) || 0,
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
        sourceRef: sourceRef || undefined,
        sourceRefLabel: sourceRef
          ? formatSourceRefForInspector(sourceRef)
          : String(item.sourceRefLabel || item.sourceRef || "").trim() || undefined,
      };
    }),
    redactions: (envelope.redactions || []).slice(0, 80).map((item) => ({
      source: String(item.source || ""),
      blockId: String(item.blockId || ""),
      reason: String(item.reason || "redacted"),
      count: Number(item.count) || 0,
    })),
  };
}

export function recordContextEnvelope(envelope) {
  const trace = sanitizeEnvelope(envelope);
  const bag = readBag();
  bag.traces = [trace, ...bag.traces.filter((item) => item.id !== trace.id)]
    .slice(0, CONTEXT_INSPECTOR_LIMIT);
  writeBag(bag);
  try {
    if (typeof document !== "undefined" && typeof CustomEvent === "function") {
      document.dispatchEvent(new CustomEvent("yueqi:context-trace", { detail: { trace } }));
    }
  } catch {
    /* non-DOM host */
  }
  return trace;
}

export function listContextTraces({ characterId = "", limit = CONTEXT_INSPECTOR_LIMIT } = {}) {
  const cid = String(characterId || "").trim();
  const rows = readBag().traces.filter((item) => !cid || item.request?.characterId === cid);
  return rows.slice(0, Math.max(1, Number(limit) || CONTEXT_INSPECTOR_LIMIT));
}

export function getContextTrace(id) {
  return readBag().traces.find((item) => item.id === String(id || "")) || null;
}

export function clearContextTraces() {
  writeBag(emptyBag());
}

export function exportContextInspectorBag() {
  return JSON.parse(JSON.stringify(readBag()));
}

export function importContextInspectorBag(input) {
  const traces = Array.isArray(input?.traces) ? input.traces : [];
  return writeBag({ schemaVersion: 1, traces: traces.slice(0, CONTEXT_INSPECTOR_LIMIT) });
}
