/**
 * P0 — Cross-character turn race (module-level + static wiring probes).
 *
 * Acceptance: send as A, switch to B mid-flight → reply/memory still owned by A.
 * This harness verifies TurnExecutionScope buckets + chat.js freeze wiring without a live model.
 *
 * Usage: node e2e/p0-cross-character-race.spec.mjs
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const chat = readFileSync(join(ROOT, "src/panels/chat.js"), "utf8");
const app = readFileSync(join(ROOT, "src/app.js"), "utf8");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "OK" : "XX"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const scopeA = freezeTurnExecutionScope({
  characterId: "char-a",
  sessionId: "sess-a",
  conversationSessionId: "conv-a",
  branchId: "br-a",
  userMessageId: "ua0",
  providerSnapshot: snapshotProviderConfig({ kind: "OpenAI Compatible", model: "gpt-test" }),
});
const scopeB = freezeTurnExecutionScope({ characterId: "char-b", sessionId: "sess-b" });
const buckets = createPendingTurnBuckets();
buckets.buffer(scopeA, { userText: "msg for A", userMessageId: "ua" });
// Simulate UI focus switch to B while A is in-flight
const liveFocus = scopeB;
const takenWrong = buckets.take(liveFocus);
check("switch_b_does_not_take_a", takenWrong.pendingUserTurns === 0 && takenWrong.userText === "");
const takenA = buckets.take(scopeA);
check("a_bucket_intact", takenA.userText === "msg for A" && takenA.scope.characterId === "char-a");

buckets.buffer(scopeA, { userText: "second A", userMessageId: "ua2" });
buckets.buffer(scopeB, { userText: "only B", userMessageId: "ub" });
const raceB = buckets.take(scopeB);
const raceA = buckets.take(scopeA);
check(
  "parallel_buckets_isolated",
  raceA.userText === "second A" && raceB.userText === "only B"
    && raceA.scope.characterId === "char-a"
    && raceB.scope.characterId === "char-b",
);

// Cross-char race: A buffered, live focus B → resolveReplyExecutionScope must pick A
buckets.buffer(scopeA, { userText: "race A", userMessageId: "ua-race" });
const raceResolved = resolveReplyExecutionScope(buckets, scopeB);
check(
  "resolve_reply_prefers_buffered_over_live",
  raceResolved.executionScope?.characterId === "char-a"
    && raceResolved.taken.userText === "race A",
);

check("scope_v2_fields", scopeA.conversationSessionId === "conv-a" && scopeA.branchId === "br-a");
check("scope_provider_snapshot", scopeA.providerSnapshot?.model === "gpt-test");

check("chat_freezes_on_send", chat.includes("freezeTurnExecutionScope") && chat.includes("captureLiveTurnScope"));
check("chat_uses_resolve_reply_scope", chat.includes("resolveReplyExecutionScope"));
check("chat_compile_passes_executionScope", /compilePrompt\([\s\S]*executionScope/.test(chat) || chat.includes("executionScope,"));
check("chat_write_uses_frozen_character", chat.includes("characterId: executionScope.characterId"));
check("chat_write_fail_closed", chat.includes('reason: "missing_executionScope"'));
check("chat_group_meta_from_scope", chat.includes("groupSpeakerMetaFromScope"));
check("chat_runtime_scope_guard", chat.includes("runtimeTargetMatchesScope"));
check("chat_record_scoped_message", chat.includes("recordScopedCompanionMessage"));
check("chat_no_live_group_speaker_meta", !chat.includes("getLastGroupSpeakerMeta()"));
check("app_compile_prefers_frozen", app.includes("opts.executionScope?.characterId") || app.includes("executionScope?.characterId"));
check("chat_no_global_pending", !/let pendingUserTurns\s*=/.test(chat));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  process.exitCode = 1;
  assert.fail(failed.map((f) => f.name).join(", "));
}
