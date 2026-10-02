/**
 * Prove play packs survive refresh and envelopes load game system prompts.
 */
import assert from "node:assert/strict";
import { seedExplorePlayPacks } from "../src/skill-platform/play-seed.js";
import {
  getCatalogEntry,
  listSkillFiles,
  skillFilesMissing,
  __setSkillPlatformStorageForTests,
} from "../src/skill-platform/store.js";
import { createSkillRunRecord, __setSkillRunStorageForTests } from "../src/skill-platform/run-store.js";
import { createProductionConversationApi } from "../src/skill-platform/conversation-binding.js";
import { defaultScopesForMode } from "../src/skill-platform/scopes.js";
import { buildHostEnvelope } from "../src/skill-platform/runtime.js";
import { buildHostModelMessages } from "../src/skill-platform/host-model.js";
import { BUILTIN_CHARACTER_ID } from "../src/constants.js";

const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.localStorage = storage;
__setSkillPlatformStorageForTests(storage);
__setSkillRunStorageForTests(storage);

seedExplorePlayPacks({ force: true });
assert.equal(skillFilesMissing("midnight-train"), false);

// Simulate full page reload: new memory maps, same localStorage
__setSkillPlatformStorageForTests(storage);
assert.equal(skillFilesMissing("midnight-train"), false, "files must hydrate after reload");
assert.ok(listSkillFiles("midnight-train", "1.0.0").some((f) => f.path.includes("system")));

const run = createSkillRunRecord(
  {
    skillId: "midnight-train",
    agentId: "yueqi-agent",
    characterId: BUILTIN_CHARACTER_ID,
    mode: "isolated_new",
    scopes: defaultScopesForMode("isolated_new"),
    grantedCapabilities: [],
    title: "雨夜末班车",
  },
  { conversationApi: createProductionConversationApi() },
);
assert.equal(run.ok, true, run.reason);

const env = await buildHostEnvelope({ runId: run.value.id, userText: "开始" });
assert.equal(env.ok, true, env.reason);
assert.ok(String(env.value.resources.system || "").includes("末班车"), "system prompt must load");

const msgs = buildHostModelMessages(env.value, { history: [] });
assert.ok(msgs[0].content.includes("末班车"));
assert.ok(!msgs[0].content.includes("工作 Agent"), "must not drown play skill in work-agent boilerplate");

console.log("verify-play-kickoff: ok", {
  catalog: getCatalogEntry("midnight-train")?.name,
  systemChars: env.value.resources.system.length,
});
