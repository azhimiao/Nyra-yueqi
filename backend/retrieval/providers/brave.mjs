/**
 * Brave Search API provider (production-capable).
 * Docs: https://api.search.brave.com/res/v1/web/search
 * Key: BRAVE_API_KEY or YUEQI_WEB_SEARCH_API_KEY (server env only).
 */

import {
  clampMaxResults,
  normalizeEvidenceList,
  providerFailure,
  providerSuccess,
} from "./base.mjs";

export const BRAVE_PROVIDER_ID = "brave";
export const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveBraveApiKey(env = process.env) {
  return String(
    env.BRAVE_API_KEY
    || env.YUEQI_WEB_SEARCH_API_KEY
    || env.WEB_SEARCH_API_KEY
    || "",
  ).trim();
}

/**
 * @param {{
 *   apiKey?: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   endpoint?: string,
 * }} [opts]
 * @returns {import("./base.mjs").SearchProvider}
 */
export function createBraveProvider(opts = {}) {
  const id = BRAVE_PROVIDER_ID;
  const endpoint = String(opts.endpoint || BRAVE_SEARCH_URL).trim();

  return {
    id,
    isConfigured(env = process.env) {
      return Boolean(opts.apiKey || resolveBraveApiKey(env));
    },
    async search(query, searchOpts = {}) {
      const q = String(query || "").trim();
      if (!q) return providerFailure("empty_query", id);

      const env = searchOpts.env || process.env;
      const apiKey = String(opts.apiKey || resolveBraveApiKey(env)).trim();
      if (!apiKey) {
        return providerFailure(
          "provider_unconfigured",
          id,
          "BRAVE_API_KEY (or YUEQI_WEB_SEARCH_API_KEY) not set",
        );
      }

      const fetchImpl = searchOpts.fetchImpl || opts.fetchImpl || globalThis.fetch;
      if (typeof fetchImpl !== "function") {
        return providerFailure("fetch_unavailable", id);
      }

      const timeoutMs = Number(searchOpts.timeoutMs || opts.timeoutMs) > 0
        ? Number(searchOpts.timeoutMs || opts.timeoutMs)
        : DEFAULT_TIMEOUT_MS;
      const maxResults = clampMaxResults(searchOpts.maxResults);
      const fetchedAt = new Date().toISOString();

      const url = new URL(endpoint);
      url.searchParams.set("q", q);
      url.searchParams.set("count", String(maxResults));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (searchOpts.signal) {
        if (searchOpts.signal.aborted) controller.abort();
        else {
          searchOpts.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
      }

      try {
        const res = await fetchImpl(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": apiKey,
          },
          signal: controller.signal,
        });

        if (res.status === 401 || res.status === 403) {
          return providerFailure(
            "provider_auth_failed",
            id,
            `Brave auth failed (HTTP ${res.status})`,
          );
        }
        if (res.status === 429) {
          return providerFailure("provider_rate_limited", id, "Brave rate limit exceeded");
        }
        if (!res.ok) {
          return providerFailure(
            "provider_http_error",
            id,
            `Brave HTTP ${res.status}`,
          );
        }

        let data;
        try {
          data = await res.json();
        } catch {
          return providerFailure("provider_invalid_response", id, "Brave response not JSON");
        }

        const rawHits = Array.isArray(data?.web?.results) ? data.web.results : [];
        const results = normalizeEvidenceList(rawHits, {
          query: q,
          provider: id,
          fetchedAt,
          maxResults,
          allowlistHostnames: searchOpts.allowlistHostnames,
        });
        return providerSuccess(id, results, { fetchedAt });
      } catch (err) {
        if (String(err?.name || "") === "AbortError") {
          return providerFailure("timeout", id, "Brave search timed out");
        }
        return providerFailure(
          "provider_error",
          id,
          String(err?.message || err),
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
