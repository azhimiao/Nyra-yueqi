/**
 * C2 contract checks — life ledger / DayPack (not L3 product acceptance).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
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

const lifeFiles = [
  "src/life/schema.js",
  "src/life/validate.js",
  "src/life/store.js",
  "src/life/generator.js",
  "src/life/projections.js",
  "src/life/prompt.js",
  "src/life/migration.js",
  "src/life/bridge.js",
  "src/life/fixtures/xingli-day-001.js",
];

for (const rel of lifeFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const {
  LIFE_SCHEMA_VERSION,
  LIFE_STORE_KEY,
  EVIDENCE_APPS,
  DAY_PACK_MIN,
  dayPackId,
} = await import("../src/life/schema.js");

const {
  validateLifeEvent,
  validateEvidenceItem,
  validateDayPack,
  findCrossRefCycles,
  meetsDayPackScale,
  validateObservation,
} = await import("../src/life/validate.js");

const {
  __setLifeStorageForTests,
  saveDayPack,
  getDayPack,
  listDayPacks,
  clearAllLife,
  clearCharacterLife,
  exportLifeBag,
  importLifeBag,
  lifeBagsDeepEqual,
  ensureXingliSeedPack,
  recordObservation,
  listLifeEvents,
} = await import("../src/life/store.js");

const { generateCompleteDayPack, createDeterministicDayPackProvider } = await import(
  "../src/life/generator.js"
);
const { projectAppEvidence, projectLockNotifications, projectEventTrail } = await import(
  "../src/life/projections.js"
);
const { formatLifePromptSummary, assertNoPrivateLeak } = await import("../src/life/prompt.js");
const { migrateSidewritePayloadsToLegacyEvidence } = await import("../src/life/migration.js");
const { appendCohabitEvent, projectLifeToCohabitRows, formatBridgedTimelineBlock } = await import(
  "../src/life/bridge.js"
);
const { getXingliDay001Clone, XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE, XINGLI_DAY_001 } =
  await import("../src/life/fixtures/xingli-day-001.js");
const { FIXTURES_BY_APP } = await import("../src/sidewrite/fixtures/index.js");
const { DATA_MODULES, listDataModuleIds } = await import("../src/memory/data-modules.js");
const { BUILTIN_CHARACTER_ID } = await import("../src/constants.js");

check("schema version is 1", LIFE_SCHEMA_VERSION === 1);
check("life store key set", LIFE_STORE_KEY === "yueqi.life.v1");
check("six evidence apps", EVIDENCE_APPS.length === 6);

// --- memory fixture storage ---
__setLifeStorageForTests(memoryStorage());
clearAllLife();

// Normal seed pack validates + scale
const seed = getXingliDay001Clone();
const seedOk = validateDayPack(seed);
check("seed DayPack validates", seedOk.ok === true, seedOk.reason || "ok");
const scale = meetsDayPackScale(seedOk.value || seed);
check(
  "seed meets scale (≥4 events, ≥12 evidence, ≥5 crossRefs)",
  scale.ok,
  `events=${scale.events} evidence=${scale.evidence} crossRefs=${scale.crossRefs}`,
);
check(
  "seed mins match DAY_PACK_MIN",
  scale.events >= DAY_PACK_MIN.events &&
    scale.evidence >= DAY_PACK_MIN.evidence &&
    scale.crossRefs >= DAY_PACK_MIN.crossRefs,
);

const saved = saveDayPack(seed);
check("store saveDayPack", saved.ok === true);
check(
  "store get by character+date",
  getDayPack(XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE)?.id === dayPackId(XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE),
);
check("character isolation list", listDayPacks("other-char").length === 0);
check("listLifeEvents scoped", listLifeEvents(XINGLI_CHARACTER_ID).length >= 4);

// Missing fields
const missId = validateLifeEvent({ summary: "x", characterId: "c", occurredAt: "2026-03-12T10:00:00.000Z" });
check("reject missing event id", missId.ok === false && missId.reason === "missing_id");

const missEv = validateEvidenceItem({
  id: "e1",
  app: "memo",
  occurredAt: "2026-03-12T10:00:00.000Z",
  title: "t",
  content: "c",
});
check("reject missing eventId on evidence", missEv.ok === false && missEv.reason === "missing_eventId");

const badPack = validateDayPack({ characterId: "c1", events: [], evidence: [] });
check("reject DayPack missing localDate / events", badPack.ok === false);

// Bad time
const badTime = validateLifeEvent({
  id: "e",
  characterId: "c",
  occurredAt: "not-a-date",
  summary: "x",
});
check("reject bad occurredAt", badTime.ok === false && badTime.reason === "bad_occurredAt");

const badEvidenceTime = validateDayPack({
  ...getXingliDay001Clone(),
  evidence: [
    {
      ...getXingliDay001Clone().evidence[0],
      id: "bad-time-evd",
      occurredAt: "yesterday",
    },
  ],
});
check(
  "reject bad evidence time in pack",
  badEvidenceTime.ok === false && badEvidenceTime.reason === "bad_evidence_time",
);

// Duplicate ids
const dup = getXingliDay001Clone();
dup.events = [dup.events[0], { ...dup.events[0] }];
const dupR = validateDayPack(dup);
check("reject duplicate event id", dupR.ok === false && String(dupR.reason).includes("duplicate_event"));

const dupE = getXingliDay001Clone();
dupE.evidence = [dupE.evidence[0], { ...dupE.evidence[0] }];
const dupER = validateDayPack(dupE);
check(
  "reject duplicate evidence id",
  dupER.ok === false && String(dupER.reason).includes("duplicate_evidence"),
);

// Cross-character
const cross = getXingliDay001Clone();
cross.events = cross.events.map((e, i) =>
  i === 0 ? { ...e, characterId: "char-other" } : e,
);
const crossR = validateDayPack(cross);
check(
  "reject cross-character event",
  crossR.ok === false && String(crossR.reason).includes("cross_character"),
);

const crossEv = validateEvidenceItem(
  { ...seed.evidence[0], characterId: "char-other" },
  { characterId: XINGLI_CHARACTER_ID },
);
check("reject cross-character evidence", crossEv.ok === false && crossEv.reason === "cross_character");

// Cyclic crossRef
const cyclic = getXingliDay001Clone();
const a = cyclic.evidence[0];
const b = cyclic.evidence[1];
a.crossRefs = [b.id];
b.crossRefs = [a.id];
const cycles = findCrossRefCycles([a, b]);
check("detect cyclic crossRef", cycles.length >= 1, `cycles=${cycles.length}`);
const cyclicRepaired = validateDayPack(cyclic, { repairCycles: true });
check("repair cyclic crossRef (default)", cyclicRepaired.ok === true);
const cyclicReject = validateDayPack(
  {
    ...getXingliDay001Clone(),
    evidence: getXingliDay001Clone().evidence.map((e, i) => {
      if (i === 0) return { ...e, crossRefs: [getXingliDay001Clone().evidence[1].id] };
      if (i === 1) return { ...e, crossRefs: [getXingliDay001Clone().evidence[0].id] };
      return e;
    }),
  },
  { repairCycles: false },
);
check("reject cyclic when repairCycles=false", cyclicReject.ok === false);

// Consistency: same event time/person/location
const trail = projectEventTrail(seedOk.value, "ev-river-walk");
check("event trail has multi-app evidence", (trail.evidence || []).length >= 2);
const locs = new Set(
  [trail.event?.location].filter(Boolean),
);
check("river walk location consistent", locs.size === 1 && [...locs][0].includes("西河"));
const names = new Set(
  (trail.event?.participants || []).map((p) => p.name).concat(
    trail.evidence.map((e) => e.counterpart).filter(Boolean),
  ),
);
check("river walk participants include 你", names.has("你") && names.has("星梨"));

// Projections
check(
  "project messages ≥1",
  projectAppEvidence(seedOk.value, "messages").length >= 1,
);
check(
  "lock notifications 2–4",
  (() => {
    const n = projectLockNotifications(seedOk.value);
    return n.length >= 2 && n.length <= 4;
  })(),
);

// Generator — one complete pack, not per-app
__setLifeStorageForTests(memoryStorage());
clearAllLife();
const genSeed = await generateCompleteDayPack({
  characterId: XINGLI_CHARACTER_ID,
  localDate: XINGLI_DAY_001_DATE,
  forceSeed: true,
});
check("generator seed path", genSeed.ok === true && meetsDayPackScale(genSeed.pack).ok);

const provider = createDeterministicDayPackProvider();
const genModel = await generateCompleteDayPack({
  characterId: "char-test",
  localDate: "2026-04-01",
  provider,
});
check("generator complete pack via provider", genModel.ok === true && genModel.pack?.source === "model");
check(
  "generator remaps date",
  genModel.pack?.localDate === "2026-04-01" &&
    String(genModel.pack.events[0].occurredAt).startsWith("2026-04-01"),
);

const badProvider = {
  async generateDayPack() {
    return { broken: true };
  },
};
__setLifeStorageForTests(memoryStorage());
ensureXingliSeedPack();
const failGen = await generateCompleteDayPack({
  characterId: XINGLI_CHARACTER_ID,
  localDate: "2099-01-01",
  provider: badProvider,
});
check(
  "generator failure retains previous / message",
  failGen.ok === false && failGen.message === "今天还没有更新" && failGen.retained != null,
);

// Prompt — no private leak
__setLifeStorageForTests(memoryStorage());
clearAllLife();
ensureXingliSeedPack();
const pack = getDayPack(XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE);
const privateFact = (pack.events.find((e) => e.visibility === "private")?.privateFacts || [])[0];
const block = formatLifePromptSummary({ characterId: XINGLI_CHARACTER_ID, pack });
check("prompt summary non-empty for shared", block.includes("角色近况"));
check(
  "prompt does not dump privateFacts",
  !privateFact || !block.includes(privateFact),
  privateFact ? "private withheld" : "no private fact",
);
const leak = assertNoPrivateLeak(block, pack);
check("assertNoPrivateLeak", leak.ok);

recordObservation({
  id: "obs-1",
  characterId: XINGLI_CHARACTER_ID,
  dayPackId: pack.id,
  evidenceId: "evd-album-bridge",
  observedAt: "2026-03-12T19:00:00.000Z",
  dwellMs: 4000,
  reactionState: "eligible",
});
const block2 = formatLifePromptSummary({ characterId: XINGLI_CHARACTER_ID });
check("observed discoverable can appear", block2.includes("旧桥") || block2.includes("用户看过"));

// Migration F2a → legacy evidence
__setLifeStorageForTests(memoryStorage());
clearAllLife();
const mig = migrateSidewritePayloadsToLegacyEvidence(
  "char-legacy",
  {
    c5: FIXTURES_BY_APP.c5,
    c4: FIXTURES_BY_APP.c4,
    c8: FIXTURES_BY_APP.c8,
    c2: FIXTURES_BY_APP.c2,
  },
  { localDate: "2026-03-12", merge: false },
);
check("migration ok", mig.ok === true, mig.reason || "ok");
check(
  "migrated evidence viewable",
  (mig.pack?.evidence || []).length >= 5,
  `count=${mig.pack?.evidence?.length || 0}`,
);
const legacyTitles = (mig.pack?.evidence || []).map((e) => e.title).join("|");
check(
  "legacy keeps mom / album / memo content",
  /妈妈|相册|日常|待办|桂花|样本/.test(legacyTitles + JSON.stringify(mig.pack?.evidence || [])),
);
const roundPack = getDayPack("char-legacy", "2026-03-12");
check("migration persisted in store", roundPack != null && (roundPack.evidence || []).length >= 5);

// Export → clear → import deep equal
__setLifeStorageForTests(memoryStorage());
clearAllLife();
ensureXingliSeedPack();
const exported = exportLifeBag();
check("export has packs", Object.keys(exported.packs || {}).length >= 1);
clearAllLife();
check("cleared store empty", Object.keys(exportLifeBag().packs || {}).length === 0);
const imp = importLifeBag(exported);
check("import ok", imp.ok === true && imp.imported >= 1);
check("export/import deep equal", lifeBagsDeepEqual(exported, exportLifeBag()));

// Character clear isolation
saveDayPack({
  ...getXingliDay001Clone(),
  id: dayPackId("char-b", XINGLI_DAY_001_DATE),
  characterId: "char-b",
  events: getXingliDay001Clone().events.map((e) => ({ ...e, characterId: "char-b" })),
});
clearCharacterLife("char-b");
check("clearCharacterLife isolates", getDayPack("char-b", XINGLI_DAY_001_DATE) == null);
check(
  "clearCharacterLife keeps others",
  getDayPack(XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE) != null,
);

// Bridge
__setLifeStorageForTests(memoryStorage());
clearAllLife();
const coh = appendCohabitEvent({
  summary: "一起听了一首歌",
  characterId: "char-bridge",
  appId: "listen",
  kind: "play",
});
check("bridge appendCohabitEvent returns event", Boolean(coh?.id));
const lifeAfter = getDayPack("char-bridge", String(coh.at).slice(0, 10));
check(
  "bridge dual-writes life summary",
  Boolean(lifeAfter?.events?.some((e) => e.summary.includes("一起听"))),
);
check(
  "projectLifeToCohabitRows",
  projectLifeToCohabitRows("char-bridge").length >= 1,
);
check(
  "formatBridgedTimelineBlock",
  formatBridgedTimelineBlock({ characterId: "char-bridge" }).length > 0,
);

// Observation validator
const obsBad = validateObservation({ id: "o", characterId: "c", evidenceId: "e", observedAt: "bad" });
check("reject bad observation time", obsBad.ok === false);

// Backup module registration
check(
  "data-modules includes life",
  listDataModuleIds().includes("life") &&
    DATA_MODULES.some((m) => m.id === "life" && m.key === LIFE_STORE_KEY && m.required),
);

// Backup.js / assemble.js / cohabit dual-write wired
const backupSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "src/memory/backup.js"), "utf8"),
);
check("backup exports life", backupSrc.includes("exportLifeBag") && backupSrc.includes("importLifeBag"));
const assembleSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "src/prompt/assemble.js"), "utf8"),
);
check("assemble injects lifeSummaryBlock", assembleSrc.includes("lifeSummaryBlock") && assembleSrc.includes("formatLifePromptSummary"));
const cohabitSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "src/memory/cohabit-timeline.js"), "utf8"),
);
check("cohabit dual-writes via cohabit-sync", cohabitSrc.includes("cohabit-sync"));

// Fixture frozen export matches character
check("xingli fixture characterId", XINGLI_DAY_001.characterId === BUILTIN_CHARACTER_ID);

const failed = checks.filter((c) => !c.pass);
console.log(`\nverify-core-c2: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:");
  for (const f of failed) console.error(` - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
  process.exit(1);
}
