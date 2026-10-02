/** Model tool -> diary executor -> ToolRun receipt regression. */
import assert from "node:assert/strict";
import { createCompanionChatExecutors } from "../src/tools/companion-executors.js";
import {
  formatReceiptMessage,
  runCompanionToolLoop,
} from "../src/tools/companion-tool-loop.js";

if (typeof localStorage === "undefined") {
  globalThis.localStorage = {
    _d: Object.create(null),
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
}
globalThis.window = globalThis;
globalThis.document = { dispatchEvent() { return true; } };

const toolCall = {
  id: "diary-tool-001",
  function: {
    name: "companion_diary__create",
    arguments: JSON.stringify({ companionId: "char-tool", diaryDay: "2026-08-19" }),
  },
};

const transitions = [];
let persistedDiary = null;
const executor = createCompanionChatExecutors({
  companionId: "char-tool",
  characterProfile: { id: "char-tool", name: "占位角色" },
  sessionId: "session-tool",
  collectProviderConfig: () => ({ baseUrl: "http://provider", apiKey: "test", model: "test" }),
  getExistingFn: async () => persistedDiary,
  generateFn: async () => ({
    ok: true,
    title: "测试日记",
    body: "这是一条执行测试，不是人物正文。",
    styleId: "literary",
  }),
  saveFn: async (payload) => {
    persistedDiary = { ...payload, id: "diary-tool-001" };
    return persistedDiary;
  },
});

const success = await runCompanionToolLoop({
  toolCalls: [toolCall],
  explicitOperations: ["companion.diary.create"],
  runtime: { foreground: true },
  provider: { supportsTools: true },
  executors: executor,
  putRun: async (record) => ({ ok: true, record }),
  transitionRun: async (id, status) => {
    transitions.push({ id, status });
    return { ok: true };
  },
});
assert.equal(success.receipts[0].status, "succeeded");
assert.deepEqual(transitions.map((row) => row.status), ["executing", "succeeded"]);
assert.match(success.feedback, /写好|日记|完成/);
assert.equal(success.receipts[0].data.artifactId, "diary:diary-tool-001");

const missingExecutorTransitions = [];
const missing = await runCompanionToolLoop({
  toolCalls: [toolCall],
  explicitOperations: ["companion.diary.create"],
  runtime: { foreground: true },
  provider: { supportsTools: true },
  putRun: async (record) => ({ ok: true, record }),
  transitionRun: async (id, status) => {
    missingExecutorTransitions.push({ id, status });
    return { ok: true };
  },
});
assert.equal(missing.receipts[0].status, "failed");
assert.match(missing.receipts[0].error, /no_executor/);
assert.deepEqual(missingExecutorTransitions.map((row) => row.status), ["executing", "failed"]);
assert.match(formatReceiptMessage(missing.receipts[0]), /没有完成/);

console.log("verify-diary-tool-execution: 10 PASS");
