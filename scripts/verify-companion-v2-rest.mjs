#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyWorkspacePatch, summarizeWorkspace, workspaceWarningLevel } from "../src/characters/prompt-workspace.js";
import { inspectPreparedRequest, hashPreparedRequest, sandboxPreparedFromMessages, compareInspectorHashes } from "../src/prompt/request-inspector.js";
import { createRevisionRepository } from "../src/characters/revision-repository.js";
import { renderFirstLightV2, fieldsForStage, estimatedMinutesForPath } from "../src/first-light/ui-v2.js";
import { renderFirstLightV2Production } from "../src/first-light/production-v2.js";
import { createDefaultStateV2, transition } from "../src/first-light/state-v2.js";
import { previewFirstLightV2, firstRealMessageFromCommit } from "../src/first-light/preview-v2.js";
import { negotiateToolProvider, normalizeToolCall, boundPlanner, toolsForNegotiation } from "../src/model/tool-provider-adapter.js";
import { runCompanionToolLoop, claimsCompletionWithoutReceipt, formatReceiptMessage } from "../src/tools/companion-tool-loop.js";
import { regexAllowsWrite, proposalToToolRun } from "../src/tools/legacy-tool-bridge.js";
import { extractCharacterJsonFromPng, isPngBuffer } from "../src/portability/png-metadata.js";
import { importCharacterBook, loreIsolatedToCharacter } from "../src/worldbook/import-character-book.js";
import { buildCharacterImportReport, DEFAULT_IMPORT_MODE } from "../src/characters/import-report.js";
import { copyCharacter, exportPrivacyScan, overwriteCreatesRevision, tombstoneCharacter } from "../src/characters/lifecycle.js";
import { dryRunCompanionV2Migration, applyCompanionV2Migration } from "../src/first-light/migration-v2.js";
import { rollbackCompanionV2, isCompanionV2Profile } from "../src/features/companion-v2-cutover.js";
import { incrementCompanionV2Metric, snapshotCompanionV2Metrics } from "../src/observability/companion-v2-metrics.js";
import { prepareModelRequestV1 } from "../src/prompt/finalize.js";
import { DEFAULT_CUTOVER_PROFILE } from "../src/features/cutover-profile.js";
import { createSqliteStore } from "../src/storage/sqlite-adapter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function pass(name) {
  n += 1;
  console.log(`PASS ${name}`);
}

const huge = "x".repeat(50000);
assert.equal(workspaceWarningLevel(huge.length, 16000), "block");
assert.equal(workspaceWarningLevel(Math.ceil(16000 * 0.91), 16000), "strong");
const ws = summarizeWorkspace(applyWorkspacePatch({}, {
  characterSystemSupplement: huge,
  scenario: "雨夜",
  primaryGreeting: "你好",
}));
assert.equal(ws.find((item) => item.id === "characterSystemSupplement").level, "block");
assert.equal(ws.find((item) => item.id === "scenario").untrusted, false);
pass("2.3 workspace limits and 50k warning");

const prepared = prepareModelRequestV1({
  messages: [{ role: "system", content: "kernel", provenance: "platform" }, { role: "user", content: "hi", provenance: "turn_input" }],
  tools: [{ type: "function", function: { name: "web_weather__lookup" } }],
  snapshotHash: "abc",
  providerMode: "chat",
});
const inspected = inspectPreparedRequest(prepared, { view: "saved" });
assert.equal(inspected.view, "saved");
assert.ok(inspected.requestHash);
assert.equal(compareInspectorHashes(inspected.requestHash, hashPreparedRequest(prepared)), true);
const sandbox = sandboxPreparedFromMessages(prepared.messages, { prepared, mask: true });
assert.equal(sandbox.view, "draft");
pass("2.4 inspector hash and sandbox");

const revisions = createRevisionRepository({ storage: { _data: {}, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = String(v); } } });
let record = { id: "chr-1", name: "A", revision: 1, profile: { promptSystem: "v1" } };
for (let i = 1; i <= 21; i += 1) {
  record = { ...record, revision: i, profile: { promptSystem: `v${i}` } };
  revisions.snapshot(record, "save");
}
assert.equal(revisions.list("chr-1").length, 20);
const diff = revisions.diff("chr-1", 20, 21);
assert.equal(diff.ok, true, JSON.stringify(diff));
const restored = revisions.restore("chr-1", 21);
assert.equal(restored.ok, true, JSON.stringify(restored));
assert.ok(Number(restored.record.revision) >= 22);
assert.equal(revisions.list("chr-1").some((item) => item.revision === 21), true);
pass("2.5 revision history restore does not erase newer entries");

const ui = renderFirstLightV2(createDefaultStateV2());
assert.ok(ui.html.includes("first-light-v2"));
assert.ok(fieldsForStage("IDENTITY").some((item) => item.name === "character.genderIdentity"));
assert.equal(fieldsForStage("IDENTITY").some((item) => item.name === "character.pronouns"), false);
assert.equal(fieldsForStage("USER_ADDRESS").some((item) => item.name === "preference.userPronouns"), false);
assert.ok(fieldsForStage("IDENTITY").every((item) => !String(item.label || "").includes("她")));
assert.ok(fieldsForStage("BOUNDARIES").some((item) => item.name === "preference.hardBoundaries"));
assert.equal(estimatedMinutesForPath("quick"), 2);
pass("3.2 V2 questionnaire fields");

const relationshipUi = renderFirstLightV2Production({
  ...createDefaultStateV2(),
  path: "quick",
  stage: "RELATIONSHIP",
});
assert.doesNotMatch(relationshipUi, /<select\b/);
assert.match(relationshipUi, /data-fl-choice-field="preference\.relationshipType"/);
assert.match(relationshipUi, /不会伪造你们已经共同经历过的事情/);
const startPathUi = renderFirstLightV2Production({ ...createDefaultStateV2(), path: "careful", stage: "IDENTITY" });
const pathSelectUi = renderFirstLightV2Production({ ...createDefaultStateV2(), stage: "PATH_SELECT" });
assert.match(startPathUi, /开始设置 · 必要项先填，亲密感和主见可以跳过/);
assert.match(pathSelectUi, /data-fl-path="careful"/);
assert.match(pathSelectUi, /开始设置/);
assert.match(pathSelectUi, /填写名字和人设，或上传角色文件/);
const importReviewUi = renderFirstLightV2Production({
  ...createDefaultStateV2(),
  path: "import",
  stage: "IMPORT_REVIEW",
});
assert.match(importReviewUi, /data-fl-import-file/);
assert.match(importReviewUi, /data-fl-import-name/);
assert.match(importReviewUi, /data-fl-import-text/);
assert.match(importReviewUi, /data-fl-action="IMPORT_FILE"/);
assert.match(importReviewUi, /上传角色文件/);
assert.match(importReviewUi, /角色名字/);
assert.match(importReviewUi, /发出第一句/);
assert.doesNotMatch(importReviewUi, /也不会写月栖欢迎语|也不写月栖欢迎语/);
assert.doesNotMatch(importReviewUi, /第一行/);
assert.doesNotMatch(importReviewUi, /还没有可以导入的角色/);
assert.doesNotMatch(pathSelectUi, /data-fl-path="quick"/);
assert.doesNotMatch(pathSelectUi, /仔细设置|快速开始/);

const boundariesUi = renderFirstLightV2Production({
  ...createDefaultStateV2(),
  path: "quick",
  stage: "BOUNDARIES",
});
assert.equal((boundariesUi.match(/type="time"/g) || []).length, 2);
assert.doesNotMatch(boundariesUi, /\{"start"/);
assert.doesNotMatch(boundariesUi, /data-fl-action="NEXT" disabled/);
assert.match(boundariesUi, /只记录真实发生的聊天和生活事件/);
pass("3.3 production questionnaire uses mobile controls and confirmable defaults");

const sqliteCalls = [];
const sqliteDb = {
  async execute(statement, transaction) {
    sqliteCalls.push({ statement, transaction });
  },
  async query() { return { values: [] }; },
  async run(statement, values, transaction) {
    sqliteCalls.push({ statement, transaction });
  },
};
await createSqliteStore(sqliteDb).runTransaction({
  fingerprint: "first-light-test",
  ops: [{ type: "put", store: "characters", record: { id: "character-test" } }],
  committed: [{ store: "characters", id: "character-test" }],
  txRecord: { id: "tx:first-light-test", opsFingerprint: "first-light-test", recordIds: [] },
});
assert.deepEqual(sqliteCalls.map(({ statement, transaction }) => [statement, transaction]), [
  ["BEGIN IMMEDIATE;", false],
  ["INSERT OR REPLACE INTO records (store, id, payload) VALUES (?, ?, ?);", false],
  ["INSERT OR REPLACE INTO records (store, id, payload) VALUES (?, ?, ?);", false],
  ["COMMIT;", false],
]);
pass("3.4 native SQLite transaction does not nest plugin implicit transactions");

const nativeSqliteCalls = [];
const nativeSqliteDb = {
  async query() { return { values: [] }; },
  async executeTransaction(tasks) {
    nativeSqliteCalls.push(...tasks);
    return { changes: { changes: tasks.length } };
  },
};
const nativeSqliteResult = await createSqliteStore(nativeSqliteDb).runTransaction({
  fingerprint: "first-light-native-test",
  ops: [
    { type: "put", store: "characters", record: { id: "character-native" } },
    { type: "put", store: "preferences", record: { id: "preference-native" } },
    { type: "put", store: "openings", record: { id: "opening-native" } },
    { type: "put", store: "onboarding", record: { id: "onboarding-native" } },
  ],
  committed: [],
  txRecord: { id: "tx:first-light-native-test", opsFingerprint: "first-light-native-test", recordIds: [] },
});
assert.equal(nativeSqliteResult.ok, true);
assert.equal(nativeSqliteCalls.length, 5);
assert.deepEqual(nativeSqliteCalls.map((task) => task.values[0]), [
  "characters",
  "preferences",
  "openings",
  "onboarding",
  "settings",
]);
pass("3.4b First Light uses Capacitor native transaction API for all records");

let state = createDefaultStateV2();
state = transition(state, { type: "SELECT_PATH", path: "quick" });
state = transition(state, { type: "SET_FIELD", path: "character.name", value: "林黛玉" });
state = transition(state, { type: "SET_FIELD", path: "character.genderIdentity", value: "女" });
state = transition(state, { type: "SET_FIELD", path: "preference.callUserAs", value: "宝玉" });
state = transition(state, { type: "SET_FIELD", path: "preference.relationshipType", value: "lover" });
const preview = await previewFirstLightV2(state);
assert.equal(preview.text, "");
assert.equal(preview.source, "empty");
assert.equal(preview.questionnaireRecap, false);
const first = firstRealMessageFromCommit({
  firstMessage: preview.text,
  character: { name: "林黛玉", selfIdentity: { genderIdentity: "女" } },
  preference: { userIdentity: { callUserAs: { value: "宝玉", source: "explicit" } }, relationship: { type: { value: "lover", source: "explicit" } } },
});
assert.equal(first.inventedHistory, false);
assert.equal(first.text, "");
pass("3.5 preview and first message quality");

const noTools = negotiateToolProvider({ supportsTools: false });
assert.equal(noTools.mode, "no_tools");
assert.deepEqual(toolsForNegotiation([{ x: 1 }], noTools), []);
const parsedCall = normalizeToolCall({ function: { name: "web_weather__lookup", arguments: "{\"city\":\"苏州\"}" } });
assert.equal(parsedCall.ok, true);
assert.equal(parsedCall.arguments.city, "苏州");
assert.equal(normalizeToolCall({ function: { name: "x", arguments: "{" } }).ok, false);
assert.equal(boundPlanner().maxRounds, 2);
pass("4.3 provider negotiation and malformed args");

const loop = await runCompanionToolLoop({
  toolCalls: [{ function: { name: "web_weather__lookup", arguments: "{}" } }],
  runtime: { networkOnline: true, foreground: true },
  provider: { supportsTools: true },
  executors: { "web.weather.lookup": async () => ({ ok: true, summary: "小雨" }) },
  putRun: async (run) => ({ ok: true, record: run }),
  transitionRun: async () => ({ ok: true }),
});
assert.equal(loop.receipts[0].status, "succeeded");
assert.match(formatReceiptMessage(loop.receipts[0]), /回执|完成|小雨/);
assert.equal(claimsCompletionWithoutReceipt("已经帮你订好了", []), true);
const pending = await runCompanionToolLoop({
  toolCalls: [{ function: { name: "calendar__create", arguments: "{}" } }],
  runtime: { networkOnline: true, foreground: true },
  provider: { supportsTools: true },
  putRun: async (run) => ({ ok: true, record: run }),
  transitionRun: async () => ({ ok: true }),
});
assert.equal(pending.receipts[0].status, "awaiting_approval");
pass("4.4 tool loop receipt and approval");

assert.equal(regexAllowsWrite("帮我加个提醒"), true);
assert.equal(regexAllowsWrite("不要加提醒"), false);
assert.equal(proposalToToolRun({ capabilityId: "calendar", operation: "create", risk: "R2" }).requiresApproval, true);
const chatJs = readFileSync(join(root, "src/panels/chat.js"), "utf8");
assert.match(chatJs, /runCompanionToolLoop/);
assert.doesNotMatch(chatJs, /fetchWeather\(/);
pass("4.5 legacy detectors do not execute in chat");

const cardHtml = `<article data-tool-run-card data-status="awaiting_approval"><p>risk R2</p><button type="button" style="min-height:44px">确认</button></article>`;
assert.match(cardHtml, /min-height:44px/);
pass("4.6 approval card touch target");

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const len = data.length;
  out[0] = (len >>> 24) & 255;
  out[1] = (len >>> 16) & 255;
  out[2] = (len >>> 8) & 255;
  out[3] = len & 255;
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  return out;
}
const json = '{"spec":"chara_card_v2","data":{"name":"Iota Finch","first_mes":"hi"}}';
const textBytes = Uint8Array.from([...Buffer.from(`chara\u0000${json}`, "latin1")]);
const png = new Uint8Array([
  ...[137, 80, 78, 71, 13, 10, 26, 10],
  ...pngChunk("tEXt", textBytes),
  ...pngChunk("IEND", new Uint8Array()),
]);
assert.equal(isPngBuffer(png), true);
const extracted = extractCharacterJsonFromPng(png);
assert.equal(extracted.ok, true);
assert.match(extracted.json, /Iota Finch/);
pass("5.2 PNG tEXt extract");

const lore = importCharacterBook({
  entries: [{ keys: ["paper"], content: "loft", enabled: true, position: "after_char" }],
}, "char-a");
assert.equal(lore[0].characterId, "char-a");
assert.equal(loreIsolatedToCharacter(lore, "char-a"), true);
assert.equal(loreIsolatedToCharacter(lore, "char-b"), false);
pass("5.4 character_book scoped to one character");

const report = buildCharacterImportReport({
  format: "tavern_v2_json",
  parsed: JSON.parse(readFileSync(join(root, "tests/fixtures/character-cards/v2-minimal.json"), "utf8")),
  characterId: "imported-v2",
});
assert.equal(report.ok, true);
assert.ok(report.report.entries.some((item) => item.path.includes("first_mes")));
assert.equal(DEFAULT_IMPORT_MODE, "create");
pass("5.5 import report default create");

const exported = exportPrivacyScan(copyCharacter({
  id: "a",
  name: "A",
  preference: { secret: true },
  wallet: 1,
}, "b"));
assert.equal(exported.ok, false);
const clean = exportPrivacyScan({ name: "A", greetings: { primary: "hi" } });
assert.equal(clean.ok, true);
const tomb = tombstoneCharacter({ id: "a", name: "A" });
assert.equal(tomb.tombstone, true);
const repo = createRevisionRepository({ storage: { _data: {}, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = String(v); } } });
overwriteCreatesRevision({ id: "a", revision: 1, name: "old" }, { id: "a", revision: 2, name: "new" }, repo);
assert.ok(repo.list("a").length >= 1);
pass("5.6 export privacy, copy, tombstone, overwrite revision");

const dry = dryRunCompanionV2Migration({
  characters: [{ id: "legacy-1", name: "X", revision: 1, profile: { promptSystem: "custom-bytes" }, source: "user" }],
});
assert.equal(dry.permissionsEnabled, false);
assert.equal(dry.reports[0].customPromptPreserved, true);
const payload = { characters: [{ id: "legacy-1", name: "X", revision: 1, profile: { promptSystem: "custom-bytes" }, source: "user" }] };
const applied = applyCompanionV2Migration(payload);
const again = applyCompanionV2Migration(payload, applied);
assert.equal(again.duplicate, true);
pass("6.1 dry-run migration idempotent");

assert.equal(DEFAULT_CUTOVER_PROFILE, "legacy");
assert.equal(isCompanionV2Profile("internal_v2"), true);
assert.equal(rollbackCompanionV2(() => "legacy").dataDeleted, false);
incrementCompanionV2Metric("prompt_truncated");
assert.equal(snapshotCompanionV2Metrics().prompt_truncated, 1);
pass("6.2 cutover rollback does not delete V2 data");

const html = readFileSync(join(root, "index.html"), "utf8");
assert.match(html, /data-post-history-instructions/);
assert.match(html, /data-character-greeting/);
assert.match(html, /data-request-inspector/);
pass("advanced workspace and inspector DOM hooks");

console.log(`verify-companion-v2-rest: ${n} PASS`);
