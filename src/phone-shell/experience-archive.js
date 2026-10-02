/**
 * Read-only archive census/export for frozen experience apps (P0).
 * Does not delete user content.
 */

import { ARCHIVED_EXPERIENCE_APPS } from "./app-registry.js";
import { loadScrollState } from "../scroll/store.js";
import { loadAdventureBag, exportAdventureBag } from "../adventure/store.js";
import { listDrafts, exportCocreateBag } from "../cocreate/store.js";
import { listSessions } from "../cocreate/session-store.js";

function safeCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function scrollSummary() {
  try {
    const state = loadScrollState() || {};
    const sessions = state.sessions && typeof state.sessions === "object" ? state.sessions : {};
    const works = Object.keys(sessions);
    let eventCount = 0;
    for (const workId of works) {
      eventCount += safeCount(sessions[workId]?.events);
    }
    return {
      appId: "scroll",
      label: "漫卷",
      ok: true,
      workCount: works.length,
      eventCount,
      hasContent: works.length > 0,
    };
  } catch (error) {
    return { appId: "scroll", label: "漫卷", ok: false, error: error?.message || "read_failed", hasContent: false };
  }
}

function adventureSummary() {
  try {
    const bag = loadAdventureBag() || {};
    const runs = Array.isArray(bag.runs) ? bag.runs : [];
    return {
      appId: "adventure",
      label: "冒险",
      ok: true,
      runCount: runs.length,
      activeRunId: bag.activeRunId || "",
      hasContent: runs.length > 0,
    };
  } catch (error) {
    return { appId: "adventure", label: "冒险", ok: false, error: error?.message || "read_failed", hasContent: false };
  }
}

function cocreateSummary() {
  try {
    const drafts = typeof listDrafts === "function" ? listDrafts() : [];
    let sessions = [];
    try {
      sessions = typeof listSessions === "function" ? listSessions() : [];
    } catch {
      sessions = [];
    }
    return {
      appId: "cocreate",
      label: "共创",
      ok: true,
      draftCount: Array.isArray(drafts) ? drafts.length : 0,
      sessionCount: Array.isArray(sessions) ? sessions.length : 0,
      hasContent: (drafts?.length || 0) + (sessions?.length || 0) > 0,
    };
  } catch (error) {
    return { appId: "cocreate", label: "共创", ok: false, error: error?.message || "read_failed", hasContent: false };
  }
}

function theaterSummary() {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem("yueqi.theater.v1") || localStorage.getItem("yueqi.scenario.v1")
      : null;
    const parsed = raw ? JSON.parse(raw) : null;
    const keys = parsed && typeof parsed === "object" ? Object.keys(parsed) : [];
    return {
      appId: "theater",
      label: "舞台/情景",
      ok: true,
      recordKeys: keys.length,
      hasContent: keys.length > 0,
    };
  } catch (error) {
    return { appId: "theater", label: "舞台/情景", ok: false, error: error?.message || "read_failed", hasContent: false };
  }
}

/**
 * @returns {{
 *   frozenAt: string,
 *   apps: object[],
 *   totalWithContent: number,
 *   archivedIds: string[],
 * }}
 */
export function censusExperienceArchives() {
  const apps = [
    scrollSummary(),
    adventureSummary(),
    cocreateSummary(),
    theaterSummary(),
  ];
  return {
    frozenAt: new Date().toISOString(),
    archivedIds: [...ARCHIVED_EXPERIENCE_APPS],
    apps,
    totalWithContent: apps.filter((row) => row.hasContent).length,
    policy: "read_only_archive — content is not deleted; interactive entry frozen",
  };
}

/**
 * Export a JSON blob for user backup / later migration.
 */
export function exportExperienceArchiveBundle() {
  const census = censusExperienceArchives();
  let adventure = null;
  let cocreate = null;
  let scroll = null;
  try {
    adventure = typeof exportAdventureBag === "function" ? exportAdventureBag() : loadAdventureBag();
  } catch {
    adventure = null;
  }
  try {
    cocreate = typeof exportCocreateBag === "function" ? exportCocreateBag() : null;
  } catch {
    cocreate = null;
  }
  try {
    scroll = loadScrollState();
  } catch {
    scroll = null;
  }
  return {
    kind: "yueqi.experience-archive.v1",
    exportedAt: new Date().toISOString(),
    census,
    payloads: {
      scroll,
      adventure,
      cocreate,
    },
  };
}

export function downloadExperienceArchiveBundle() {
  const bundle = exportExperienceArchiveBundle();
  const text = JSON.stringify(bundle, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yueqi-experience-archive-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, bytes: text.length, totalWithContent: bundle.census.totalWithContent };
}
