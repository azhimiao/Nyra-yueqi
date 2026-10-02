/**
 * Scenario persistence helpers — pause/resume + idempotent memory commit.
 */

import {
  buildScenarioExperienceRecord,
  ingestScenarioFinaleToCompanion,
  scenarioFinaleIdempotentKey,
} from "../../companion/scenario-memory-bridge.js";
import { saveDiary } from "../../diary/records.js";
import { emitAppEvent } from "../../world/app-events.js";
import { getActiveCharacterId, getCharacterSync } from "../../characters/store.js";
import { recordScenarioFinale } from "../../life/confluence.js";
import { endRun, getRun, getScript, pauseRun, saveRun } from "../store.js";
import { transitionPhase } from "./state-machine.js";

/**
 * Persist pause with explicit phase.
 */
export function pauseScenarioRun(runId) {
  return pauseRun(runId);
}

/**
 * Resume a paused run → interactive phase.
 */
export function resumeScenarioRun(runId) {
  const run = getRun(runId);
  if (!run) return null;
  const resumePhase = run.directorState?.resumePhase || "waiting_choice";
  const stepped = transitionPhase("paused", resumePhase);
  const phase = stepped.ok ? stepped.phase : "waiting_choice";
  return saveRun({
    ...run,
    status: "active",
    phase,
    directorState: {
      ...(run.directorState || {}),
      phase,
    },
  });
}

/**
 * Idempotent finale → diary + cohabit/life. Safe to call twice.
 * @returns {{ ok: boolean, alreadyCommitted?: boolean, diaryId?: string, eventId?: string, runId?: string, summary?: string, error?: string }}
 */
export async function commitFinaleMemory(runId, summaryOverride = "") {
  const run = getRun(runId);
  if (!run) return { ok: false, error: "unknown_run" };

  const finaleSummary = String(summaryOverride || run.summary || "").trim();
  if (!finaleSummary) return { ok: false, error: "empty_summary" };

  const resolvedRunId = String(run.id || runId || "").trim();
  const characterId = String(run.cast?.leadId || getActiveCharacterId() || "").trim();

  if (run.memoryCommitted) {
    return {
      ok: true,
      alreadyCommitted: true,
      diaryId: run.memoryCommit?.diaryId || "",
      eventId: run.memoryCommit?.eventId || "",
      runId: run.memoryCommit?.runId || resolvedRunId,
      summary: finaleSummary,
    };
  }

  const script = getScript(run.scriptId);
  const title = `情景剧 · ${script?.title || "谢幕"}`;
  const leadName = getCharacterSync(characterId || run.cast?.leadId)?.name || "角色";

  let diaryId = "";
  try {
    const diary = await saveDiary({
      title,
      body: finaleSummary,
      roleName: leadName,
      tags: ["情景剧", "谢幕"],
    });
    diaryId = String(diary?.id || "");
  } catch (error) {
    console.warn("scenario finale diary failed", error);
    // Degrade: still mark cohabit; caller may toast
  }

  let eventId = "";
  try {
    const written = recordScenarioFinale({
      characterId,
      runId: resolvedRunId,
      scriptId: run.scriptId,
      scriptTitle: script?.title || "",
      summary: finaleSummary,
      diaryId,
    });
    eventId = String(written?.event?.id || "");
  } catch (error) {
    console.warn("scenario finale cohabit failed", error);
  }

  const experienceRecord = buildScenarioExperienceRecord({
    runId: resolvedRunId,
    scriptId: run.scriptId || "",
    scriptTitle: script?.title || "",
    summary: finaleSummary,
    characterId,
    diaryId,
    eventId,
    memoryCandidate: run.directorState?.memoryCandidate || "",
    directorState: run.directorState || {},
  });

  let companionMemory = null;
  try {
    companionMemory = ingestScenarioFinaleToCompanion({
      runId: resolvedRunId,
      scriptId: run.scriptId || "",
      scriptTitle: script?.title || "",
      summary: finaleSummary,
      characterId,
      diaryId,
      eventId,
      memoryCandidate: run.directorState?.memoryCandidate || "",
      directorState: run.directorState || {},
    });
  } catch (error) {
    console.warn("scenario finale companion memory failed", error);
  }

  const ended = endRun(run.id, finaleSummary);
  saveRun({
    ...ended,
    status: "ended",
    phase: "memory_commit",
    summary: finaleSummary,
    memoryCommitted: true,
    memoryCommit: {
      at: new Date().toISOString(),
      diaryId,
      eventId,
      runId: resolvedRunId,
    },
    directorState: {
      ...(ended.directorState || {}),
      phase: "memory_commit",
    },
  });

  emitAppEvent("scenario.event.completed", {
    appId: "scenario",
    runId: resolvedRunId,
    scriptId: run.scriptId || "",
    scriptTitle: script?.title || "",
    characterId,
    diaryId,
    eventId,
    summary: finaleSummary.slice(0, 160),
    narrativeSummary: finaleSummary.slice(0, 240),
    relationshipDeltaCandidates: experienceRecord.relationshipDeltaCandidates,
    importantFactCandidates: experienceRecord.importantFactCandidates,
    idempotentKey: scenarioFinaleIdempotentKey(resolvedRunId),
  });

  return {
    ok: true,
    alreadyCommitted: false,
    diaryId,
    eventId,
    runId: resolvedRunId,
    summary: finaleSummary,
    companionMemory,
    experienceRecord,
  };
}

/**
 * Apply ScenarioTurn deltas onto run.directorState (single writer).
 */
export function applyTurnToRunState(run, turn) {
  const tension = turn?._tension != null
    ? turn._tension
    : Math.max(
        0,
        Math.min(
          3,
          (Number(run.directorState?.tension) || 1) + Number(turn?.stateDelta?.tension || 0),
        ),
      );
  const intimacy = Math.max(
    0,
    Math.min(5, (Number(run.directorState?.intimacy) || 0) + Number(turn?.stateDelta?.intimacy || 0)),
  );
  const trust = Math.max(
    0,
    Math.min(5, (Number(run.directorState?.trust) || 0) + Number(turn?.stateDelta?.trust || 0)),
  );
  const flags = {
    ...(run.directorState?.flags || {}),
  };
  for (const flag of turn?.stateDelta?.flags || []) {
    flags[String(flag)] = true;
  }
  const beatCursor = turn?._beatCursor != null
    ? turn._beatCursor
    : (Number(run.directorState?.beatCursor) || 0);
  const beatNodeId = turn?._beatNodeId != null
    ? String(turn._beatNodeId)
    : (run.directorState?.beatNodeId || "");

  return {
    tension,
    intimacy,
    trust,
    flags,
    beatCursor,
    beatNodeId,
    lastBeatId: turn?.beatId || run.directorState?.lastBeatId || "",
    lastActionId: turn?.actionId || "",
    lastExpressionId: turn?.expressionId || "",
    lastEmotion: turn?.emotion || "",
    backgroundId: turn?.backgroundId || run.directorState?.backgroundId || "",
    memoryCandidate: turn?.memoryCandidate || run.directorState?.memoryCandidate || "",
    phase: run.phase || run.directorState?.phase || "playing",
    lastGenerationSource: turn?._generationSource
      || run.directorState?.lastGenerationSource
      || "",
    lastGenerationReason: turn?._generationReason
      || run.directorState?.lastGenerationReason
      || "",
  };
}
