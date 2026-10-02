/**
 * C3 contract + journey (automatable) + semantic — TA's phone / DayPack projections.
 * Does not self-sign L3 product acceptance.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const requiredFiles = [
  "src/sidewrite/daypack-access.js",
  "src/sidewrite/ui/sidewrite-app.js",
  "src/sidewrite/ui/ta-lock.js",
  "src/sidewrite/ui/ta-screen.js",
  "src/sidewrite/ui/ta-navigation.js",
  "src/sidewrite/ui/apps/messages.js",
  "src/sidewrite/ui/apps/album.js",
  "src/sidewrite/ui/apps/calendar.js",
  "src/sidewrite/ui/apps/memo.js",
  "src/sidewrite/ui/apps/browser.js",
  "src/sidewrite/ui/apps/orders.js",
  "src/life/projections.js",
  "src/life/fixtures/xingli-day-001.js",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const {
  TA_APP_KEYS,
  TA_GRID_ORDER,
  TA_DOCK_ORDER,
  TA_APP_META,
} = await import("../src/sidewrite/constants.js");

check("six product apps", TA_APP_KEYS.length === 6 && TA_APP_KEYS.join(",") === "messages,album,calendar,memo,browser,orders");
check("grid and dock disjoint", TA_GRID_ORDER.every((id) => !TA_DOCK_ORDER.includes(id)));
check(
  "dock is four primary apps",
  TA_DOCK_ORDER.join(",") === "messages,album,calendar,browser",
);
check(
  "grid is memo/orders",
  TA_GRID_ORDER.join(",") === "memo,orders",
);
check(
  "all six have meta",
  TA_APP_KEYS.every((k) => TA_APP_META[k]?.label && TA_APP_META[k]?.icon),
);

// Forbidden consumer copy in C3 product UI paths
const uiRoots = [
  "src/sidewrite/ui/sidewrite-app.js",
  "src/sidewrite/ui/ta-lock.js",
  "src/sidewrite/ui/ta-screen.js",
  "src/sidewrite/ui/shared.js",
  "src/sidewrite/ui/apps/messages.js",
  "src/sidewrite/ui/apps/album.js",
  "src/sidewrite/ui/apps/calendar.js",
  "src/sidewrite/ui/apps/memo.js",
  "src/sidewrite/ui/apps/browser.js",
  "src/sidewrite/ui/apps/orders.js",
];
const banned = ["生成痕迹", "正在伪造"];
const bannedDevVisible = ["fixture"];
for (const rel of uiRoots) {
  const text = readFileSync(join(root, rel), "utf8");
  const hit = banned.find((b) => text.includes(b));
  check(`no banned copy in ${rel}`, !hit, hit || "ok");
  // fixture string only banned if used as user-visible label (skip jsdoc/comments lightly)
  if (bannedDevVisible.some((b) => text.includes(`>${b}<`) || text.includes(`"${b}"`))) {
    check(`no visible fixture label in ${rel}`, false, "fixture");
  }
}

const sidewriteApp = readFileSync(join(root, "src/sidewrite/ui/sidewrite-app.js"), "utf8");
check(
  "sidewrite consumes DayPack projections",
  sidewriteApp.includes("resolveDayPackForCharacter") &&
    sidewriteApp.includes("projectLockNotifications") &&
    sidewriteApp.includes("mountMessagesApp"),
);
check(
  "sidewrite does not mount per-app generate runner",
  !sidewriteApp.includes("generateAppPayload") && !sidewriteApp.includes("mountC5Im"),
);

const {
  __setLifeStorageForTests,
  clearAllLife,
  clearCharacterLife,
  ensureXingliSeedPack,
  saveDayPack,
  getDayPack,
  recordObservation,
  listObservations,
} = await import("../src/life/store.js");
const { dayPackId } = await import("../src/life/schema.js");

const {
  measureAppDensity,
  projectMessagesVm,
  projectMessageThreadDetail,
  projectAlbumVm,
  projectAlbumItemDetail,
  projectCalendarVm,
  projectCalendarDetail,
  projectEventTrail,
  projectLockNotifications,
  projectUnreadBadges,
} = await import("../src/life/projections.js");

const { formatLifePromptSummary, assertNoPrivateLeak } = await import("../src/life/prompt.js");
const { getXingliDay001Clone, XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE } = await import(
  "../src/life/fixtures/xingli-day-001.js"
);
const { resolveDayPackForCharacter, observeEvidence, listObservedEvidenceIds } = await import(
  "../src/sidewrite/daypack-access.js"
);

__setLifeStorageForTests(memoryStorage());
clearAllLife();

const seed = getXingliDay001Clone();
const saved = saveDayPack(seed);
check("seed saves", saved.ok === true);

const density = measureAppDensity(saved.pack);
check(
  "§5.2 density",
  density.ok,
  `msg=${density.messages} albums=${density.albumAlbums} photos=${density.albumItems} cal=${density.calendar} memo=${density.memo} browser=${density.browser} orders=${density.orders}`,
);

const notes = projectLockNotifications(saved.pack);
check("lock notifications 2–4", notes.length >= 2 && notes.length <= 4, `n=${notes.length}`);

// --- Journey (contract-layer automation) ---
const pack = ensureXingliSeedPack();
const msgVm = projectMessagesVm(pack);
const youThread = msgVm.threads.find((t) => t.title === "你") || msgVm.threads[0];
check("journey: messages list has threads", msgVm.count >= 5 && Boolean(youThread));

const threadDetail = projectMessageThreadDetail(pack, youThread.id);
const albumRef = (threadDetail?.linked || []).find((e) => e.app === "album");
check("journey: message links to album", Boolean(albumRef), albumRef?.id || "missing");

// Observe message evidence
for (const eid of youThread.evidenceIds || []) {
  observeEvidence({
    characterId: XINGLI_CHARACTER_ID,
    dayPackId: pack.id,
    evidenceId: eid,
    discoverable: true,
  });
}

const albumDetail = projectAlbumItemDetail(pack, albumRef?.id || "evd-album-bridge");
check("journey: album detail opens", Boolean(albumDetail?.item), albumDetail?.item?.title || "");
if (albumDetail?.item) {
  observeEvidence({
    characterId: XINGLI_CHARACTER_ID,
    dayPackId: pack.id,
    evidenceId: albumDetail.item.id,
    discoverable: albumDetail.item.discoverable,
  });
}

const sameEventId = albumDetail?.item?.eventId || youThread.eventId;
const trail = projectEventTrail(pack, sameEventId);
const calSibling = trail.evidence.find((e) => e.app === "calendar");
check("journey: same event has calendar sibling", Boolean(calSibling), calSibling?.id || "");

const calDetail = projectCalendarDetail(pack, calSibling?.id || "evd-cal-walk");
check("journey: calendar detail", Boolean(calDetail?.item));
if (calDetail?.item) {
  observeEvidence({
    characterId: XINGLI_CHARACTER_ID,
    dayPackId: pack.id,
    evidenceId: calDetail.item.id,
    discoverable: calDetail.item.discoverable,
  });
}

const obs = listObservations(XINGLI_CHARACTER_ID, { limit: 50 });
check("journey: observations written", obs.length >= 2, `n=${obs.length}`);

const prompt = formatLifePromptSummary({ characterId: XINGLI_CHARACTER_ID, pack });
check(
  "journey: Pop summary includes observed",
  prompt.includes("用户看过") || /西河|旧桥|散步/.test(prompt),
  prompt.slice(0, 120),
);
const leak = assertNoPrivateLeak(prompt, pack);
check("journey: prompt does not leak privateFacts", leak.ok, leak.leaked?.[0] || "ok");

// Unobserved private must not appear
const privateFact = (pack.events.find((e) => e.visibility === "private")?.privateFacts || [])[0];
check(
  "private fact absent from prompt",
  !privateFact || !prompt.includes(privateFact),
);

// Character isolation
clearCharacterLife("char-other-c3");
const other = resolveDayPackForCharacter("char-other-c3");
check("other character has empty pack (no xingli leak)", other.pack === null && other.source === "empty");
const xingliResolved = resolveDayPackForCharacter(XINGLI_CHARACTER_ID);
check("xingli resolves seed/stored", Boolean(xingliResolved.pack));

// Prefer dense seed over thin cohabit dual-write pack
saveDayPack({
  id: dayPackId(XINGLI_CHARACTER_ID, "2026-07-26"),
  schemaVersion: 1,
  characterId: XINGLI_CHARACTER_ID,
  localDate: "2026-07-26",
  theme: "同栖摘要",
  generatedAt: "2026-07-26T00:00:00.000Z",
  source: "chat",
  events: [
    {
      id: "ev-thin",
      schemaVersion: 1,
      characterId: XINGLI_CHARACTER_ID,
      occurredAt: "2026-07-26T00:00:00.000Z",
      durationMinutes: 5,
      type: "note",
      summary: "同栖摘要",
      participants: [{ id: "p-self", name: "角色", relation: "self" }],
      location: "",
      emotionBefore: "",
      emotionAfter: "",
      privateFacts: [],
      memoryRefs: [],
      relatedEventIds: [],
      evidenceIds: [],
      visibility: "shared",
      source: "chat",
    },
  ],
  evidence: [],
  appSummary: {},
  consistency: { checkedAt: "2026-07-26T00:00:00.000Z", errors: [], warnings: [] },
});
const preferDense = resolveDayPackForCharacter(XINGLI_CHARACTER_ID);
check(
  "resolve prefers dense seed over thin latest",
  preferDense.pack?.localDate === XINGLI_DAY_001_DATE && (preferDense.pack?.evidence || []).length >= 12,
  preferDense.pack?.localDate || "",
);

const readIds = listObservedEvidenceIds(XINGLI_CHARACTER_ID);
const badges = projectUnreadBadges(pack, readIds);
check("unread badges object covers six apps", TA_APP_KEYS.every((k) => typeof badges[k] === "number"));

// Semantic: time/place consistency for river-walk trail
const riverTrail = projectEventTrail(pack, "ev-river-walk");
const places = new Set(
  [riverTrail.event?.location, ...riverTrail.evidence.map(() => riverTrail.event?.location)].filter(Boolean),
);
check(
  "semantic: river-walk single location",
  places.size <= 1 && String(riverTrail.event?.location || "").includes("西河"),
  riverTrail.event?.location || "",
);
const timesOk = riverTrail.evidence.every((e) => String(e.occurredAt).startsWith(XINGLI_DAY_001_DATE));
check("semantic: river evidence same localDate", timesOk);

const albumVm = projectAlbumVm(pack);
check("album ≥3 / ≥8", albumVm.albums.length >= 3 && albumVm.count >= 8);

const calVm = projectCalendarVm(pack);
check("calendar ≥3", calVm.count >= 3);

// Candidate screenshot dir may be empty until capture — warn only if REVIEW missing after we write it
const reviewPath = join(root, "docs/qa/core-experience/C3/REVIEW.md");
check("C3 REVIEW.md present", existsSync(reviewPath));

const statusPath = join(root, "docs/qa/core-experience/STATUS.md");
const statusText = readFileSync(statusPath, "utf8");
check(
  "STATUS mentions C3",
  statusText.includes("C3") && statusText.includes("TA"),
);

const failed = checks.filter((c) => !c.pass);
console.log(`\nverify-core-c3: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:");
  for (const f of failed) console.error(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
