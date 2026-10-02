/**
 * V0.2 — Director lore inject + real offline choice / free-say branching.
 * Run: node scripts/verify-core-v0-director.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const memory = {
  _data: {},
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
  },
  setItem(key, value) {
    this._data[key] = String(value);
  },
  removeItem(key) {
    delete this._data[key];
  },
  clear() {
    this._data = {};
  },
};

globalThis.window = { localStorage: memory };
globalThis.document = { dispatchEvent() { return true; } };

const required = [
  "src/scenario/runtime/director-adapter.js",
  "src/scenario/runtime/action-mapper.js",
  "src/scenario/presets.js",
  "src/scenario/player/player-ui.js",
  "public/assets/scenes/night-rain-station/scene.json",
];
for (const rel of required) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const adapterSrc = readFileSync(join(root, "src/scenario/runtime/director-adapter.js"), "utf8");
check("buildDirectorMessages loads lore", /loreEntryIds|loadRunLoreEntries|世界书/.test(adapterSrc));
check("offline uses nextByChoice / branch", /nextByChoice|branchMode|beatNodeId/.test(adapterSrc));
check("conversation optional import", /conversation/.test(adapterSrc));

const playerSrc = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
check("player Chinese premise label", /前提\s*\/\s*设定|前提/.test(playerSrc) && !/Premise/.test(playerSrc));
check("player free-text primary class", /composer--primary|choices--secondary/.test(playerSrc));
check("player awaits buildDirectorMessages", /await\s+buildDirectorMessages/.test(playerSrc));
check("player passes choiceId to offline", /choiceId:\s*meta\.choiceId/.test(playerSrc));

const {
  buildDirectorMessages,
  offlineDirectorTurn,
} = await import("../src/scenario/runtime/director-adapter.js");
const { startRun, getRun, saveRun } = await import("../src/scenario/store.js");
const { getPresetBeats, getPresetScript } = await import("../src/scenario/presets.js");
const { BUILTIN_CHARACTER_ID } = await import("../src/constants.js");

const rain = getPresetScript("script-rain-station");
check("夜雨车站 branchMode", Boolean(rain?.branchMode));
check("夜雨车站 ≥8 beats", (rain?.beats?.length || 0) >= 8, String(rain?.beats?.length || 0));
check(
  "夜雨车站 ≥2 branch points",
  (rain?.beats || []).filter((b) => b.nextByChoice && Object.keys(b.nextByChoice).length >= 3).length >= 2,
);
check("durationHint not fake ~8 for short beats", !/^约\s*8\s*分钟$/.test(String(rain?.durationHint || "")));

const run = startRun({
  scriptId: "script-rain-station",
  cast: { leadId: BUILTIN_CHARACTER_ID, memberIds: [BUILTIN_CHARACTER_ID] },
  loreEntryIds: ["wb-v0-lore-test"],
});

const loreBody = "末班车误点时，站台灯会故意闪一下。";
const messages = await buildDirectorMessages(getRun(run.id), "靠近一点", {
  loreEntries: [
    { id: "wb-v0-lore-test", title: "夜雨车站灯", content: loreBody },
  ],
});
const joined = messages.map((m) => m.content).join("\n");
check("lore text in buildDirectorMessages", joined.includes(loreBody), loreBody.slice(0, 24));
check("lore title in director prompt", joined.includes("夜雨车站灯"));

// Opening turn
const open = offlineDirectorTurn(getRun(run.id), "");
check("opening dialogue", Boolean(open?.dialogue));
check("opening sets beatNodeId", open?._beatNodeId === "rs-1", String(open?._beatNodeId || ""));

saveRun({
  ...getRun(run.id),
  directorState: {
    ...(getRun(run.id).directorState || {}),
    beatNodeId: "rs-1",
    beatCursor: 1,
  },
});

const afterOpen = getRun(run.id);
const near = offlineDirectorTurn(afterOpen, "靠近一点", { choiceId: "lean-in" });
const ask = offlineDirectorTurn(afterOpen, "轻轻问一句", { choiceId: "ask" });
const quiet = offlineDirectorTurn(afterOpen, "先不说话", { choiceId: "silence" });

check("choice lean ≠ ask", near.dialogue !== ask.dialogue, `near=${near._beatNodeId} ask=${ask._beatNodeId}`);
check("choice ask ≠ silence", ask.dialogue !== quiet.dialogue);
check("choice lean ≠ silence", near.dialogue !== quiet.dialogue);
check("lean routes rs-2-near", near._beatNodeId === "rs-2-near", String(near._beatNodeId));
check("ask routes rs-2-ask", ask._beatNodeId === "rs-2-ask", String(ask._beatNodeId));
check("silence routes rs-2-quiet", quiet._beatNodeId === "rs-2-quiet", String(quiet._beatNodeId));

// Free-say influence (distinct embedded text)
const freeA = offlineDirectorTurn(afterOpen, "今天雨好大，我带了热可可");
const freeB = offlineDirectorTurn(afterOpen, "我想听听铁轨的声音");
check("free-say A has content", Boolean(freeA?.dialogue));
check("free-say B has content", Boolean(freeB?.dialogue));
check(
  "free-say texts differ",
  freeA.dialogue !== freeB.dialogue,
  `A=${(freeA.dialogue || "").slice(0, 40)} | B=${(freeB.dialogue || "").slice(0, 40)}`,
);

// Keyword free-say should also branch
const kwNear = offlineDirectorTurn(afterOpen, "我再靠近一点");
check("keyword 靠近 → near branch", kwNear._beatNodeId === "rs-2-near", String(kwNear._beatNodeId));

const mapperSrc = readFileSync(join(root, "src/scenario/runtime/action-mapper.js"), "utf8");
check("action-mapper resolves characterId", /characterId/.test(mapperSrc) && !/characterId:\s*"char-xingli"\s*,\s*petId:\s*"xingli"/.test(mapperSrc.replace(/\s+/g, "")));

const stageSrc = readFileSync(join(root, "src/scenario/player/stage-renderer.js"), "utf8");
check("stage loads night-rain-station layers", /night-rain-station|scenario-stage-layers|scene\.json/.test(stageSrc));

const sceneJson = JSON.parse(
  readFileSync(join(root, "public/assets/scenes/night-rain-station/scene.json"), "utf8"),
);
check("scene manifest has ≥3 layers", (sceneJson.layers || []).length >= 3);

const failed = checks.filter((item) => !item.pass);
const passed = checks.length - failed.length;
const score = `${passed}/${checks.length}`;
console.log(`\nV0.2 director verify: ${score} passed`);
if (failed.length) {
  console.log("Failed:");
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
  process.exit(1);
}
