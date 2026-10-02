#!/usr/bin/env node
/**
 * First Light V2 state machine — explicitness, path length, pause/resume/restart.
 * Does not touch v1 onboarding (`yueqi.firstLight.v1`).
 */

import assert from "node:assert/strict";
import {
  canAdvance,
  createDefaultStateV2,
  createEmptyDraftV2,
  draftToCharacterInput,
  draftToPreferenceInput,
  genderAssumption,
  getField,
  isSensitiveEnabled,
  isUnset,
  stagesForPath,
  transition,
} from "../src/first-light/state-v2.js";
import {
  FIRST_LIGHT_V1_KEY,
  FIRST_LIGHT_V2_KEY,
  createFirstLightControllerV2,
} from "../src/first-light/controller-v2.js";

const AT = "2026-08-18T03:00:00.000Z";
const GENDER_GUESSES = ["male", "female", "man", "woman", "男", "女"];

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function ev(state, type, extra = {}) {
  return transition(state, { type, at: AT, ...extra });
}

function fillIdentity(state) {
  let next = ev(state, "SET_FIELD", { field: "characterName", value: "月栖" });
  next = ev(next, "SKIP_FIELD", { field: "characterGender" });
  return next;
}

function fillAddress(state) {
  return ev(state, "SET_FIELD", { field: "callUserAs", value: "阿栖" });
}

function fillRelationship(state) {
  return ev(state, "SET_FIELD", { field: "relationshipType", value: "friend" });
}

function fillPurposes(state) {
  return ev(state, "SET_FIELD", { field: "purposes", value: ["daily"] });
}

function fillSupport(state) {
  let next = ev(state, "SET_FIELD", { field: "supportStyle", value: "hold" });
  next = ev(next, "SET_FIELD", { field: "initiativeStyle", value: "occasional" });
  return next;
}

function fillBoundaries(state) {
  let next = ev(state, "SET_FIELD", { field: "allowProactive", value: false });
  next = ev(next, "SET_FIELD", { field: "quietHours", value: { start: "22:00", end: "08:00" } });
  next = ev(next, "SET_FIELD", { field: "hardBoundaries", value: ["no-jealousy-blackmail"] });
  return next;
}

function fillCurrent(state) {
  switch (state.stage) {
    case "IDENTITY":
      return fillIdentity(state);
    case "USER_ADDRESS":
      return fillAddress(state);
    case "RELATIONSHIP":
      return fillRelationship(state);
    case "PURPOSES":
      return fillPurposes(state);
    case "SUPPORT_INITIATIVE":
      return fillSupport(state);
    case "CAREFUL_STYLES":
      return state;
    case "BOUNDARIES":
      return fillBoundaries(state);
    case "IMPORT_REVIEW":
      return ev(state, "SET_FIELD", { field: "importedCharacterId", value: "chr_import_1" });
    default:
      return state;
  }
}

function walkTo(path, target, { start } = {}) {
  let state = start || createDefaultStateV2();
  const seen = [];
  state = ev(state, "NEXT");
  state = ev(state, "NEXT");
  state = ev(state, "SELECT_PATH", { path });
  let guard = 0;
  while (state.stage !== target && guard < 40) {
    seen.push(state.stage);
    if (state.stage === "PATH_SELECT" || state.stage === "BOOT" || state.stage === "WELCOME" || state.stage === "PREVIEW") {
      const before = state.stage;
      state = ev(state, "NEXT");
      if (state.stage === before) {
        throw new Error(`stuck at ${before} walking ${path} → ${target}`);
      }
      guard += 1;
      continue;
    }
    state = fillCurrent(state);
    const before = state.stage;
    if (!canAdvance(state)) {
      throw new Error(`cannot advance from ${before} on ${path}: ${JSON.stringify({
        gender: getField(state, "characterGender"),
        name: getField(state, "characterName"),
        imported: state.draft.importedCharacterId,
      })}`);
    }
    state = ev(state, "NEXT");
    if (state.stage === before) {
      throw new Error(`NEXT no-op at ${before} walking ${path} → ${target}`);
    }
    guard += 1;
  }
  if (state.stage !== target) {
    throw new Error(`did not reach ${target} on ${path}, last=${state.stage} seen=${seen.join(">")}`);
  }
  return { state, seen };
}

test("1. quick path has fewer stages than careful", () => {
  const quick = stagesForPath("quick");
  const careful = stagesForPath("careful");
  assert.ok(quick.length < careful.length, `quick=${quick.length} careful=${careful.length}`);
  assert.ok(!quick.includes("CAREFUL_STYLES"));
  assert.ok(careful.includes("CAREFUL_STYLES"));
  assert.ok(!quick.includes("IMPORT_REVIEW"));
  assert.ok(stagesForPath("import").includes("IMPORT_REVIEW"));

  const quickWalk = walkTo("quick", "PREVIEW");
  const carefulWalk = walkTo("careful", "PREVIEW");
  const quickVisited = new Set(quickWalk.seen.filter((s) => !["BOOT", "WELCOME", "PATH_SELECT"].includes(s)));
  const carefulVisited = new Set(carefulWalk.seen.filter((s) => !["BOOT", "WELCOME", "PATH_SELECT"].includes(s)));
  assert.ok(quickVisited.size < carefulVisited.size);
  assert.ok(!quickVisited.has("CAREFUL_STYLES"));
  assert.ok(carefulVisited.has("CAREFUL_STYLES"));
});

test("2. skip gender → skipped, not enabled, not assumed male/female", () => {
  let state = createDefaultStateV2();
  state = ev(state, "NEXT");
  state = ev(state, "NEXT");
  state = ev(state, "SELECT_PATH", { path: "quick" });
  state = ev(state, "NEXT");
  assert.equal(state.stage, "IDENTITY");
  assert.equal(isUnset(getField(state, "characterGender")), true);

  state = ev(state, "SET_FIELD", { field: "characterName", value: "月栖" });
  state = ev(state, "SKIP_FIELD", { field: "characterGender" });
  const gender = getField(state, "characterGender");
  assert.equal(gender.source, "skipped");
  assert.equal(isSensitiveEnabled(gender), false);
  const value = gender.value;
  assert.equal(GENDER_GUESSES.includes(value), false);
  assert.equal(GENDER_GUESSES.includes(String(value || "").toLowerCase()), false);
  assert.equal(genderAssumption(gender), null);
  assert.ok(canAdvance(state));
});

test("3. quick does not ask intimacy → flirtLevel default off", () => {
  const { state } = walkTo("quick", "BOUNDARIES");
  const flirt = getField(state, "flirtLevel");
  assert.equal(flirt.source, "default");
  assert.equal(flirt.value, "off");
  assert.equal(isSensitiveEnabled(flirt), false);
  assert.equal(getField(state, "allowJealousy").source, "default");
  assert.equal(getField(state, "allowJealousy").value, false);
  assert.equal(getField(state, "nudgePolicy").source, "default");
  assert.equal(getField(state, "nudgePolicy").value, "off");
  assert.equal(getField(state, "autoDiary").source, "default");
  assert.equal(isSensitiveEnabled(getField(state, "allowProactive")), false);
});

test("4. import cannot NEXT out of IMPORT_REVIEW without importedCharacterId", () => {
  let state = createDefaultStateV2();
  state = ev(state, "NEXT");
  state = ev(state, "NEXT");
  state = ev(state, "SELECT_PATH", { path: "import" });
  state = ev(state, "NEXT");
  assert.equal(state.stage, "IMPORT_REVIEW");
  assert.equal(state.draft.importedCharacterId, "");
  assert.equal(canAdvance(state), false);
  const blocked = ev(state, "NEXT");
  assert.equal(blocked.stage, "IMPORT_REVIEW");

  const withId = ev(state, "SET_FIELD", { field: "importedCharacterId", value: "chr_import_1" });
  assert.equal(canAdvance(withId), true);
  assert.equal(ev(withId, "NEXT").stage, "USER_ADDRESS");
});

test("4b. required user address cannot be explicitly empty", () => {
  let state = createDefaultStateV2();
  state = ev(state, "NEXT");
  state = ev(state, "NEXT");
  state = ev(state, "SELECT_PATH", { path: "quick" });
  state = ev(state, "NEXT");
  state = fillIdentity(state);
  state = ev(state, "NEXT");
  assert.equal(state.stage, "USER_ADDRESS");
  state = ev(state, "SET_FIELD", { field: "callUserAs", value: "" });
  assert.equal(canAdvance(state), false);
  state = ev(state, "SET_FIELD", { field: "callUserAs", value: "你" });
  assert.equal(canAdvance(state), true);
});

test("5. import does not write character gender into user preference", () => {
  let state = createDefaultStateV2();
  state = ev(state, "NEXT");
  state = ev(state, "NEXT");
  state = ev(state, "SELECT_PATH", { path: "import" });
  state = ev(state, "NEXT");
  state = ev(state, "SET_FIELD", { field: "importedCharacterId", value: "chr_card" });
  state = ev(state, "SET_FIELD", {
    field: "characterGender",
    value: "female",
    source: "import_review",
  });
  state = ev(state, "SET_FIELD", {
    field: "characterName",
    value: "Imported",
    source: "import_review",
  });

  const character = draftToCharacterInput(state.draft);
  assert.equal(character.selfIdentity.genderIdentity.source, "import_review");
  assert.equal(character.selfIdentity.genderIdentity.value, "female");

  const preference = draftToPreferenceInput(state.draft);
  assert.equal(Object.prototype.hasOwnProperty.call(preference.userIdentity, "genderIdentity"), false);
  assert.equal(preference.userIdentity.pronouns.source, "default");
  assert.deepEqual(preference.userIdentity.pronouns.value, []);
  const dumped = JSON.stringify(preference);
  assert.equal(dumped.includes("female"), false);
  assert.equal(dumped.includes("Imported"), false);
});

test("6. pause/resume keeps answers", () => {
  const { state: atBoundaries } = walkTo("quick", "BOUNDARIES");
  let state = fillBoundaries(atBoundaries);
  const proactive = getField(state, "allowProactive");
  assert.equal(proactive.source, "explicit");
  assert.equal(proactive.value, false);

  const paused = ev(state, "PAUSE");
  assert.equal(paused.stage, "PAUSED");
  assert.equal(paused.paused, true);
  assert.equal(getField(paused, "allowProactive").source, "explicit");
  assert.equal(getField(paused, "characterName").value, "月栖");

  const resumed = ev(paused, "RESUME");
  assert.equal(resumed.stage, "BOUNDARIES");
  assert.equal(resumed.paused, false);
  assert.deepEqual(getField(resumed, "allowProactive"), getField(state, "allowProactive"));
  assert.equal(getField(resumed, "flirtLevel").source, "default");

  const mem = new Map();
  const storage = {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, String(value)),
    removeItem: (key) => mem.delete(key),
  };
  const ctl = createFirstLightControllerV2({ storage });
  ctl.save(state);
  ctl.dispatch({ type: "PAUSE", at: AT });
  const reloaded = createFirstLightControllerV2({ storage });
  const loaded = reloaded.load();
  assert.equal(loaded.stage, "PAUSED");
  const live = reloaded.dispatch({ type: "RESUME", at: AT });
  assert.equal(live.stage, "BOUNDARIES");
  assert.equal(getField(live, "characterName").value, "月栖");
  assert.equal(mem.has(FIRST_LIGHT_V1_KEY), false);
  assert.equal(mem.has(FIRST_LIGHT_V2_KEY), true);
});

test("7. restart clears explicit answers", () => {
  const { state: atBoundaries } = walkTo("quick", "BOUNDARIES");
  let state = fillBoundaries(atBoundaries);
  assert.equal(getField(state, "characterName").source, "explicit");
  assert.equal(getField(state, "allowProactive").source, "explicit");

  const restarted = ev(state, "RESTART");
  assert.equal(getField(restarted, "characterName").source, "default");
  assert.equal(getField(restarted, "characterName").value, "");
  assert.equal(getField(restarted, "allowProactive").source, "default");
  assert.equal(getField(restarted, "characterGender").source, "default");
  assert.equal(restarted.draft.importedCharacterId, "");
  assert.ok(["BOOT", "WELCOME", "PATH_SELECT"].includes(restarted.stage));

  const keepPath = ev(state, "RESTART", { keepPath: true });
  assert.equal(keepPath.path, "quick");
  assert.equal(getField(keepPath, "characterName").source, "default");
  assert.equal(getField(keepPath, "flirtLevel").source, "default");
  assert.equal(getField(keepPath, "flirtLevel").value, "off");
});

test("8. BACK from BOUNDARIES keeps explicit boundary answers", () => {
  const { state: atBoundaries } = walkTo("quick", "BOUNDARIES");
  let state = fillBoundaries(atBoundaries);
  assert.equal(state.stage, "BOUNDARIES");
  assert.equal(getField(state, "allowProactive").source, "explicit");
  assert.deepEqual(getField(state, "hardBoundaries").value, ["no-jealousy-blackmail"]);

  const back = ev(state, "BACK");
  assert.equal(back.stage, "SUPPORT_INITIATIVE");
  assert.equal(getField(back, "allowProactive").source, "explicit");
  assert.equal(getField(back, "allowProactive").value, false);
  assert.equal(getField(back, "hardBoundaries").source, "explicit");
  assert.equal(getField(back, "characterName").value, "月栖");
});

test("9. FAIL enters ERROR; RESUME or BACK recover", () => {
  const { state: atBoundaries } = walkTo("quick", "BOUNDARIES");
  let state = fillBoundaries(atBoundaries);
  const failed = ev(state, "FAIL", { message: "preview_model_failed" });
  assert.equal(failed.stage, "ERROR");
  assert.equal(failed.errorMessage, "preview_model_failed");
  assert.equal(getField(failed, "characterName").value, "月栖");

  const resumed = ev(failed, "RESUME");
  assert.equal(resumed.stage, "BOUNDARIES");
  assert.equal(resumed.errorMessage, "");
  assert.equal(getField(resumed, "allowProactive").source, "explicit");

  const back = ev(failed, "BACK");
  assert.equal(back.stage, "SUPPORT_INITIATIVE");
  assert.equal(getField(back, "allowProactive").source, "explicit");
});

test("10. SET_FIELD on a default field becomes explicit", () => {
  const { state } = walkTo("quick", "BOUNDARIES");
  const before = getField(state, "flirtLevel");
  assert.equal(before.source, "default");
  assert.equal(before.value, "off");
  assert.equal(isSensitiveEnabled(before), false);

  const after = ev(state, "SET_FIELD", { field: "flirtLevel", value: "light" });
  const flirt = getField(after, "flirtLevel");
  assert.equal(flirt.source, "explicit");
  assert.equal(flirt.value, "light");
  assert.equal(isSensitiveEnabled(flirt), true);
  assert.equal(getField(after, "nudgePolicy").source, "default");
});

test("empty draft distinguishes required / skipped / unset", () => {
  const draft = createEmptyDraftV2();
  assert.equal(getField(draft, "characterGender").source, "default");
  assert.equal(isUnset(getField(draft, "characterGender")), true);
  assert.equal(isSensitiveEnabled(getField(draft, "characterGender")), false);
  assert.equal(getField(draft, "allowProactive").source, "default");
});

test("v2 controller never writes the v1 key", () => {
  const mem = new Map();
  mem.set(FIRST_LIGHT_V1_KEY, JSON.stringify({ keep: true, stage: "WELCOME" }));
  const storage = {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, String(value)),
    removeItem: (key) => mem.delete(key),
  };
  const ctl = createFirstLightControllerV2({ storage });
  ctl.dispatch({ type: "SELECT_PATH", path: "quick", at: AT });
  assert.equal(JSON.parse(mem.get(FIRST_LIGHT_V1_KEY)).keep, true);
  assert.ok(mem.get(FIRST_LIGHT_V2_KEY));
  assert.notEqual(FIRST_LIGHT_V2_KEY, FIRST_LIGHT_V1_KEY);
});

console.log(`\nverify-first-light-v2-state PASSED (${passed} tests)`);
