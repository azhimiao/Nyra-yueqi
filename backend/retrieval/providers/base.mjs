/**
 * Web search Provider interface (C4 / plan §10).
 *
 * Contract:
 *   search(query, opts) → Promise<ProviderSearchResult>
 *
 * ProviderSearchResult (success):
 *   { ok: true, provider, results: WebEvidenceLike[], fetchedAt }
 *
 * ProviderSearchResult (failure):
 *   { ok: false, provider, reason, message? }
 *
 * WebEvidence-like row fields:
 *   title, url, excerpt, publishedAt?, publisher?, fetchedAt, freshness?, provider?
 *
 * Providers must NEVER invent sources. Empty/missing key → honest failure.
 */

import { createHash } from "node:crypto";
import { validateFetchUrl } from "../ssrf.js";

export const MAX_RESULTS_HARD_CAP = 10;
export const DEFAULT_MAX_RESULTS = 5;

/**
 * @typedef {object} WebEvidenceLike
 * @property {string} title
 * @property {string} url
 * @property {string} excerpt
 * @property {string} [publishedAt]
 * @property {string} [publisher]
 * @property {string} fetchedAt
 * @property {string} [freshness]
 * @property {string} [provider]
 * @property {string} [query]
 * @property {string} [contentHash]
 * @property {string} [evidenceId]
 */

/**
 * @typedef {object} ProviderSearchSuccess
 * @property {true} ok
 * @property {string} provider
 * @property {WebEvidenceLike[]} results
 * @property {string} fetchedAt
 */

/**
 * @typedef {object} ProviderSearchFailure
 * @property {false} ok
 * @property {string} provider
 * @property {string} reason
 * @property {string} [message]
 */

/**
 * @typedef {ProviderSearchSuccess | ProviderSearchFailure} ProviderSearchResult
 */

/**
 * @typedef {object} SearchProvider
 * @property {string} id
 * @property {(env?: NodeJS.ProcessEnv) => boolean} isConfigured
 * @property {(query: string, opts?: object) => Promise<ProviderSearchResult>} search
 */

/**
 * @param {string} reason
 * @param {string} provider
 * @param {string} [message]
 * @returns {ProviderSearchFailure}
 */
export function providerFailure(reason, provider, message = "") {
  const out = {
    ok: false,
    provider: String(provider || "unknown"),
    reason: String(reason || "provider_error"),
  };
  if (message) out.message = String(message);
  return out;
}

/**
 * @param {string} provider
 * @param {WebEvidenceLike[]} results
 * @param {{ fetchedAt?: string }} [meta]
 * @returns {ProviderSearchSuccess | ProviderSearchFailure}
 */
export function providerSuccess(provider, results, meta = {}) {
  const list = Array.isArray(results) ? results.filter(Boolean) : [];
  if (list.length === 0) {
    return providerFailure(
      "no_source",
      provider,
      "Provider returned zero usable sources",
    );
  }
  const fetchedAt = String(meta.fetchedAt || new Date().toISOString());
  return {
    ok: true,
    provider: String(provider || "unknown"),
    results: list,
    fetchedAt,
  };
}

/**
 * Normalize a raw search hit into a WebEvidence-like row.
 * Drops rows with invalid/blocked URLs (SSRF / empty).
 *
 * @param {object} row
 * @param {{ query: string, provider: string, fetchedAt?: string, allowlistHostnames?: string[] }} ctx
 * @returns {WebEvidenceLike | null}
 */
export function normalizeEvidenceRow(row, ctx) {
  if (!row || typeof row !== "object") return null;
  const url = String(row.url || row.link || "").trim();
  if (!url) return null;

  const urlCheck = validateFetchUrl(url, {
    allowlistHostnames: ctx.allowlistHostnames || [],
  });
  if (!urlCheck.ok) return null;

  const title = String(row.title || row.name || "").trim() || urlCheck.url.hostname;
  const excerpt = String(
    row.excerpt || row.snippet || row.description || row.content || "",
  ).trim();
  if (!excerpt && !title) return null;

  const fetchedAt = String(ctx.fetchedAt || new Date().toISOString());
  const publishedAt = String(
    row.publishedAt || row.published_at || row.age || row.page_age || "",
  ).trim();
  const publisher = String(
    row.publisher || row.source || urlCheck.url.hostname || "",
  ).trim();
  const query = String(ctx.query || row.query || "").trim();
  const contentHash = createHash("sha256")
    .update(`${url}\n${title}\n${excerpt}`)
    .digest("hex")
    .slice(0, 32);
  const evidenceId = `wev_${createHash("sha256")
    .update(`${url}|${fetchedAt}|${query}`)
    .digest("hex")
    .slice(0, 16)}`;

  /** @type {WebEvidenceLike} */
  const out = {
    evidenceId,
    query,
    title: title.slice(0, 300),
    url: urlCheck.url.toString(),
    excerpt: (excerpt || title).slice(0, 800),
    fetchedAt,
    contentHash,
    freshness: ["live", "recent", "archival", "unknown"].includes(row.freshness)
      ? row.freshness
      : "live",
    provider: String(ctx.provider || row.provider || "").trim() || undefined,
  };
  if (publisher) out.publisher = publisher.slice(0, 200);
  if (publishedAt) out.publishedAt = publishedAt.slice(0, 64);
  return out;
}

/**
 * @param {unknown[]} rows
 * @param {{ query: string, provider: string, fetchedAt?: string, maxResults?: number, allowlistHostnames?: string[] }} ctx
 * @returns {WebEvidenceLike[]}
 */
export function normalizeEvidenceList(rows, ctx) {
  const max = Math.min(
    Math.max(1, Number(ctx.maxResults) || DEFAULT_MAX_RESULTS),
    MAX_RESULTS_HARD_CAP,
  );
  const fetchedAt = String(ctx.fetchedAt || new Date().toISOString());
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const norm = normalizeEvidenceRow(row, { ...ctx, fetchedAt });
    if (norm) out.push(norm);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Clamp max results from opts/env.
 * @param {unknown} value
 */
export function clampMaxResults(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_RESULTS;
  return Math.min(Math.floor(n), MAX_RESULTS_HARD_CAP);
}
