/**
 * ActionProposal executor (W4) — controlled execution for calendar / weather / UnifiedTask.
 * R2/R3 never auto-write from chat understand; use approveProposal / rejectProposal.
 */

import { policyForRisk } from "./action-policy.js";
import {
  registerProposal,
  getProposalRecord,
  updateProposalRecord,
  markExecutedCorrelation,
  getExecutedCorrelation,
  emitActionProposal,
} from "./proposal-store.js";
import { isSuccessStatus } from "./proposal-repository.js";
import { calendarDraftCapability } from "../agent/capabilities/calendar-draft.js";
import { calendarCrudCapability } from "../agent/capabilities/calendar-crud.js";
import {
  listLocalEvents,
  clearLocalCalendarStore,
  updateLocalEvent,
  removeLocalEventByProposalId,
} from "../agent/capabilities/local-calendar-store.js";
import { createTask, transitionTask, getTask } from "../tasks/unified-task-repo.js";
import { fetchWeather } from "../status/weather.js";
import { isFeatureEnabled } from "../features/flags.js";
import { onCalendarCommitted } from "../memory/adapters/calendar.js";
import {
  searchWeb,
  requireWebEvidenceSources,
  memoryWritePolicy,
  buildSourcedArtifact,
} from "../integrations/web-retrieval/index.js";
import { saveArtifact } from "../agent/task-store.js";
import { newId, nowIso } from "../agent/schema.js";
import { getCapability } from "../capabilities/registry.js";
import { executeDeviceTool } from "../capabilities/device-tools.js";

/**
 * Register proposals from a turn and auto-run only eligible R0 / explicit R1.
 * R2/R3 stay proposed until approveProposal.
 *
 * @param {object} understanding
 * @param {{ sourceText?: string, nowIso?: string }} [opts]
 */
export async function processActionProposals(understanding, opts = {}) {
  const actions = Array.isArray(understanding?.actionProposals)
    ? understanding.actionProposals
    : [];
  const turnId = String(understanding?.turnId || "").trim();
  const fromScope = understanding?.scope && typeof understanding.scope === "object"
    ? understanding.scope
    : {};
  const scope = {
    userId: fromScope.userId || understanding?.userId || "local",
    companionId: fromScope.companionId || understanding?.companionId || "",
    relationshipId: fromScope.relationshipId || understanding?.relationshipId || "",
    conversationId: fromScope.conversationId || understanding?.conversationId || "",
  };
  const sourceText = String(opts.sourceText || understanding?.userText || "");

  /** @type {object[]} */
  const results = [];
  /** @type {object[]} */
  const pendingApproval = [];
  let calendarWrite = false;

  const temporalSnapshot =
    understanding?.temporalSnapshot && typeof understanding.temporalSnapshot === "object"
      ? understanding.temporalSnapshot
      : null;

  for (const raw of actions) {
    const capabilityPolicy = getCapability(raw?.capabilityId, raw?.operation);
    const policyApproval = String(capabilityPolicy?.approval || "");
    const forceApproval = ["always", "always-twice", "writes", "user-gesture"].includes(policyApproval);
    const minimumRisk = String(capabilityPolicy?.risk || "").includes("R3")
      ? "R3"
      : String(capabilityPolicy?.risk || "").includes("R2")
        ? "R2"
        : String(capabilityPolicy?.risk || "").includes("R1")
          ? "R1"
          : "R0";
    const riskRank = { R0: 0, R1: 1, R2: 2, R3: 3 };
    const rawRisk = String(raw?.risk || "R3");
    const enforced = {
      ...raw,
      risk: (riskRank[rawRisk] ?? 3) >= riskRank[minimumRisk] ? rawRisk : minimumRisk,
      requiresApproval: forceApproval ? true : Boolean(raw?.requiresApproval),
    };
    const registered = registerProposal(enforced, {
      turnId,
      scope,
      sourceText,
      temporalSnapshot,
      correlationId: raw?.proposalId,
      nowIso: opts.nowIso,
    });
    const record = registered.record;
    if (!record) {
      results.push({ ok: false, reason: "register_failed", proposalId: raw?.proposalId });
      continue;
    }

    const proposal = record.proposal;
    const policy = policyForRisk(proposal.risk, proposal.explicitness);

    ensureUnifiedTask(record);

    if (policy.mayAutoExecute && !proposal.requiresApproval) {
      const exec = await executeProposalInternal(proposal.proposalId, {
        approved: true,
        auto: true,
        nowIso: opts.nowIso,
      });
      results.push(exec);
      if (exec.calendarWrite) calendarWrite = true;
      continue;
    }

    updateProposalRecord(proposal.proposalId, { status: "proposed", temporalSnapshot });
    emitActionProposal(proposal, {
      turnId,
      scope,
      exactEffect: proposal.exactEffect,
      requiresApproval: true,
      temporalSnapshot,
      record,
    });
    pendingApproval.push(proposal);
    results.push({
      ok: true,
      status: "proposed",
      proposalId: proposal.proposalId,
      risk: proposal.risk,
      requiresApproval: true,
      executed: false,
      calendarWrite: false,
    });
  }

  return {
    ok: true,
    executed: results.some((r) => r.executed),
    calendarWrite,
    openClawInvoked: false,
    results,
    pendingApproval,
  };
}

/**
 * Programmatic approval API (W4). Idempotent for same proposalId.
 * @param {string} proposalId
 * @param {{ nowIso?: string, confirmExternal?: boolean }} [opts]
 */
export async function approveProposal(proposalId, opts = {}) {
  const id = String(proposalId || "").trim();
  const record = getProposalRecord(id);
  if (!record) return { ok: false, reason: "not_found", proposalId: id };

  if (record.status === "rejected") {
    return { ok: false, reason: "already_rejected", proposalId: id };
  }
  if (record.status === "expired" || record.status === "undone") {
    return { ok: false, reason: `already_${record.status}`, proposalId: id };
  }

  const prior = getExecutedCorrelation(id);
  if (prior || isSuccessStatus(record.status)) {
    return {
      ok: true,
      idempotent: true,
      proposalId: id,
      status: "executed",
      executed: true,
      calendarWrite: Boolean(prior?.eventId || record.executionResult?.eventId),
      eventId: prior?.eventId || record.executionResult?.eventId || "",
      result: record.executionResult || prior?.result || null,
    };
  }

  // In-flight / already approved: still route through execute (idempotent).
  if (record.status !== "executing") {
    updateProposalRecord(id, {
      status: "approved",
      approvedAt: new Date().toISOString(),
      proposal: { status: "approved" },
    });
    bumpTask(record, "approved");
  }

  return executeProposalInternal(id, {
    approved: true,
    auto: false,
    nowIso: opts.nowIso,
    confirmExternal: Boolean(opts.confirmExternal),
  });
}

/**
 * @param {string} proposalId
 */
export function rejectProposal(proposalId) {
  const id = String(proposalId || "").trim();
  const record = getProposalRecord(id);
  if (!record) return { ok: false, reason: "not_found", proposalId: id };

  if (isSuccessStatus(record.status)) {
    return { ok: false, reason: "already_executed", proposalId: id };
  }
  if (record.status === "rejected") {
    return { ok: true, idempotent: true, status: "rejected", proposalId: id, calendarWrite: false };
  }

  updateProposalRecord(id, {
    status: "rejected",
    rejectedAt: new Date().toISOString(),
    proposal: { status: "rejected" },
  });
  bumpTask(record, "cancelled");

  return {
    ok: true,
    status: "rejected",
    proposalId: id,
    executed: false,
    calendarWrite: false,
  };
}

/**
 * Undo a completed reversible proposal (C2). Calendar create → remove by proposalId.
 * @param {string} proposalId
 */
export async function undoProposal(proposalId) {
  const id = String(proposalId || "").trim();
  const record = getProposalRecord(id);
  if (!record) return { ok: false, reason: "not_found", proposalId: id };

  if (record.status === "undone") {
    return { ok: true, idempotent: true, status: "undone", proposalId: id };
  }
  if (!isSuccessStatus(record.status)) {
    return { ok: false, reason: "not_executed", proposalId: id, status: record.status };
  }

  const proposal = record.proposal || {};
  const reversible = proposal.reversible !== false
    || isCalendarWrite(proposal)
    || Boolean(record.executionResult?.eventId);

  if (!reversible) {
    return { ok: false, reason: "not_reversible", proposalId: id };
  }

  let calendarRemoved = false;
  let eventId = String(record.executionResult?.eventId || "").trim();

  if (isCalendarWrite(proposal) || eventId) {
    const removed = removeLocalEventByProposalId(id);
    calendarRemoved = Boolean(removed.removed);
    if (removed.eventId) eventId = removed.eventId;
    if (!removed.ok && !eventId) {
      return {
        ok: false,
        reason: removed.reason || "undo_failed",
        proposalId: id,
      };
    }
  }

  const undoInfo = {
    undoneAt: new Date().toISOString(),
    eventId,
    calendarRemoved,
    kind: record.executionResult?.kind || "calendar_event",
  };

  updateProposalRecord(id, {
    status: "undone",
    undoInfo,
    proposal: { status: "rejected" },
  });
  bumpTask(record, "cancelled", { resultSummary: "undone" });

  return {
    ok: true,
    status: "undone",
    proposalId: id,
    calendarRemoved,
    eventId,
    undoInfo,
  };
}

/**
 * @param {string} proposalId
 * @param {{ approved?: boolean, auto?: boolean, nowIso?: string, confirmExternal?: boolean }} ctx
 */
async function executeProposalInternal(proposalId, ctx = {}) {
  const record = getProposalRecord(proposalId);
  if (!record) return { ok: false, reason: "not_found", proposalId, executed: false };

  const prior = getExecutedCorrelation(proposalId);
  if (prior || isSuccessStatus(record.status)) {
    return {
      ok: true,
      idempotent: true,
      proposalId,
      status: "executed",
      executed: true,
      calendarWrite: Boolean(prior?.eventId || record.executionResult?.eventId),
      eventId: prior?.eventId || record.executionResult?.eventId || "",
      result: prior?.result || record.executionResult,
    };
  }

  const proposal = record.proposal;
  const risk = proposal.risk || "R3";
  const registeredCapability = getCapability(proposal.capabilityId, proposal.operation);

  if (!registeredCapability || !registeredCapability.implemented) {
    const reason = registeredCapability ? "capability_unavailable" : "unsupported_capability";
    updateProposalRecord(proposalId, {
      status: "failed",
      executionResult: { reason, capabilityId: proposal.capabilityId, operation: proposal.operation },
      proposal: { status: "failed" },
    });
    bumpTask(record, "failed", { errorCode: reason });
    return {
      ok: false,
      status: "failed",
      proposalId,
      risk,
      executed: false,
      calendarWrite: false,
      reason,
      capabilityId: proposal.capabilityId,
      operation: proposal.operation,
    };
  }

  updateProposalRecord(proposalId, {
    status: "executing",
    proposal: { status: "approved" },
  });

  if (risk === "R3") {
    if (!ctx.confirmExternal) {
      updateProposalRecord(proposalId, {
        status: "approved",
        proposal: { status: "approved" },
      });
      return {
        ok: true,
        status: "requires_second_confirm",
        proposalId,
        risk: "R3",
        executed: false,
        calendarWrite: false,
        reason: "not_implemented_requiresApproval",
        exactEffect: proposal.exactEffect,
      };
    }
    updateProposalRecord(proposalId, {
      status: "failed",
      executionResult: { reason: "external_send_not_implemented" },
      proposal: { status: "failed" },
    });
    bumpTask(record, "failed", { errorCode: "external_send_not_implemented" });
    return {
      ok: false,
      status: "failed",
      proposalId,
      risk: "R3",
      executed: false,
      calendarWrite: false,
      reason: "not_implemented_requiresApproval",
    };
  }

  let result;
  if (isWeatherCapability(proposal)) {
    result = await executeWeather(proposal);
  } else if (isWebSearchCapability(proposal)) {
    result = await executeWebSearch(proposal, record, ctx);
  } else if (isDeviceCapability(proposal)) {
    result = await executeDeviceProposal(proposal, ctx);
  } else if (isCalendarDraft(proposal) && risk === "R1") {
    result = executeCalendarDraft(proposal, record, ctx);
  } else if (isCalendarWrite(proposal)) {
    result = executeCalendarWrite(proposal, record, ctx);
  } else if (isCalendarRead(proposal)) {
    result = executeCalendarRead(proposal, record);
  } else {
    result = {
      ok: false,
      reason: "unsupported_capability",
      capabilityId: proposal.capabilityId,
      operation: proposal.operation,
      executed: false,
      calendarWrite: false,
    };
  }

  if (result.ok && result.executed) {
    markExecutedCorrelation(proposalId, {
      eventId: result.eventId || "",
      artifactId: result.artifactId || "",
      result,
    });
    const undoInfo = result.eventId
      ? {
        reversible: true,
        eventId: result.eventId,
        kind: result.kind || "calendar_event",
      }
      : result.reversible
        ? { reversible: true, kind: result.kind || "action" }
        : null;
    updateProposalRecord(proposalId, {
      status: "executed",
      executedAt: new Date().toISOString(),
      executionResult: result,
      undoInfo,
      proposal: {
        status: "executed",
        reversible: Boolean(undoInfo?.reversible || proposal.reversible),
      },
    });
    bumpTask(record, "succeeded", {
      resultSummary: String(result.summary || result.exactEffect || "").slice(0, 300),
    });
  } else if (!result.ok && result.reason !== "approval_required") {
    updateProposalRecord(proposalId, {
      status: "failed",
      executionResult: result,
      proposal: { status: "failed" },
    });
    bumpTask(record, "failed", { errorCode: String(result.reason || "failed") });
  }

  return {
    ...result,
    proposalId,
    risk,
  };
}

function isWeatherCapability(p) {
  const id = String(p.capabilityId || "");
  return id === "web.weather" || id.includes("weather");
}

function isWebSearchCapability(p) {
  const id = String(p.capabilityId || "");
  const op = String(p.operation || "");
  return (
    id === "web.search"
    || id === "web.retrieval"
    || id === "web.fetch"
    || op === "web_search"
    || (id.startsWith("web.") && op === "search")
  );
}

const DEVICE_TOOL_BY_ACTION = Object.freeze({
  "microphone.capture.get_status": "microphone.get_status",
  "microphone.capture.start_capture": "microphone.start_capture",
  "microphone.capture.stop_capture": "microphone.stop_capture",
  "voice.input.listen": "voice.listen",
  "voice.output.speak": "voice.speak",
  "camera.capture.get_status": "camera.get_status",
  "camera.capture.capture": "camera.capture",
  "location.current.get_current": "location.get_current",
  "screen.capture.capture": "screen.capture",
  "screen.observe.start": "screen.observe.start",
  "screen.observe.stop": "screen.observe.stop",
  "notification.send.send": "notification.send",
  "calendar.read.list_calendars": "calendar.list_calendars",
  "calendar.read.list_events": "calendar.list_events",
  "calendar.read.get_event": "calendar.get_event",
  "calendar.write.create_event": "calendar.create_event",
  "calendar.write.update_event": "calendar.update_event",
  "calendar.write.delete_event": "calendar.delete_event",
});

function isDeviceCapability(proposal) {
  const key = `${String(proposal?.capabilityId || "")}.${String(proposal?.operation || "")}`;
  return Boolean(DEVICE_TOOL_BY_ACTION[key]);
}

async function executeDeviceProposal(proposal, ctx = {}) {
  const key = `${proposal.capabilityId}.${proposal.operation}`;
  const tool = DEVICE_TOOL_BY_ACTION[key];
  const rawResult = await executeDeviceTool(tool, proposal.parameters || {}, {
    userGesture: ctx.auto !== true && ctx.approved === true,
    allowPermissionRequest: ctx.auto !== true && ctx.approved === true,
  });
  const result = dispatchEphemeralDeviceMedia(rawResult, tool);
  if (!result?.ok) {
    return {
      ...result,
      ok: false,
      executed: false,
      reason: result?.code || result?.reason || "NATIVE_ERROR",
      capabilityId: proposal.capabilityId,
      operation: proposal.operation,
      calendarWrite: false,
    };
  }
  return {
    ...result,
    ok: true,
    executed: true,
    capabilityId: proposal.capabilityId,
    operation: proposal.operation,
    calendarWrite: proposal.capabilityId === "calendar.write",
    summary: result.summary || `已执行 ${tool}`,
  };
}

function dispatchEphemeralDeviceMedia(result, tool) {
  const imageDataUrl = String(result?.dataUrl || result?.imageDataUrl || "");
  const audioDataUrl = String(result?.audioDataUrl || (
    String(result?.mimeType || "").startsWith("audio/") ? result?.dataUrl : ""
  ) || "");
  const hasImage = imageDataUrl.startsWith("data:image/");
  const hasAudio = audioDataUrl.startsWith("data:audio/");
  if (!hasImage && !hasAudio) return result;

  const artifactId = `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("yueqi:device-artifact", {
      detail: {
        artifactId,
        imageDataUrl: hasImage ? imageDataUrl : "",
        audioDataUrl: hasAudio ? audioDataUrl : "",
        source: tool.replaceAll(".", "_"),
        text: hasImage ? "看看我刚刚主动分享的画面。" : "",
      },
    }));
  }
  const {
    dataUrl: _dataUrl,
    imageDataUrl: _imageDataUrl,
    audioDataUrl: _audioDataUrl,
    ...safe
  } = result;
  return {
    ...safe,
    artifactId,
    representation: hasImage ? "temporary_image_attachment" : "temporary_audio_attachment",
  };
}

/**
 * Generic web search — only when webRetrievalV1 is on.
 * Completes solely with validated WebEvidence sources; otherwise fails honestly.
 */
async function executeWebSearch(proposal, record, ctx = {}) {
  if (!isFeatureEnabled("webRetrievalV1")) {
    return {
      ok: false,
      executed: false,
      calendarWrite: false,
      reason: "external_pending",
      message: "通用联网检索未启用（webRetrievalV1）",
      memoryPolicy: memoryWritePolicy(),
    };
  }
  if (!isFeatureEnabled("turnUnderstandingV1")) {
    return {
      ok: false,
      executed: false,
      calendarWrite: false,
      reason: "external_pending",
      message: "TurnUnderstanding 未启用",
      memoryPolicy: memoryWritePolicy(),
    };
  }

  const query = String(proposal.parameters?.query || proposal.title || "").trim();
  if (!query) {
    return {
      ok: false,
      executed: false,
      calendarWrite: false,
      reason: "empty_query",
      memoryPolicy: memoryWritePolicy(),
    };
  }

  let searchResult;
  try {
    searchResult = await searchWeb(query, {
      explicit: true,
      baseUrl: ctx.retrievalBaseUrl,
      timeoutMs: ctx.timeoutMs,
      signal: ctx.signal,
    });
  } catch (err) {
    return {
      ok: false,
      executed: false,
      calendarWrite: false,
      reason: "web_search_failed",
      error: String(err?.message || err),
      memoryPolicy: memoryWritePolicy(),
    };
  }

  if (!searchResult?.ok) {
    return {
      ok: false,
      executed: false,
      calendarWrite: false,
      reason: searchResult?.reason || "web_search_failed",
      message: searchResult?.message || "",
      memoryPolicy: memoryWritePolicy(),
      provider: searchResult?.provider || null,
    };
  }

  const sourced = requireWebEvidenceSources(searchResult.evidence);
  if (!sourced.ok) {
    return {
      ok: false,
      executed: false,
      calendarWrite: false,
      reason: sourced.reason || "no_source",
      memoryPolicy: memoryWritePolicy(),
    };
  }

  const fetchedAt = sourced.evidence[0]?.fetchedAt || new Date().toISOString();
  const summary = `联网检索「${query}」：${sourced.evidence.length} 条来源（${fetchedAt}）。资料默认不写入稳定记忆。`;

  let artifactId = "";
  if (ctx.saveAsArtifact === true) {
    const built = buildSourcedArtifact(sourced.evidence, {
      query,
      characterId: record.scope?.companionId || "",
      title: proposal.title,
    });
    if (built.ok && built.artifact) {
      const artifact = {
        id: newId("artifact"),
        ...built.artifact,
        createdAt: nowIso(),
        proposalId: proposal.proposalId,
      };
      saveArtifact(artifact);
      artifactId = artifact.id;
    }
  }

  return {
    ok: true,
    executed: true,
    calendarWrite: false,
    status: "executed",
    kind: "web_search",
    summary,
    evidence: sourced.evidence,
    sources: sourced.evidence,
    memoryPolicy: memoryWritePolicy(),
    artifactId,
    fetchedAt,
  };
}

function isCalendarWrite(p) {
  const id = String(p.capabilityId || "");
  const op = String(p.operation || "");
  return (
    id === "calendar"
    || id === "calendar-crud"
    || id === "calendar-draft"
    || op === "create_reminder"
    || op === "create"
  );
}

function isCalendarDraft(p) {
  return String(p.capabilityId || "") === "calendar-draft" || p.operation === "create_draft";
}

function isCalendarRead(p) {
  const op = String(p.operation || "");
  return op === "list" || op === "free" || op === "read";
}

async function executeWeather(proposal) {
  const city = String(proposal.parameters?.city || "当地");
  const whenText = String(proposal.parameters?.whenText || "");
  const location = String(proposal.parameters?.location || city);
  const fetchedAt = new Date().toISOString();

  let weather;
  try {
    weather = await fetchWeather(location, "locate", "");
  } catch (err) {
    return {
      ok: false,
      executed: false,
      calendarWrite: false,
      reason: "weather_fetch_failed",
      error: String(err?.message || err),
    };
  }

  const source = String(weather?.source || "unknown");
  if (weather?.available === false || weather?.condition === "unknown") {
    return {
      ok: false,
      executed: false,
      calendarWrite: false,
      reason: weather?.reason || "weather_unavailable",
      status: "failed",
      kind: "weather",
      summary: "没有获得可靠的天气结果；未读取到位置或天气服务没有返回结果。",
      weather,
      sources: [],
    };
  }
  const summary = `${city}${whenText ? `（${whenText}）` : ""}天气：${weather?.label || weather?.condition || "未知"}，来源 ${source}，于 ${fetchedAt}`;

  return {
    ok: true,
    executed: true,
    calendarWrite: false,
    status: "executed",
    kind: "weather",
    summary,
    weather: {
      ...weather,
      city,
      whenText,
      fetchedAt,
      source,
    },
    sources: [
      {
        type: "weather",
        provider: source,
        fetchedAt,
        query: proposal.parameters?.query || city,
      },
    ],
  };
}

function executeCalendarDraft(proposal, record, ctx) {
  const text =
    String(proposal.parameters?.whenText || "")
    || String(record.sourceText || "")
    || String(proposal.title || "");
  const out = calendarDraftCapability.execute(
    {
      text,
      characterId: record.scope?.companionId || "",
      nowIso: ctx.nowIso || "",
      title: proposal.parameters?.title,
    },
    {
      approved: Boolean(ctx.approved),
      characterId: record.scope?.companionId || "",
      taskId: record.taskId || "",
      commitToLocalCalendar: false,
    },
  );
  if (!out.ok) {
    return { ...out, executed: false, calendarWrite: false };
  }
  return {
    ok: true,
    executed: true,
    calendarWrite: false,
    status: "executed",
    kind: "calendar_draft",
    artifactId: out.artifactId,
    artifact: out.artifact,
    summary: out.summary,
    reversible: true,
  };
}

function executeCalendarWrite(proposal, record, ctx) {
  if (!ctx.approved) {
    return { ok: false, reason: "approval_required", executed: false, calendarWrite: false };
  }

  const proposalId = proposal.proposalId;

  const existing = listLocalEvents().find(
    (e) => e.proposalId === proposalId || e.correlationId === proposalId,
  );
  if (existing) {
    markExecutedCorrelation(proposalId, { eventId: existing.id, result: { event: existing } });
    const lifecycle = projectCalendarLifecycle(existing, {
      op: "create",
      scope: {
        userId: record.scope?.userId || "local",
        companionId: record.scope?.companionId || "",
        relationshipId: record.scope?.relationshipId || "",
      },
    });
    return {
      ok: true,
      idempotent: true,
      executed: true,
      calendarWrite: true,
      status: "executed",
      kind: "calendar_event",
      eventId: existing.id,
      event: existing,
      summary: `已存在日历事件「${existing.title}」（幂等）`,
      timelineLifecycle: lifecycle,
    };
  }

  const params = proposal.parameters || {};
  const hasStructured =
    Boolean(String(params.title || "").trim())
    && (params.hour != null || params.time || params.startsAt || params.date);
  const text = hasStructured
    ? ""
    : String(params.whenText || "")
      || String(record.sourceText || "")
      || `${params.title || proposal.title || ""} ${params.startsAt || ""}`.trim();

  const input = {
    op: "create",
    text,
    title: String(params.title || "").trim(),
    date: params.date ? String(params.date) : "",
    time: resolveProposalTime(params, record),
    prompt: String(params.prompt || record.sourceText || params.whenText || "").slice(0, 200),
    nowIso: ctx.nowIso || "",
    characterId: record.scope?.companionId || "",
  };

  if (params.startsAt && !input.date) {
    const d = new Date(params.startsAt);
    if (!Number.isNaN(d.getTime())) {
      input.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!input.time && params.hour == null) {
        input.time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
  }

  const out = calendarCrudCapability.execute(input, {
    approved: true,
    characterId: record.scope?.companionId || "",
    taskId: record.taskId || "",
  });

  if (!out.ok) {
    return { ...out, executed: false, calendarWrite: false };
  }

  let event = out.event;
  if (event?.id) {
    const updated = updateLocalEvent(event.id, {
      proposalId,
      correlationId: proposalId,
    });
    event = updated || { ...event, proposalId, correlationId: proposalId };
  }

  const lifecycle = projectCalendarLifecycle(event, {
    op: "create",
    scope: {
      userId: record.scope?.userId || "local",
      companionId: record.scope?.companionId || "",
      relationshipId: record.scope?.relationshipId || "",
    },
  });

  return {
    ok: true,
    executed: true,
    calendarWrite: true,
    status: "executed",
    kind: "calendar_event",
    eventId: event?.id || out.eventId || "",
    event,
    artifactId: out.artifactId,
    summary: out.summary || "已创建本地日历事件",
    exactEffect: proposal.exactEffect,
    timelineLifecycle: lifecycle,
  };
}

/**
 * After successful calendar repository write: adapter emits Timeline lifecycle
 * with sourceRef → calendar event id (flag-gated; never a second calendar store).
 */
function projectCalendarLifecycle(event, opts = {}) {
  if (!event?.id) return { ok: false, reason: "missing_event" };
  try {
    if (!isFeatureEnabled("unifiedMemoryAdaptersV1")) {
      return { ok: true, skipped: true, reason: "flag_off" };
    }
    return onCalendarCommitted(event, opts);
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

function resolveProposalTime(params, record) {
  if (params.time) return String(params.time).slice(0, 5);
  if (params.hour == null) return "";
  let hour = Number(params.hour);
  const minute = Number(params.minute ?? 0);
  const hint = `${params.whenText || ""} ${record.sourceText || ""}`;
  if (/下午|午后|晚上|傍晚/.test(hint) && hour > 0 && hour < 12) hour += 12;
  if (/上午|早上|清晨/.test(hint) && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function executeCalendarRead(proposal, record) {
  const op = String(proposal.operation || "list");
  const out = calendarCrudCapability.execute(
    {
      op: op === "read" ? "list" : op,
      date: proposal.parameters?.date,
      characterId: record.scope?.companionId || "",
    },
    { approved: false },
  );
  return {
    ok: Boolean(out.ok),
    executed: Boolean(out.ok),
    calendarWrite: false,
    status: out.ok ? "executed" : "failed",
    kind: "calendar_read",
    summary: out.summary,
    preview: out.preview,
    artifactId: out.artifactId,
    reason: out.reason,
  };
}

function ensureUnifiedTask(record) {
  if (record.taskId) return record.taskId;
  const proposal = record.proposal;
  const created = createTask({
    userId: record.scope?.userId || "local",
    companionId: record.scope?.companionId || "",
    title: proposal.title || proposal.exactEffect || "ActionProposal",
    kind: "action_proposal",
    state: proposal.requiresApproval ? "awaiting_approval" : "approved",
    executor: "local",
    correlationId: proposal.proposalId,
    idempotencyKey: `action-proposal:${proposal.proposalId}`,
    approvalId: proposal.proposalId,
    steps: [
      {
        capabilityId: proposal.capabilityId,
        operation: proposal.operation,
        risk: proposal.risk,
      },
    ],
    auditRefs: [`proposal:${proposal.proposalId}`],
  });
  if (created.ok && created.value?.taskId) {
    updateProposalRecord(proposal.proposalId, { taskId: created.value.taskId });
    record.taskId = created.value.taskId;
    return created.value.taskId;
  }
  return "";
}

function bumpTask(record, state, patch = {}) {
  const taskId = record.taskId || getProposalRecord(record.proposal?.proposalId)?.taskId;
  if (!taskId) return;
  try {
    transitionTask(taskId, state, patch);
  } catch {
    /* non-fatal */
  }
}

/** Test helper */
export function clearExecutorCalendarForTests() {
  clearLocalCalendarStore();
}

export { getTask, listLocalEvents };
