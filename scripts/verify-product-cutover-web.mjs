/**
 * C4: product cutover — real web retrieval providers, normalization, SSRF, honesty gates.
 * Plan: docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md §10
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_KEYS } from "../src/constants.js";
import {
  createWebEvidenceV1,
  validateWebEvidenceV1,
  createTemporalSnapshotV1,
} from "../src/contracts/index.js";
import { validateFetchUrl } from "../server/retrieval/ssrf.js";
import {
  handleSearchBody,
  handleFetchBody,
  getSearchProviderStatus,
  selectSearchProvider,
  runSearch,
  cacheClear,
  clearRateLimits,
  clearAuditEntries,
  getAuditEntries,
} from "../server/retrieval/gateway.mjs";
import {
  normalizeEvidenceRow,
  normalizeEvidenceList,
  providerSuccess,
} from "../server/retrieval/providers/base.mjs";
import { createBraveProvider } from "../server/retrieval/providers/brave.mjs";
import { createTavilyProvider } from "../server/retrieval/providers/tavily.mjs";
import {
  understandTurnDispatch,
  clearShadowStoreForTests,
  clearExecutorCalendarForTests,
  getProposalRecord,
} from "../src/turn-understanding/index.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
} from "../src/temporal/index.js";
import { clearWebRetrievalClientCache } from "../src/integrations/web-retrieval/index.js";
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
  cacheClear();
  clearRateLimits();
  clearAuditEntries();
  __setUnifiedTaskStorageForTests(memStorage);
  __setAgentStorageForTests(memStorage);
}

const SCOPE = {
  userId: "usr_local",
  companionId: "cmp_demo",
  relationshipId: "rel:usr_local:cmp_demo",
  conversationId: "cnv_c4",
};

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

async function main() {
  resetAll();
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-08T03:00:00.000Z");
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const snapshot = createTemporalSnapshotV1({ locale: "zh-CN" });

  // --- Provider selection from env ---
  {
    const stub = getSearchProviderStatus({ YUEQI_WEB_PROVIDER: "stub" });
    assert.equal(stub.provider, "stub");
    assert.equal(stub.configured, false);

    const braveNoKey = getSearchProviderStatus({ YUEQI_WEB_PROVIDER: "brave" });
    assert.equal(braveNoKey.provider, "brave");
    assert.equal(braveNoKey.configured, false);

    const braveKey = getSearchProviderStatus({
      YUEQI_WEB_PROVIDER: "brave",
      BRAVE_API_KEY: "test-key",
    });
    assert.equal(braveKey.configured, true);

    const legacy = getSearchProviderStatus({
      YUEQI_WEB_SEARCH_PROVIDER: "tavily",
      TAVILY_API_KEY: "tvly-test",
    });
    assert.equal(legacy.provider, "tavily");
    assert.equal(legacy.configured, true);

    const unknown = selectSearchProvider({ env: { YUEQI_WEB_PROVIDER: "serp_magic" } });
    const unkOut = await unknown.search("q");
    assert.equal(unkOut.ok, false);
    assert.equal(unkOut.reason, "provider_unconfigured");
    ok("provider selection: stub|brave|tavily; unknown fails honestly");
  }

  // --- Without key → not completed ---
  {
    const env = { YUEQI_WEB_PROVIDER: "brave" };
    const out = await runSearch("今日新闻", { env, skipCache: true });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "provider_unconfigured");
    assert.notEqual(out.reason, "completed");
    ok("without API key → not completed (provider_unconfigured)");
  }

  // --- Stub never invents results ---
  {
    const stub = selectSearchProvider({ env: { YUEQI_WEB_PROVIDER: "stub" } });
    const out = await stub.search("anything");
    assert.equal(out.ok, false);
    assert.equal(out.reason, "provider_unconfigured");
    assert.equal(Array.isArray(out.results), false);
    ok("stub never returns invented sources");
  }

  // --- Mock Brave: field normalization ---
  {
    const fetchedAt = new Date(fixedMs).toISOString();
    const mockFetch = async (url) => {
      assert.match(String(url), /api\.search\.brave\.com|mock-brave/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          web: {
            results: [
              {
                title: "Brave Hit",
                url: "https://example.com/a",
                description: "摘要 A",
                page_age: "2026-08-01T00:00:00Z",
              },
              {
                title: "Private should drop",
                url: "http://127.0.0.1/secret",
                description: "should be filtered by SSRF",
              },
              {
                title: "Second public",
                url: "https://example.org/b",
                description: "摘要 B",
              },
            ],
          },
        }),
      };
    };

    const provider = createBraveProvider({
      apiKey: "test-brave-key",
      fetchImpl: mockFetch,
      endpoint: "https://api.search.brave.com/res/v1/web/search",
    });
    const out = await provider.search("量子计算", {
      maxResults: 5,
      fetchImpl: mockFetch,
    });
    assert.equal(out.ok, true);
    assert.equal(out.provider, "brave");
    assert.ok(out.results.length >= 1);
    assert.ok(out.results.every((r) => !/127\.0\.0\.1/.test(r.url)));
    assert.ok(out.results.every((r) => r.title && r.url && r.excerpt && r.fetchedAt));
    assert.equal(out.results[0].provider, "brave");
    // Ensure WebEvidence-shaped enough for client contract
    for (const row of out.results) {
      const ev = createWebEvidenceV1(row);
      assert.equal(validateWebEvidenceV1(ev).ok, true);
    }
    ok("Brave mock: normalize fields + drop SSRF URLs");

    // Gateway path with env + mock
    cacheClear();
    clearRateLimits();
    const gw = await runSearch("量子计算", {
      env: {
        YUEQI_WEB_PROVIDER: "brave",
        BRAVE_API_KEY: "test-brave-key",
      },
      fetchImpl: mockFetch,
      skipCache: true,
    });
    assert.equal(gw.ok, true);
    assert.equal(gw.provider, "brave");
    assert.ok(gw.results.length >= 1);
    const audits = getAuditEntries().filter((a) => a.action === "search" && a.provider === "brave");
    assert.ok(audits.length >= 1);
    assert.ok(audits.some((a) => a.ok === true && a.queryHash));
    ok("gateway runSearch + audit with mocked Brave");
  }

  // --- Mock Tavily normalization ---
  {
    const mockFetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      assert.ok(body.api_key);
      assert.ok(body.query);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              title: "Tavily Hit",
              url: "https://example.com/t",
              content: "Tavily excerpt",
              published_date: "2026-08-07",
            },
          ],
        }),
      };
    };
    const provider = createTavilyProvider({ apiKey: "tvly-test", fetchImpl: mockFetch });
    const out = await provider.search("news", { fetchImpl: mockFetch });
    assert.equal(out.ok, true);
    assert.equal(out.provider, "tavily");
    assert.equal(out.results[0].url, "https://example.com/t");
    assert.ok(out.results[0].excerpt.includes("Tavily"));
    ok("Tavily mock: field normalization");
  }

  // --- Empty provider results → not success ---
  {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ web: { results: [] } }),
    });
    const out = await runSearch("empty", {
      env: { YUEQI_WEB_PROVIDER: "brave", BRAVE_API_KEY: "k" },
      fetchImpl: mockFetch,
      skipCache: true,
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "no_source");
    ok("empty search results → no_source (not completed)");
  }

  // --- SSRF still blocked on fetch path ---
  {
    assert.equal(validateFetchUrl("http://127.0.0.1/x").ok, false);
    assert.equal(validateFetchUrl("file:///etc/passwd").ok, false);
    const blocked = await handleFetchBody({ url: "http://192.168.0.1/" });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.blocked, true);
    const dropped = normalizeEvidenceRow(
      { title: "x", url: "http://10.0.0.1/a", excerpt: "e" },
      { query: "q", provider: "brave" },
    );
    assert.equal(dropped, null);
    const kept = normalizeEvidenceList(
      [
        { title: "ok", url: "https://example.com", description: "d" },
        { title: "bad", url: "http://169.254.169.254/", description: "meta" },
      ],
      { query: "q", provider: "brave", maxResults: 5 },
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].url, "https://example.com/");
    ok("SSRF blocked on fetch + result normalization");
  }

  // --- Rate limit surfaces honestly ---
  {
    clearRateLimits();
    cacheClear();
    const env = {
      YUEQI_WEB_PROVIDER: "stub",
      YUEQI_WEB_RATE_LIMIT: "2",
      YUEQI_WEB_RATE_WINDOW_MS: "60000",
    };
    const a = await runSearch("q1", { env, skipCache: true, rateLimitKey: "test-rl" });
    const b = await runSearch("q2", { env, skipCache: true, rateLimitKey: "test-rl" });
    const c = await runSearch("q3", { env, skipCache: true, rateLimitKey: "test-rl" });
    assert.equal(a.reason, "provider_unconfigured");
    assert.equal(b.reason, "provider_unconfigured");
    assert.equal(c.ok, false);
    assert.equal(c.reason, "rate_limited");
    clearRateLimits();
    ok("rate limit returns rate_limited (not fake complete)");
  }

  // --- providerSuccess rejects empty ---
  {
    const empty = providerSuccess("brave", []);
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, "no_source");
    ok("providerSuccess refuses empty sources");
  }

  // --- Client / bundle: no API keys ---
  {
    const clientPaths = [
      join(ROOT, "src/integrations/web-retrieval/client.js"),
      join(ROOT, "src/integrations/web-retrieval/index.js"),
      join(ROOT, "src/integrations/web-retrieval/policy.js"),
      join(ROOT, "src/turn-understanding/executor.js"),
    ];
    for (const p of clientPaths) {
      const src = readFileSync(p, "utf8");
      assert.equal(/BRAVE_API_KEY|TAVILY_API_KEY|YUEQI_WEB_SEARCH_API_KEY/i.test(src), false, p);
      assert.equal(/X-Subscription-Token/i.test(src), false, p);
    }

    const bundleRoots = ["dist", "build", "android/app/src/main/assets"].map((d) => join(ROOT, d));
    const keyPat = /BRAVE_API_KEY\s*[:=]|TAVILY_API_KEY\s*[:=]|YUEQI_WEB_SEARCH_API_KEY\s*[:=]|sk-live-|tvly-[A-Za-z0-9]{8,}/i;
    let scanned = 0;
    for (const root of bundleRoots) {
      for (const file of walkFiles(root)) {
        const ext = extname(file).toLowerCase();
        if (![".js", ".mjs", ".cjs", ".html", ".css", ".map"].includes(ext)) continue;
        if (statSync(file).size > 5_000_000) continue;
        const text = readFileSync(file, "utf8");
        scanned += 1;
        assert.equal(keyPat.test(text), false, `key material in ${file}`);
      }
    }
    ok(`client sources + bundles have no API key material (scanned ${scanned} bundle files)`);
  }

  // --- Executor path: provider failure honest (not completed) ---
  {
    resetAll();
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
    // legacy profile forces webRetrieval off — use internal_v1 for execute path
    setCutoverProfile("internal_v1");
    setFlags({ turnUnderstandingV1: true, webRetrievalV1: true });
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/api/retrieval/search")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            ok: false,
            reason: "provider_unconfigured",
            provider: "brave",
            message: "BRAVE_API_KEY not set",
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
    assert.ok(sRes, "expected web.search result");
    assert.equal(sRes.ok, false);
    assert.equal(sRes.executed, false);
    assert.equal(sRes.reason, "provider_unconfigured");
    assert.notEqual(sRes.reason, "completed");
    globalThis.fetch = prevFetch;
    clearWebRetrievalClientCache();
    ok("executor surfaces provider_unconfigured (not completed)");
  }

  // --- handleSearchBody opts.env isolation ---
  {
    const out = await handleSearchBody(
      { query: "x" },
      { env: { YUEQI_WEB_PROVIDER: "tavily" }, skipCache: true },
    );
    assert.equal(out.ok, false);
    assert.equal(out.reason, "provider_unconfigured");
    assert.equal(out.provider, "tavily");
    ok("handleSearchBody respects env override");
  }

  console.log("\nAll C4 product-cutover web retrieval checks passed.");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exitCode = 1;
});
