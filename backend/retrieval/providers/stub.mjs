/**
 * Stub search provider — always fails honestly (never invents sources).
 */

import { providerFailure } from "./base.mjs";

export const STUB_PROVIDER_ID = "stub";

/**
 * @returns {import("./base.mjs").SearchProvider}
 */
export function createStubProvider() {
  return {
    id: STUB_PROVIDER_ID,
    isConfigured() {
      return false;
    },
    async search(_query, _opts = {}) {
      return providerFailure(
        "provider_unconfigured",
        STUB_PROVIDER_ID,
        "Search provider stub — set YUEQI_WEB_PROVIDER to brave|tavily and configure API key",
      );
    },
  };
}
