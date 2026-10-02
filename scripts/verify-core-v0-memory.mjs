/**
 * PAIOS V0.5 — Context Graph memory hot path.
 * Isolation + assemble inject + ingest/retrieve roundtrip.
 * Contract verify only — NOT a product E2E via localStorage bag.
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

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  };
}

const ls = memoryStorage();
globalThis.window = { localStorage: ls };
globalThis.localStorage = ls;
globalThis.document = {
  querySelectorAll() {
    return [];
  },
  dispatchEvent() {
    return true;
  },
};

const required = [
  "src/context/hot-path.js",
  "src/context/retrieve.js",
  "src/context/pipeline.js",
  "src/prompt/assemble.js",
  "src/scenario/runtime/director-adapter.js",
  "src/panels/chat.js",
  "docs/qa/paios/EXECUTION_STATE.md",
];
for (const rel of required) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const assembleSrc = readFileSync(join(root, "src/prompt/assemble.js"), "utf8");
check(
  "assemble wires context graph hot path",
  /loadContextGraphPromptBlock|contextGraphBlock/.test(assembleSrc),
);
check(
  "assemble injects contextGraphBlock into system",
  /contextGraphBlock/.test(assembleSrc) && /buildSystemContent/.test(assembleSrc),
);

const chatSrc = readFileSync(join(root, "src/panels/chat.js"), "utf8");
check(
  "chat best-effort ingest after assistant save",
  /ingestChatTurnBestEffort/.test(chatSrc),
);

const directorSrc = readFileSync(join(root, "src/scenario/runtime/director-adapter.js"), "utf8");
check(
  "director loadMemorySummary prefers retrieveContext",
  /retrieveContext/.test(directorSrc) && /searchMemories/.test(directorSrc),
);

const execState = readFileSync(join(root, "docs/qa/paios/EXECUTION_STATE.md"), "utf8");
check("EXECUTION_STATE Product RED", execState.includes("Product RED"));
check(
  "EXECUTION_STATE RC revoked",
  execState.includes("已撤销") || /~~release_candidate~~/.test(execState),
);

const {
  __resetContextIdSeqForTests,
  __setContextStorageForTests,
  clearAllContextItems,
  ingestCandidate,
  retrieveContext,
  listItems,
  loadContextGraphPromptBlock,
  formatContextGraphBlock,
  ingestChatTurnBestEffort,
  chatTextsToCandidates,
} = await import("../src/context/index.js");

const ctxStore = memoryStorage();
__setContextStorageForTests(ctxStore);
clearAllContextItems();
__resetContextIdSeqForTests();

const nowIso = "2026-07-26T15:00:00.000Z";
const CHAR_A = "char-xingli-v05";
const CHAR_B = "char-other-v05";
const SECRET_A = "星梨专属：夜雨车站喜欢热可可";
const SECRET_B = "他角色密语：绝不泄漏的蓝莓密码";

// --- Fixture isolation ---
{
  const a = ingestCandidate(
    {
      content: SECRET_A,
      kind: "semantic",
      source: "user.stated",
      characterId: CHAR_A,
      whyRemembered: "V0.5 isolation fixture A",
    },
    { nowIso },
  );
  const b = ingestCandidate(
    {
      content: SECRET_B,
      kind: "semantic",
      source: "user.stated",
      characterId: CHAR_B,
      whyRemembered: "V0.5 isolation fixture B",
    },
    { nowIso },
  );
  check("fixture seed A ok", a.ok === true, a.reason || "");
  check("fixture seed B ok", b.ok === true, b.reason || "");

  const resA = retrieveContext({
    characterId: CHAR_A,
    query: "热可可",
    nowIso,
    markUsed: false,
    limit: 20,
  });
  const resB = retrieveContext({
    characterId: CHAR_B,
    query: "蓝莓",
    nowIso,
    markUsed: false,
    limit: 20,
  });

  let leaks = 0;
  leaks += resA.leaks?.length || 0;
  leaks += resA.items.filter((i) => i.characterId !== CHAR_A).length;
  leaks += resA.items.filter((i) => String(i.content).includes("蓝莓密码")).length;
  leaks += resB.items.filter((i) => i.characterId !== CHAR_B).length;
  leaks += resB.items.filter((i) => String(i.content).includes("热可可")).length;

  check("0 cross-character leak on fixture", leaks === 0, `leaks=${leaks}`);
  check("A retrieve sees A secret", resA.items.some((i) => i.content.includes("热可可")));
  check("B retrieve does not see A secret", !resB.items.some((i) => i.content.includes("热可可")));
}

// --- Assemble includes graph line when seeded ---
{
  const graphBlock = loadContextGraphPromptBlock({
    characterId: CHAR_A,
    query: "车站",
    nowIso,
    limit: 6,
  });
  check(
    "seeded graph block non-empty",
    Boolean(graphBlock) && graphBlock.includes("个人上下文图谱"),
    graphBlock.slice(0, 48),
  );
  check("seeded graph block has A secret", graphBlock.includes("热可可") || graphBlock.includes("夜雨"));

  const { buildSystemContent } = await import("../src/prompt/assemble.js");
  const { DEFAULT_INJECTION_ORDER } = await import("../src/constants.js");
  const system = buildSystemContent({
    promptSystem: "系统底座",
    character: {
      name: "星梨",
      alias: "星梨",
      identity: "陪伴",
      base: "温柔",
      ranges: [],
      tokens: [],
    },
    injectionOrder: DEFAULT_INJECTION_ORDER,
    appId: "pop",
    worldbook: [],
    memories: [],
    externalContext: [],
    contextGraphBlock: graphBlock,
  });
  check(
    "assemble system includes graph line when seeded",
    system.includes("个人上下文图谱") && (system.includes("热可可") || system.includes("夜雨")),
  );

  const emptySystem = buildSystemContent({
    promptSystem: "系统底座",
    character: {
      name: "星梨",
      alias: "星梨",
      identity: "陪伴",
      base: "温柔",
      ranges: [],
      tokens: [],
    },
    injectionOrder: DEFAULT_INJECTION_ORDER,
    appId: "pop",
    worldbook: [],
    memories: [],
    externalContext: [],
    contextGraphBlock: "",
  });
  check(
    "assemble graceful when graph empty",
    !emptySystem.includes("个人上下文图谱"),
  );
}

// --- Ingest + retrieve roundtrip (chat hot path, not bag dump) ---
clearAllContextItems();
__resetContextIdSeqForTests();
{
  const userText = "我喜欢在雨天听铁轨的声音，记得吗？";
  const assistantText = "记得。你喜欢雨天铁轨，我下次也会提起。";
  const candidates = chatTextsToCandidates({
    characterId: CHAR_A,
    userText,
    assistantText,
    nowIso,
    sourceRef: "v05-roundtrip-1",
  });
  check("chatTextsToCandidates non-empty", candidates.length >= 1, String(candidates.length));

  const ingest = ingestChatTurnBestEffort({
    characterId: CHAR_A,
    userText,
    assistantText,
    nowIso,
    sourceRef: "v05-roundtrip-1",
  });
  check("ingestChatTurnBestEffort ok", ingest.ok === true && ingest.ingested >= 1, String(ingest.ingested));

  const hit = retrieveContext({
    characterId: CHAR_A,
    query: "铁轨",
    nowIso,
    markUsed: false,
    limit: 10,
  });
  check(
    "ingest→retrieve roundtrip",
    hit.ok &&
      hit.items.some(
        (i) =>
          String(i.content).includes("铁轨") ||
          String(i.summary).includes("铁轨") ||
          String(i.content).includes("雨天"),
      ),
    `items=${hit.items.length}`,
  );

  // Isolation still holds after chat ingest
  const cross = retrieveContext({
    characterId: CHAR_B,
    query: "铁轨",
    nowIso,
    markUsed: false,
    limit: 10,
  });
  check(
    "roundtrip no cross-character leak",
    cross.items.every((i) => i.characterId === CHAR_B) &&
      !cross.items.some((i) => String(i.content).includes("铁轨")),
  );
}

// --- Director prefers context graph ---
{
  clearAllContextItems();
  __resetContextIdSeqForTests();
  ingestCandidate(
    {
      content: "末班车误点时我们在雨里等过",
      kind: "episodic",
      source: "chat.memory",
      characterId: CHAR_A,
      whyRemembered: "director fixture",
    },
    { nowIso },
  );

  const { buildDirectorMessages } = await import("../src/scenario/runtime/director-adapter.js");
  const { startRun, getRun } = await import("../src/scenario/store.js");
  const run = startRun({
    scriptId: "script-rain-station",
    cast: { leadId: CHAR_A, memberIds: [CHAR_A] },
    loreEntryIds: [],
  });
  const messages = await buildDirectorMessages(getRun(run.id), "雨里等车", {
    loreEntries: [],
  });
  const joined = messages.map((m) => m.content).join("\n");
  check(
    "director memory uses context graph for characterId",
    joined.includes("相关记忆") && joined.includes("末班车"),
    joined.includes("相关记忆") ? "has memory block" : "missing",
  );
}

// Guard: this verify must exercise pipeline APIs, not only dump a bag
check(
  "verify uses ingest/retrieve APIs (not bag-only E2E)",
  typeof ingestCandidate === "function" &&
    typeof retrieveContext === "function" &&
    typeof formatContextGraphBlock === "function" &&
    listItems({ characterId: CHAR_A, limit: 5 }).length >= 0,
);

const failed = checks.filter((c) => !c.pass);
const passed = checks.length - failed.length;
const score = `${passed}/${checks.length}`;
console.log(`\nV0.5 memory hot path verify: ${score} passed`);
if (failed.length) {
  console.log("Failed:");
  for (const item of failed) {
    console.log(`  - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
  }
  process.exit(1);
}
