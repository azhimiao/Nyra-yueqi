import { WORLD_CAPABILITIES } from "./schema.js";

/**
 * Future social platforms implement this read-only adapter. The page only
 * consumes normalized results, so platform-specific payloads never leak into UI.
 */
export class WorldPlatformAdapter {
  constructor({ id, name, capabilities = WORLD_CAPABILITIES } = {}) {
    this.id = id || "unknown";
    this.name = name || "Unknown Platform";
    this.capabilities = [...capabilities];
  }

  async listPosts(_options = {}) {
    throw new Error(`${this.name} does not implement listPosts`);
  }

  async getPost(_postId) {
    throw new Error(`${this.name} does not implement getPost`);
  }

  async searchPosts(_options = {}) {
    throw new Error(`${this.name} does not implement searchPosts`);
  }

  async getTrending(_options = {}) {
    throw new Error(`${this.name} does not implement getTrending`);
  }

  async getProfile(_authorId) {
    throw new Error(`${this.name} does not implement getProfile`);
  }

  async healthCheck() {
    return {
      ok: false,
      status: "preview",
      message: "平台尚未接入",
    };
  }
}

const adapterRegistry = new Map();

export function registerWorldAdapter(adapter) {
  if (!(adapter instanceof WorldPlatformAdapter)) {
    throw new TypeError("World adapter must extend WorldPlatformAdapter");
  }
  adapterRegistry.set(adapter.id, adapter);
  return adapter;
}

export function getWorldAdapter(platformId = "preview") {
  return adapterRegistry.get(platformId) || adapterRegistry.get("preview") || null;
}

export function listWorldAdapters() {
  return [...adapterRegistry.values()];
}
