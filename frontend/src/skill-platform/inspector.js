/**
 * Skill Run debug inspector — enabled skill, resources, scopes, tokens, proposals, memory candidates.
 * Sensitive source text collapsed by default.
 */

import { getCatalogEntry, getInstallation, listSkillFiles } from "./store.js";
import { getSkillRun, listSkillRuns } from "./run-store.js";
import { loadSkillPromptResources, estimateTokens } from "./prompt-loader.js";
import { listPendingCandidates } from "./memory-candidates.js";
import { listSkillAuditEvents } from "./audit.js";
import { getAgentProfile } from "../agents/profile-store.js";
import { listTasks } from "../agent/task-store.js";

const SENSITIVE_COLLAPSE_LEN = 80;

function collapseSensitive(text, expanded = false) {
  const t = String(text || "").trim();
  if (!t) return "";
  if (expanded || t.length <= SENSITIVE_COLLAPSE_LEN) return t;
  return `${t.slice(0, SENSITIVE_COLLAPSE_LEN)}… [${t.length} chars, collapsed]`;
}

/**
 * Build inspector snapshot for a SkillRun or active run hint.
 * @param {{
 *   runId?: string,
 *   skillId?: string,
 *   agentId?: string,
 *   expandSensitive?: boolean,
 * }} [opts]
 */
export function buildSkillInspectorSnapshot(opts = {}) {
  const runId = String(opts.runId || "").trim();
  let run = runId ? getSkillRun(runId) : null;

  if (!run && opts.skillId) {
    const runs = listSkillRuns({
      skillId: String(opts.skillId),
      agentId: opts.agentId,
      status: "active",
    });
    run = runs[0] || listSkillRuns({ skillId: String(opts.skillId), status: "paused" })[0] || null;
  }

  if (!run) {
    return {
      ok: false,
      reason: "no_run",
      enabledSkill: null,
      resources: [],
      scopes: null,
      tokenEstimate: 0,
      capabilityProposals: [],
      memoryCandidates: [],
      auditTrail: [],
    };
  }

  const skillId = run.skillId;
  const catalog = getCatalogEntry(skillId);
  const installation = getInstallation(skillId);
  const agent = run.agentId ? getAgentProfile(run.agentId) : null;
  const enabled = installation?.enabled !== false;
  const version = run.skillVersion || catalog?.version || "1.0.0";

  const loaded = loadSkillPromptResources({
    skillId,
    version,
    manifest: catalog || {},
    nextAction: run.hostState?.phase || run.meta?.lastAction || "",
    hostState: run.hostState || {},
  });

  /** @type {object[]} */
  const resourceRows = [];
  for (const path of loaded.trace?.loadedPaths || []) {
    const file = listSkillFiles(skillId, version, path)[0];
    resourceRows.push({
      path,
      kind: /polic/i.test(path) ? "policy" : /schema/i.test(path) ? "schema" : "system",
      tokens: estimateTokens(file?.content || ""),
      preview: collapseSensitive(file?.content || loaded.system, opts.expandSensitive),
    });
  }

  const tokenEstimate = loaded.tokenEstimate || resourceRows.reduce((sum, r) => sum + r.tokens, 0);

  const pending = listPendingCandidates(run.id);
  const memoryCandidates = pending.map((c) => ({
    id: c.id,
    target: c.target,
    status: c.status,
    text: collapseSensitive(c.text, opts.expandSensitive),
    evidenceCount: Array.isArray(c.evidence) ? c.evidence.length : 0,
    evidencePreview: collapseSensitive(
      Array.isArray(c.evidence) ? c.evidence.map((e) => e.text || e.id || "").join(" | ") : "",
      opts.expandSensitive,
    ),
  }));

  const auditTrail = listSkillAuditEvents({ skillRunId: run.id, limit: 20 });

  const tasks = listTasks().filter((t) =>
    String(t.meta?.skillRunId || t.idempotentKey || "").includes(run.id),
  );

  const capabilityProposals = tasks
    .filter((t) => t.state === "proposed" || t.state === "running" || t.state === "completed")
    .map((t) => ({
      taskId: t.id,
      capabilityId: t.intent?.capabilityId,
      title: t.intent?.title,
      state: t.state,
      skillRunId: run.id,
    }));

  return {
    ok: true,
    runId: run.id,
    skillId,
    agentId: run.agentId,
    agentName: agent?.name,
    enabledSkill: {
      id: skillId,
      name: catalog?.name || skillId,
      version,
      enabled,
      integrityFlag: installation?.integrityFlag || null,
    },
    resources: resourceRows,
    scopes: run.scopes || agent?.defaultScopes || null,
    grantedCapabilities: run.grantedCapabilities || installation?.grants?.capabilities || [],
    tokenEstimate,
    capabilityProposals,
    memoryCandidates,
    auditTrail: auditTrail.map((e) => ({
      id: e.id,
      type: e.type,
      at: e.at,
      skillRunId: e.meta?.skillRunId,
      taskId: e.meta?.taskId,
      detail: e.detail,
    })),
    trace: {
      mode: run.mode,
      status: run.status,
      stateRevision: run.stateRevision,
      loadedPaths: loaded.trace?.loadedPaths || [],
    },
  };
}

/**
 * Minimal shape check for verify scripts.
 * @param {object} snapshot
 */
export function validateInspectorShape(snapshot) {
  const required = [
    "enabledSkill",
    "resources",
    "scopes",
    "tokenEstimate",
    "capabilityProposals",
    "memoryCandidates",
    "auditTrail",
  ];
  return required.every((k) => Object.prototype.hasOwnProperty.call(snapshot, k));
}
