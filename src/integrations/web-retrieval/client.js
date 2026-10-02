/**
 * Web retrieval client — calls server gateway only.
 * Never embeds search/API keys in the client bundle.
 */

import { createWebEvidenceV1, validateWebEvidenceV1 } from "../../contracts/web-evidence-v1.js";
import { cacheGet, cacheSet, cacheClear } from "./cache.js";
import { mayRequestWeb, requireWebEvidenceSources, memoryWritePolicy } from "./policy.js";

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * @returns {string} gateway base URL (no trailing slash)
 */
export function resolveGatewayBase(opts = {}) {
  if (opts.baseUrl != null && String(opts.baseUrl).trim()) {
    return String(opts.baseUrl).trim().replace(/\/+$/, "");
  }
  if (typeof globalThis !== "undefined" && globalThis.__YUEQI_RETRIEVAL_BASE__) {
    return String(globalThis.__YUEQI_RETRIEVAL_BASE__).replace(/\/+$/, "");
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_RETRIEVAL_BASE) {
      return String(import.meta.env.VITE_RETRIEVAL_BASE).replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
  // Local/dev default — same host as companion server
  return "http://127.0.0.1:8787";
}

/**
 * @param {string} path
 * @param {object} body
 * @param {{ baseUrl?: string, timeoutMs?: number, signal?: AbortSignal, headers?: object }} [opts]
 */
async function postJson(path, body, opts = {}) {
  const base = resolveGatewayBase(opts);
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onOuterAbort, { once: true });
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(opts.headers && typeof opts.headers === "object" ? opts.headers : {}),
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        reason: data?.reason || data?.error || `http_${res.status}`,
        status: res.status,
        data,
      };
    }
    return data && typeof data === "object" ? data : { ok: false, reason: "invalid_response" };
  } catch (err) {
    const name = String(err?.name || "");
    if (name === "AbortError") {
      return { ok: false, reason: "timeout_or_cancelled" };
    }
    return { ok: false, reason: "network_error", error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Search via server gateway. Stub provider returns provider_unconfigured without a key.
 *
 * @param {string} query
 * @param {{ explicit?: boolean, baseUrl?: string, timeoutMs?: number, signal?: AbortSignal, skipCache?: boolean, ttlMs?: number }} [opts]
 */
export async function searchWeb(query, opts = {}) {
  const gate = mayRequestWeb({
    query,
    explicit: opts.explicit !== false,
    kind: "search",
  });
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, evidence: [], memoryPolicy: memoryWritePolicy() };
  }

  const cacheKey = `search:${gate.query}`;
  if (!opts.skipCache) {
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  const raw = await postJson(
    "/api/retrieval/search",
    { query: gate.query },
    opts,
  );

  if (!raw?.ok) {
    const fail = {
      ok: false,
      reason: raw?.reason || "search_failed",
      evidence: [],
      memoryPolicy: memoryWritePolicy(),
      provider: raw?.provider || null,
    };
    // Do not cache hard configuration failures forever — still short TTL ok for spam control
    if (raw?.reason === "provider_unconfigured") {
      cacheSet(cacheKey, fail, { ttlMs: opts.ttlMs ?? 15_000 });
    }
    return fail;
  }

  const evidence = normalizeEvidenceList(raw.results || raw.evidence || [], gate.query);
  const sourced = requireWebEvidenceSources(evidence);
  if (!sourced.ok) {
    return {
      ok: false,
      reason: sourced.reason,
      evidence: [],
      memoryPolicy: memoryWritePolicy(),
    };
  }

  const success = {
    ok: true,
    query: gate.query,
    evidence: sourced.evidence,
    memoryPolicy: memoryWritePolicy(),
    provider: raw.provider || "gateway",
  };
  cacheSet(cacheKey, success, { ttlMs: opts.ttlMs });
  return success;
}

/**
 * Fetch a single page via gateway (SSRF-checked server-side).
 *
 * @param {string} url
 * @param {{ query?: string, explicit?: boolean, baseUrl?: string, timeoutMs?: number, signal?: AbortSignal, skipCache?: boolean }} [opts]
 */
export async function fetchWebPage(url, opts = {}) {
  const target = String(url || "").trim();
  if (!target) return { ok: false, reason: "empty_url", evidence: [] };

  const gate = mayRequestWeb({
    query: opts.query || target,
    explicit: opts.explicit !== false,
    kind: "search",
  });
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, evidence: [] };
  }

  const cacheKey = `fetch:${target}`;
  if (!opts.skipCache) {
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  const raw = await postJson(
    "/api/retrieval/fetch",
    { url: target, query: gate.query },
    opts,
  );

  if (!raw?.ok) {
    return {
      ok: false,
      reason: raw?.reason || "fetch_failed",
      evidence: [],
      blocked: Boolean(raw?.blocked),
    };
  }

  const ev = createWebEvidenceV1({
    query: gate.query,
    title: raw.title || target,
    url: raw.url || target,
    excerpt: raw.excerpt || "",
    publisher: raw.publisher,
    publishedAt: raw.publishedAt,
    fetchedAt: raw.fetchedAt || new Date().toISOString(),
    contentHash: raw.contentHash,
    freshness: raw.freshness || "live",
  });
  const check = validateWebEvidenceV1(ev);
  if (!check.ok) {
    return { ok: false, reason: "invalid_evidence", errors: check.errors, evidence: [] };
  }

  const success = { ok: true, evidence: [ev], memoryPolicy: memoryWritePolicy() };
  cacheSet(cacheKey, success);
  return success;
}

function normalizeEvidenceList(rows, query) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const ev = createWebEvidenceV1({
      evidenceId: row.evidenceId,
      query: row.query || query,
      title: row.title,
      url: row.url,
      excerpt: row.excerpt || row.snippet || "",
      publisher: row.publisher,
      publishedAt: row.publishedAt,
      fetchedAt: row.fetchedAt,
      contentHash: row.contentHash,
      freshness: row.freshness || "unknown",
    });
    if (validateWebEvidenceV1(ev).ok) out.push(ev);
  }
  return out;
}

/** Test helper */
export function clearWebRetrievalClientCache() {
  cacheClear();
}

export { DEFAULT_TIMEOUT_MS };
