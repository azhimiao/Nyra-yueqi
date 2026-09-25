/**
 * Tavily Search API provider (production-capable).
 * Docs: https://api.tavily.com/search
 * Key: TAVILY_API_KEY or YUEQI_WEB_SEARCH_API_KEY (server env only).
 */

import {
  clampMaxResults,
  normalizeEvidenceList,
  providerFailure,
  providerSuccess,
} from "./base.mjs";

export const TAVILY_PROVIDER_ID = "tavily";
export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveTavilyApiKey(env = process.env) {
  return String(
    env.TAVILY_API_KEY
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
export function createTavilyProvider(opts = {}) {
  const id = TAVILY_PROVIDER_ID;
  const endpoint = String(opts.endpoint || TAVILY_SEARCH_URL).trim();

  return {
    id,
    isConfigured(env = process.env) {
      return Boolean(opts.apiKey || resolveTavilyApiKey(env));
    },
    async search(query, searchOpts = {}) {
      const q = String(query || "").trim();
      if (!q) return providerFailure("empty_query", id);

      const env = searchOpts.env || process.env;
      const apiKey = String(opts.apiKey || resolveTavilyApiKey(env)).trim();
      if (!apiKey) {
        return providerFailure(
          "provider_unconfigured",
          id,
          "TAVILY_API_KEY (or YUEQI_WEB_SEARCH_API_KEY) not set",
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

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (searchOpts.signal) {
        if (searchOpts.signal.aborted) controller.abort();
        else {
          searchOpts.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
      }

      try {
        const res = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: apiKey,
            query: q,
            max_results: maxResults,
            include_answer: false,
            search_depth: "basic",
          }),
          signal: controller.signal,
        });

        if (res.status === 401 || res.status === 403) {
          return providerFailure(
            "provider_auth_failed",
            id,
            `Tavily auth failed (HTTP ${res.status})`,
          );
        }
        if (res.status === 429) {
          return providerFailure("provider_rate_limited", id, "Tavily rate limit exceeded");
        }
        if (!res.ok) {
          return providerFailure(
            "provider_http_error",
            id,
            `Tavily HTTP ${res.status}`,
          );
        }

        let data;
        try {
          data = await res.json();
        } catch {
          return providerFailure("provider_invalid_response", id, "Tavily response not JSON");
        }

        const rawHits = Array.isArray(data?.results) ? data.results : [];
        const mapped = rawHits.map((r) => ({
          title: r.title,
          url: r.url,
          excerpt: r.content || r.snippet,
          publishedAt: r.published_date,
        }));
        const results = normalizeEvidenceList(mapped, {
          query: q,
          provider: id,
          fetchedAt,
          maxResults,
          allowlistHostnames: searchOpts.allowlistHostnames,
        });
        return providerSuccess(id, results, { fetchedAt });
      } catch (err) {
        if (String(err?.name || "") === "AbortError") {
          return providerFailure("timeout", id, "Tavily search timed out");
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
