/**
 * Experience projection deep links + read-only archive resolution (DEL-05).
 * Frozen apps stay non-interactive; memory cards open archived summaries.
 */

import { projectionKindLabel } from "./projections-feed.js";

export const KIND_APP_IDS = Object.freeze({
  scroll: "scroll",
  story: "story",
  adventure: "adventure",
  cocreate: "cocreate",
  game: "game",
});

/**
 * @param {{ id?: string, kind?: string, meta?: object }} item
 */
export function experienceProjectionDeepLink(item) {
  const meta = item?.meta && typeof item.meta === "object" ? item.meta : {};
  const appId = String(meta.appId || KIND_APP_IDS[item?.kind] || item?.kind || "").trim();
  const entityId = String(meta.entityId || meta.runId || meta.sessionId || item?.characterId || "").trim();
  const projId = String(item?.id || meta.projId || "").trim();
  const artifactId = String(meta.artifactId || (projId ? `exp:${projId}` : "")).trim();
  if (!appId) return "";
  const params = new URLSearchParams();
  if (entityId) params.set("entityId", entityId);
  if (projId) params.set("projId", projId);
  if (artifactId) params.set("artifactId", artifactId);
  const qs = params.toString();
  return qs ? `yueqi://experience/${encodeURIComponent(appId)}?${qs}` : `yueqi://experience/${encodeURIComponent(appId)}`;
}

/**
 * @param {string} href
 */
export function parseExperienceDeepLink(href) {
  const raw = String(href || "").trim();
  if (!raw.startsWith("yueqi://experience/")) return { ok: false, reason: "not_experience" };
  try {
    const u = new URL(raw);
    const appId = decodeURIComponent(String(u.pathname || "").replace(/^\/+/, ""));
    if (!appId) return { ok: false, reason: "missing_appId" };
    return {
      ok: true,
      appId,
      entityId: String(u.searchParams.get("entityId") || "").trim(),
      projId: String(u.searchParams.get("projId") || "").trim(),
      artifactId: String(u.searchParams.get("artifactId") || "").trim(),
      raw,
    };
  } catch {
    return { ok: false, reason: "parse_failed" };
  }
}

/**
 * @param {{ kind?: string, summary?: string, meta?: object, characterId?: string }} item
 */
export async function resolveExperienceArchiveDetail(item) {
  const meta = item?.meta && typeof item.meta === "object" ? item.meta : {};
  const appId = String(meta.appId || KIND_APP_IDS[item?.kind] || item?.kind || "").trim();
  const entityId = String(meta.entityId || meta.runId || meta.sessionId || item?.characterId || "").trim();
  const kindLabel = projectionKindLabel(item?.kind);
  const base = {
    appId,
    entityId,
    kind: item?.kind || "",
    kindLabel,
    title: kindLabel,
    summary: String(item?.summary || "").trim(),
    body: String(item?.summary || "").trim(),
    frozen: true,
  };

  if (appId === "scroll" && entityId) {
    try {
      const { getCharacterScrollSession } = await import("../scroll/character-session.js");
      const session = getCharacterScrollSession(entityId);
      const ending = session?.ending;
      if (ending?.title || ending?.summary) {
        base.title = String(ending.title || kindLabel);
        base.body = [ending.title, ending.summary].filter(Boolean).join("\n\n");
      } else if (Array.isArray(session?.frames) && session.frames.length) {
        const last = session.frames.at(-1);
        base.body = String(last?.text || last?.caption || base.summary);
      }
    } catch {
      /* keep summary fallback */
    }
  } else if (appId === "story" && entityId) {
    try {
      const { STORY_STORE_KEY } = await import("../story/story-app.js");
      const raw = JSON.parse(window.localStorage.getItem(STORY_STORE_KEY) || "{}");
      const session = raw?.sessions?.[entityId];
      const last = Array.isArray(session?.messages)
        ? session.messages.filter((m) => m.role === "assistant").at(-1)
        : null;
      if (last?.content) base.body = String(last.content);
    } catch {
      /* keep summary fallback */
    }
  } else if (appId === "adventure" && entityId) {
    try {
      const { getAdventureRun } = await import("../adventure/store.js");
      const run = getAdventureRun(entityId);
      if (run?.title) base.title = String(run.title);
      const lastTurn = Array.isArray(run?.turns) ? run.turns.at(-1) : null;
      const narration = lastTurn?.narration || lastTurn?.output?.narration;
      if (narration) base.body = String(narration);
    } catch {
      /* keep summary fallback */
    }
  } else if (appId === "cocreate" && entityId) {
    try {
      const { getSession } = await import("../cocreate/session-store.js");
      const session = getSession(entityId);
      if (session?.title) base.title = String(session.title);
      const lastTurn = Array.isArray(session?.turns) ? session.turns.at(-1) : null;
      const text = lastTurn?.assistantText || lastTurn?.userText;
      if (text) base.body = String(text);
    } catch {
      /* keep summary fallback */
    }
  }

  return base;
}

/**
 * @param {{ id?: string, kind?: string, characterId?: string, summary?: string, meta?: object }} item
 */
export async function deliverExperienceProjection(item) {
  const companionId = String(item?.characterId || "").trim();
  if (!companionId || !item?.id) return { ok: false, reason: "missing_identity" };
  try {
    const { upsertArtifact, enqueueDelivery, artifactDeepLink } = await import("../artifacts/index.js");
    const artifactId = `exp:${item.id}`;
    const deepLink = artifactDeepLink(artifactId);
    const meta = item.meta && typeof item.meta === "object" ? { ...item.meta } : {};
    meta.projId = item.id;
    meta.kind = item.kind;
    meta.appId = meta.appId || KIND_APP_IDS[item.kind] || item.kind;
    const art = upsertArtifact({
      artifactId,
      companionId,
      type: "chapter",
      status: "ready",
      title: projectionKindLabel(item.kind),
      previewText: String(item.summary || "").slice(0, 120),
      deepLink,
      readyAt: new Date().toISOString(),
      meta,
    });
    if (!art.ok) return art;
    const channels = ["phone_today", "phone_badge", "pop", "system_notification"];
    for (const channel of channels) {
      enqueueDelivery({
        artifactId,
        channel,
        companionId,
        dedupeKey: `${artifactId}:${channel}`,
      });
    }
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("yueqi:experience-delivered", {
        detail: { artifactId, companionId, deepLink },
      }));
    }
    return { ok: true, artifactId, deepLink };
  } catch (error) {
    return { ok: false, reason: error?.message || "delivery_failed" };
  }
}
