/**
 * M5 — scenario theater multi-select cast + director cast inject.
 * Run: node scripts/verify-characters-m5.mjs
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

globalThis.document = {
  dispatchEvent() {
    return true;
  },
};

const phoneJs = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
const theaterJs = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
const appsJs = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
const appJs = readFileSync(join(root, "src/app.js"), "utf8");

check(
  "apps catalog scenario",
  appsJs.includes('id: "scenario"')
    && appsJs.includes('labelKey: "phone.apps.scenario"')
    && appsJs.includes('icon: "clapperboard"')
    && appsJs.includes('advanced: true'),
);
check("phone scenario screen", phoneJs.includes('data-phone-screen="scenario"') && phoneJs.includes("data-scenario-mount"));
check("phone mounts theater", phoneJs.includes("mountScenarioTheater") && phoneJs.includes("collectProviderConfig"));
check("app passes provider config", /mountSmallPhone\(\{[\s\S]*collectProviderConfig/.test(appJs));
check("curtain cast list", theaterJs.includes("data-scenario-cast-list") && theaterJs.includes("data-cast-id"));
check("cast UX select/lead", theaterJs.includes("setLead") && theaterJs.includes("toggleCast"));

const {
  createCharacter,
  ensureCharactersMigrated,
  resetCharacterCacheForTests,
  setActiveCharacterId,
} = await import("../src/characters/store.js");
const { openMemoryDb } = await import("../src/storage/db.js");
const { BUILTIN_CHARACTER_ID } = await import("../src/constants.js");
const { normalizeCast, buildCastPromptBlock, defaultCastFromCharacters } = await import("../src/scenario/cast.js");
const { SCENARIO_PRESETS } = await import("../src/scenario/presets.js");
const { startRun, getRun, listScripts, upsertUserScript } = await import("../src/scenario/store.js");
const { buildDirectorMessages, offlineDirectorTurn } = await import("../src/scenario/director.js");

resetCharacterCacheForTests();
await openMemoryDb();
await ensureCharactersMigrated();

const charB = await createCharacter({ name: "配角乙", copyFromId: BUILTIN_CHARACTER_ID });
await setActiveCharacterId(BUILTIN_CHARACTER_ID);

const normalized = normalizeCast({
  leadId: charB.id,
  memberIds: [BUILTIN_CHARACTER_ID, charB.id],
});
check("normalize keeps lead in members", normalized.leadId === charB.id && normalized.memberIds.includes(charB.id));

const fixed = normalizeCast({ leadId: "missing", memberIds: [BUILTIN_CHARACTER_ID] });
check("normalize repairs missing lead", fixed.leadId === BUILTIN_CHARACTER_ID);

const defaults = await defaultCastFromCharacters();
check("default cast lead is active", defaults.leadId === BUILTIN_CHARACTER_ID && defaults.memberIds.includes(BUILTIN_CHARACTER_ID));

const castBlock = buildCastPromptBlock({
  leadId: BUILTIN_CHARACTER_ID,
  memberIds: [BUILTIN_CHARACTER_ID, charB.id],
});
check("cast prompt has 主演", castBlock.includes("主演"));
check("cast prompt has 配角", castBlock.includes("配角") && castBlock.includes("配角乙"));

check("presets count >= 3", SCENARIO_PRESETS.length >= 3);
check(
  "presets have title/premise",
  SCENARIO_PRESETS.every((item) => item.id && item.title && item.premise),
);

const scripts = listScripts();
check(
  "listScripts exposes production presets without legacy beat graphs",
  SCENARIO_PRESETS.every((preset) => {
    const exposed = scripts.find((item) => item.id === preset.id);
    return preset.productionRuntime === "experience"
      ? Boolean(exposed) && !Object.hasOwn(exposed, "beats")
      : !exposed;
  }),
);

const userScript = upsertUserScript({
  id: "script-user-m5",
  title: "M5 用户剧本",
  premise: "用于验证用户剧本、卡司与运行时能够完整衔接。",
  openingBeat: "灯光亮起，角色进入舞台。",
});
check("user script enters writable library", listScripts().some((item) => item.id === userScript.id));

const run = startRun({
  scriptId: userScript.id,
  cast: { leadId: charB.id, memberIds: [BUILTIN_CHARACTER_ID, charB.id] },
});
check("startRun stores cast", run.cast?.leadId === charB.id && run.cast.memberIds.length === 2);
check("startRun opening beat", (run.beats || []).some((beat) => beat.kind === "narration"));

const stored = getRun(run.id);
check("getRun roundtrip", stored?.id === run.id && stored.cast.leadId === charB.id);

const messages = await buildDirectorMessages(stored, "靠近一点");
const system = messages.find((item) => item.role === "system")?.content || "";
check("director injects cast block", system.includes("卡司") && system.includes("主演") && system.includes("配角乙"));

const offline = offlineDirectorTurn(stored, "轻轻问一句");
check("offline director reply", Boolean(offline.dialogue || offline.reply) && Array.isArray(offline.choices) && offline.choices.length >= 2);

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
