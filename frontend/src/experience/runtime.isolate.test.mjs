import assert from "node:assert/strict";
import {
  __setConversationStorageForTests,
  __reloadConversationBagFromStorage,
  appendAssistantCandidate,
  getOrCreateActiveSession,
  getActiveSessionForCharacter,
  getSession,
  selectVisibleHistory,
} from "../conversation/index.js";
import { __setSessionMapStorageForTests } from "../context/session-map.js";
import {
  __setExperienceStorageForTests,
  __clearExperienceRegistryForTests,
  registerPackage,
  createNightRainStationPackage,
  NIGHT_RAIN_PACKAGE_ID,
  enterExperience,
} from "./index.js";
import { isIsolatedScenarioSession, isScenarioHistoryRow } from "./conversation-bind.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

__setConversationStorageForTests(memoryStorage());
__reloadConversationBagFromStorage();
__setSessionMapStorageForTests(memoryStorage());
__setExperienceStorageForTests(memoryStorage());
__clearExperienceRegistryForTests();

const pkg = createNightRainStationPackage();
assert.equal(pkg.compatibleCharacterRules.requireSameCharacter, false);
registerPackage(pkg);

const dm = getOrCreateActiveSession({ characterId: "char-companion" });
appendAssistantCandidate(dm.id, "我是。我住在月栖。\n我叫你宝贝。", {
  source: "opening_intro",
});

const entered = enterExperience({
  packageId: NIGHT_RAIN_PACKAGE_ID,
  openingId: "opening-first-meeting",
  characterId: "char-companion",
});
assert.equal(entered.ok, true, entered.reason);
assert.ok(entered.conversationSessionId);
assert.notEqual(entered.conversationSessionId, dm.id);

const scenario = getSession(entered.conversationSessionId);
assert.ok(isIsolatedScenarioSession(scenario));
assert.equal(getActiveSessionForCharacter("char-companion")?.id, dm.id);

const dmText = selectVisibleHistory(getSession(dm.id)).map((row) => row.text).join("\n");
assert.match(dmText, /我住在月栖/);

const scenarioRows = selectVisibleHistory(scenario);
assert.ok(scenarioRows.every(isScenarioHistoryRow));
assert.ok(scenarioRows.some((row) => /车还要多久/.test(row.text || "")));
assert.ok(!scenarioRows.some((row) => /我住在月栖|我叫你宝贝/.test(row.text || "")));

console.log("experience-runtime-isolate: ok");
