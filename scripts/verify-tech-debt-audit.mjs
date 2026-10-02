/**
 * Production audit regression pack (P0/P1 fixes).
 * Run: node scripts/verify-tech-debt-audit.mjs
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafeUpstreamUrl } from "../server/upstream-url.mjs";
import { createAccountStore } from "../server/account-store.mjs";
import {
  __setConversationStorageForTests,
  persistSession,
  getSession,
  clearAllConversations,
} from "../src/conversation/store.js";
import { CONVERSATION_STORE_KEY, createConversationSession } from "../src/conversation/schema.js";
import { isFeatureEnabled } from "../src/features/flags.js";
import { requestCompanionDiary } from "../src/companion/diary-action.js";
import { DEFAULT_CUTOVER_PROFILE } from "../src/features/cutover-profile.js";

function ok(name) {
  console.log(`PASS ${name}`);
}

async function testUpstreamSsrf() {
  assert.equal(assertSafeUpstreamUrl("https://api.openai.com/v1", { publicServer: true }), "https://api.openai.com/v1");
  assert.throws(() => assertSafeUpstreamUrl("http://127.0.0.1:11434", { publicServer: true }), /拒绝|blocked/i);
  assert.throws(() => assertSafeUpstreamUrl("http://10.0.0.5/v1", { publicServer: true }), /拒绝|blocked/i);
  assert.throws(() => assertSafeUpstreamUrl("http://192.168.1.1/v1", { publicServer: true }), /拒绝|blocked/i);
  assert.throws(() => assertSafeUpstreamUrl("http://169.254.169.254/latest", { publicServer: true }), /拒绝|元数据|blocked/i);
  // Local-dev may talk to Ollama
  assert.match(assertSafeUpstreamUrl("http://127.0.0.1:11434/v1", { publicServer: false }), /127\.0\.0\.1/);
  ok("upstream SSRF blocks private + metadata on publicServer");
}

async function testCreditRace() {
  const dir = await mkdtemp(join(tmpdir(), "yueqi-acct-"));
  const file = join(dir, "store.json");
  const storeApi = createAccountStore(file);
  await storeApi.writeStore({
    users: {
      u1: { id: "u1", subscription: { status: "active", credits: 10 } },
    },
    sync: {},
    grants: {},
    usage: {},
  });

  async function charge(amount) {
    return storeApi.transact((store) => {
      const user = store.users.u1;
      const current = Number(user.subscription.credits);
      if (current < amount) return null;
      user.subscription.credits = current - amount;
      store.usage.u1 ||= [];
      store.usage.u1.push({ chargedCredits: amount });
      return user.subscription.credits;
    });
  }

  const results = await Promise.all([charge(4), charge(4), charge(4)]);
  const success = results.filter((r) => r != null);
  const finalRaw = JSON.parse(await readFile(file, "utf8"));
  assert.equal(success.length, 2, "only two of three 4-credit charges succeed from 10");
  assert.equal(finalRaw.users.u1.subscription.credits, 2);
  await rm(dir, { recursive: true, force: true });
  ok("account store serializes concurrent credit charges");
}

async function testConversationCorrupt() {
  const memory = new Map();
  const storage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
  __setConversationStorageForTests(storage);

  const session = createConversationSession({
    characterId: "char-a",
    title: "t",
  });
  assert.equal(persistSession(session).ok, true);
  const good = storage.getItem(CONVERSATION_STORE_KEY);
  assert.ok(good);

  // Corrupt primary but keep valid tmp recovery
  storage.setItem(`${CONVERSATION_STORE_KEY}.tmp`, good);
  storage.setItem(CONVERSATION_STORE_KEY, "{not-json");
  __setConversationStorageForTests(storage);
  // Re-bind after reset — storage map kept
  memory.set(`${CONVERSATION_STORE_KEY}.tmp`, good);
  memory.set(CONVERSATION_STORE_KEY, "{not-json");
  const recovered = getSession(session.id);
  assert.ok(recovered, "tmp recovery restores session");
  ok("conversation V2 recovers from .tmp after corrupt primary");

  // Both corrupt → refuse wipe writes
  __setConversationStorageForTests(storage);
  memory.set(CONVERSATION_STORE_KEY, "{broken");
  memory.delete(`${CONVERSATION_STORE_KEY}.tmp`);
  getSession(session.id); // load empty + block
  const again = createConversationSession({ characterId: "char-b", title: "x" });
  const blocked = persistSession(again);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "corrupt_conversation_v2");
  assert.match(storage.getItem(CONVERSATION_STORE_KEY) || "", /broken|corrupt/);
  // Quarantine key exists
  assert.ok([...memory.keys()].some((k) => String(k).includes(".corrupt.")));
  clearAllConversations();
  ok("conversation V2 refuses write after unrecovered corrupt JSON");
}

async function testDiaryNoOverwrite() {
  const existing = { id: "d1", title: "old", body: "old body" };
  const result = await requestCompanionDiary({
    companionId: "cmp",
    characterProfile: { name: "星梨" },
    overwrite: false,
    getExistingFn: async () => existing,
    generateFn: async () => ({ ok: true, title: "new", body: "new body", styleId: "literary" }),
    saveFn: async () => {
      throw new Error("should not save");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "EXISTS_NO_OVERWRITE");
  ok("diary action defaults to no silent overwrite");
}

function testFlagsAndCutover() {
  assert.equal(DEFAULT_CUTOVER_PROFILE, "legacy");
  assert.equal(isFeatureEnabled("doesNotExistEver"), false);
  ok("cutover default legacy + unknown flags off");
}

async function main() {
  await testUpstreamSsrf();
  await testCreditRace();
  await testConversationCorrupt();
  await testDiaryNoOverwrite();
  testFlagsAndCutover();
  console.log("\nverify-tech-debt-audit: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
