/**
 * CompanionLifeSnapshot: fact-only life layer for Reality / Broker.
 * Only product-backed digital behavior. Estimates are labeled and optional.
 * Never invents offline life (逛街/上班).
 */

import { getLifeState } from "./life-state.js";
import { formatLifePromptSummary } from "../life/prompt.js";

/**
 * @param {{ companionId?: string, characterId?: string, locale?: string }} input
 */
export function buildCompanionLifeSnapshot(input = {}) {
  const companionId = String(input.companionId || input.characterId || "").trim();
  const locale = input.locale === "en" ? "en" : "zh-CN";
  if (!companionId) {
    return {
      companionId: "",
      mood: "",
      focus: "",
      intent: "",
      projects: [],
      unresolved: [],
      recentEvents: [],
      provenance: [],
      locale,
    };
  }

  const life = getLifeState(companionId);
  const provenance = [];
  const projects = [];
  for (const goal of life.currentGoals || []) {
    const text = String(goal || "").trim();
    if (!text) continue;
    projects.push(text);
    provenance.push({ kind: "project", source: "life_state.currentGoals", text });
  }

  const unresolved = [];
  for (const ev of life.pendingEvents || []) {
    const summary = typeof ev === "string" ? ev : (ev?.summary || ev?.text || "");
    const text = String(summary || "").trim();
    if (!text) continue;
    unresolved.push(text);
    provenance.push({
      kind: "relationship_event",
      source: "life_state.pendingEvents",
      text,
      status: "unresolved",
    });
  }

  const recentEvents = [];
  try {
    const summary = formatLifePromptSummary({ characterId: companionId, maxLines: 4 });
    for (const line of String(summary || "").split("\n")) {
      const t = line.trim();
      if (!t.startsWith("- ")) continue;
      const text = t.slice(2);
      recentEvents.push(text);
      provenance.push({ kind: "artifact", source: "life.prompt_summary", text });
    }
  } catch {
    /* optional */
  }

  const mood = String(life.currentMood || "").trim();
  // Mood from life-tick is an estimate, not a verified product fact.
  if (mood) {
    provenance.push({ kind: "estimate", source: "life_state.currentMood", text: mood });
  }

  return {
    companionId,
    mood,
    focus: projects[0] || "",
    intent: String(life.pendingActions?.[0]?.kind || life.pendingActions?.[0]?.type || "").trim(),
    projects: projects.slice(0, 4),
    unresolved: unresolved.slice(0, 4),
    recentEvents: recentEvents.slice(0, 4),
    provenance,
    locale,
    updatedAt: life.updatedAt || "",
  };
}

/**
 * Fact-only prompt block. Estimates are explicitly labeled.
 * @param {ReturnType<typeof buildCompanionLifeSnapshot>} snapshot
 * @param {{ locale?: string, maxLines?: number, includeEstimates?: boolean }} [opts]
 */
export function formatCompanionLifeSnapshotBlock(snapshot, opts = {}) {
  if (!snapshot?.companionId) return "";
  const locale = opts.locale === "en" || snapshot.locale === "en" ? "en" : "zh-CN";
  const maxLines = Math.max(1, Number(opts.maxLines) || 8);
  const includeEstimates = opts.includeEstimates === true;
  const lines = [];

  for (const e of snapshot.recentEvents || []) {
    if (lines.length >= maxLines) break;
    lines.push(locale === "en" ? `[artifact] ${e}` : `【作品事实】${e}`);
  }
  for (const p of snapshot.projects || []) {
    if (lines.length >= maxLines) break;
    lines.push(locale === "en" ? `[project] ${p}` : `【项目】${p}`);
  }
  for (const u of snapshot.unresolved || []) {
    if (lines.length >= maxLines) break;
    lines.push(locale === "en" ? `[unresolved] ${u}` : `【未决】${u}`);
  }
  if (includeEstimates && snapshot.mood && lines.length < maxLines) {
    lines.push(locale === "en"
      ? `[estimate] mood: ${snapshot.mood}`
      : `【估计·非事实】心情：${snapshot.mood}`);
  }

  if (!lines.length) return "";
  const header = locale === "en"
    ? "[Life snapshot — product facts only; estimates labeled; do not invent offline errands]"
    : "【生活快照 — 仅产品真实事实；估计已标注；禁止编造逛街/上班等线下生活】";
  return [header, ...lines.map((l) => `- ${l}`)].join("\n");
}
