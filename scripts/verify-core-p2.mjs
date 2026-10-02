/**
 * PAIOS P2 contract checks — Personal Context Graph.
 * Contract + migration + isolation + delete/freeze. Deterministic; no payment.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
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
  };
}

const requiredFiles = [
  "src/context/schema.js",
  "src/context/store.js",
  "src/context/pipeline.js",
  "src/context/retrieve.js",
  "src/context/migrate.js",
  "src/context/actions.js",
  "src/context/index.js",
  "src/context/ui/context-viewer-ui.js",
  "src/context/ui/context-viewer.css",
  "docs/qa/paios/P2/REVIEW.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const {
  CONTEXT_SCHEMA_VERSION,
  CONTEXT_GRAPH_KEY,
  MEMORY_KINDS,
  validateContextItem,
  buildContextItem,
  __resetContextIdSeqForTests,
  __setContextStorageForTests,
  clearAllContextItems,
  getContextStoreKey,
  listItems,
  getItem,
  ingestCandidate,
  retrieveContext,
  recallPreference,
  countExpiredMisuse,
  migrateIntoContextGraph,
  editMemory,
  deleteMemory,
  freezeMemory,
  forbidProactiveUse,
  getMemoryViewerModel,
} = await import("../src/context/index.js");

__setContextStorageForTests(memoryStorage());
clearAllContextItems();
__resetContextIdSeqForTests();

check("schema version 1", CONTEXT_SCHEMA_VERSION === 1);
check(
  "store key yueqi.context.graph.v1",
  getContextStoreKey() === CONTEXT_GRAPH_KEY && CONTEXT_GRAPH_KEY === "yueqi.context.graph.v1",
);
check("five memory kinds", MEMORY_KINDS.length === 5);

{
  const bad = validateContextItem({ id: "x" });
  check("reject incomplete item", bad.ok === false);
  const good = buildContextItem({
    content: "喜欢晚间散步",
    source: "user.stated",
    characterId: "xingli",
    kind: "semantic",
  });
  check("build item has provenance fields", Boolean(good.source && good.createdAt && good.confidence >= 0));
  check("build item has privacy/retention/conflict", Boolean(good.privacyLevel && good.retention && good.conflictState));
  check("build item has lastUsedAt null", good.lastUsedAt === null);
}

const nowIso = "2026-07-26T12:00:00.000Z";
const CHAR_A = "char-xingli";
const CHAR_B = "char-other";

// --- Pipeline stages ---
{
  const empty = ingestCandidate({ content: "", source: "t", characterId: CHAR_A }, { nowIso });
  check("pipeline reject empty", empty.ok === false && empty.stage === "candidate");

  const noChar = ingestCandidate({ content: "hi", source: "t", characterId: "" }, { nowIso });
  check("pipeline require characterId", noChar.ok === false);

  const a = ingestCandidate(
    {
      content: "喜欢抹茶拿铁",
      kind: "semantic",
      source: "user.stated",
      characterId: CHAR_A,
      whyRemembered: "用户明确说过的偏好",
    },
    { nowIso },
  );
  check("pipeline store preference", a.ok && a.stage === "store");

  const dup = ingestCandidate(
    {
      content: "喜欢抹茶拿铁",
      kind: "semantic",
      source: "user.stated",
      characterId: CHAR_A,
    },
    { nowIso },
  );
  check("pipeline dedupe", dup.ok && dup.reused === true);

  const conflict = ingestCandidate(
    {
      content: "不喜欢抹茶拿铁",
      kind: "semantic",
      source: "chat.inferred",
      characterId: CHAR_A,
      confidence: 0.4,
    },
    { nowIso },
  );
  check(
    "pipeline conflict detected",
    conflict.ok &&
      (conflict.conflictWith?.length > 0 || getItem(conflict.itemId)?.conflictState === "suspected"),
  );

  const forbidden = ingestCandidate(
    {
      content: "密码是 secret123 不要外泄",
      source: "user.stated",
      characterId: CHAR_A,
    },
    { nowIso },
  );
  check(
    "pipeline privacy forbidden",
    forbidden.ok &&
      getItem(forbidden.itemId)?.privacyLevel === "forbidden" &&
      getItem(forbidden.itemId)?.forbidProactive === true,
  );
}

// --- Migration from diary / life / cohabit / relations ---
clearAllContextItems();
__resetContextIdSeqForTests();
{
  const mig = migrateIntoContextGraph({
    readLiveStores: false,
    nowIso,
    diaries: [
      {
        id: "d1",
        characterId: CHAR_A,
        title: "雨天咖啡",
        rawText: "今天下雨，我们在窗边喝了咖啡。",
        diaryDay: "2026-07-20",
        createdAt: "2026-07-20T15:00:00.000Z",
      },
      {
        id: "d2",
        characterId: CHAR_B,
        title: "别的角色日记",
        rawText: "B 角色的私密日记不应泄漏给 A。",
        diaryDay: "2026-07-21",
        createdAt: "2026-07-21T15:00:00.000Z",
      },
    ],
    lifeEvents: [
      {
        id: "le1",
        characterId: CHAR_A,
        summary: "一起去看了夜展",
        type: "outing",
        occurredAt: "2026-07-18T19:00:00.000Z",
        source: "scenario",
        visibility: "shared",
        participants: [{ id: "u", name: "用户", relation: "partner" }],
      },
      {
        id: "le2",
        characterId: CHAR_B,
        summary: "B 独自加班",
        type: "work",
        occurredAt: "2026-07-18T21:00:00.000Z",
        source: "seed",
        visibility: "private",
        participants: [],
      },
    ],
    cohabitEvents: [
      {
        id: "c1",
        characterId: CHAR_A,
        summary: "在相册标记了合照",
        appId: "album",
        kind: "mark",
        at: "2026-07-19T10:00:00.000Z",
      },
      {
        id: "c2",
        characterId: CHAR_B,
        summary: "B 的同栖事件",
        appId: "memo",
        at: "2026-07-19T11:00:00.000Z",
      },
    ],
    relations: [
      {
        id: "r1",
        characterId: CHAR_A,
        content: "我们约定每周五一起复盘",
        predicate: "commitment",
        source: "relation.character",
      },
      {
        id: "r2",
        characterId: CHAR_B,
        content: "B 的边界：不讨论工作细节",
        predicate: "boundary",
        source: "relation.character",
      },
    ],
  });
  check("migration ok", mig.ok === true);
  check("migration indexed diary", mig.counts.diary >= 2);
  check("migration indexed life", mig.counts.life >= 2);
  check("migration indexed cohabit", mig.counts.cohabit >= 2);
  check("migration indexed relation", mig.counts.relation >= 2);

  const again = migrateIntoContextGraph({
    readLiveStores: false,
    nowIso,
    diaries: [
      {
        id: "d1",
        characterId: CHAR_A,
        title: "雨天咖啡",
        rawText: "今天下雨，我们在窗边喝了咖啡。",
        diaryDay: "2026-07-20",
        createdAt: "2026-07-20T15:00:00.000Z",
      },
    ],
    lifeEvents: [],
    cohabitEvents: [],
    relations: [],
  });
  check("migration idempotent dedupe", again.counts.reused >= 1);

  const aItems = listItems({ characterId: CHAR_A, limit: 100 });
  const bLeak = aItems.filter((i) => i.characterId !== CHAR_A);
  check("migration isolation no foreign items in A list", bLeak.length === 0);
  check(
    "migration A has diary+life+cohabit+relation",
    aItems.some((i) => i.source === "diary.memory") &&
      aItems.some((i) => i.source.startsWith("life.")) &&
      aItems.some((i) => i.source.startsWith("cohabit.")) &&
      aItems.some((i) => i.kind === "relational"),
  );
}

// --- 100-item isolation dataset with conflicts + expiry ---
clearAllContextItems();
__resetContextIdSeqForTests();
{
  const preferences = [];
  for (let i = 0; i < 100; i += 1) {
    const characterId = i % 2 === 0 ? CHAR_A : CHAR_B;
    const isPref = i % 5 === 0;
    // Expire only non-preference episodics so recall metrics stay clean
    const isExpired = !isPref && i % 7 === 0;
    const isConflictPair = !isPref && i % 11 === 0;
    const content = isPref
      ? `喜欢饮品独特偏好-${characterId}-${i}`
      : isConflictPair
        ? i % 22 === 0
          ? `边界：可以讨论项目话题-${characterId}-${i}`
          : `边界：不要讨论项目话题-${characterId}-${i}`
        : `事件片段唯一 #${i} 角色=${characterId}`;
    const kind = isPref ? "semantic" : isConflictPair ? "relational" : "episodic";
    const occurredAt = new Date(Date.parse("2026-06-01T00:00:00.000Z") + i * 864e5).toISOString();
    const r = ingestCandidate(
      {
        content,
        kind,
        source: isPref ? "user.stated" : "life.seed",
        sourceRef: `seed-${i}`,
        characterId,
        occurredAt,
        confidence: isPref ? 0.95 : 0.7,
        retention: isExpired ? "rolling_30d" : "permanent",
        expiresAt: isExpired ? "2026-07-01T00:00:00.000Z" : null,
        whyRemembered: isPref ? "稳定偏好" : "数据集事件",
        tags: isPref ? ["preference"] : ["dataset"],
        skipDedupe: false,
      },
      { nowIso },
    );
    if (isPref && characterId === CHAR_A && r.ok && !r.reused) {
      preferences.push({ i, content, id: r.itemId });
    }
  }

  check("dataset size ≥100", listItems({ limit: 500 }).length >= 100, `${listItems({ limit: 500 }).length}`);

  // Cross-character leak = 0
  let leaks = 0;
  const resA = retrieveContext({
    characterId: CHAR_A,
    nowIso,
    includeExpired: true,
    markUsed: false,
    limit: 200,
  });
  leaks += resA.leaks.length;
  leaks += resA.items.filter((i) => i.characterId !== CHAR_A).length;

  const resB = retrieveContext({
    characterId: CHAR_B,
    nowIso,
    query: "主题色",
    markUsed: false,
    limit: 50,
  });
  leaks += resB.items.filter((i) => i.characterId !== CHAR_B).length;

  // Workspace isolation: A retrieve must not see B sourceRefs
  const bRefs = new Set(
    listItems({ characterId: CHAR_B, limit: 500 }).map((i) => i.sourceRef),
  );
  for (const item of resA.items) {
    if (bRefs.has(item.sourceRef) && item.characterId === CHAR_B) leaks += 1;
  }
  check("0 wrong-character leaks on 100-item set", leaks === 0, `leaks=${leaks}`);

  // Preference recall ≥ 90% for A preferences
  let hit = 0;
  const aPrefs = preferences.filter(Boolean);
  for (const pref of aPrefs) {
    const needle = pref.content.replace(/^喜欢/, "");
    const recalled = recallPreference(CHAR_A, needle, { nowIso });
    if (recalled.some((r) => r.content.includes(pref.content) || r.content.includes(needle))) {
      hit += 1;
    }
  }
  const recallRate = aPrefs.length ? hit / aPrefs.length : 0;
  check(
    `preference recall ≥90% (${(recallRate * 100).toFixed(1)}%)`,
    recallRate >= 0.9,
    `${hit}/${aPrefs.length}`,
  );

  const misuse = countExpiredMisuse(CHAR_A, nowIso);
  const misuseRate = misuse.safeTotal ? misuse.misuseCount / misuse.safeTotal : 0;
  check(
    `expired fact misuse ≤2% (${(misuseRate * 100).toFixed(2)}%)`,
    misuseRate <= 0.02 && misuse.misuseCount === 0,
    `${misuse.misuseCount}/${misuse.safeTotal}`,
  );

  // Multi-signal retrieve (not vector-only)
  const taskHit = retrieveContext({
    characterId: CHAR_A,
    taskHint: "项目",
    relationHint: "边界",
    source: "life.seed",
    nowIso,
    markUsed: false,
    limit: 10,
  });
  check(
    "retrieve uses task+relation+source signals",
    taskHit.ok &&
      taskHit.items.length >= 1 &&
      taskHit.items.every((i) => Array.isArray(i._matchReasons) && i._matchReasons.length >= 1),
  );
}

// --- Delete / freeze / forbid ---
{
  const made = ingestCandidate(
    {
      content: "临时可删记忆：周五电影",
      kind: "episodic",
      source: "user.stated",
      characterId: CHAR_A,
      sourceRef: "del-1",
    },
    { nowIso },
  );
  const id = made.itemId;
  check("viewer model explains why", Boolean(getMemoryViewerModel(id)?.whyRemembered));

  freezeMemory(id, true);
  const frozenRetrieve = retrieveContext({
    characterId: CHAR_A,
    query: "周五电影",
    forProactive: true,
    nowIso,
    markUsed: false,
    limit: 20,
  });
  check(
    "freeze blocks proactive retrieve",
    !frozenRetrieve.items.some((i) => i.id === id),
  );

  freezeMemory(id, false);
  forbidProactiveUse(id, true);
  const forbidRetrieve = retrieveContext({
    characterId: CHAR_A,
    query: "周五电影",
    forProactive: true,
    nowIso,
    markUsed: false,
    limit: 20,
  });
  check(
    "forbidProactive blocks proactive retrieve",
    !forbidRetrieve.items.some((i) => i.id === id),
  );

  const edited = editMemory(id, { content: "临时可删记忆：周五纪录片" });
  check("edit memory works", edited.ok && getItem(id)?.content.includes("纪录片"));

  deleteMemory(id);
  check("delete removes from getItem", getItem(id) == null);
  const afterDel = retrieveContext({
    characterId: CHAR_A,
    query: "纪录片",
    includeExpired: true,
    includeFrozen: true,
    forProactive: false,
    nowIso,
    markUsed: false,
    limit: 50,
  });
  check(
    "delete removes from all retrieval",
    !afterDel.items.some((i) => i.id === id) && !listItems({ characterId: CHAR_A }).some((i) => i.id === id),
  );
}

// Consumer wiring
{
  const shell = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
  check("phone screen context wired", shell.includes("buildContextViewerScreenHtml") || shell.includes('data-phone-screen="context"'));
  check("Pop Me or settings context entry", shell.includes('data-phone-open="context"'));
  const settings = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");
  check("settings 记忆图谱 row", settings.includes("记忆图谱") && settings.includes('data-phone-open="context"'));
  const indexHtml = readFileSync(join(root, "index.html"), "utf8");
  check("context-viewer.css linked", indexHtml.includes("context-viewer.css"));
}

const failed = checks.filter((c) => !c.pass);
const passed = checks.length - failed.length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (failed.length) {
  console.log("Failed:");
  for (const f of failed) console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("P2 contract: implementation_green candidate");
