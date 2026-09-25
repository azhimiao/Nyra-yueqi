/**
 * Provider registry — select by YUEQI_WEB_PROVIDER (or legacy YUEQI_WEB_SEARCH_PROVIDER).
 * Unknown providers fail honestly; never invent results.
 */

import { providerFailure } from "./base.mjs";
import { createStubProvider, STUB_PROVIDER_ID } from "./stub.mjs";
import { createBraveProvider, BRAVE_PROVIDER_ID, resolveBraveApiKey } from "./brave.mjs";
import { createTavilyProvider, TAVILY_PROVIDER_ID, resolveTavilyApiKey } from "./tavily.mjs";

export {
  STUB_PROVIDER_ID,
  BRAVE_PROVIDER_ID,
  TAVILY_PROVIDER_ID,
  resolveBraveApiKey,
  resolveTavilyApiKey,
};

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveProviderId(env = process.env) {
  const raw = String(
    env.YUEQI_WEB_PROVIDER
    || env.YUEQI_WEB_SEARCH_PROVIDER
    || STUB_PROVIDER_ID,
  ).trim().toLowerCase();
  return raw || STUB_PROVIDER_ID;
}

/**
 * Whether the selected provider has a usable API key.
 * Stub is never "configured" for search success.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getSearchProviderStatus(env = process.env) {
  const provider = resolveProviderId(env);
  if (provider === STUB_PROVIDER_ID || provider === "none") {
    return { configured: false, provider, hasKey: false };
  }
  if (provider === BRAVE_PROVIDER_ID) {
    const hasKey = Boolean(resolveBraveApiKey(env));
    return { configured: hasKey, provider, hasKey };
  }
  if (provider === TAVILY_PROVIDER_ID) {
    const hasKey = Boolean(resolveTavilyApiKey(env));
    return { configured: hasKey, provider, hasKey };
  }
  // Unknown provider name — treat as unconfigured (no fake results)
  const legacyKey = String(
    env.YUEQI_WEB_SEARCH_API_KEY || env.WEB_SEARCH_API_KEY || env.BING_SEARCH_API_KEY || "",
  ).trim();
  return { configured: false, provider, hasKey: Boolean(legacyKey) };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   providerId?: string,
 * }} [opts]
 * @returns {import("./base.mjs").SearchProvider}
 */
export function selectSearchProvider(opts = {}) {
  const env = opts.env || process.env;
  const id = String(opts.providerId || resolveProviderId(env)).trim().toLowerCase()
    || STUB_PROVIDER_ID;

  if (id === STUB_PROVIDER_ID || id === "none") {
    return createStubProvider();
  }
  if (id === BRAVE_PROVIDER_ID) {
    return createBraveProvider({ fetchImpl: opts.fetchImpl });
  }
  if (id === TAVILY_PROVIDER_ID) {
    return createTavilyProvider({ fetchImpl: opts.fetchImpl });
  }

  // Unknown → stub-like failure wrapper (do not call external APIs)
  return {
    id,
    isConfigured() {
      return false;
    },
    async search() {
      return providerFailure(
        "provider_unconfigured",
        id,
        `Search provider "${id}" not implemented — use stub|brave|tavily`,
      );
    },
  };
}
