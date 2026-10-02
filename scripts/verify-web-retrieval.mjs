/**
 * W7: web retrieval — SSRF, WebEvidence contract, sourced completion gate, flags.
 * Plan §5.6, §11, §W7.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_KEYS } from "../src/constants.js";
import {
  createWebEvidenceV1,
  validateWebEvidenceV1,
  createTemporalSnapshotV1,
  createActionProposalV1,
} from "../src/contracts/index.js";
import {
  validateFetchUrl,
  isLoopbackHostname,
  isPrivateOrReservedHostname,
} from "../server/retrieval/ssrf.js";
import {
  handleSearchBody,
  handleFetchBody,
  getSearchProviderStatus,
} from "../server/retrieval/gateway.mjs";
import {
  requireWebEvidenceSources,
  memoryWritePolicy,
  mayRequestWeb,
  buildSourcedArtifact,
  clearWebRetrievalClientCache,
  searchWeb,
} from "../src/integrations/web-retrieval/index.js";
import {
  understandTurn,
  understandTurnDispatch,
  dispatchProposals,
  clearShadowStoreForTests,
  clearExecutorCalendarForTests,
  getProposalRecord,
} from "../src/turn-understanding/index.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
} from "../src/temporal/index.js";
import { clearUnifiedTasksForTests, __setUnifiedTaskStorageForTests } from "../src/tasks/unified-task-repo.js";
import { clearAllAgentTasks, __setAgentStorageForTests } from "../src/agent/task-store.js";
import {
  setCutoverProfile,
  __resetCutoverProfileCacheForTests,
} from "../src/features/cutover-profile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = { localStorage: memStorage };

function ok(name) {
  console.log(`PASS ${name}`);
}

function setFlags(flags) {
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify(flags));
}

function resetAll() {
  memory.clear();
  __resetCutoverProfileCacheForTests();
  clearShadowStoreForTests();
  clearExecutorCalendarForTests();
  clearUnifiedTasksForTests();
  clearAllAgentTasks();
  clearWebRetrievalClientCache();
  __setUnifiedTaskStorageForTests(memStorage);
  __setAgentStorageForTests(memStorage);
}

const SCOPE = {
  userId: "usr_local",
  companionId: "cmp_demo",
  relationshipId: "rel:usr_local:cmp_demo",
  conversationId: "cnv_w7",
};

async function main() {
  resetAll();
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z");
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const snapshot = createTemporalSnapshotV1({ locale: "zh-CN" });

  // --- Contract: WebEvidence create/validate ---
  {
    const ev = createWebEvidenceV1({
      query: "上海天气",
      title: "Example Source",
      url: "https://example.com/weather",
      excerpt: "晴，25°C",
      freshness: "live",
      publisher: "example.com",
    });
    assert.equal(validateWebEvidenceV1(ev).ok, true);
    assert.ok(ev.evidenceId);
    assert.ok(ev.contentHash);
    assert.ok(ev.fetchedAt);
    ok("WebEvidenceV1 create/validate");

    const bad = validateWebEvidenceV1({ ...ev, url: "", freshness: "nope" });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.includes("url"));
    assert.ok(bad.errors.includes("freshness_enum"));
    ok("WebEvidenceV1 rejects invalid");
  }

  // --- SSRF blocked ---
  {
    const local = validateFetchUrl("http://127.0.0.1/secret");
    assert.equal(local.ok, false);
    assert.equal(local.reason, "blocked_localhost");
    ok("SSRF blocks http://127.0.0.1");

    const fileUrl = validateFetchUrl("file:///etc/passwd");
    assert.equal(fileUrl.ok, false);
    assert.ok(String(fileUrl.reason).includes("file") || fileUrl.reason === "blocked_scheme_file");
    ok("SSRF blocks file:///etc/passwd");

    assert.equal(validateFetchUrl("http://192.168.1.1/").ok, false);
    assert.equal(validateFetchUrl("http://10.0.0.5/").ok, false);
    assert.equal(isLoopbackHostname("localhost"), true);
    assert.equal(isPrivateOrReservedHostname("169.254.169.254"), true);
    ok("SSRF blocks private / metadata hosts");

    const allowed = validateFetchUrl("http://127.0.0.1/ok", {
      allowlistHostnames: ["127.0.0.1"],
    });
    assert.equal(allowed.ok, true);
    ok("SSRF allowlist permits localhost for tests");

    const fetchBlocked = await handleFetchBody({ url: "http://127.0.0.1/" });
    assert.equal(fetchBlocked.ok, false);
    assert.equal(fetchBlocked.blocked, true);
    const fetchFile = await handleFetchBody({ url: "file:///etc/passwd" });
    assert.equal(fetchFile.ok, false);
    ok("gateway fetch rejects SSRF targets");
  }

  // --- Unconfigured provider fails honestly ---
  {
    const emptyEnv = {
      YUEQI_WEB_PROVIDER: "stub",
      YUEQI_WEB_SEARCH_PROVIDER: "stub",
    };
    const status = getSearchProviderStatus(emptyEnv);
    assert.equal(status.configured, false);
    const out = await handleSearchBody({ query: "今日新闻" }, { env: emptyEnv, skipCache: true });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "provider_unconfigured");
    ok("unconfigured provider → provider_unconfigured");
  }

  // --- Client: no API keys in client sources ---
  {
    const clientSrc = readFileSync(join(ROOT, "src/integrations/web-retrieval/client.js"), "utf8");
    assert.equal(/API_KEY|apiKey|secret_key/i.test(clientSrc), false);
    const idxSrc = readFileSync(join(ROOT, "src/integrations/web-retrieval/index.js"), "utf8");
    assert.equal(/YUEQI_WEB_SEARCH_API_KEY|WEB_SEARCH_API_KEY/i.test(idxSrc), false);
    ok("client bundle sources have no API key material");
  }

  // --- Policy: default not stable memory; user-save artifact ---
  {
    const pol = memoryWritePolicy();
    assert.equal(pol.writeStableMemory, false);
    assert.equal(pol.saveAsArtifactRequiresUserConfirm, true);
    assert.equal(mayRequestWeb({ query: "", explicit: true }).ok, false);
    assert.equal(mayRequestWeb({ query: "foo", explicit: false }).ok, false);
    assert.equal(mayRequestWeb({ query: "foo", explicit: true }).ok, true);

    const ev = createWebEvidenceV1({
      query: "foo",
      title: "T",
      url: "https://example.com/a",
      excerpt: "ex",
      freshness: "recent",
    });
    const art = buildSourcedArtifact([ev], { query: "foo" });
    assert.equal(art.ok, true);
    assert.equal(art.artifact.kind, "sourced_web_artifact");
    assert.equal(art.artifact.memoryPolicy.writeStableMemory, false);
    ok("policy: explicit-only; no stable memory; sourced artifact");
  }

  // --- no-source cannot complete ---
  {
    const empty = requireWebEvidenceSources([]);
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, "no_source");

    const invalid = requireWebEvidenceSources([{ title: "x" }]);
    assert.equal(invalid.ok, false);
    ok("no-source / invalid evidence cannot complete");

    // Client path: gateway returns ok with empty results → fail
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, results: [] }),
    });
    clearWebRetrievalClientCache();
    const noSrc = await searchWeb("任意查询", { explicit: true, skipCache: true });
    assert.equal(noSrc.ok, false);
    assert.ok(["no_source", "no_valid_web_evidence"].includes(noSrc.reason));
    globalThis.fetch = prevFetch;
    clearWebRetrievalClientCache();
    ok("searchWeb refuses empty-source success");
  }

  // --- Flag off: web.search → external_pending (no fake complete) ---
  {
    resetAll();
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
    // internal_v1 allows storage override; keep webRetrieval off
    setCutoverProfile("internal_v1");
    setFlags({ turnUnderstandingV1: true, webRetrievalV1: false });

    const understood = await understandTurn({
      text: "查一下量子计算最新进展",
      scope: SCOPE,
      snapshot,
    });
    assert.ok(
      understood.understanding.webRequests.some((w) => w.kind === "search")
      || understood.understanding.actionProposals.some((a) => a.capabilityId === "web.search"),
    );

    const dispatched = await dispatchProposals(understood.understanding, {
      mode: "execute",
      sourceText: "查一下量子计算最新进展",
    });
    const webResult = (dispatched.results || []).find((r) => {
      const rec = getProposalRecord(r.proposalId);
      return rec?.proposal?.capabilityId === "web.search";
    });
    assert.ok(webResult, "expected web.search result");
    assert.equal(webResult.ok, false);
    assert.equal(webResult.reason, "external_pending");
    assert.equal(webResult.executed, false);
    ok("flag webRetrievalV1 off → external_pending (no complete)");
  }

  // --- Flag off entirely: no-op vs weather path when both off ---
  {
    resetAll();
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
    // defaults: both false → dispatch shadow
    const r = await understandTurnDispatch(
      {
        text: "查一下量子计算最新进展",
        scope: SCOPE,
        snapshot,
      },
      { mode: "shadow" },
    );
    const shadowMode = r.dispatch?.record?.mode || r.shadow?.record?.mode || r.dispatch?.mode;
    assert.equal(shadowMode, "shadow");
    assert.equal(Boolean(r.dispatch?.executed || r.shadow?.executed), false);
    ok("flags off: shadow no-op (no web execution)");
  }

  // --- Both flags on: weather still uses weather path; web.search hits gateway honestly ---
  {
    resetAll();
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
    setCutoverProfile("internal_v1");
    setFlags({ turnUnderstandingV1: true, webRetrievalV1: true });

    const weather = await understandTurnDispatch(
      {
        text: "查一下明天上海天气",
        scope: SCOPE,
        snapshot,
      },
      { mode: "execute" },
    );
    const wProp = weather.understanding.actionProposals.find((a) => a.capabilityId === "web.weather");
    assert.ok(wProp);
    // Weather path may succeed or fail on network, but must not be web.search
    const wRes = (weather.dispatch.results || []).find(
      (r) => getProposalRecord(r.proposalId)?.proposal?.capabilityId === "web.weather",
    );
    assert.ok(wRes);
    assert.notEqual(wRes.reason, "external_pending");
    ok("weather keeps existing path under webRetrievalV1");

    // Mock unconfigured search response through client fetch
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/retrieval/search")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ ok: false, reason: "provider_unconfigured", provider: "stub" }),
        };
      }
      return prevFetch?.(url);
    };
    clearWebRetrievalClientCache();

    const search = await understandTurnDispatch(
      {
        text: "查一下量子计算最新进展",
        scope: SCOPE,
        snapshot,
      },
      { mode: "execute" },
    );
    const sRes = (search.dispatch.results || []).find(
      (r) => getProposalRecord(r.proposalId)?.proposal?.capabilityId === "web.search",
    );
    assert.ok(sRes);
    assert.equal(sRes.ok, false);
    assert.equal(sRes.executed, false);
    assert.equal(sRes.reason, "provider_unconfigured");
    globalThis.fetch = prevFetch;
    clearWebRetrievalClientCache();
    ok("web.search with flags on fails honestly when provider unconfigured");
  }

  // --- Sourced complete path (mocked evidence from gateway) ---
  {
    resetAll();
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
    setCutoverProfile("internal_v1");
    setFlags({ turnUnderstandingV1: true, webRetrievalV1: true });
    const prevFetch = globalThis.fetch;
    const fetchedAt = new Date(fixedMs).toISOString();
    globalThis.fetch = async (url) => {
      if (String(url).includes("/api/retrieval/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            provider: "mock",
            results: [
              {
                title: "Mock Source",
                url: "https://example.com/q",
                excerpt: "量子计算进展摘要",
                fetchedAt,
                freshness: "live",
                publisher: "example.com",
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    clearWebRetrievalClientCache();

    const search = await understandTurnDispatch(
      {
        text: "查一下量子计算最新进展",
        scope: SCOPE,
        snapshot,
      },
      { mode: "execute" },
    );
    const sRes = (search.dispatch.results || []).find(
      (r) => getProposalRecord(r.proposalId)?.proposal?.capabilityId === "web.search",
    );
    assert.ok(sRes);
    assert.equal(sRes.ok, true);
    assert.equal(sRes.executed, true);
    assert.ok(Array.isArray(sRes.evidence) && sRes.evidence.length >= 1);
    assert.equal(validateWebEvidenceV1(sRes.evidence[0]).ok, true);
    assert.equal(sRes.memoryPolicy?.writeStableMemory, false);
    globalThis.fetch = prevFetch;
    clearWebRetrievalClientCache();
    ok("web.search completes only with WebEvidence sources");
  }

  // --- Action proposal without sources must not look like success ---
  {
    const fake = createActionProposalV1({
      capabilityId: "web.search",
      operation: "search",
      title: "x",
      exactEffect: "x",
      risk: "R0",
      explicitness: "explicit_command",
      parameters: { query: "x" },
      evidenceRefs: ["x"],
    });
    assert.equal(fake.capabilityId, "web.search");
    const gate = requireWebEvidenceSources([]);
    assert.equal(gate.ok, false);
    ok("completion gate independent of proposal shape");
  }

  console.log("\nAll W7 web-retrieval checks passed.");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exitCode = 1;
});
