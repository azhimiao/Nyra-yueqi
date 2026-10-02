#!/usr/bin/env node
/**
 * Regression checks for the phone Qiji Assistant boundary.
 * The phone shell supplies provider credentials asynchronously because the
 * API key may come from the secure store. The assistant must await that value
 * before choosing conversation or local-agent execution.
 */

import { createAssistChatStore } from "../src/studio-assist/chat-store.js";
import { clearAssistantTasksForTests } from "../src/studio-assist/agent/task-store.js";

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const provider = {
  kind: "OpenAI Compatible",
  baseUrl: "http://127.0.0.1:9/v1",
  apiKey: "test-key",
  model: "test-model",
};

clearAssistantTasksForTests();

// A valid async provider must reach the local-agent branch. Before the fix,
// the Promise itself was inspected and every task failed as PROVIDER_REQUIRED.
const agentStore = createAssistChatStore({
  context: "assist",
  locale: "zh-CN",
  collectProviderConfig: async () => provider,
  allowFakeStream: true,
  agentTestScenario: "happy",
});
const progressEvents = [];
const agentResult = await agentStore.send("检查角色卡并修复 personality", {
  onProgress: (event) => progressEvents.push(event),
});
check(agentResult.decision?.mode === "local-agent", "agent route should remain local-agent");
check(agentResult.ok === true, "async provider should not fail as missing provider");
check(
  agentResult.message?.cards?.[0]?.taskStatus === "WAITING_FOR_APPROVAL",
  `agent task should reach approval, got ${agentResult.message?.cards?.[0]?.taskStatus || "none"}`,
);
check(progressEvents.some((event) => event.type === "tool_started"), "agent progress should expose tool start");
check(progressEvents.some((event) => event.type === "tool_finished"), "agent progress should expose tool completion");

// Conversation uses the same async boundary. With no reachable gateway this
// should surface a real model/login/network error, never the misleading no-key
// branch caused by reading properties from a Promise.
const conversationStore = createAssistChatStore({
  context: "assist",
  locale: "zh-CN",
  collectProviderConfig: async () => provider,
});
const conversationResult = await conversationStore.send("你好");
check(
  !String(conversationResult.message?.content || "").includes("需要先连接一个模型"),
  "async provider must not be treated as missing in conversation mode",
);

if (failures.length) {
  console.error("Qiji assistant mobile chain checks failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Qiji assistant mobile chain checks passed (async provider + agent + conversation).");
}
