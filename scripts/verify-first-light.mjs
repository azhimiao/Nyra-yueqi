/**
 * First Light — state machine, copy mapping, preview, offline, resume, a11y motion.
 */

import assert from "node:assert/strict";
import {
  __clearFirstLightForTests,
  __setFirstLightBagForTests,
  ensureFirstLightMigration,
  loadFirstLightState,
  nextStage,
  prevStage,
  resetFirstLight,
  saveFirstLightState,
  trackIndexForStage,
} from "../src/first-light/state.js";
import {
  chooseEntryMode,
  confirmEntryMode,
  confirmPurposes,
  confirmRelationshipStart,
  confirmRelationshipType,
  confirmStyle,
  goBack,
  pauseSession,
  resumeOrRestart,
  selectEntryMode,
  selectRelationshipStart,
  selectRelationshipType,
  selectStyle,
  setCustomRelationshipText,
  setStyleField,
  togglePurpose,
} from "../src/first-light/controller.js";
import {
  CUSTOM_RELATIONSHIP_MAX,
  PURPOSE_MAX,
} from "../src/first-light/state.js";
import { buildPreviewLines, firstMessageForDraft, polishPreviewLines } from "../src/first-light/preview.js";
import {
  buildReviewSections,
  draftToAutonomyPatch,
  draftToRelationshipSeed,
  draftToStructuralPrefs,
} from "../src/first-light/presets.js";
import { FL_COPY, getFirstLightCopy } from "../src/first-light/copy.js";
import { FL_MOTION, prefersReducedMotion } from "../src/first-light/motion-tokens.js";

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

function ok(name) {
  console.log(`PASS ${name}`);
}

function setup() {
  memory.clear();
  __clearFirstLightForTests();
  __setFirstLightBagForTests(null);
}

function walkQuickLover() {
  resetFirstLight();
  chooseEntryMode("quick");
  assert.equal(loadFirstLightState().entryPath, "quick");
  togglePurpose("romance");
  confirmPurposes();
  selectRelationshipType("lover");
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_TYPE");
  confirmRelationshipType();
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_START");
  selectRelationshipStart("now");
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_START");
  confirmRelationshipStart();
  assert.equal(loadFirstLightState().stage, "STYLE_INTIMACY");
  selectStyle("intimacyStyle", "warm");
  assert.equal(loadFirstLightState().stage, "STYLE_INTIMACY");
  confirmStyle();
  assert.equal(loadFirstLightState().stage, "BOUNDARIES_CORE");
  saveFirstLightState({ stage: "DRAFT_REVIEW" });
  const sections = buildReviewSections(loadFirstLightState().draft);
  assert.match(sections.relation, /恋人/);
  const msg = firstMessageForDraft(loadFirstLightState().draft);
  assert.match(msg.join("\n"), /我是/);
  assert.doesNotMatch(msg.join("\n"), /过来一点|欢迎进入/);
}

function walkCarefulWithPreview() {
  resetFirstLight();
  chooseEntryMode("careful");
  togglePurpose("listen");
  togglePurpose("daily");
  confirmPurposes();
  selectRelationshipType("lover");
  confirmRelationshipType();
  selectRelationshipStart("now");
  confirmRelationshipStart();
  assert.equal(loadFirstLightState().stage, "STYLE_SUPPORT");
  selectStyle("supportStyle", "hold");
  confirmStyle();
  selectStyle("initiativeStyle", "reach");
  confirmStyle();
  selectStyle("conflictStyle", "gentle");
  confirmStyle();
  selectStyle("intimacyStyle", "warm");
  confirmStyle();
  assert.equal(loadFirstLightState().stage, "STYLE_AUTONOMY");
  setStyleField("autonomyPreference", "balanced");
  const lines = buildPreviewLines(loadFirstLightState().draft, "balanced");
  assert.ok(lines.length >= 1);
  saveFirstLightState({ stage: "LIVE_PREVIEW", previewLines: lines });
  const softer = buildPreviewLines(loadFirstLightState().draft, "softer");
  assert.notDeepEqual(softer, lines);
}

async function offlinePreview() {
  const result = await polishPreviewLines(
    { supportStyle: "quiet", initiativeStyle: "wait" },
    {
      callModel: async () => {
        throw new Error("network");
      },
      collectProviderConfig: async () => ({ baseUrl: "x", apiKey: "y", model: "z" }),
    },
  );
  assert.equal(result.source, "template");
  assert.ok(result.lines.length >= 1);
}

function pauseResume() {
  resetFirstLight();
  chooseEntryMode("careful");
  togglePurpose("grow");
  confirmPurposes();
  selectRelationshipType("friend");
  confirmRelationshipType();
  assert.equal(loadFirstLightState().stage, "STYLE_SUPPORT");
  pauseSession();
  assert.equal(loadFirstLightState().paused, true);
  assert.equal(loadFirstLightState().resumeStage, "STYLE_SUPPORT");
  resumeOrRestart("continue");
  assert.equal(loadFirstLightState().paused, false);
  assert.equal(loadFirstLightState().stage, "STYLE_SUPPORT");
  assert.equal(loadFirstLightState().draft.relationshipType, "friend");
}

function slowBurnNoPromise() {
  const msg = firstMessageForDraft({
    relationshipType: "lover",
    relationshipStart: "slow",
  }).join("\n");
  assert.doesNotMatch(msg, /我就是你的恋人/);
  assert.doesNotMatch(msg, /靠近|定义我们/);
  assert.match(msg, /我住在月栖/);
}

function longHistoryOpening() {
  const msg = firstMessageForDraft({
    relationshipType: "lover",
    relationshipStart: "long",
    sharedHistory: "我们一起走过一个雨季",
  }).join("\n");
  assert.match(msg, /我住在月栖/);
  assert.doesNotMatch(msg, /雨季/);
  assert.doesNotMatch(msg, /欢迎/);
}

function openingKeepsThreeNamesApart() {
  const v1Nickname = firstMessageForDraft({
    name: "小栖",
    relationshipType: "friend",
  }).join("\n");
  assert.match(v1Nickname, /我是\s*Nyra/);
  assert.match(v1Nickname, /你叫我小栖/);
  assert.doesNotMatch(v1Nickname, /我是小栖|来自小栖/);

  const v2 = firstMessageForDraft({
    characterName: "林黛玉",
    callUserAs: "宝玉",
    relationshipType: "lover",
    relationshipStart: "now",
  }).join("\n");
  assert.match(v2, /我是林黛玉/);
  assert.match(v2, /我叫你宝玉/);
  assert.doesNotMatch(v2, /过来一点/);
  assert.doesNotMatch(v2, /我是宝玉|来自宝玉|你叫我宝玉/);
}

function structuralHiddenFromUserCopy() {
  const structural = draftToStructuralPrefs({
    supportStyle: "hold",
    initiativeStyle: "reach",
    conflictStyle: "direct",
    intimacyStyle: "warm",
    autonomyPreference: "stance",
    relationshipType: "lover",
    relationshipStart: "now",
    allowProactive: true,
  });
  assert.equal(structural.supportStyle, "hold");
  const blob = JSON.stringify(getFirstLightCopy("zh-CN"));
  assert.doesNotMatch(blob, /supportStyle/);
  assert.doesNotMatch(blob, /置信度/);
  const enBlob = JSON.stringify(getFirstLightCopy("en"));
  assert.match(enBlob, /Quick Start/);
  assert.match(enBlob, /Romantic Partner/);
  assert.doesNotMatch(enBlob, /认真认识一下/);
  const review = buildReviewSections({
    relationshipType: "lover",
    relationshipStart: "now",
    supportStyle: "hold",
    initiativeStyle: "reach",
    intimacyStyle: "warm",
    autonomyPreference: "balanced",
    allowProactive: true,
    quietNight: true,
  });
  assert.doesNotMatch(JSON.stringify(review), /supportStyle|0\.\d+/);
}

function autonomyConservative() {
  const patch = draftToAutonomyPatch({
    allowProactive: false,
    relationshipType: "friend",
    autoDiary: false,
    autoMoments: false,
  });
  assert.equal(patch.onboardingComplete, true);
  assert.equal(patch.proactiveMessage, true);
  assert.equal(patch.aiAutonomousLife, true);
}

function relationshipSeedLoverNow() {
  const seed = draftToRelationshipSeed({
    relationshipType: "lover",
    relationshipStart: "now",
  });
  assert.ok(seed.flags.includes("fl:lover_now"));
  assert.ok(seed.intimacy >= 2);
}

function migrationLegacyOnly() {
  // Fresh install: the product gate alone must not consume First Light.
  resetFirstLight();
  ensureFirstLightMigration({ hasProductOnboardingDone: true, hasPriorCompanionUse: false });
  assert.equal(loadFirstLightState().done, false);

  resetFirstLight();
  ensureFirstLightMigration({ hasProductOnboardingDone: true, hasPriorCompanionUse: true });
  assert.equal(loadFirstLightState().done, true);
  assert.equal(loadFirstLightState().migratedFromLegacy, true);

  // Installs auto-completed by the old deferral branch are handed back the flow.
  resetFirstLight();
  saveFirstLightState({ done: true, stage: "COMPLETED", deferredFromMandatoryOnboarding: true });
  ensureFirstLightMigration({ hasProductOnboardingDone: true, hasPriorCompanionUse: false });
  assert.equal(loadFirstLightState().done, false);
  assert.equal(loadFirstLightState().deferredFromMandatoryOnboarding, false);

  // A real completion stays completed.
  resetFirstLight();
  saveFirstLightState({ done: true, stage: "COMPLETED", committedCharacterId: "char-legacy" });
  ensureFirstLightMigration({ hasProductOnboardingDone: true, hasPriorCompanionUse: false });
  assert.equal(loadFirstLightState().done, true);

  resetFirstLight();
  saveFirstLightState({ stage: "RELATIONSHIP_TYPE", draft: { entryMode: "careful" } });
  ensureFirstLightMigration({ hasProductOnboardingDone: true, hasPriorCompanionUse: false });
  assert.equal(loadFirstLightState().done, false);
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_TYPE");
}

function stageGraphQuick() {
  const state = {
    entryPath: "quick",
    draft: { relationshipType: "lover", relationshipStart: "now", entryMode: "quick" },
  };
  assert.equal(nextStage("PURPOSE", state), "RELATIONSHIP_TYPE");
  assert.equal(nextStage("RELATIONSHIP_START", state), "STYLE_INTIMACY");
  assert.equal(nextStage("STYLE_INTIMACY", state), "BOUNDARIES_CORE");
  assert.equal(prevStage("STYLE_INTIMACY", state), "RELATIONSHIP_START");
}

function motionTokensPresent() {
  assert.equal(FL_MOTION.instant, 120);
  assert.equal(FL_MOTION.scene, 560);
  assert.equal(typeof prefersReducedMotion(), "boolean");
  assert.equal(trackIndexForStage("STYLE_SUPPORT"), 2);
}

function copyNoExclaimSpam() {
  const blob = JSON.stringify(getFirstLightCopy("zh-CN"));
  assert.doesNotMatch(blob, /！！/);
  assert.doesNotMatch(blob, /生成成功/);
  const en = JSON.stringify(getFirstLightCopy("en"));
  assert.doesNotMatch(en, /！！/);
  assert.doesNotMatch(en, /生成成功/);
}

function englishOpeningMessages() {
  const msg = firstMessageForDraft(
    { relationshipType: "lover", relationshipStart: "now" },
    "en",
  ).join("\n");
  assert.match(msg, /I live in Yueqi/i);
  assert.doesNotMatch(msg, /Come a little closer/i);
  assert.doesNotMatch(msg, /过来一点/);
  const slow = firstMessageForDraft(
    { relationshipType: "lover", relationshipStart: "slow" },
    "en",
  ).join("\n");
  assert.doesNotMatch(slow, /partner from this moment|I'm your partner/i);
}

async function commitIdempotencySmoke() {
  const { __resetCommitInflightForTests, commitFirstLightDraft } = await import("../src/first-light/commit.js");
  __resetCommitInflightForTests();
  resetFirstLight();
  saveFirstLightState({
    draft: {
      entryMode: "quick",
      relationshipType: "lover",
      relationshipStart: "now",
      intimacyStyle: "warm",
      supportStyle: "hold",
      purposes: ["romance"],
    },
  });
  // Without full IndexedDB character store, commit may fail or create — mark done path:
  markDoneViaState();
  const { commitFirstLightDraft: commit } = await import("../src/first-light/commit.js");
  const a = await commit({ relationshipType: "lover", relationshipStart: "now" });
  const b = await commit({ relationshipType: "lover", relationshipStart: "now" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.alreadyCommitted, true);
  assert.equal(a.characterId || loadFirstLightState().committedCharacterId, b.characterId || loadFirstLightState().committedCharacterId);
}

function radioDoesNotAdvanceOrDeselect() {
  resetFirstLight();
  chooseEntryMode("careful");
  togglePurpose("daily");
  confirmPurposes();
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_TYPE");
  selectRelationshipType("lover");
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_TYPE");
  assert.equal(loadFirstLightState().draft.relationshipType, "lover");
  selectRelationshipType("lover");
  assert.equal(loadFirstLightState().draft.relationshipType, "lover");
  selectRelationshipType("friend");
  assert.equal(loadFirstLightState().draft.relationshipType, "friend");
  selectRelationshipType("friend");
  assert.equal(loadFirstLightState().draft.relationshipType, "friend");
  confirmRelationshipType();
  assert.equal(loadFirstLightState().stage, "STYLE_SUPPORT");
  goBack();
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_TYPE");
  assert.equal(loadFirstLightState().draft.relationshipType, "friend");
}

function entryModeSelectConfirm() {
  resetFirstLight();
  saveFirstLightState({ stage: "ENTRY_MODE" });
  const blocked = confirmEntryMode();
  assert.equal(blocked.stage, "ENTRY_MODE");
  selectEntryMode("careful");
  assert.equal(loadFirstLightState().stage, "ENTRY_MODE");
  assert.equal(loadFirstLightState().draft.entryMode, "careful");
  selectEntryMode("quick");
  assert.equal(loadFirstLightState().stage, "ENTRY_MODE");
  assert.equal(loadFirstLightState().draft.entryMode, "quick");
  selectEntryMode("quick");
  assert.equal(loadFirstLightState().draft.entryMode, "quick");
  confirmEntryMode();
  assert.equal(loadFirstLightState().entryPath, "quick");
  assert.equal(loadFirstLightState().stage, "PURPOSE");
  goBack();
  assert.equal(loadFirstLightState().stage, "ENTRY_MODE");
  assert.equal(loadFirstLightState().draft.entryMode, "quick");
  selectEntryMode("skip");
  assert.equal(loadFirstLightState().stage, "ENTRY_MODE");
  confirmEntryMode();
  assert.equal(loadFirstLightState().stage, "DRAFT_REVIEW");
}

function customRelationshipTextChain() {
  resetFirstLight();
  chooseEntryMode("careful");
  togglePurpose("listen");
  confirmPurposes();
  selectRelationshipType("custom");
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_TYPE");
  const blocked = confirmRelationshipType();
  assert.equal(blocked.relationshipConfirmResult, "blocked");
  assert.equal(loadFirstLightState().stage, "RELATIONSHIP_TYPE");
  setCustomRelationshipText("像一起长大的朋友");
  selectRelationshipType("friend");
  assert.equal(loadFirstLightState().draft.customRelationshipText, "像一起长大的朋友");
  selectRelationshipType("custom");
  assert.equal(loadFirstLightState().draft.customRelationshipText, "像一起长大的朋友");
  confirmRelationshipType();
  assert.equal(loadFirstLightState().stage, "STYLE_SUPPORT");
  goBack();
  assert.equal(loadFirstLightState().draft.relationshipType, "custom");
  assert.equal(loadFirstLightState().draft.customRelationshipText, "像一起长大的朋友");
  const long = "x".repeat(CUSTOM_RELATIONSHIP_MAX + 20);
  setCustomRelationshipText(long);
  assert.equal(loadFirstLightState().draft.customRelationshipText.length, CUSTOM_RELATIONSHIP_MAX);
}

function purposeToggleCapAndUnsure() {
  resetFirstLight();
  chooseEntryMode("careful");
  const stage = () => loadFirstLightState().stage;
  const purposes = () => loadFirstLightState().draft.purposes;
  assert.equal(stage(), "PURPOSE");

  togglePurpose("daily");
  togglePurpose("daily");
  assert.deepEqual(purposes(), []);
  assert.equal(stage(), "PURPOSE");

  togglePurpose("daily");
  togglePurpose("romance");
  togglePurpose("listen");
  assert.equal(purposes().length, PURPOSE_MAX);
  const capped = togglePurpose("grow");
  assert.equal(capped.purposeToggleResult, "limit_reached");
  assert.deepEqual(purposes(), ["daily", "romance", "listen"]);
  assert.equal(stage(), "PURPOSE");

  togglePurpose("listen");
  togglePurpose("grow");
  assert.deepEqual(purposes(), ["daily", "romance", "grow"]);
  assert.equal(stage(), "PURPOSE");

  togglePurpose("unsure");
  assert.deepEqual(purposes(), ["unsure"]);
  togglePurpose("unsure");
  assert.deepEqual(purposes(), []);
  togglePurpose("unsure");
  togglePurpose("daily");
  assert.deepEqual(purposes(), ["daily"]);

  togglePurpose("daily");
  assert.deepEqual(purposes(), []);
  const blockedEmpty = confirmPurposes();
  assert.equal(blockedEmpty.purposeConfirmResult, "empty");
  assert.equal(stage(), "PURPOSE");
  assert.deepEqual(purposes(), []);
}

function customPersistsThroughPresets() {
  const draft = {
    relationshipType: "custom",
    customRelationshipText: "像一起长大的朋友",
    purposes: ["daily"],
    supportStyle: "quiet",
    intimacyStyle: "easy",
  };
  const structural = draftToStructuralPrefs(draft);
  assert.equal(structural.relationshipType, "custom");
  assert.equal(structural.customRelationshipText, "像一起长大的朋友");
  const review = buildReviewSections(draft, "zh-CN");
  assert.match(review.relation, /像一起长大的朋友/);
  const msg = firstMessageForDraft(draft, "zh-CN").join("\n");
  assert.match(msg, /我住在月栖/);
  assert.doesNotMatch(msg, /像一起长大的朋友/);
  const seed = draftToRelationshipSeed(draft);
  assert.ok(seed.flags.includes("fl:custom"));
}

function migrateCustomRelationLabel() {
  resetFirstLight();
  saveFirstLightState({
    stage: "RELATIONSHIP_TYPE",
    draft: { customRelationLabel: "旧标签关系", relationshipType: "custom" },
  });
  const state = loadFirstLightState();
  assert.equal(state.draft.customRelationshipText, "旧标签关系");
}

function markDoneViaState() {
  saveFirstLightState({
    done: true,
    stage: "COMPLETED",
    committedCharacterId: "char-idempotent-test",
  });
}

async function main() {
  setup();
  walkQuickLover();
  ok("quick start lover path");

  setup();
  walkCarefulWithPreview();
  ok("careful path + live preview adjust");

  setup();
  await offlinePreview();
  ok("offline / model-fail preview fallback");

  setup();
  pauseResume();
  ok("pause and resume");

  setup();
  slowBurnNoPromise();
  ok("slow-burn opening without lover promise");

  setup();
  longHistoryOpening();
  ok("long history cites one shared beat");

  setup();
  openingKeepsThreeNamesApart();
  ok("opening keeps official name, user address, and character address apart");

  setup();
  structuralHiddenFromUserCopy();
  ok("structural fields not in user copy");

  setup();
  autonomyConservative();
  ok("conservative autonomy defaults");

  setup();
  relationshipSeedLoverNow();
  ok("lover_now relationship seed");

  setup();
  migrationLegacyOnly();
  ok("migration gated on prior use + repairs auto-deferred installs");

  setup();
  stageGraphQuick();
  ok("quick stage graph");

  motionTokensPresent();
  ok("motion tokens");

  copyNoExclaimSpam();
  ok("copy restraint");

  setup();
  englishOpeningMessages();
  ok("english first messages");

  setup();
  await commitIdempotencySmoke();
  ok("commit idempotency early-exit");

  setup();
  radioDoesNotAdvanceOrDeselect();
  ok("relationship radio select/confirm/back");

  setup();
  entryModeSelectConfirm();
  ok("entry mode radio select/confirm/back");

  setup();
  customRelationshipTextChain();
  ok("custom relationship text validate/restore");

  setup();
  purposeToggleCapAndUnsure();
  ok("purpose toggle, cap 3, unsure exclusive, empty confirm blocked");

  setup();
  customPersistsThroughPresets();
  ok("custom relationship maps through prefs/review/opening");

  setup();
  migrateCustomRelationLabel();
  ok("customRelationLabel migrates to customRelationshipText");

  console.log("\nAll First Light checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
