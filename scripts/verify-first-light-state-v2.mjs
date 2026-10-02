#!/usr/bin/env node
/**
 * First Light V2 state machine — explicitness, paths, pause/resume/back/restart.
 * Does not mount UI or commit.
 */

import assert from "node:assert/strict";
import {
  canAdvance,
  createEmptyDraftV2,
  createDefaultFirstLightStateV2,
  fieldPresence,
  getField,
  isSensitiveEnabled,
  reduceFirstLightV2,
} from "../src/first-light/state-v2.js";

let passCount = 0;
function pass(name, fn) {
  fn();
  passCount += 1;
  console.log(`PASS ${name}`);
}

function reduce(state, event) {
  return reduceFirstLightV2(state, event);
}

function fillRequired(state, extra = {}) {
  const answers = {
    characterName: extra.characterName ?? "月栖",
    genderIdentity: extra.genderIdentity ?? "she",
    pronouns: extra.pronouns ?? ["she", "her"],
    callUserAs: extra.callUserAs ?? "你",
    relationshipType: extra.relationshipType ?? "friend",
    purposes: extra.purposes ?? ["daily"],
    allowProactive: extra.allowProactive ?? false,
    hardBoundaries: extra.hardBoundaries ?? ["no_blackmail"],
    quietHours: extra.quietHours ?? { start: "22:00", end: "08:00" },
    supportStyle: extra.supportStyle ?? "hold",
    initiativeStyle: extra.initiativeStyle ?? "occasional",
  };
  let next = state;
  for (const [field, value] of Object.entries(answers)) {
    if (extra.omit && extra.omit.includes(field)) continue;
    if (next.path === "import" && ["characterName", "genderIdentity", "pronouns"].includes(field)) {
      continue;
    }
    next = reduce(next, { type: "set_field", field, value, source: "explicit" });
  }
  return next;
}

function advanceTo(state, stage) {
  let next = state;
  let guard = 0;
  while (next.stage !== stage && guard < 20) {
    const before = next.stage;
    next = reduce(next, { type: "next" });
    if (next.stage === before) {
      throw new Error(`stuck at ${before} while advancing to ${stage}`);
    }
    guard += 1;
  }
  assert.equal(next.stage, stage);
  return next;
}

pass("createEmptyDraftV2 leaves required and skippable unset", () => {
  const draft = createEmptyDraftV2();
  assert.equal(fieldPresence(draft, "characterName"), "unset");
  assert.equal(fieldPresence(draft, "hardBoundaries"), "unset");
  assert.equal(fieldPresence(draft, "flirtLevel"), "unset");
  assert.equal(getField(draft, "flirtLevel")?.source || "default", "default");
});

pass("1. quick unanswered flirt is default, not explicit; sensitive stays off", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "quick" });
  assert.equal(state.path, "quick");
  assert.equal(state.draft.flirtLevel?.value, "off");
  assert.equal(state.draft.flirtLevel?.source, "default");
  assert.notEqual(state.draft.flirtLevel?.source, "explicit");
  assert.equal(isSensitiveEnabled(state.draft, "flirtLevel"), false);
  assert.equal(isSensitiveEnabled(state.draft, "jealousy"), false);
  assert.equal(isSensitiveEnabled(state.draft, "autoDiary"), false);

  state = fillRequired(state);
  state = advanceTo(state, "REVIEW");
  assert.equal(state.draft.flirtLevel.source, "default");
  assert.equal(isSensitiveEnabled(state.draft, "flirtLevel"), false);
});

pass("quick default light-looking value still is not consent", () => {
  const draft = {
    ...createEmptyDraftV2(),
    flirtLevel: { value: "open", source: "default" },
  };
  assert.equal(isSensitiveEnabled(draft, "flirtLevel"), false);
});

pass("2. skip hard-boundary confirmation is not explicit consent", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "careful" });
  state = reduce(state, { type: "skip_field", field: "hardBoundaries" });
  assert.equal(fieldPresence(state.draft, "hardBoundaries"), "skipped");
  assert.equal(state.draft.hardBoundaries.source, "skipped");
  assert.notEqual(state.draft.hardBoundaries.source, "explicit");
  assert.equal(isSensitiveEnabled(state.draft, "hardBoundaries"), false);

  state = fillRequired(state, { omit: ["hardBoundaries"] });
  state = reduce(state, { type: "skip_field", field: "hardBoundaries" });
  state = advanceTo(state, "BOUNDARIES");
  assert.equal(canAdvance(state), false);
});

pass("required / unset / skipped are distinct", () => {
  const empty = createEmptyDraftV2();
  assert.equal(fieldPresence(empty, "characterName"), "unset");
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "careful" });
  state = reduce(state, { type: "skip_field", field: "characterName" });
  assert.equal(fieldPresence(state.draft, "characterName"), "skipped");
  state = reduce(state, { type: "set_field", field: "characterName", value: "月栖", source: "explicit" });
  assert.equal(fieldPresence(state.draft, "characterName"), "set");
  assert.equal(state.draft.characterName.source, "explicit");
});

pass("3. careful pause/resume keeps filled fields", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "careful" });
  state = reduce(state, { type: "next" });
  state = reduce(state, { type: "set_field", field: "characterName", value: "认真名" });
  state = reduce(state, { type: "set_field", field: "genderIdentity", value: "they" });
  state = reduce(state, { type: "set_field", field: "callUserAs", value: "搭档" });
  state = reduce(state, { type: "set_field", field: "values", value: ["温柔"], source: "explicit" });
  assert.equal(state.stage, "IDENTITY");
  state = reduce(state, { type: "pause" });
  assert.equal(state.stage, "PAUSED");
  assert.equal(state.paused, true);
  state = reduce(state, { type: "resume" });
  assert.equal(state.stage, "IDENTITY");
  assert.equal(state.paused, false);
  assert.equal(state.draft.characterName.value, "认真名");
  assert.equal(state.draft.genderIdentity.value, "they");
  assert.equal(state.draft.callUserAs.value, "搭档");
  assert.deepEqual(state.draft.values.value, ["温柔"]);
});

pass("4. back does not drop filled answers", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "careful" });
  state = reduce(state, { type: "next" });
  state = reduce(state, { type: "set_field", field: "characterName", value: "回退名" });
  state = reduce(state, { type: "set_field", field: "genderIdentity", value: "she" });
  state = reduce(state, { type: "next" });
  assert.equal(state.stage, "CALL_USER");
  state = reduce(state, { type: "set_field", field: "callUserAs", value: "你" });
  state = reduce(state, { type: "back" });
  assert.equal(state.stage, "IDENTITY");
  assert.equal(state.draft.characterName.value, "回退名");
  assert.equal(state.draft.callUserAs.value, "你");
});

pass("5. restart clears answers but can keep path", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "careful" });
  state = fillRequired(state);
  state = reduce(state, { type: "set_field", field: "sharedHistory", value: "曾经同路", source: "explicit" });
  state = reduce(state, { type: "restart" });
  assert.equal(state.path, "careful");
  assert.equal(fieldPresence(state.draft, "characterName"), "unset");
  assert.equal(fieldPresence(state.draft, "callUserAs"), "unset");
  assert.equal(fieldPresence(state.draft, "sharedHistory"), "unset");
  assert.equal(state.draft.characterName, undefined);
});

pass("6. import records importedCharacterId; identity set_field defaults to import_review", () => {
  let state = reduce(createDefaultFirstLightStateV2(), {
    type: "select_path",
    path: "import",
    importedCharacterId: "chr_imported_card",
    identity: {
      characterName: "卡上的名",
      genderIdentity: "she",
      pronouns: ["she"],
    },
  });
  assert.equal(state.path, "import");
  assert.equal(state.importedCharacterId, "chr_imported_card");
  assert.equal(state.draft.characterName.source, "import_review");
  assert.equal(state.draft.characterName.value, "卡上的名");

  state = reduce(state, { type: "set_field", field: "characterName", value: "卡上的名" });
  assert.equal(state.draft.characterName.source, "import_review");

  const overwritten = reduce(state, { type: "set_field", field: "characterName", value: "不该覆盖" });
  assert.equal(overwritten.draft.characterName.value, "卡上的名");
  assert.equal(overwritten.draft.characterName.source, "import_review");

  state = reduce(state, {
    type: "set_field",
    field: "characterName",
    value: "卡上的名",
    source: "explicit",
  });
  assert.equal(state.draft.characterName.source, "explicit");
  assert.equal(state.draft.characterName.value, "卡上的名");
});

pass("7. illegal COMPLETED identity mutation is no-op", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "quick" });
  state = fillRequired(state);
  state = advanceTo(state, "COMPLETED");
  assert.equal(state.done, true);
  const before = structuredClone(state.draft.characterName);
  state = reduce(state, { type: "set_field", field: "characterName", value: "篡改身份", source: "explicit" });
  assert.deepEqual(state.draft.characterName, before);
  assert.equal(state.stage, "COMPLETED");
});

pass("8. required fields incomplete → canAdvance false", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "quick" });
  assert.equal(canAdvance(state), true);
  state = reduce(state, { type: "next" });
  assert.equal(state.stage, "IDENTITY");
  assert.equal(canAdvance(state), false);
  state = reduce(state, { type: "set_field", field: "characterName", value: "半成品" });
  assert.equal(canAdvance(state), false);
  state = fillRequired(state);
  assert.equal(canAdvance(state), true);
});

pass("error then resume restores draft", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "careful" });
  state = reduce(state, { type: "next" });
  state = reduce(state, { type: "set_field", field: "characterName", value: "出错前" });
  state = reduce(state, { type: "error", message: "write_failed" });
  assert.equal(state.stage, "ERROR");
  assert.equal(canAdvance(state), false);
  state = reduce(state, { type: "resume" });
  assert.equal(state.stage, "IDENTITY");
  assert.equal(state.draft.characterName.value, "出错前");
});

pass("unset_named / undefined relationship / unsure purposes satisfy required", () => {
  let state = reduce(createDefaultFirstLightStateV2(), { type: "select_path", path: "quick" });
  state = fillRequired(state, {
    characterName: "unset_named",
    genderIdentity: "unset",
    relationshipType: "undefined",
    purposes: ["unsure"],
  });
  state = reduce(state, { type: "next" });
  assert.equal(canAdvance(state), true);
});

console.log(`\n${passCount} checks passed`);
