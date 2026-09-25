/**
 * Pop ↔ Duo bridge adapter — binds DuoGameRuntime to chat session bag.
 */

import { DuoGameBridge } from "../duo/bridge.js";
import { DuoGameRuntime } from "../duo/runtime.js";
import { createLocalPersistence } from "../platform/persistence.js";
import {
  endChatGameSession,
  getActiveChatGameSession,
  startChatGameSession,
} from "../chat-game-session.js";
import { getGameContextExtension, setGameContextExtension } from "./context-slot.js";
import { resolveGameMemoryPolicy } from "./memory-policy.js";
import { enrichDuoObservationForPrompt } from "./observation-normalize.js";

/** @type {DuoGameRuntime|null} */
let sharedRuntime = null;

export function getSharedDuoRuntime() {
  if (!sharedRuntime) {
    sharedRuntime = new DuoGameRuntime({
      persistence: createLocalPersistence(),
    });
  }
  return sharedRuntime;
}

export function getSharedDuoBridge() {
  return new DuoGameBridge({ runtime: getSharedDuoRuntime() });
}

/**
 * Start a duo game for a Pop conversation.
 * @param {{ conversationId: string, gameId: string, title?: string, seed?: string|number }} input
 */
export function startPopDuoGame(input = {}) {
  const conversationId = String(input.conversationId || "").trim();
  const gameId = String(input.gameId || "").trim();
  if (!conversationId || !gameId) return { ok: false, error: "missing_ids" };

  const existing = getActiveChatGameSession(conversationId);
  if (existing) {
    endChatGameSession(conversationId, { result: "开始新游戏前结束上一局" });
    if (existing.platformSessionId) {
      try {
        getSharedDuoRuntime().abort?.(existing.platformSessionId);
      } catch {
        try {
          getSharedDuoRuntime().finish(existing.platformSessionId, "replaced");
        } catch {
          /* ignore */
        }
      }
    }
    setGameContextExtension(conversationId, null);
  }

  const bridge = getSharedDuoBridge();
  const session = bridge.begin(gameId, {
    seed: input.seed,
    meta: { conversationId },
  });
  const run = startChatGameSession({
    sessionId: conversationId,
    gameId,
    title: input.title || session?.gameId || gameId,
    runId: session.id,
    platformSessionId: session.id,
    runtime: "duo",
    memoryPolicy: "game_only",
  });
  if (run && !run.platformSessionId) {
    // Attach platform id onto bag without breaking legacy readers.
    try {
      const key = "yueqi.chat.games.v1";
      const bag = JSON.parse(globalThis.localStorage?.getItem?.(key) || "{}");
      if (bag[conversationId]) {
        bag[conversationId].platformSessionId = session.id;
        bag[conversationId].runtime = "duo";
        bag[conversationId].memoryPolicy = "game_only";
        globalThis.localStorage?.setItem?.(key, JSON.stringify(bag));
      }
    } catch {
      /* node / no storage */
    }
  }

  publishCharacterObservation(conversationId, session.id);

  return {
    ok: true,
    run: { ...run, platformSessionId: session.id, runtime: "duo", memoryPolicy: "game_only" },
    session,
    output: null,
  };
}

/**
 * @param {string} conversationId
 */
export function getPopActiveDuo(conversationId) {
  const run = getActiveChatGameSession(conversationId);
  if (!run) return null;
  const platformSessionId = run.platformSessionId || run.runId;
  const runtime = getSharedDuoRuntime();
  let session = null;
  try {
    session = runtime.getSession(platformSessionId);
  } catch {
    session = null;
  }
  return {
    run,
    platformSessionId,
    session,
    memoryPolicy: resolveGameMemoryPolicy({
      activeGame: true,
      memoryPolicy: run.memoryPolicy || "game_only",
    }),
  };
}

/**
 * Handle user text/action during duo game.
 */
export function handlePopDuoUserInput(conversationId, payload = {}) {
  const active = getPopActiveDuo(conversationId);
  if (!active?.platformSessionId) return { ok: false, error: "no_active_game" };
  const bridge = getSharedDuoBridge();
  const result = typeof payload.rawText === "string" && !payload.action
    ? bridge.userMessage(active.platformSessionId, payload.rawText)
    : bridge.userAction(active.platformSessionId, payload.action || payload);

  publishCharacterObservation(conversationId, active.platformSessionId);

  if (bridge.finished(active.platformSessionId) || result?.session?.status === "finished") {
    const gameResult = bridge.result(active.platformSessionId);
    endChatGameSession(conversationId, {
      result: gameResult?.summary || "本局结束",
    });
    setGameContextExtension(conversationId, null);
  }

  return { ok: true, ...result, memoryPolicy: "game_only" };
}

export function endPopDuoGame(conversationId, resultText = "") {
  const active = getPopActiveDuo(conversationId);
  if (active?.platformSessionId) {
    try {
      getSharedDuoRuntime().finish(active.platformSessionId, "user_end");
    } catch {
      /* ignore */
    }
  }
  setGameContextExtension(conversationId, null);
  return endChatGameSession(conversationId, { result: resultText || "用户结束本局" });
}

function publishCharacterObservation(conversationId, platformSessionId) {
  try {
    const bridge = getSharedDuoBridge();
    const raw = bridge.observe(platformSessionId, "character");
    const legal = bridge.legal(platformSessionId, "character") || [];
    const enriched = enrichDuoObservationForPrompt(raw, { legalActions: legal });
    setGameContextExtension(conversationId, enriched);
    return enriched;
  } catch {
    return null;
  }
}

export function refreshPopDuoObservation(conversationId) {
  const active = getPopActiveDuo(conversationId);
  if (!active?.platformSessionId) {
    setGameContextExtension(conversationId, null);
    return null;
  }
  return publishCharacterObservation(conversationId, active.platformSessionId);
}

export function ensurePopDuoObservation(conversationId) {
  const id = String(conversationId || "").trim();
  if (!id) return null;
  const existing = getGameContextExtension(id);
  if (existing && !existing.error && (existing.rules || existing.yourHand || existing.allowedActions?.length)) {
    return existing;
  }
  return refreshPopDuoObservation(id);
}
