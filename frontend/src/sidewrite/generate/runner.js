import { callModel } from "../../model/client.js";
import { APP_KEYS } from "../constants.js";
import { getOrCreateManifest, saveManifest } from "../manifest-store.js";
import { getPayload, setPayload } from "../payload-store.js";
import { degradePayload, validateSidewritePayload } from "../schema/validate.js";
import { buildGenerateMessages, extractJsonObject } from "./prompts.js";

/** @type {Map<string, Promise<object>>} */
const inflight = new Map();

async function loadFixture(appKey) {
  const { FIXTURES_BY_APP } = await import("../fixtures/index.js");
  return degradePayload(appKey, FIXTURES_BY_APP[appKey] || null);
}

/**
 * @param {string} characterId
 * @param {string} appKey
 * @param {{
 *   character?: { name?: string, alias?: string, profileSummary?: string },
 *   collectProviderConfig?: () => { baseUrl?: string, apiKey?: string, model?: string, kind?: string },
 *   useFixtureIfNoProvider?: boolean,
 *   onStatus?: (status: string) => void,
 * }} [opts]
 */
export async function generateAppPayload(characterId, appKey, opts = {}) {
  const cid = String(characterId || "").trim();
  const key = String(appKey || "").trim();
  if (!cid || !APP_KEYS.includes(key)) {
    return { ok: false, error: "bad_args", payload: degradePayload(key) };
  }

  const flightKey = `${cid}:${key}`;
  if (inflight.has(flightKey)) return inflight.get(flightKey);

  const run = (async () => {
    opts.onStatus?.("generating");
    const manifest = await getOrCreateManifest(cid);
    manifest.apps[key] = {
      ...(manifest.apps[key] || {}),
      status: "generating",
      error: null,
    };
    manifest.generationStatus = "generating";
    await saveManifest(manifest);

    const provider = await Promise.resolve(opts.collectProviderConfig?.() || null);
    const hasProvider = Boolean(provider?.baseUrl && provider?.apiKey && provider?.model);

    let raw = null;
    let lastError = null;

    if (hasProvider) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const messages = buildGenerateMessages(key, opts.character || {});
          const result = await callModel(provider, messages, {
            stream: false,
            temperature: 0.7,
            businessPurpose: `creative.sidewrite_${key}`,
            capability: "chat",
            companionId: opts.character?.id || "",
          });
          raw = extractJsonObject(result?.content || "");
          const validated = validateSidewritePayload(key, raw);
          if (validated.ok) {
            raw = validated.value;
            break;
          }
          lastError = validated.reason || "validate_fail";
          raw = null;
        } catch (error) {
          lastError = String(error?.message || error || "generate_fail").slice(0, 200);
          raw = null;
        }
      }
    }

    if (!raw && (opts.useFixtureIfNoProvider !== false)) {
      raw = await loadFixture(key);
      lastError = hasProvider ? lastError : null;
    }

    if (!raw) {
      const failed = await getOrCreateManifest(cid);
      failed.apps[key] = {
        ...(failed.apps[key] || {}),
        status: "failed",
        error: lastError || "生成失败，稍后再试",
      };
      failed.generationStatus = "failed";
      failed.generationError = lastError || "生成失败，稍后再试";
      await saveManifest(failed);
      opts.onStatus?.("failed");
      return { ok: false, error: lastError || "failed", payload: degradePayload(key) };
    }

    const payload = await setPayload(cid, key, raw);
    const ready = await getOrCreateManifest(cid);
    ready.apps[key] = {
      status: "ready",
      generatedAt: new Date().toISOString(),
      checksum: null,
      error: null,
    };
    const statuses = APP_KEYS.map((k) => ready.apps[k]?.status);
    if (statuses.every((s) => s === "ready")) ready.generationStatus = "ready";
    else if (statuses.some((s) => s === "ready")) ready.generationStatus = "partial";
    else ready.generationStatus = "idle";
    ready.generationError = null;
    await saveManifest(ready);
    opts.onStatus?.("ready");
    return { ok: true, payload, fromFixture: !hasProvider };
  })();

  inflight.set(flightKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(flightKey);
  }
}

/**
 * Ensure payload exists: return stored, else null (caller shows empty shell).
 */
export async function ensurePayloadOrEmpty(characterId, appKey) {
  return getPayload(characterId, appKey);
}
