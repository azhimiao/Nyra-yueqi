/**
 * Smoke checks for Pop-first companion games (Launch v1 Duo catalog).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPopGameStart, getPopGame, listPopGames } from "../src/games/pop-games.js";
import {
  createChatGameRun,
  finishChatGameRun,
  startNextChatGameRound,
} from "../src/games/chat-game-session.js";
import { resolveGameMessageCard } from "../src/chat/game-message.js";
import { listDuoGames } from "../src/games/duo/games/index.js";
import { DUO_RULES, getDuoRules } from "../src/games/duo/rules.js";
import { formatGameObservationBlock } from "../src/games/adapters/context-slot.js";
import { enrichDuoObservationForPrompt } from "../src/games/adapters/observation-normalize.js";
import { extractActionFromSpeech, parseDuoAction } from "../src/games/duo/action-parse.js";
import { DuoGameRuntime } from "../src/games/duo/runtime.js";
import { createLocalPersistence } from "../src/games/platform/persistence.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

function check(name, cond, detail = "") {
  if (!cond) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

const duoDefs = listDuoGames();
const games = listPopGames();
check("ten duo pop games", games.length === 10, String(games.length));
check("pop catalog matches duo registry", games.length === duoDefs.length);
check(
  "ids are duo packages",
  games.every((g) => g.id.startsWith("nyra.") && g.runtime === "duo"),
);
check("invite uses current chat framing", games.every((g) => g.invite.includes("我们来玩")));
check("invite includes game description", games.every((g) => !g.blurb || g.invite.includes(g.blurb)));
check("invite warns against title-only roleplay", games.every((g) => g.invite.includes("不要只凭游戏名字")));
check(
  "every duo game has actor-facing rules",
  duoDefs.every((def) => Boolean(getDuoRules(def.id))),
  duoDefs.filter((def) => !DUO_RULES[def.id]).map((def) => def.id).join(","),
);
check("getPopGame resonance", getPopGame("nyra.resonance")?.title === "同频");
check("build ok", buildPopGameStart("nyra.resonance").ok === true);
check("build unknown", buildPopGameStart("nope").ok === false);
check("legacy placeholders removed", !games.some((g) => g.id === "office-werewolf" || g.id === "first-scene"));

const run = createChatGameRun({
  runId: "game-run-001",
  sessionId: "session-001",
  gameId: "nyra.resonance",
  title: "同频",
  platformSessionId: "duo_test",
  runtime: "duo",
  memoryPolicy: "game_only",
  startedAt: "2026-08-15T14:00:00.000Z",
});
check("game run starts active", run.status === "active" && run.round === 0);
check("platform session attached", run.platformSessionId === "duo_test");
const round = startNextChatGameRound(run, { at: "2026-08-15T14:01:00.000Z" });
check("game round increments", round.round === 1 && round.status === "active");
const ended = finishChatGameRun(round, { result: "完成 1 回合", at: "2026-08-15T14:02:00.000Z" });
check("game run ends with result", ended.status === "ended" && ended.result === "完成 1 回合");

const startCard = resolveGameMessageCard({
  kind: "game_event",
  gameEvent: { type: "start", runId: run.runId, gameId: run.gameId, title: run.title },
});
const roundCard = resolveGameMessageCard({
  kind: "game_event",
  gameEvent: { type: "round", runId: run.runId, gameId: run.gameId, title: run.title, round: 1 },
});
const resultCard = resolveGameMessageCard({
  kind: "game_event",
  gameEvent: { type: "result", runId: run.runId, gameId: run.gameId, title: run.title, round: 1, result: "本回合完成" },
});
const endCard = resolveGameMessageCard({
  kind: "game_event",
  gameEvent: { type: "end", runId: run.runId, gameId: run.gameId, title: run.title, round: 1, result: "完成 1 回合" },
});
check("start round result end cards", [startCard, roundCard, resultCard, endCard].every(Boolean));
check("card event types stable", [startCard.type, roundCard.type, resultCard.type, endCard.type].join(",") === "start,round,result,end");
check("card title from duo catalog", startCard.title === "同频");

const chatSource = read("src/panels/chat.js");
const phoneSource = read("src/phone-shell/phone-shell.js");
const appSource = read("src/app.js");
const visualCss = read("src/ui/chat-message-visual.css");
check("game events use authoritative writer", /writeGameEvent/.test(chatSource) && /writePopTurn\("system"/.test(chatSource));
check("duo bridge wired", /startPopDuoGame/.test(chatSource) && /handlePopDuoUserInput/.test(chatSource));
check("memory gate during games", /shouldWriteLongTermMemory/.test(chatSource));
check("desktop game bypass removed", !/metadata:\s*\{\s*kind:\s*"pop-game-start"/.test(chatSource));
check("both shells render game cards", /message-game-card/.test(phoneSource) && /message-game-card/.test(appSource));
check("game cards share visual authority", /\.message-game-card/.test(visualCss));
const assembleSource = read("src/prompt/assemble.js");
const popDuoSource = read("src/games/adapters/pop-duo.js");
const slotSource = read("src/games/adapters/context-slot.js");
check("chat applies character turn even on round 0", /refreshPopDuoObservation/.test(chatSource) && /duoActive\?\.platformSessionId/.test(chatSource));
check("assemble rehydrates game observation", /ensurePopDuoObservation/.test(assembleSource));
check("pop-duo enriches observation with rules and legal actions", /enrichDuoObservationForPrompt/.test(popDuoSource) && /publishCharacterObservation/.test(popDuoSource));
check("prompt formatter dumps leftover observation fields", /leftover/.test(slotSource) && /yourHand/.test(read("src/games/duo/games/heartbeat.js")));

const memory = {};
const storage = {
  getItem: (key) => (Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null),
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: (key) => { delete memory[key]; },
};
const runtimeA = new DuoGameRuntime({ persistence: createLocalPersistence(storage) });
const session = runtimeA.createSession("nyra.heartbeat", { seed: 42 });
runtimeA.start(session.id);
const characterObs = runtimeA.observe(session.id, "character");
const legal = runtimeA.legalActions(session.id, "character");
const enriched = enrichDuoObservationForPrompt(characterObs, { legalActions: legal });
const promptBlock = formatGameObservationBlock(enriched);
check("heartbeat observation exposes character hand", Array.isArray(characterObs.yourHand) && characterObs.yourHand.length > 0);
check("heartbeat prompt includes hand", promptBlock.includes("yourHand") && promptBlock.includes(String(characterObs.yourHand[0])));
check("heartbeat prompt includes rules not intimacy", promptBlock.includes("数字默契") && promptBlock.includes("不是真的对心跳"));
check("heartbeat prompt includes legal plays", promptBlock.includes("allowedActions") && promptBlock.includes("play"));
const spoken = parseDuoAction({
  input: `那就先出 ${characterObs.yourHand[0]} 吧，跟着你的节奏。`,
  legalActions: legal,
});
check("speech play parses to legal card", spoken.action?.type === "play" && spoken.action.value === characterObs.yourHand[0]);
check("speech extractor finds play", extractActionFromSpeech(`我出 ${characterObs.yourHand[0]}`, legal)?.value === characterObs.yourHand[0]);
const runtimeB = new DuoGameRuntime({ persistence: createLocalPersistence(storage) });
const restored = runtimeB.getSession(session.id);
check("duo session hydrates after process restart", restored?.id === session.id && restored.gameId === "nyra.heartbeat");
check("hydrated heartbeat still has a hand", runtimeB.observe(session.id, "character").yourHand?.length > 0);

if (process.exitCode) {
  console.error("verify-pop-games failed");
  process.exit(1);
}
console.log("verify-pop-games passed");
