/**
 * Experience Runtime — enter / pause / resume / end (§13.2 / §14 W3).
 * Mounts ExperienceSession onto Conversation V2 (conversationSessionId + activeBranchId).
 */

import {
  createExperienceSession,
  createEmptySceneState,
  createDirectorAgenda,
  createExperienceId,
  createExperienceBranchSnapshot,
} from "./schema.js";
import { getPackageOpening } from "./package-io.js";
import {
  getRegisteredPackage,
  registerPackage,
  saveExperienceSession,
  getExperienceSession,
  getActiveExperienceSession,
  getActiveExperienceForCharacter,
} from "./store.js";
import {
  enterImmersive,
  exitImmersive,
  sendUser,
  appendAssistantCandidate,
  getSession,
  getActiveCandidate,
} from "../conversation/index.js";
import { bindScenarioConversation, rebindAwayFromCompanionDm } from "./conversation-bind.js";

/**
 * Resolve package by id or legacy script id.
 * @param {string} packageId
 * @param {object} [pkgOverride]
 */
function resolvePackage(packageId, pkgOverride) {
  if (pkgOverride) {
    const reg = registerPackage(pkgOverride);
    if (reg.ok) return reg.value;
  }
  return getRegisteredPackage(packageId);
}

/**
 * Enter an experience: create session, mount Conversation V2 immersive mode.
 * Free input is primary; opening suggestedActions seed the first UI chips only.
 *
 * @param {{
 *   packageId: string,
 *   openingId?: string,
 *   characterId: string,
 *   package?: object,
 *   legacyRunId?: string,
 *   conversationSessionId?: string,
 *   runKind?: string,
 *   meta?: object,
 * }} opts
 */
export function enterExperience(opts = {}) {
  const characterId = String(opts.characterId || "").trim();
  if (!characterId) return { ok: false, reason: "character_id_required" };

  const packageId = String(opts.packageId || opts.package?.id || "").trim();
  if (!packageId) return { ok: false, reason: "package_id_required" };

  const pkg = resolvePackage(packageId, opts.package);
  if (!pkg) return { ok: false, reason: "package_not_found" };

  const opening = getPackageOpening(pkg, opts.openingId);
  if (!opening) return { ok: false, reason: "opening_not_found" };

  // Pause any other active experience for this character
  const existing = getActiveExperienceForCharacter(characterId);
  if (existing && existing.status === "active") {
    pauseExperience(existing.id);
  }

  const experienceId = createExperienceId("exps");
  let conversationSession;
  try {
    const bound = bindScenarioConversation({
      packageId: pkg.id,
      openingId: opening.id,
      runId: opts.legacyRunId || experienceId,
      conversationSessionId: opts.conversationSessionId,
      characterId,
    });
    if (!bound.ok || !bound.session) {
      return { ok: false, reason: bound.reason || "scenario_session_failed" };
    }
    conversationSession = bound.session;
  } catch (error) {
    return { ok: false, reason: `conversation_session_failed:${error?.message || error}` };
  }

  const sceneState = createEmptySceneState({
    ...opening.initialSceneState,
    openingId: opening.id,
    experienceId: pkg.id,
    relationshipPremise:
      opening.relationshipPremise || opening.initialSceneState?.relationshipPremise || "",
    turnIndex: 0,
  });

  const initialDisplay = opening.openingTurns?.length
    ? opening.openingTurns[opening.openingTurns.length - 1]
    : null;
  const initialSnapshot = createExperienceBranchSnapshot({
    sceneState,
    suggestedActions: opening.suggestedActions || [],
    lastPerformance: opening.initialPerformance || null,
    lastDisplay: initialDisplay
      ? {
          narration: initialDisplay.narration || "",
          dialogue: initialDisplay.dialogue || "",
          contentBlocks: [
            initialDisplay.narration
              ? { id: "opening-narration", type: "narration", text: initialDisplay.narration }
              : null,
            initialDisplay.dialogue
              ? { id: "opening-dialogue", type: "dialogue", speakerId: "lead", text: initialDisplay.dialogue }
              : null,
          ].filter(Boolean),
        }
      : null,
  });
  const session = createExperienceSession({
    id: experienceId,
    packageId: pkg.id,
    packageVersion: pkg.version,
    characterId,
    conversationSessionId: conversationSession.id,
    activeBranchId: conversationSession.activeBranchId,
    openingId: opening.id,
    status: "active",
    sceneState,
    directorAgenda: createDirectorAgenda(
      opening.directorAgenda || pkg.directorPolicy?.defaultAgenda || {},
    ),
    suggestedActions: opening.suggestedActions || [],
    lastPerformance: opening.initialPerformance || null,
    lastDisplay: initialSnapshot.lastDisplay,
    branchSnapshots: {
      [conversationSession.activeBranchId]: initialSnapshot,
    },
    legacyRunId: opts.legacyRunId || "",
    meta: {
      legacyScriptId: pkg.legacyScriptId || "",
      title: pkg.title,
      openingTitle: opening.title,
      runKind: String(opts.runKind || opts.meta?.runKind || "live"),
      preview: opts.runKind === "preview" || opts.runKind === "sandbox" || opts.meta?.preview === true,
      ...(opts.meta && typeof opts.meta === "object" ? opts.meta : {}),
    },
  });

  const saved = saveExperienceSession(session);
  if (!saved.ok) return saved;

  // Mount onto Conversation V2
  const mounted = enterImmersive(conversationSession.id, {
    runId: session.legacyRunId || session.id,
    scenarioId: pkg.legacyScriptId || pkg.id,
    loreEntryIds: opening.enabledLoreIds || [],
    experienceSessionId: session.id,
    packageId: pkg.id,
    openingId: opening.id,
  });
  if (!mounted.ok) {
    return { ok: false, reason: mounted.reason || "enter_immersive_failed", session: saved.value };
  }

  // Seed opening assistant turns into conversation (if any)
  const liveSession = getSession(conversationSession.id) || conversationSession;
  for (const turn of opening.openingTurns || []) {
    if (turn.role === "user" && (turn.dialogue || turn.narration)) {
      sendUser(liveSession.id, turn.dialogue || turn.narration, {
        mode: "immersive",
        experienceSessionId: session.id,
        openingSeed: true,
      });
    } else if (turn.dialogue || turn.narration) {
      const text = [turn.narration, turn.dialogue].filter(Boolean).join("\n");
      appendAssistantCandidate(liveSession.id, text, {
        mode: "immersive",
        narration: turn.narration || "",
        performance: turn.performance || opening.initialPerformance,
        suggestedActions: opening.suggestedActions,
        contentBlocks: [
          turn.narration
            ? { id: `opening-${opening.id}-narration`, type: "narration", text: turn.narration }
            : null,
          turn.dialogue
            ? { id: `opening-${opening.id}-dialogue`, type: "dialogue", speakerId: "lead", text: turn.dialogue }
            : null,
        ].filter(Boolean),
        experienceSnapshot: initialSnapshot,
        experienceSessionId: session.id,
        openingSeed: true,
      });
    }
  }

  // Refresh activeBranchId after seeds
  const after = getSession(conversationSession.id);
  if (after) {
    saved.value.activeBranchId = after.activeBranchId;
    saveExperienceSession(saved.value);
  }

  return {
    ok: true,
    value: getExperienceSession(session.id),
    package: pkg,
    opening,
    conversationSessionId: conversationSession.id,
  };
}

/**
 * @param {string} experienceSessionId
 * @param {{ draft?: string }} [opts]
 */
export function pauseExperience(experienceSessionId, opts = {}) {
  const session = getExperienceSession(experienceSessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  if (session.status === "ended" || session.status === "archived") {
    return { ok: false, reason: "session_already_closed" };
  }
  const next = {
    ...session,
    status: "paused",
    inputDraft: opts.draft != null ? String(opts.draft) : session.inputDraft || "",
  };
  return saveExperienceSession(next);
}

/**
 * @param {string} experienceSessionId
 */
export function resumeExperience(experienceSessionId) {
  const session = getExperienceSession(experienceSessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  if (session.status === "ended" || session.status === "archived") {
    return { ok: false, reason: "session_already_closed" };
  }

  const rebound = rebindAwayFromCompanionDm({
    conversationSessionId: session.conversationSessionId,
    packageId: session.packageId,
    openingId: session.openingId,
    runId: session.legacyRunId || session.id,
    characterId: session.characterId,
  });
  const conv = rebound.ok ? rebound.session : getSession(session.conversationSessionId);
  if (conv) {
    session.conversationSessionId = conv.id;
    enterImmersive(conv.id, {
      runId: session.legacyRunId || session.id,
      scenarioId: session.meta?.legacyScriptId || session.packageId,
      experienceSessionId: session.id,
      packageId: session.packageId,
      openingId: session.openingId,
      loreEntryIds: conv.loreEntryIds || [],
    });
    session.activeBranchId = conv.activeBranchId;
  }

  return saveExperienceSession({
    ...session,
    status: "active",
  });
}

/**
 * Finale / end current experience session (user-driven, not beat-tree end).
 * @param {string} experienceSessionId
 * @param {{ archive?: boolean, reason?: string }} [opts]
 */
export function endExperience(experienceSessionId, opts = {}) {
  const session = getExperienceSession(experienceSessionId);
  if (!session) return { ok: false, reason: "session_not_found" };

  if (session.conversationSessionId) {
    try {
      exitImmersive(session.conversationSessionId);
    } catch {
      /* best effort */
    }
  }

  const now = new Date().toISOString();
  return saveExperienceSession({
    ...session,
    status: opts.archive ? "archived" : "ended",
    endedAt: now,
    meta: {
      ...(session.meta || {}),
      endReason: String(opts.reason || "user_finale"),
    },
  });
}

function nearestConversationSnapshot(conv, branchId) {
  let messageId = conv?.branches?.[branchId]?.headMessageId || "";
  const seen = new Set();
  while (messageId && !seen.has(messageId)) {
    seen.add(messageId);
    const node = conv?.messageNodes?.[messageId];
    if (!node) break;
    const candidate = getActiveCandidate(node);
    if (candidate?.meta?.experienceSnapshot) return candidate.meta.experienceSnapshot;
    messageId = node.parentMessageId || "";
  }
  return null;
}

/**
 * Sync session pointers from live Conversation V2 branch.
 * @param {string} experienceSessionId
 */
export function syncExperienceBranch(experienceSessionId) {
  const session = getExperienceSession(experienceSessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const conv = getSession(session.conversationSessionId);
  if (!conv) return { ok: false, reason: "conversation_not_found" };
  const branchId = conv.activeBranchId;
  const candidateSnapshot = nearestConversationSnapshot(conv, branchId);
  const fallbackSnapshot = session.branchSnapshots?.[branchId]
    || (session.activeBranchId === branchId
      ? createExperienceBranchSnapshot(session)
      : null)
    || createExperienceBranchSnapshot({
      sceneState: session.sceneState,
      suggestedActions: session.suggestedActions,
      lastPerformance: session.lastPerformance,
      lastDisplay: session.lastDisplay,
    });
  const snapshot = createExperienceBranchSnapshot(candidateSnapshot || fallbackSnapshot);
  return saveExperienceSession({
    ...session,
    activeBranchId: branchId,
    sceneState: snapshot.sceneState,
    suggestedActions: snapshot.suggestedActions,
    lastPerformance: snapshot.lastPerformance,
    lastDisplay: snapshot.lastDisplay,
    branchSnapshots: {
      ...(session.branchSnapshots || {}),
      [branchId]: snapshot,
    },
  });
}

/**
 * Persist scene + suggested actions after a director turn.
 * @param {string} experienceSessionId
 * @param {object} patch
 */
export function updateExperienceAfterTurn(experienceSessionId, patch = {}) {
  const session = getExperienceSession(experienceSessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  if (session.status !== "active") return { ok: false, reason: "session_not_active" };

  const conv = getSession(session.conversationSessionId);
  const branchId = conv?.activeBranchId || session.activeBranchId;
  const snapshot = createExperienceBranchSnapshot({
    sceneState: patch.sceneState || session.sceneState,
    suggestedActions: Array.isArray(patch.suggestedActions)
      ? patch.suggestedActions
      : session.suggestedActions,
    lastPerformance: patch.lastPerformance || session.lastPerformance,
    lastDisplay: patch.lastDisplay || session.lastDisplay,
  });
  const next = {
    ...session,
    sceneState: snapshot.sceneState,
    directorAgenda: patch.directorAgenda || session.directorAgenda,
    suggestedActions: snapshot.suggestedActions,
    lastPerformance: snapshot.lastPerformance,
    lastDisplay: snapshot.lastDisplay,
    activeBranchId: branchId,
    branchSnapshots: {
      ...(session.branchSnapshots || {}),
      [branchId]: snapshot,
    },
    inputDraft: "",
  };
  return saveExperienceSession(next);
}

export function getExperienceRuntimeSnapshot(experienceSessionId) {
  const session = getExperienceSession(experienceSessionId) || getActiveExperienceSession();
  if (!session) return null;
  const pkg = getRegisteredPackage(session.packageId);
  const opening = pkg ? getPackageOpening(pkg, session.openingId) : null;
  return { session, package: pkg, opening };
}

/** Night-rain production entry helper */
export const NIGHT_RAIN_LEGACY_SCRIPT_ID = "script-rain-station";

/**
 * True when a library script id should open via Experience Runtime (production).
 * @param {string} scriptId
 */
export function isExperienceBackedScript(scriptId) {
  const id = String(scriptId || "").trim();
  if (!id) return false;
  if (id === NIGHT_RAIN_LEGACY_SCRIPT_ID) return true;
  return Boolean(getRegisteredPackage(id));
}
