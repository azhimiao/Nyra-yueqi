/**
 * lazy Local Agent runners (OpenClaw-backed). Light facade only.
 */

/** @type {Promise<Record<string, Function>> | null} */
let agentRunnersPromise = null;

async function loadAgentRunnersModule() {
  if (!agentRunnersPromise) {
    agentRunnersPromise = Promise.all([
      import("./runner.js"),
      import("./theme-draft-runner.js"),
      import("./scenario-audit-runner.js"),
    ]).then(([runner, theme, scenario]) => ({
      runCharacterFixAgentTask: runner.runCharacterFixAgentTask,
      approveAssistantTask: runner.approveAssistantTask,
      rejectAssistantTask: runner.rejectAssistantTask,
      pauseAssistantTask: runner.pauseAssistantTask,
      resumeAssistantTask: runner.resumeAssistantTask,
      runThemeDraftAgentTask: theme.runThemeDraftAgentTask,
      approveThemeDraftTask: theme.approveThemeDraftTask,
      runScenarioAuditAgentTask: scenario.runScenarioAuditAgentTask,
    }));
  }
  return agentRunnersPromise;
}

export async function runCharacterFixAgentTask(opts) {
  const { assertLocalAgentAllowed } = await import("../../agent/capabilities/prefs.js");
  const gate = assertLocalAgentAllowed();
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, skipped: true };
  }
  const mod = await loadAgentRunnersModule();
  return mod.runCharacterFixAgentTask(opts);
}

export async function approveAssistantTask(taskId, opts) {
  const mod = await loadAgentRunnersModule();
  return mod.approveAssistantTask(taskId, opts);
}

export async function rejectAssistantTask(taskId, opts) {
  const mod = await loadAgentRunnersModule();
  return mod.rejectAssistantTask(taskId, opts);
}

export async function pauseAssistantTask(taskId) {
  const mod = await loadAgentRunnersModule();
  return mod.pauseAssistantTask(taskId);
}

export async function resumeAssistantTask(taskId) {
  const mod = await loadAgentRunnersModule();
  return mod.resumeAssistantTask(taskId);
}

export async function runThemeDraftAgentTask(opts) {
  const { assertLocalAgentAllowed } = await import("../../agent/capabilities/prefs.js");
  const gate = assertLocalAgentAllowed();
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, skipped: true };
  }
  const mod = await loadAgentRunnersModule();
  return mod.runThemeDraftAgentTask(opts);
}

export async function approveThemeDraftTask(taskId, opts) {
  const mod = await loadAgentRunnersModule();
  return mod.approveThemeDraftTask(taskId, opts);
}

export async function runScenarioAuditAgentTask(opts) {
  const { assertLocalAgentAllowed } = await import("../../agent/capabilities/prefs.js");
  const gate = assertLocalAgentAllowed();
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, skipped: true };
  }
  const mod = await loadAgentRunnersModule();
  return mod.runScenarioAuditAgentTask(opts);
}

export { CHARACTER_FIX_FIXTURE } from "./fixtures.js";
