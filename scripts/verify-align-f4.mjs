/**
 * F4 — 剧章 / 情景剧加深 / 共创 / 游戏 / 联机 deferred.
 * Run: node scripts/verify-align-f4.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
    removeItem(key) {
      delete this._data[key];
    },
  },
};

const { validateChapter, reachability } = await import("../src/story/schema.js");
const { advanceNode, normalizeProgress } = await import("../src/story/engine.js");
const { CH1_MISSING_PAGE } = await import("../src/story/chapters/ch1-missing-page.js");
const { STORY_STORE_KEY } = await import("../src/story/store.js");
const { SCENARIO_STORE_KEY } = await import("../src/scenario/store.js");
const { GAMES_STORE_KEY } = await import("../src/games/store.js");
const { COCREATE_STORE_KEY } = await import("../src/cocreate/store.js");
const { parseDirectorOutput } = await import("../src/scenario/director.js");
const { normalizeMultiplayerPrefs, defaultMultiplayerPrefs } = await import("../src/multiplayer/prefs.js");
const { createMatchBoard, scoreMatchPairs, flipMatchCard } = await import("../src/games/match-pairs.js");
const { scoreTapSequence } = await import("../src/games/tap-rhythm.js");
const { listDataModuleIds } = await import("../src/memory/data-modules.js");
const { offlineCocreateDraft, parseCocreateLlmJson } = await import("../src/cocreate/schema.js");

const v = validateChapter(CH1_MISSING_PAGE);
check("validateChapter ch1 ok", v.ok === true, v.errors?.join(",") || "");

const reachable = reachability(CH1_MISSING_PAGE);
const allIds = new Set(CH1_MISSING_PAGE.nodes.map((n) => n.id));
const coverage = [...allIds].every((id) => reachable.has(id));
check("reachability covers all nodes", coverage && reachable.size === allIds.size, `${reachable.size}/${allIds.size}`);

const endings = CH1_MISSING_PAGE.nodes.filter((n) => n.kind === "ending");
check(
  "ending reachable",
  endings.length >= 1 && endings.some((e) => reachable.has(e.id)),
  String(endings.length),
);

const badChoice = advanceNode(CH1_MISSING_PAGE, "n2", "nope");
check("advanceNode bad choice", Boolean(badChoice.error) && badChoice.nextNodeId === null, badChoice.error || "");

const progress = normalizeProgress({ garbage: true });
check(
  "normalizeProgress stable",
  progress.activeChapterId === ""
    && progress.activeNodeId === ""
    && Array.isArray(progress.completedChapterIds)
    && progress.completedChapterIds.length === 0,
);

const fallback = parseDirectorOutput("{bad");
check("parseDirectorOutput fails honestly", fallback.ok === false && Array.isArray(fallback.choices) && fallback.choices.length === 0);

check("STORY_STORE_KEY", STORY_STORE_KEY === "yueqi.story.v1");
check("SCENARIO_STORE_KEY", SCENARIO_STORE_KEY === "yueqi.scenario.v1");
check("GAMES_STORE_KEY", GAMES_STORE_KEY === "yueqi.games.v1");
check("COCREATE_STORE_KEY", COCREATE_STORE_KEY === "yueqi.cocreate.v1");

const catalogApps = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
check(
  "apps-catalog keeps games/scenario/cocreate without duplicate theater entry",
  catalogApps.includes('id: "games"')
    && catalogApps.includes('id: "scenario"')
    && !catalogApps.includes('id: "story"')
    && catalogApps.includes('id: "cocreate"')
    && !catalogApps.includes('id: "theater"'),
);

const defaults = defaultMultiplayerPrefs();
const normalized = normalizeMultiplayerPrefs({});
check(
  "multiplayer deferred default",
  defaults.enabled === false
    && defaults.mode === "deferred"
    && normalized.enabled === false
    && normalized.mode === "deferred",
);

const board = createMatchBoard(42);
const first = board[0];
const flipped = flipMatchCard(board, first.id, []);
const scoreA = scoreMatchPairs({ moves: 16, elapsedMs: 30000, matchedPairs: 8 });
const scoreB = scoreMatchPairs({ moves: 16, elapsedMs: 30000, matchedPairs: 8 });
check("match-pairs score reproducible", scoreA === scoreB && scoreA > 0, String(scoreA));
check("match-pairs board seeded", board.length === 16 && flipped.openIds.length === 1);

const tapScore = scoreTapSequence(["hit", "hit", "miss", "hit"]);
const tapScore2 = scoreTapSequence(["hit", "hit", "miss", "hit"]);
check("tap-rhythm sequence score", tapScore === tapScore2 && tapScore > 0, String(tapScore));

const mods = listDataModuleIds();
check(
  "data modules F4",
  mods.includes("story") && mods.includes("scenario") && mods.includes("cocreate") && mods.includes("games") && mods.includes("multiplayer"),
);

const offline = offlineCocreateDraft({ target: "script", prompt: "雨夜" });
check("offline cocreate script", Boolean(offline.scriptPatch?.title) && Boolean(offline.scriptPatch?.premise));
check("parseCocreate bad json", parseCocreateLlmJson("{bad").ok === false);

const theater = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
const persistence = readFileSync(join(root, "src/scenario/runtime/persistence.js"), "utf8");
const confluence = readFileSync(join(root, "src/life/confluence.js"), "utf8");
check(
  "finale commits through life confluence",
  theater.includes("commitFinaleMemory")
    && persistence.includes("recordScenarioFinale")
    && confluence.includes('appId: "scenario"')
    && confluence.includes('kind: "finale"')
    && !theater.includes("LivingTimelineEvent")
    && !theater.includes("living-timeline"),
);

const storeJs = readFileSync(join(root, "src/scenario/store.js"), "utf8");
check("upsertUserScript exists", storeJs.includes("upsertUserScript") || storeJs.includes("saveScript"));

const shellJs = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check(
  "phone-shell keeps archived creator data mounted but unblocks scenario",
  shellJs.includes("mountGamesLobby")
    && shellJs.includes("data-multiplayer-enabled")
    && shellJs.includes("mountStoryApp")
    && shellJs.includes("mountCocreateApp")
    && shellJs.includes('new Set(["scroll", "adventure", "cocreate"])')
    && !shellJs.includes('new Set(["scroll", "adventure", "cocreate", "theater", "scenario"])'),
);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
check("package verify:align-f4", typeof pkg.scripts["verify:align-f4"] === "string");

const choiceCount = CH1_MISSING_PAGE.nodes.filter((n) => n.kind === "choice").length;
check("ch1 has ≥2 choices", choiceCount >= 2, String(choiceCount));
check("ch1 has ≥5 nodes", CH1_MISSING_PAGE.nodes.length >= 5, String(CH1_MISSING_PAGE.nodes.length));

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
