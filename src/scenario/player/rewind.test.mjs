import assert from "node:assert/strict";
import {
  __setConversationStorageForTests,
  appendAssistantTurn,
  getOrCreateActiveSession,
  getSession,
  selectVisibleHistory,
  sendUser,
} from "../../conversation/index.js";
import { planScenarioRewind, rewindScenarioConversation } from "./rewind.js";

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

assert.deepEqual(planScenarioRewind([]), { kind: "leave", count: 0 });
assert.deepEqual(planScenarioRewind([{ role: "assistant" }]), { kind: "leave", count: 0 });
assert.deepEqual(
  planScenarioRewind([{ role: "user" }, { role: "assistant" }]),
  { kind: "drop-turn", count: 2 },
);
assert.deepEqual(
  planScenarioRewind([{ role: "assistant" }, { role: "user" }]),
  { kind: "drop-one", count: 1 },
);

__setConversationStorageForTests(memoryStorage());
const session = getOrCreateActiveSession({ characterId: "char-rewind-test" });
const sid = session.id;
appendAssistantTurn(sid, "开场：雨还在下。");
sendUser(sid, "我把伞递过去");
appendAssistantTurn(sid, "她接过伞，指尖凉了一下。");

function history() {
  return selectVisibleHistory(getSession(sid));
}

const before = history();
assert.equal(before.length, 3);
const result = rewindScenarioConversation(sid);
assert.equal(result.ok, true, result.reason);
assert.equal(result.leave, false);
assert.equal(result.dropped, 2);
const after = history();
assert.equal(after.length, 1);
assert.match(after[0].text, /开场/);

const leave = rewindScenarioConversation(sid);
assert.equal(leave.leave, true);

console.log("scenario-rewind: ok");
