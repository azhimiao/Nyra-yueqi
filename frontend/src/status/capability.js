import { listMcpCards } from "../integrations/registry.js";
import { t } from "../i18n/index.js";
import { isManagedProductMode, readProductAccess } from "../account/product-access.js";

export const CAPABILITY_TOTAL = 8;

/**
 * Score bits (8): model · voice · sync · 5 MCP grants
 */
export function scoreCapabilities({
  modelConfigured = false,
  voiceConfigured = false,
  syncReady = false,
  grants = {},
} = {}) {
  const mcp = listMcpCards().map((card) => Boolean(grants[card.id]));
  const bits = [
    Boolean(modelConfigured),
    Boolean(voiceConfigured),
    Boolean(syncReady),
    ...mcp,
  ].slice(0, CAPABILITY_TOTAL);
  while (bits.length < CAPABILITY_TOTAL) bits.push(false);
  return {
    ready: bits.filter(Boolean).length,
    total: CAPABILITY_TOTAL,
    bits,
  };
}

export function resolveCapabilityLabel({
  modelConfigured = false,
  serverOnline = false,
  localOfflineSession = false,
} = {}) {
  if (!modelConfigured) {
    return { key: "capability.needsKey", kind: "needs_key" };
  }
  // Offline BYOK talks to the provider directly. 8787 being down is not a
  // chat outage and must not read as "local service offline".
  if (serverOnline || localOfflineSession) {
    return { key: "capability.online", kind: "online" };
  }
  return { key: "capability.serviceOffline", kind: "service_offline" };
}

export function formatCapabilityStatus(score, label) {
  const text = label?.text || t(label?.key || "capability.online");
  return `${text} · ${score.ready}/${score.total}`;
}

export function isModelConfigured(config = {}) {
  if (isManagedProductMode()) return readProductAccess().loggedIn;
  return Boolean(
    String(config.baseUrl || "").trim()
    && String(config.apiKey || "").trim()
    && String(config.model || "").trim()
  );
}

export function isSyncReady(ecosystem = {}, sync = {}) {
  if (ecosystem.cloudSave && ecosystem.token && !String(ecosystem.token).startsWith("local-")) {
    return true;
  }
  return Boolean(sync.lastSyncedAt);
}

/**
 * Build a short life-context line for the chat parameter strip.
 */
export function buildLifeContextLine({
  nowPlaying = null,
  eventsToday = [],
  albumCount = 0,
  grants = {},
} = {}) {
  const parts = [];
  if (grants.music && nowPlaying?.title) {
    parts.push(`${t("capability.nowPlaying")}: ${nowPlaying.title}`);
  }
  if (grants.calendar && eventsToday.length) {
    parts.push(t("capability.eventsToday", { count: eventsToday.length }));
  }
  if (grants.album && albumCount > 0) {
    parts.push(t("capability.albumCount", { count: albumCount }));
  }
  return parts.length ? parts.join(" · ") : t("capability.lifeIdle");
}
