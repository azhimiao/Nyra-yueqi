import { getPopGame } from "../games/pop-games.js";
import { resolveGameDefinition } from "../games/platform/registry.js";
import { t } from "../i18n/index.js";

const EVENT_TYPES = new Set(["start", "round", "result", "end"]);

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function positiveInt(value) {
  const number = Math.floor(Number(value) || 0);
  return number > 0 ? number : 0;
}

function resolveGameTitle(gameId) {
  const pop = getPopGame(gameId);
  if (pop?.title) return pop.title;
  const resolved = resolveGameDefinition(gameId);
  return resolved?.definition?.title || "";
}

export function isGameMessageMetadata(metadata = {}) {
  const kind = clean(metadata?.kind || metadata?.mediaType, 80);
  return kind === "game_event"
    || kind === "pop-game-start"
    || Boolean(metadata?.gameEvent && typeof metadata.gameEvent === "object");
}

export function createGameEventMetadata(run, type, extra = {}) {
  if (!run || !EVENT_TYPES.has(type)) return null;
  return {
    kind: "game_event",
    mediaType: "game_event",
    popGameId: clean(run.gameId, 80),
    gameRunId: clean(run.runId, 120),
    gameEventType: type,
    memoryPolicy: clean(run.memoryPolicy, 32) || "game_only",
    game: {
      sessionId: clean(run.platformSessionId || run.runId, 120),
      kind: type === "end" || type === "result" ? "result" : "event",
    },
    gameEvent: {
      type,
      runId: clean(run.runId, 120),
      gameId: clean(run.gameId, 80),
      title: clean(run.title, 100),
      round: positiveInt(extra.round ?? run.round),
      summary: clean(extra.summary, 240),
      result: clean(extra.result ?? run.result, 240),
      status: type === "end" ? "ended" : "active",
    },
  };
}

export function resolveGameMessageCard(metadata = {}, content = "", { locale = "zh-CN" } = {}) {
  if (!isGameMessageMetadata(metadata)) return null;
  const event = metadata.gameEvent && typeof metadata.gameEvent === "object"
    ? metadata.gameEvent
    : {};
  const legacyStart = clean(metadata.kind || metadata.mediaType, 80) === "pop-game-start";
  const typeCandidate = clean(event.type || metadata.gameEventType, 40);
  const type = legacyStart ? "start" : EVENT_TYPES.has(typeCandidate) ? typeCandidate : "start";
  const gameId = clean(event.gameId || metadata.popGameId || metadata.gameId, 80);
  const localeId = String(locale || "zh-CN").toLowerCase().startsWith("en") ? "en" : "zh-CN";
  const title = clean(event.title || metadata.gameTitle || resolveGameTitle(gameId), 100)
    || (gameId || t("phone.pop.playTogether", localeId));
  const round = positiveInt(event.round ?? metadata.gameRound);
  const result = clean(event.result || metadata.gameResult, 240);
  const summary = clean(event.summary || metadata.gameSummary || content, 240);
  const runId = clean(event.runId || metadata.gameRunId, 120);
  const eyebrow = type === "start"
    ? t("shared.game.started", localeId)
    : type === "round"
      ? t("shared.game.round", localeId, { round: round || 1 })
      : type === "result"
        ? t("shared.game.result", localeId)
        : t("shared.game.ended", localeId);

  return {
    type,
    runId,
    gameId,
    title,
    eyebrow,
    round,
    summary,
    result,
    status: type === "end" ? "ended" : "active",
    canEnd: type !== "end" && Boolean(runId),
    endLabel: t("shared.game.end", localeId),
  };
}
