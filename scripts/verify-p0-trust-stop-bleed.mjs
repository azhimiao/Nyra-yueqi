/**
 * P0 trust stop-bleed — static + unit checks (no browser).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  freezeTurnExecutionScope,
  createPendingTurnBuckets,
  resolveReplyExecutionScope,
  snapshotProviderConfig,
} from "../src/conversation/turn-scope.js";
import { OpenClawMobileRuntimeAdapter } from "../src/integrations/openclaw-mobile/OpenClawMobileRuntimeAdapter.js";
import { ARCHIVED_EXPERIENCE_APPS } from "../src/phone-shell/app-registry.js";
import {
  upsertArtifact,
  enqueueDelivery,
  markDelivered,
  parseDeepLink,
  __resetArtifactsForTests,
  __resetDeliveryForTests,
} from "../src/artifacts/index.js";
import { censusPalaceRows, verifyAssemblePalaceIsolation, filterPalaceRowsForAssemble } from "../src/memory/palace/legacy-census.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const cases = [];
function check(id, ok, detail = "") {
  cases.push({ id, pass: Boolean(ok), detail: String(detail || "") });
  if (!ok) console.error(`FAIL ${id}`, detail);
  else console.log(`PASS ${id}`);
}

// --- TurnExecutionScope buckets ---
const scopeA = freezeTurnExecutionScope({
  characterId: "char-a",
  sessionId: "sess-a",
});
const scopeB = freezeTurnExecutionScope({
  characterId: "char-b",
  sessionId: "sess-b",
});
assert.ok(scopeA && scopeB);
check("scope_freeze", scopeA.characterId === "char-a" && scopeA.turnKey.includes("char-a"));

const buckets = createPendingTurnBuckets();
buckets.buffer(scopeA, { userText: "hello A", userMessageId: "m1" });
buckets.buffer(scopeB, { userText: "hello B", userMessageId: "m2" });
const takenB = buckets.take(scopeB);
const takenA = buckets.take(scopeA);
check(
  "bucket_isolation",
  takenB.userText === "hello B" && takenA.userText === "hello A" && takenB.pendingUserTurns === 1,
  JSON.stringify({ takenA, takenB }),
);
check("bucket_empty_after_take", buckets.size() === 0);

// Switching focus to B must not steal A's buffered text when taking B with empty bucket
buckets.buffer(scopeA, { userText: "only A", userMessageId: "m3" });
const steal = buckets.take(scopeB);
check("no_cross_character_steal", steal.userText === "" && steal.pendingUserTurns === 0);
const remainA = buckets.take(scopeA);
check("a_still_buffered", remainA.userText === "only A");

// Mid-flight focus switch: buffered A must win over live B scope
buckets.buffer(scopeA, { userText: "midflight A", userMessageId: "m4" });
const midflight = resolveReplyExecutionScope(buckets, scopeB);
check(
  "crosschar_midflight_buffered_scope",
  midflight.executionScope?.characterId === "char-a" && midflight.taken.userText === "midflight A",
);

const scoped = freezeTurnExecutionScope({
  characterId: "char-a",
  sessionId: "sess-a",
  conversationSessionId: "conv-v2",
  branchId: "br-main",
  providerSnapshot: snapshotProviderConfig({ model: "test-model", kind: "OpenAI Compatible" }),
});
check(
  "scope_extended_fields",
  scoped.conversationSessionId === "conv-v2"
    && scoped.branchId === "br-main"
    && scoped.providerSnapshot?.model === "test-model",
);

// --- chat.js uses turn scope ---
const chat = read("src/panels/chat.js");
check("chat_imports_turn_scope", chat.includes("freezeTurnExecutionScope") && chat.includes("createPendingTurnBuckets"));
check("chat_resolve_reply_scope", chat.includes("resolveReplyExecutionScope"));
check("chat_write_fail_closed", chat.includes('reason: "missing_executionScope"'));
check("chat_frozen_group_speaker", chat.includes("groupSpeakerMetaFromScope") && !chat.includes("getLastGroupSpeakerMeta()"));
check("chat_runtime_scope_guard", chat.includes("runtimeTargetMatchesScope") && chat.includes("recordScopedCompanionMessage"));
check("chat_provider_snapshot", chat.includes("snapshotProviderConfig") && chat.includes("mergeProviderConfig"));
check("chat_no_global_pending_turns", !/let pendingUserTurns\s*=/.test(chat));
check("chat_stops_palace_chat_copy", !chat.includes('source: "chat.memory"'));

// --- assemble isolates unscoped palace ---
const assemble = read("src/prompt/assemble.js");
check("assemble_filters_companion_scope", assemble.includes("rowMatchesCompanionScope"));
check("assemble_clears_kg", assemble.includes("kgBlock = \"\"") || assemble.includes('kgBlock = ""'));
check("assemble_clears_wakeup", assemble.includes('wakeUpBlock = ""') || assemble.includes("wakeUpBlock = \"\""));

// --- CROSS-palace leak surfaces ---
const filterJs = read("src/memory/palace/filter.js");
const searchJs = read("src/memory/palace/search.js");
const wakeUpJs = read("src/memory/palace/wake-up.js");
const phoneData = read("src/phone-shell/phone-data.js");
const proactiveJs = read("src/proactive/pipeline.js");
const diaryRecords = read("src/diary/records.js");
const assistTools = read("src/studio-assist/tools.js");

check("filter_companion_scope", filterJs.includes("filterRowsByCompanionScope"));
check("search_skips_kg_when_scoped", searchJs.includes("!companionId && isRelationalQuery"));
check("wake_up_empty_block", wakeUpJs.includes('block: ""') || wakeUpJs.includes("block: ''"));
check("phone_memory_requires_companion", phoneData.includes("if (!cid) return []"));
check("phone_memory_scoped_filter", phoneData.includes("filterRowsByCompanionScope"));
check("proactive_memory_scoped_write", proactiveJs.includes("companionId: frozenCompanionId"));
check("diary_list_scoped", diaryRecords.includes("filterRowsByCompanionScope"));
check("assist_memory_search_scoped", assistTools.includes("rowMatchesCompanionScope"));
check("assist_memory_update_scope_guard", assistTools.includes("不属于当前角色范围"));

const palaceFixtures = [
  { id: "u1", source: "chat.memory", rawText: "unscoped A", searchable: true },
  { id: "s1", source: "chat.memory", companionId: "char-a", relationshipId: "rel:local:char-a", rawText: "scoped A", searchable: true },
  { id: "s2", source: "chat.memory", companionId: "char-b", relationshipId: "rel:local:char-b", rawText: "scoped B", searchable: true },
];
const isolation = verifyAssemblePalaceIsolation(palaceFixtures, "char-a");
check(
  "assemble_isolation_no_unscoped",
  isolation.ok && isolation.filteredCount === 1 && isolation.unscopedLeaks === 0,
  JSON.stringify(isolation),
);
const assembleFiltered = filterPalaceRowsForAssemble(palaceFixtures, "char-a");
check(
  "assemble_filter_fixture",
  assembleFiltered.length === 1 && assembleFiltered[0]?.id === "s1",
  JSON.stringify(assembleFiltered.map((r) => r.id)),
);

// --- palace census ---
// --- fake stream gated ---
const mobile = read("src/integrations/openclaw-mobile/OpenClawMobileRuntimeAdapter.js");
check("mobile_requires_stream_or_flag", mobile.includes("allowFakeStream") && mobile.includes("STREAM_FN_REQUIRED"));

const adapter = new OpenClawMobileRuntimeAdapter();
let threw = false;
try {
  // eslint-disable-next-line no-unused-vars
  for await (const _ of adapter.run({ runId: "p0-no-fake", instruction: "x", workspaceId: "p0" })) {
    /* drain */
  }
} catch (error) {
  threw = error?.code === "STREAM_FN_REQUIRED";
}
check("mobile_throws_without_streamFn", threw);

// --- experience apps archived ---
check(
  "archived_experience_apps",
  ARCHIVED_EXPERIENCE_APPS.includes("scroll")
    && ARCHIVED_EXPERIENCE_APPS.includes("adventure")
    && ARCHIVED_EXPERIENCE_APPS.includes("cocreate")
    && !ARCHIVED_EXPERIENCE_APPS.includes("scenario")
    && !ARCHIVED_EXPERIENCE_APPS.includes("theater"),
);
const phone = read("src/phone-shell/phone-shell.js");
check("openApp_blocks_archived", phone.includes('archivedIds.has') || phone.includes('new Set(["scroll"'));
check("openApp_allows_scenario", !phone.includes('new Set(["scroll", "adventure", "cocreate", "theater", "scenario"])'));
const qishi = read("src/qishi/qishi-app.js");
check(
  "market_coming_soon",
  qishi.includes("comingSoonTitle") && qishi.includes("renderComingSoon"),
);
const comingSoonFn = qishi.slice(
  qishi.indexOf("function renderComingSoon"),
  qishi.indexOf("function renderList"),
);
check(
  "coming_soon_hides_skill_shelf",
  comingSoonFn.includes("comingSoonTitle")
    && !comingSoonFn.includes("listInstalledMarketSkills")
    && !comingSoonFn.includes("sectionSkills"),
);
check(
  "market_blocks_archived",
  qishi.includes('new Set(["scroll", "adventure", "cocreate"])')
    && qishi.includes('p("toastArchived")'),
);
const { listFeaturedApps, listChartApps, getMarketApp } = await import("../src/qishi/market-catalog.js");
check(
  "featured_excludes_archived",
  listFeaturedApps("zh-CN").every((app) => !ARCHIVED_EXPERIENCE_APPS.includes(app.id))
    && listFeaturedApps("zh-CN").some((app) => app.id === "games"),
);
check(
  "charts_exclude_archived",
  listChartApps("zh-CN").every((app) => !ARCHIVED_EXPERIENCE_APPS.includes(app.id)),
);
check(
  "archived_market_apps_flagged",
  ARCHIVED_EXPERIENCE_APPS.every((id) => getMarketApp(id, "zh-CN")?.archived),
);

// --- diary honest failure (no template masquerade) ---
const diaryGen = read("src/diary/generate.js");
check("diary_no_template_fallback", !diaryGen.includes('source: "template"'));
check("diary_provider_required", diaryGen.includes("PROVIDER_REQUIRED"));

// --- palace census ---
const census = censusPalaceRows([
  { id: "1", source: "chat.memory", rawText: "unscoped" },
  { id: "2", source: "chat.memory", companionId: "c1", relationshipId: "rel:local:c1", rawText: "ok" },
]);
check("census_counts_unscoped", census.legacyUnscoped === 1 && census.scoped === 1);

// --- artifact + delivery spine (P1 start) ---
if (typeof localStorage === "undefined") {
  globalThis.localStorage = {
    _d: Object.create(null),
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
}
__resetArtifactsForTests();
__resetDeliveryForTests();
const art = upsertArtifact({
  companionId: "char-a",
  type: "diary",
  status: "ready",
  title: "今日",
  previewText: "hello",
});
check("artifact_upsert", art.ok && art.artifact?.deepLink?.includes(art.artifact.artifactId));
const parsed = parseDeepLink(art.artifact.deepLink);
check("deep_link_parse", parsed.ok && parsed.artifactId === art.artifact.artifactId);
const del = enqueueDelivery({
  artifactId: art.artifact.artifactId,
  channel: "phone_today",
});
const del2 = enqueueDelivery({
  artifactId: art.artifact.artifactId,
  channel: "phone_today",
});
check("delivery_idempotent", del.ok && del2.deduped === true);
check("delivery_mark", markDelivered(del.item.id).ok);

// --- P0 remaining surfaces (census UI + archive + daypack honesty) ---
const featureUi = read("src/companion/feature-control-ui.js");
check("palace_census_ui", featureUi.includes("data-palace-census-panel"));
check("experience_archive_ui", featureUi.includes("data-experience-archive-panel"));
const archiveMod = read("src/phone-shell/experience-archive.js");
check("experience_archive_export", archiveMod.includes("exportExperienceArchiveBundle") && archiveMod.includes("censusExperienceArchives"));
const daypack = read("src/sidewrite/daypack-access.js");
check("daypack_demo_label", daypack.includes("演示日数据") || daypack.includes("非真实共同经历"));
const lifeGen = read("src/life/generator.js");
check("daypack_seed_demo_flag", lifeGen.includes("demo: true") || lifeGen.includes("demo:true"));

const failed = cases.filter((c) => !c.pass);
console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
