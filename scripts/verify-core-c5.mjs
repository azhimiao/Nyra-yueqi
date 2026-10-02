/**
 * C5 — Cocreate multi-turn session + publish journey (automatable).
 * Journey: start → ≥3 turns → accept/reject → undo → restore → publish → library lists script.
 * Does not self-sign L3 product acceptance.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
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

globalThis.window = {
  localStorage: memory,
};

const requiredFiles = [
  "src/cocreate/session-schema.js",
  "src/cocreate/session-store.js",
  "src/cocreate/session-engine.js",
  "src/cocreate/artifact-store.js",
  "src/cocreate/publish.js",
  "src/cocreate/cocreate-ui.js",
  "src/cocreate/cocreate-app.css",
  "src/cocreate/schema.js",
  "src/cocreate/store.js",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const uiSrc = readFileSync(join(root, "src/cocreate/cocreate-ui.js"), "utf8");
const cssSrc = readFileSync(join(root, "src/cocreate/cocreate-app.css"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");

check("UI is session-based not form-wall", uiSrc.includes("data-cc-tab") && uiSrc.includes("data-cc-start"));
check("UI has continue last", uiSrc.includes("继续上次共创") || uiSrc.includes("data-cc-resume"));
check("UI has dual tabs 对话/作品", uiSrc.includes(">对话<") && uiSrc.includes(">作品<"));
check("UI has proposal accept/reject", uiSrc.includes("data-cc-accept") && uiSrc.includes("data-cc-reject"));
check("UI has undo/restore", uiSrc.includes("data-cc-undo") && uiSrc.includes("data-cc-restore"));
check("UI has publish diff", uiSrc.includes("data-cc-diff") && uiSrc.includes("data-cc-do-publish"));
check("UI preserves tab input state", uiSrc.includes("uiState") && uiSrc.includes("draftInput"));
check("UI has thinking state", uiSrc.includes("is-thinking") || uiSrc.includes("思考中"));
check("UI seeds opening turn (not blank session)", uiSrc.includes("seedSessionOpening"));
check("UI has no consumer 样例三轮 button", !uiSrc.includes("data-cc-sample") && !uiSrc.includes("样例三轮"));
check("no generate-draft CTA as primary", !uiSrc.includes("生成草稿"));
check("CSS desktop supports dual pane", cssSrc.includes("min-width: 720px") && cssSrc.includes("cc-pane--canvas"));
check("phone shell forces single-pane tabs", cssSrc.includes(".mini-cocreate-mount .cc-tabs") && cssSrc.includes(".cc-pane.is-active:not([hidden])"));
check("CSS linked in index", indexHtml.includes("cocreate-app.css"));
check("avatar in character messages", uiSrc.includes("cc-avatar"));

const {
  TASK_TEMPLATES,
  CREATION_SESSION_SCHEMA_VERSION,
  normalizeCreationSession,
  normalizeCreationTurn,
  normalizeArtifactVersion,
  normalizeProposal,
  emptyArtifactContent,
  isCompleteWork,
  countInteractiveTurns,
  MIN_TURNS_FOR_COMPLETE,
  CHARACTER_FIELD_WHITELIST,
  getTaskTemplate,
} = await import("../src/cocreate/session-schema.js");

check("schema version 1", CREATION_SESSION_SCHEMA_VERSION === 1);
check("three task templates", TASK_TEMPLATES.length === 3);
check("template backstory", Boolean(getTaskTemplate("backstory")));
check("template date_scene", Boolean(getTaskTemplate("date_scene")));
check("template world_setting", Boolean(getTaskTemplate("world_setting")));
check("min turns is 3", MIN_TURNS_FOR_COMPLETE === 3);
check("character field whitelist", CHARACTER_FIELD_WHITELIST.includes(4) && CHARACTER_FIELD_WHITELIST.includes(2));

check("normalize session rejects null", normalizeCreationSession(null).ok === false);
check("normalize turn rejects bad role", normalizeCreationTurn({ role: "npc", text: "x" }).ok === false);
check(
  "normalize turn ok",
  normalizeCreationTurn({ role: "user", text: "你好" }).ok === true,
);
check("normalize proposal ok", normalizeProposal({ text: "建议", patch: { a: 1 } }).ok === true);
check(
  "normalize version needs content",
  normalizeArtifactVersion({ artifactId: "a1" }).ok === false,
);
check("empty backstory content", emptyArtifactContent("backstory").kind === "backstory");
check("empty date content", emptyArtifactContent("date_scene").kind === "date_scene");
check("empty world content", emptyArtifactContent("world_setting").kind === "world_setting");

const {
  startSession,
  getSession,
  getLastResumableSession,
  migrateLegacyDrafts,
  clearSessionBagForTests,
  SESSION_STORE_KEY,
} = await import("../src/cocreate/session-store.js");
const {
  getCurrentContent,
  getArtifact,
  clearArtifactBagForTests,
  ARTIFACT_STORE_KEY,
  listVersionsForArtifact,
} = await import("../src/cocreate/artifact-store.js");
const {
  submitUserMessage,
  acceptProposal,
  rejectProposal,
  undoArtifact,
  restoreArtifact,
  runOfflineSampleCollaboration,
  offlineCharacterReply,
} = await import("../src/cocreate/session-engine.js");
const {
  buildCharacterWhitelistPatch,
  buildScriptPublishPayload,
  buildWorldbookEntries,
  buildPublishPreview,
  publishSession,
  readPublishBackup,
} = await import("../src/cocreate/publish.js");
const { listLibraryItems } = await import("../src/scenario/library/index.js");
const { saveDraft, listDrafts } = await import("../src/cocreate/store.js");

memory.clear();

// —— Whitelist pure tests ——
const fakeChar = {
  id: "char-xingli",
  avatarUrl: "https://example.com/a.png",
  petId: "pet-1",
  profile: {
    fields: ["林星梨", "星梨", "插画师", "model", "旧人设"],
    tokens: ["温柔"],
  },
};
const badField = buildCharacterWhitelistPatch(fakeChar, { text: "x", fieldIndex: 0 });
check("whitelist blocks name field 0", badField.ok === false);
const goodField = buildCharacterWhitelistPatch(fakeChar, {
  text: "新往事",
  fieldIndex: 4,
  tokens: ["雨"],
});
check("whitelist allows field 4", goodField.ok === true);
check("whitelist patch omits avatarUrl", !("avatarUrl" in (goodField.patch || {})));
check("whitelist preserves avatar in meta", goodField.preserved?.avatarUrl === fakeChar.avatarUrl);

const scriptPayload = buildScriptPublishPayload({
  title: "雨夜约会",
  premise: "伞下",
  openingBeat: "灯亮",
  mood: "night",
}, { artifactId: "art-test" });
check("script payload source cocreate", scriptPayload.source === "cocreate");

const wb = buildWorldbookEntries({
  relationshipSummary: "并肩留灯",
  worldEntries: [{ title: "我们", content: "默契", triggers: ["我们"] }],
}, "char-xingli");
check("worldbook entries linked to character", wb[0]?.linkedCharacterIds?.includes("char-xingli"));

// Different character voices
const v1 = offlineCharacterReply({ type: "backstory", characterName: "林星梨", roundIndex: 0, userText: "雨" });
const v2 = offlineCharacterReply({ type: "backstory", characterName: "苏晚", roundIndex: 0, userText: "雨" });
check("offline replies differ by character", v1.text !== v2.text);

// —— Journey: date_scene ——
memory.clear();
clearSessionBagForTests();
clearArtifactBagForTests();

const started = startSession({
  characterId: "char-xingli",
  type: "date_scene",
  characterName: "林星梨",
});
check("startSession returns session", Boolean(started.session?.id));
check("startSession creates artifact", Boolean(started.artifact?.id));
check("session status active", started.session.status === "active");
check("resumeable after start", getLastResumableSession()?.id === started.session.id);

const sid = started.session.id;
const r1 = submitUserMessage(sid, "想去夜市看灯", { characterName: "林星梨" });
check("round1 character reply", Boolean(r1.characterTurn?.text));
check("round1 has proposals", (r1.characterTurn?.proposals || []).length >= 1);

const turn1 = r1.characterTurn;
const propReject = turn1.proposals[1] || turn1.proposals[0];
const beforeReject = JSON.stringify(getCurrentContent(started.artifact.id));
rejectProposal(sid, turn1.id, propReject.id);
const afterReject = JSON.stringify(getCurrentContent(started.artifact.id));
check("reject does not change artifact", beforeReject === afterReject);

const propAccept = turn1.proposals[0];
const accepted = acceptProposal(sid, turn1.id, propAccept.id);
check("accept creates new version", Boolean(accepted.version?.id));
check(
  "accept content kind date_scene",
  accepted.version?.content?.kind === "date_scene",
);
const versionAfterAccept = accepted.version.id;

const r2 = submitUserMessage(sid, "绕远一点走", { characterName: "林星梨" });
const r3 = submitUserMessage(sid, "把开场写慢一点", { characterName: "林星梨" });
check("≥3 interactive rounds path", Boolean(r2 && r3));

const sessionAfter3 = getSession(sid);
const interactive = countInteractiveTurns(sessionAfter3);
check("interactive rounds count user contributions", interactive >= 3, String(interactive));
check("complete work after 3 exchanges", isCompleteWork(sessionAfter3) === true);

// Accept another proposal for undo stack
const t3 = r3.characterTurn;
const contentBeforeSecondAccept = getCurrentContent(started.artifact.id);
acceptProposal(sid, t3.id, t3.proposals[0].id);
const contentAfterSecond = getCurrentContent(started.artifact.id);
check("second accept changed content", JSON.stringify(contentBeforeSecondAccept) !== JSON.stringify(contentAfterSecond));

const undo = undoArtifact(sid);
check("undo changes version", undo?.changed === true);
check(
  "undo restored prior content",
  JSON.stringify(getCurrentContent(started.artifact.id)) === JSON.stringify(contentBeforeSecondAccept),
);

// Persist across refresh
const snapSession = memory.getItem(SESSION_STORE_KEY);
const snapArt = memory.getItem(ARTIFACT_STORE_KEY);
check("persisted session bag", Boolean(snapSession));
check("persisted artifact bag", Boolean(snapArt));
memory.clear();
memory.setItem(SESSION_STORE_KEY, snapSession);
memory.setItem(ARTIFACT_STORE_KEY, snapArt);
check("refresh keeps undone content", JSON.stringify(getCurrentContent(started.artifact.id)) === JSON.stringify(contentBeforeSecondAccept));

const restored = restoreArtifact(sid);
check("restore changes version", restored?.changed === true);
check(
  "restore back to newer content",
  JSON.stringify(getCurrentContent(started.artifact.id)) === JSON.stringify(contentAfterSecond),
);

const versions = listVersionsForArtifact(started.artifact.id);
check("multiple versions stored", versions.length >= 2, String(versions.length));

// Publish requires confirm when incomplete — test on fresh short session
memory.clear();
clearSessionBagForTests();
clearArtifactBagForTests();
const short = startSession({ characterId: "char-xingli", type: "date_scene", characterName: "林星梨" });
submitUserMessage(short.session.id, "一句", { characterName: "林星梨" });
const previewShort = buildPublishPreview(short.session.id);
check("short session needs quick confirm", previewShort.needsQuickConfirm === true);
const denied = await publishSession(short.session.id, { confirmIncomplete: false });
check("publish blocked without confirm", denied.ok === false && denied.error === "incomplete_needs_confirm");

// Full journey publish → library
memory.clear();
clearSessionBagForTests();
clearArtifactBagForTests();
const full = startSession({ characterId: "char-xingli", type: "date_scene", characterName: "林星梨" });
runOfflineSampleCollaboration(full.session.id, { characterName: "林星梨" });
const fullSession = getSession(full.session.id);
check("offline sample ≥3 user rounds", countInteractiveTurns(fullSession) >= 3, String(countInteractiveTurns(fullSession)));
const lastChar = [...(fullSession.turns || [])].reverse().find((t) => t.role === "character" && t.proposals?.length);
if (lastChar) acceptProposal(full.session.id, lastChar.id, lastChar.proposals[0].id);

const preview = buildPublishPreview(full.session.id);
check("publish preview target script", preview.target === "script");
check("publish preview has diff", (preview.diff || []).length >= 2);

const published = await publishSession(full.session.id, { confirmIncomplete: true });
check("publish ok", published.ok === true, published.error || "");
check("publish wrote backup", Boolean(readPublishBackup()?.sessionId));
check("publish returns script id", Boolean(published.script?.id));
check(
  "library lists published script",
  listLibraryItems().some((item) => item.id === published.script.id),
  published.script?.id || "",
);
check(
  "library item source cocreate",
  listLibraryItems().find((item) => item.id === published.script.id)?.source === "cocreate",
);
check("session status published", getSession(full.session.id)?.status === "published");
check("artifact publishedAt set", Boolean(getArtifact(full.artifact.id)?.publishedAt));

// Character publish whitelist end-to-end (mocked upsert)
memory.clear();
clearSessionBagForTests();
clearArtifactBagForTests();
const back = startSession({ characterId: "char-xingli", type: "backstory", characterName: "林星梨" });
runOfflineSampleCollaboration(back.session.id, {
  characterName: "林星梨",
  seeds: ["雨夜的灯", "没说完的话", "想被你读到"],
});
const backSess = getSession(back.session.id);
const backCharTurn = [...(backSess.turns || [])].reverse().find((t) => t.role === "character");
acceptProposal(back.session.id, backCharTurn.id, backCharTurn.proposals[0].id);

let upserted = null;
const charPub = await publishSession(back.session.id, {
  character: fakeChar,
  confirmIncomplete: true,
  upsertCharacter: async (partial) => {
    upserted = partial;
    return { ...fakeChar, ...partial, profile: { ...fakeChar.profile, ...partial.profile } };
  },
});
check("backstory publish ok", charPub.ok === true, charPub.error || "");
check("backstory upsert used whitelist fields", Array.isArray(upserted?.profile?.fields));
check("backstory upsert no avatar key", !("avatarUrl" in (upserted || {})));

// World setting publish
memory.clear();
clearSessionBagForTests();
clearArtifactBagForTests();
const world = startSession({ characterId: "char-xingli", type: "world_setting", characterName: "林星梨" });
runOfflineSampleCollaboration(world.session.id, { characterName: "林星梨" });
const worldSess = getSession(world.session.id);
const worldTurn = [...(worldSess.turns || [])].reverse().find((t) => t.role === "character");
acceptProposal(world.session.id, worldTurn.id, worldTurn.proposals[0].id);
const wbSaved = [];
const worldPub = await publishSession(world.session.id, {
  character: fakeChar,
  confirmIncomplete: true,
  upsertWorldbookEntry: async (e) => {
    wbSaved.push(e);
    return e;
  },
  upsertCharacter: async (p) => p,
});
check("world publish ok", worldPub.ok === true, worldPub.error || "");
check("worldbook entries written", wbSaved.length >= 1, String(wbSaved.length));

// Legacy draft migration
memory.clear();
clearSessionBagForTests();
clearArtifactBagForTests();
saveDraft({
  id: "cc-legacy-1",
  target: "script",
  characterId: "char-xingli",
  input: { prompt: "旧草稿约会" },
  output: {
    scriptPatch: {
      title: "旧一幕",
      premise: "迁移测试",
      openingBeat: "灯",
      mood: "warm",
    },
  },
  createdAt: new Date().toISOString(),
});
check("legacy draft saved", listDrafts().some((d) => d.id === "cc-legacy-1"));
const mig = migrateLegacyDrafts({ force: true });
check("legacy migrated ≥1", mig.migrated >= 1, String(mig.migrated));
check("migrated artifact exists", getArtifact(getSession("migrated-cc-legacy-1")?.artifactId)?.id);

// UI static: not form wall labels cluster
check("UI no keyword form field", !uiSrc.includes("data-cc-keywords"));
check("UI no tone select form", !uiSrc.includes("data-cc-tone"));
check("UI starts from a free idea, not template cards", uiSrc.includes("data-cc-start-input") && !uiSrc.includes("data-cc-templates"));
check("UI refuses fake offline production replies", uiSrc.includes("不会用套话冒充 TA 的创作") && uiSrc.includes("not_configured"));

const failed = checks.filter((c) => !c.pass);
console.log(`\nverify:core-c5 ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.error("Failed:", failed.map((f) => f.name).join("; "));
  process.exit(1);
}
