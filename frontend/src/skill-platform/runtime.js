/**
 * Skill Runtime — Host envelope, SkillTurn parse/validate, atomic commit.
 */

import { getCatalogEntry, getInstallation } from "./store.js";
import { getSkillRun, updateSkillRun } from "./run-store.js";
import { appendSkillAssistantMessage, createProductionConversationApi } from "./conversation-binding.js";
import { buildContextRequestFromSkillRun } from "./context-request.js";
import { loadSkillPromptResources } from "./prompt-loader.js";
import { parseSkillTurnJson } from "./turn-parser.js";
import {
  applyHostStatePatch,
  readHostState,
  resolveAllowedActions,
  resolveStatePatchWhitelist,
} from "./state-machine.js";
import { addPendingCandidates, listPendingCandidates } from "./memory-candidates.js";
import { getSkillAdapter } from "./adapters/index.js";
import { appendSkillAuditEvent } from "./audit.js";
import { createTaskDraft, proposeTask } from "../agent/executor.js";
import { listCapabilities, registerBuiltinCapabilities } from "../agent/capabilities/index.js";

let capsReady = false;
function ensureCaps() {
  if (!capsReady) {
    registerBuiltinCapabilities();
    capsReady = true;
  }
}

const HOST_TURN_PROTOCOL = Object.freeze({
  schema: "yueqi-skill-turn.v1",
  fields: ["assistantText", "nextAction", "statePatch", "memoryCandidates", "taskProposals"],
});

/**
 * Default context builder — ContextRequest helper + optional broker (try/catch).
 * @param {object} run
 * @param {Record<string, unknown>} partial
 * @param {{ buildContextEnvelope?: Function }} deps
 */
export async function defaultBuildContext(run, partial = {}, deps = {}) {
  const request = buildContextRequestFromSkillRun(run, partial);
  if (typeof deps.buildContextEnvelope === "function") {
    try {
      const envelope = await deps.buildContextEnvelope(request);
      return { ok: true, request, envelope };
    } catch (err) {
      return {
        ok: false,
        request,
        error: String(err?.message || err),
      };
    }
  }
  return { ok: true, request, envelope: null };
}

/**
 * @param {object} manifest
 * @param {object} installation
 * @param {object} run
 * @param {string} capabilityId
 */
export function isCapabilityGranted(manifest, installation, run, capabilityId) {
  ensureCaps();
  const cap = String(capabilityId || "").trim();
  if (!cap) return false;

  const registryIds = new Set(listCapabilities().map((c) => c.id));
  if (!registryIds.has(cap)) return false;

  const requested = new Set((manifest?.requestedCapabilities || []).map(String));
  const installGrants = new Set((installation?.grants?.capabilities || []).map(String));
  const runGrants = new Set((run?.grantedCapabilities || []).map(String));

  return requested.has(cap) && installGrants.has(cap) && runGrants.has(cap);
}

/**
 * @param {object[]} proposals
 * @param {object} ctx
 */
function filterTaskProposals(proposals, ctx) {
  /** @type {object[]} */
  const accepted = [];
  /** @type {object[]} */
  const rejected = [];
  for (const proposal of proposals || []) {
    if (isCapabilityGranted(ctx.manifest, ctx.installation, ctx.run, proposal.capabilityId)) {
      accepted.push(proposal);
    } else {
      rejected.push({ ...proposal, reason: "capability_not_granted" });
    }
  }
  return { accepted, rejected };
}

/**
 * @param {{
 *   runId: string,
 *   userText?: string,
 *   nextAction?: string,
 *   deps?: object,
 * }} input
 */
export async function buildHostEnvelope(input) {
  const runId = String(input.runId || "").trim();
  const run = getSkillRun(runId);
  if (!run) return { ok: false, reason: "run_not_found" };

  const catalog = getCatalogEntry(run.skillId);
  if (!catalog) return { ok: false, reason: "skill_not_installed" };

  const hostState = readHostState(run);
  const resources = loadSkillPromptResources({
    skillId: run.skillId,
    version: run.skillVersion,
    manifest: catalog,
    nextAction: input.nextAction,
    hostState,
  });

  const deps = input.deps || {};
  const context = await (deps.buildContext || defaultBuildContext)(run, {
    currentInput: String(input.userText || ""),
    conversationSessionId: run.conversation?.conversationSessionId,
    characterId: run.characterId,
  }, deps);

  const allowedActions = resolveAllowedActions(catalog);
  const patchWhitelist = resolveStatePatchWhitelist(catalog, run.skillId, run.skillVersion);

  return {
    ok: true,
    value: {
      runId: run.id,
      skillId: run.skillId,
      stateRevision: run.stateRevision,
      resources,
      context,
      protocol: HOST_TURN_PROTOCOL,
      allowedActions,
      patchWhitelist,
      hostState,
    },
    trace: {
      skillResources: resources.trace,
      contextRequest: context.request,
      skillResourcesLoaded: resources.trace.loadedPaths.length > 0,
    },
  };
}

/**
 * @param {{
 *   runId: string,
 *   userText?: string,
 *   modelResponseJson: unknown,
 *   expectedRevision?: number,
 *   deps?: {
 *     conversationApi?: object,
 *     createTaskDraft?: Function,
 *     proposeTask?: Function,
 *   },
 * }} input
 */
export function commitSkillTurn(input) {
  const runId = String(input.runId || "").trim();
  const run = getSkillRun(runId);
  if (!run) return { ok: false, reason: "run_not_found" };
  if (run.status !== "active") return { ok: false, reason: "run_not_active" };

  const expectedRevision =
    input.expectedRevision != null ? Number(input.expectedRevision) : Number(run.stateRevision);
  if (Number(run.stateRevision) !== expectedRevision) {
    return {
      ok: false,
      reason: "revision_conflict",
      currentRevision: run.stateRevision,
    };
  }

  const parsed = parseSkillTurnJson(input.modelResponseJson);
  if (!parsed.ok) return parsed;

  const catalog = getCatalogEntry(run.skillId);
  const installation = getInstallation(run.skillId);
  if (!catalog) return { ok: false, reason: "skill_not_installed" };

  const allowedActions = resolveAllowedActions(catalog);
  if (!allowedActions.includes(parsed.value.nextAction)) {
    return { ok: false, reason: "unknown_next_action", nextAction: parsed.value.nextAction };
  }

  const adapter = getSkillAdapter(run.skillId);
  const hostState = readHostState(run);
  if (adapter?.validateTurn) {
    const adapterCheck = adapter.validateTurn(parsed.value, hostState, { catalog, run });
    if (!adapterCheck.ok) {
      return { ...adapterCheck, zeroCommit: true };
    }
  }

  if (adapter?.preparePatch && parsed.value.statePatch) {
    parsed.value.statePatch = adapter.preparePatch(parsed.value.statePatch, hostState, parsed.value);
  } else if (adapter?.preparePatch) {
    parsed.value.statePatch = adapter.preparePatch({}, hostState, parsed.value);
  }

  const patchWhitelist = resolveStatePatchWhitelist(catalog, run.skillId, run.skillVersion);
  const patchKeys = Object.keys(parsed.value.statePatch || {});
  if (patchKeys.length > 0) {
    for (const key of patchKeys) {
      if (!patchWhitelist.includes(key)) {
        return { ok: false, reason: "illegal_state_patch_key", key };
      }
    }
  }

  const beforeRevision = run.stateRevision;
  const beforeCandidates = listPendingCandidates(runId).length;
  const conversationApi = input.deps?.conversationApi || createProductionConversationApi();
  const createDraft = input.deps?.createTaskDraft || createTaskDraft;
  const propose = input.deps?.proposeTask || proposeTask;

  const sessionId = String(run.conversation?.conversationSessionId || "").trim();
  if (!sessionId || !conversationApi.getSession?.(sessionId)) {
    return { ok: false, reason: "missing_conversation_session" };
  }

  const { accepted, rejected } = filterTaskProposals(parsed.value.taskProposals, {
    manifest: catalog,
    installation,
    run,
  });

  /** @type {object[]} */
  const createdTasks = [];

  try {
    const msg = appendSkillAssistantMessage(run, parsed.value.assistantText, conversationApi);
    if (!msg.ok) {
      return { ok: false, reason: msg.reason || "conversation_append_failed", zeroCommit: true };
    }

    let nextRun = run;
    if (patchKeys.length > 0) {
      const patched = applyHostStatePatch(runId, parsed.value.statePatch, {
        expectedRevision,
        whitelist: patchWhitelist,
      });
      if (!patched.ok) return { ...patched, zeroCommit: true };
      nextRun = patched.value;
    } else {
      const touched = updateSkillRun(runId, { meta: { ...(run.meta || {}) } }, { expectedRevision });
      if (!touched.ok) return { ...touched, zeroCommit: true };
      nextRun = touched.value;
    }

    if (parsed.value.memoryCandidates.length > 0) {
      const stored = addPendingCandidates(runId, parsed.value.memoryCandidates);
      if (!stored.ok) return { ok: false, reason: stored.reason, zeroCommit: true };
      for (const candidate of stored.value || []) {
        appendSkillAuditEvent({
          type: "memory_candidate",
          skillId: run.skillId,
          detail: String(candidate.target || "unknown"),
          meta: {
            skillRunId: runId,
            candidateId: candidate.id,
            evidenceCount: Array.isArray(candidate.evidence) ? candidate.evidence.length : 0,
          },
        });
      }
    }

    for (const proposal of accepted) {
      const idempotentKey = `skillrun:${runId}:${proposal.capabilityId}:${proposal.title || "task"}`;
      const draft = createDraft({
        capabilityId: proposal.capabilityId,
        characterId: run.characterId || "default",
        title: proposal.title,
        input: proposal.input || {},
        idempotentKey,
      });
      if (!draft.ok) return { ok: false, reason: draft.reason, zeroCommit: true };

      const proposed = propose(draft.value.id);
      if (!proposed.ok) return { ok: false, reason: proposed.reason, zeroCommit: true };

      createdTasks.push({
        taskId: draft.value.id,
        capabilityId: proposal.capabilityId,
        state: proposed.value?.state,
      });

      appendSkillAuditEvent({
        type: "task_proposal",
        skillId: run.skillId,
        detail: proposal.capabilityId,
        meta: { skillRunId: runId, taskId: draft.value.id },
      });
    }

    appendSkillAuditEvent({
      type: "skill_turn",
      skillId: run.skillId,
      detail: parsed.value.nextAction,
      meta: {
        skillRunId: runId,
        stateRevision: nextRun.stateRevision,
        memoryCandidates: parsed.value.memoryCandidates.length,
        tasks: createdTasks.length,
      },
    });

    return {
      ok: true,
      value: {
        run: getSkillRun(runId),
        assistantMessage: msg,
        memoryCandidates: listPendingCandidates(runId).slice(beforeCandidates),
        tasks: createdTasks,
        rejectedTaskProposals: rejected,
      },
      committed: {
        stateRevisionFrom: beforeRevision,
        stateRevisionTo: getSkillRun(runId)?.stateRevision,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "commit_failed",
      detail: String(err?.message || err),
      zeroCommit: true,
    };
  }
}

/**
 * @param {{
 *   runId: string,
 *   userText?: string,
 *   modelResponseJson: unknown,
 *   expectedRevision?: number,
 *   deps?: object,
 * }} input
 */
export async function executeSkillTurn(input) {
  const envelope = await buildHostEnvelope({
    runId: input.runId,
    userText: input.userText,
    deps: input.deps,
  });
  if (!envelope.ok) return envelope;

  const commit = commitSkillTurn({
    runId: input.runId,
    userText: input.userText,
    modelResponseJson: input.modelResponseJson,
    expectedRevision: input.expectedRevision ?? envelope.value.stateRevision,
    deps: input.deps,
  });

  return {
    ...commit,
    envelope: envelope.value,
    trace: envelope.trace,
  };
}
