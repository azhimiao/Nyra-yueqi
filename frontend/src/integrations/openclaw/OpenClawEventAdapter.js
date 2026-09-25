/**
 * OpenClawEventAdapter — maps upstream AgentEvent → NyraAgentRuntimeEvent.
 * Upstream event types never leave this module.
 */
export class OpenClawEventAdapter {
  constructor(runId) {
    this.runId = runId;
    this.modelStep = 0;
    /** @type {import('./nyra-agent-runtime.types.js').NyraAgentRuntimeEvent[]} */
    this.emitted = [];
  }

  /**
   * @param {object} event OpenClaw AgentEvent
   * @returns {import('./nyra-agent-runtime.types.js').NyraAgentRuntimeEvent[]}
   */
  map(event) {
    /** @type {import('./nyra-agent-runtime.types.js').NyraAgentRuntimeEvent[]} */
    const out = [];
    const type = event?.type;
    if (type === "agent_start") {
      out.push({ type: "run_started", runId: this.runId });
    } else if (type === "message_start" && event.message?.role === "assistant") {
      this.modelStep += 1;
      out.push({ type: "model_requested", step: this.modelStep });
    } else if (type === "tool_execution_start") {
      out.push({
        type: "tool_requested",
        toolName: event.toolName,
        callId: event.toolCallId,
      });
    } else if (type === "tool_execution_end") {
      out.push({
        type: "tool_completed",
        toolName: event.toolName,
        callId: event.toolCallId,
        isError: Boolean(event.isError),
      });
    }
    for (const e of out) this.emitted.push(e);
    return out;
  }

  /**
   * @param {string} summary
   * @param {string[]} artifactIds
   */
  completed(summary, artifactIds) {
    const e = { type: "run_completed", summary, artifactIds };
    this.emitted.push(e);
    return e;
  }

  /**
   * @param {string} code
   * @param {string} message
   */
  failed(code, message) {
    const e = { type: "run_failed", code, message };
    this.emitted.push(e);
    return e;
  }
}

/**
 * Normalize unknown errors into Nyra run_failed payloads.
 * @param {unknown} err
 */
export function toNyraRuntimeError(err) {
  const e = /** @type {{ code?: string, message?: string, name?: string }} */ (err || {});
  const message = String(e.message || err || "unknown error");
  if (e.code === "WORKSPACE_PATH_ESCAPE") {
    return { code: "WORKSPACE_PATH_ESCAPE", message };
  }
  if (e.code === "TOOL_TIMEOUT" || /timeout/i.test(message)) {
    return { code: "TOOL_TIMEOUT", message };
  }
  if (e.code === "ABORTED" || e.name === "AbortError" || /abort/i.test(message)) {
    return { code: "CANCELLED", message };
  }
  if (e.code === "CAPABILITY_DENIED") {
    return { code: "CAPABILITY_DENIED", message };
  }
  if (/Validation failed|argument-validation/i.test(message)) {
    return { code: "TOOL_SCHEMA_INVALID", message };
  }
  if (/not found/i.test(message) && /tool/i.test(message)) {
    return { code: "TOOL_NOT_FOUND", message };
  }
  return { code: "RUNTIME_ERROR", message };
}
