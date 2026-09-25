const CHAT_GAME_STORE_KEY = "yueqi.chat.games.v1";

function clean(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function nowIso(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function createChatGameRun(input = {}) {
  const sessionId = clean(input.sessionId, 120);
  const gameId = clean(input.gameId, 80);
  if (!sessionId || !gameId) return null;
  const startedAt = nowIso(input.startedAt);
  return {
    runId: clean(input.runId, 120) || `game-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    sessionId,
    gameId,
    title: clean(input.title, 80) || gameId,
    status: "active",
    round: 0,
    result: "",
    startedAt,
    updatedAt: startedAt,
    endedAt: "",
    platformSessionId: clean(input.platformSessionId || input.runId, 120),
    runtime: clean(input.runtime, 32) || "duo",
    memoryPolicy: clean(input.memoryPolicy, 32) || "game_only",
  };
}

export function startNextChatGameRound(run, { at } = {}) {
  if (!run || run.status !== "active") return run || null;
  return {
    ...run,
    round: Math.max(0, Number(run.round) || 0) + 1,
    updatedAt: nowIso(at),
  };
}

export function finishChatGameRun(run, { result = "", at } = {}) {
  if (!run) return null;
  const endedAt = nowIso(at);
  return {
    ...run,
    status: "ended",
    result: clean(result, 240) || `完成 ${Math.max(0, Number(run.round) || 0)} 回合`,
    updatedAt: endedAt,
    endedAt,
  };
}

function readBag(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(CHAT_GAME_STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBag(bag, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(CHAT_GAME_STORE_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}

export function getActiveChatGameSession(sessionId, { storage } = {}) {
  const id = clean(sessionId, 120);
  const run = readBag(storage)[id];
  return run?.status === "active" ? { ...run } : null;
}

export function startChatGameSession(input = {}, { storage } = {}) {
  const run = createChatGameRun(input);
  if (!run) return null;
  const bag = readBag(storage);
  bag[run.sessionId] = run;
  writeBag(bag, storage);
  return { ...run };
}

export function beginChatGameRound(sessionId, { storage, at } = {}) {
  const current = getActiveChatGameSession(sessionId, { storage });
  if (!current) return null;
  const next = startNextChatGameRound(current, { at });
  const bag = readBag(storage);
  bag[next.sessionId] = next;
  writeBag(bag, storage);
  return { ...next };
}

export function endChatGameSession(sessionId, { storage, result, at } = {}) {
  const current = getActiveChatGameSession(sessionId, { storage });
  if (!current) return null;
  const ended = finishChatGameRun(current, { result, at });
  const bag = readBag(storage);
  bag[ended.sessionId] = ended;
  writeBag(bag, storage);
  return { ...ended };
}

export { CHAT_GAME_STORE_KEY };
