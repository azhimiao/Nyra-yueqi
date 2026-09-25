/**
 * Web retrieval HTTP gateway handlers (plan §11.2 / §W7 / C4 §10).
 * Search provider is pluggable via YUEQI_WEB_PROVIDER; without API key returns honest failure.
 * API keys stay on the server — never returned to clients.
 */

import { createHash } from "node:crypto";
import { validateFetchUrl, allowlistFromEnv } from "./ssrf.js";
import { fetchPage } from "./fetch-page.mjs";
import {
  getSearchProviderStatus,
  selectSearchProvider,
  resolveProviderId,
} from "./providers/index.mjs";
import { clampMaxResults } from "./providers/base.mjs";
import { cacheGet, cacheSet, cacheClear } from "./cache.mjs";
import { checkRateLimit, clearRateLimits, rateLimitConfigFromEnv } from "./rate-limit.mjs";
import { auditRetrieval, hashQuery, clearAuditEntries, getAuditEntries, setAuditSink } from "./audit.mjs";

export {
  getSearchProviderStatus,
  selectSearchProvider,
  resolveProviderId,
  cacheClear,
  clearRateLimits,
  clearAuditEntries,
  getAuditEntries,
  setAuditSink,
};

const DEFAULT_SEARCH_TIMEOUT_MS = 10_000;

/**
 * Pluggable search — stub without key; real providers behind env.
 * @param {string} query
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   maxResults?: number,
 *   signal?: AbortSignal,
 *   skipCache?: boolean,
 *   rateLimitKey?: string,
 *   allowlistHostnames?: string[],
 * }} [opts]
 */
export async function runSearch(query, opts = {}) {
  const started = Date.now();
  const env = opts.env || process.env;
  const q = String(query || "").trim();
  if (!q) {
    return { ok: false, reason: "empty_query" };
  }
  if (q.length > 500) {
    return { ok: false, reason: "query_too_long" };
  }

  const status = getSearchProviderStatus(env);
  const providerId = status.provider;
  const maxResults = clampMaxResults(
    opts.maxResults ?? env.YUEQI_WEB_MAX_RESULTS,
  );
  const timeoutMs = Number(opts.timeoutMs) > 0
    ? Number(opts.timeoutMs)
    : Number(env.YUEQI_WEB_TIMEOUT_MS) > 0
      ? Number(env.YUEQI_WEB_TIMEOUT_MS)
      : DEFAULT_SEARCH_TIMEOUT_MS;

  const rlCfg = rateLimitConfigFromEnv(env);
  const rl = checkRateLimit(opts.rateLimitKey || `search:${providerId}`, rlCfg);
  if (!rl.ok) {
    const fail = {
      ok: false,
      reason: "rate_limited",
      provider: providerId,
      message: "Search rate limit exceeded",
      retryAfterMs: rl.retryAfterMs,
    };
    auditRetrieval({
      action: "search",
      provider: providerId,
      ok: false,
      reason: fail.reason,
      queryHash: hashQuery(q),
      latencyMs: Date.now() - started,
    });
    return fail;
  }

  if (!status.configured) {
    const fail = {
      ok: false,
      reason: "provider_unconfigured",
      provider: providerId,
      message: providerId === "stub" || providerId === "none"
        ? "Web search API key not configured on server"
        : `Provider "${providerId}" not configured (missing API key or unimplemented)`,
    };
    auditRetrieval({
      action: "search",
      provider: providerId,
      ok: false,
      reason: fail.reason,
      queryHash: hashQuery(q),
      latencyMs: Date.now() - started,
    });
    return fail;
  }

  const cacheKey = `search:${providerId}:${maxResults}:${q.toLowerCase()}`;
  if (!opts.skipCache) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      auditRetrieval({
        action: "search",
        provider: providerId,
        ok: Boolean(cached.ok),
        reason: cached.reason || (cached.ok ? "ok" : "error"),
        queryHash: hashQuery(q),
        latencyMs: Date.now() - started,
        cached: true,
        resultCount: Array.isArray(cached.results) ? cached.results.length : 0,
      });
      return { ...cached, cached: true };
    }
  }

  const provider = selectSearchProvider({
    env,
    fetchImpl: opts.fetchImpl,
    providerId,
  });

  let result;
  try {
    result = await provider.search(q, {
      env,
      fetchImpl: opts.fetchImpl,
      timeoutMs,
      maxResults,
      signal: opts.signal,
      allowlistHostnames: [
        ...allowlistFromEnv(env),
        ...(opts.allowlistHostnames || []),
      ],
    });
  } catch (err) {
    result = {
      ok: false,
      reason: "search_error",
      provider: providerId,
      message: String(err?.message || err),
    };
  }

  // Hard gate: success requires at least one source row
  if (result?.ok) {
    const results = Array.isArray(result.results) ? result.results : [];
    if (results.length === 0) {
      result = {
        ok: false,
        reason: "no_source",
        provider: providerId,
        message: "Provider returned no usable sources",
      };
    } else {
      result = {
        ok: true,
        provider: result.provider || providerId,
        results,
        fetchedAt: result.fetchedAt || new Date().toISOString(),
      };
      cacheSet(cacheKey, result, {
        ttlMs: Number(env.YUEQI_WEB_CACHE_TTL_MS) > 0
          ? Number(env.YUEQI_WEB_CACHE_TTL_MS)
          : 60_000,
      });
    }
  } else {
    result = {
      ok: false,
      reason: result?.reason || "search_failed",
      provider: result?.provider || providerId,
      message: result?.message || "",
    };
    // Short-cache configuration / auth failures to reduce hammering
    if (["provider_unconfigured", "provider_auth_failed"].includes(result.reason)) {
      cacheSet(cacheKey, result, { ttlMs: 15_000 });
    }
  }

  auditRetrieval({
    action: "search",
    provider: result.provider || providerId,
    ok: Boolean(result.ok),
    reason: result.reason || (result.ok ? "ok" : "error"),
    queryHash: hashQuery(q),
    latencyMs: Date.now() - started,
    resultCount: Array.isArray(result.results) ? result.results.length : 0,
  });

  return result;
}

/**
 * Express-compatible router mount.
 * @param {import("express").Express | import("express").Router} app
 * @param {{ requireAuth?: Function }} [opts]
 */
export function mountRetrievalRoutes(app, opts = {}) {
  const requireAuth = typeof opts.requireAuth === "function"
    ? opts.requireAuth
    : (_req, _res, next) => next();

  app.post("/api/retrieval/search", requireAuth, async (req, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      const rateLimitKey = `ip:${req.ip || req.socket?.remoteAddress || "anon"}`;
      const result = await runSearch(query, { rateLimitKey });
      const status = result.ok
        ? 200
        : result.reason === "empty_query" || result.reason === "query_too_long"
          ? 400
          : result.reason === "rate_limited"
            ? 429
            : 503;
      if (result.retryAfterMs != null) {
        res.setHeader("Retry-After", String(Math.ceil(Number(result.retryAfterMs) / 1000) || 1));
      }
      return res.status(status).json(result);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        reason: "search_error",
        message: String(err?.message || err),
      });
    }
  });

  app.post("/api/retrieval/fetch", requireAuth, async (req, res) => {
    try {
      const url = String(req.body?.url || "").trim();
      const query = String(req.body?.query || "").trim();
      const allowlist = allowlistFromEnv();

      const pre = validateFetchUrl(url, { allowlistHostnames: allowlist });
      if (!pre.ok) {
        auditRetrieval({
          action: "fetch",
          ok: false,
          reason: pre.reason,
          blocked: true,
        });
        return res.status(400).json({
          ok: false,
          reason: pre.reason,
          blocked: true,
        });
      }

      const result = await fetchPage(url, { query, allowlistHostnames: allowlist });
      if (!result.ok) {
        const code = result.blocked ? 400 : result.reason === "timeout" ? 504 : 502;
        auditRetrieval({
          action: "fetch",
          ok: false,
          reason: result.reason,
          blocked: Boolean(result.blocked),
        });
        return res.status(code).json(result);
      }

      // Shape as evidence-friendly payload (client wraps into WebEvidenceV1)
      const evidenceId = `wev_${createHash("sha256").update(result.url + result.fetchedAt).digest("hex").slice(0, 16)}`;
      auditRetrieval({
        action: "fetch",
        ok: true,
        reason: "ok",
        publisher: result.publisher,
      });
      return res.json({
        ok: true,
        ...result,
        evidenceId,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        reason: "fetch_error",
        message: String(err?.message || err),
      });
    }
  });

  app.get("/api/retrieval/health", (_req, res) => {
    const status = getSearchProviderStatus();
    res.json({
      ok: true,
      searchConfigured: status.configured,
      provider: status.provider,
      // never echo key material
    });
  });
}

/**
 * Direct handler helpers for tests (no Express).
 */
export async function handleSearchBody(body = {}, opts = {}) {
  return runSearch(String(body.query || "").trim(), opts);
}

export async function handleFetchBody(body = {}, opts = {}) {
  const url = String(body.url || "").trim();
  const query = String(body.query || "").trim();
  const allowlist = [
    ...allowlistFromEnv(opts.env),
    ...(opts.allowlistHostnames || []),
  ];
  const pre = validateFetchUrl(url, { allowlistHostnames: allowlist });
  if (!pre.ok) return { ok: false, reason: pre.reason, blocked: true };
  return fetchPage(url, {
    query,
    allowlistHostnames: allowlist,
    fetchImpl: opts.fetchImpl,
  });
}
