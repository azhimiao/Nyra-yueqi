/**
 * C6 — Permission-aware summary consumers for Pop / moments / diary / proactive.
 * Never expose privateFacts or unobserved discoverable content.
 */

import { listObservations, markObservationUsed, listDayPacks } from "./store.js";
import { formatLifePromptSummary, assertNoPrivateLeak } from "./prompt.js";
import { findSharedByRunId, listSharedLifeSummaries } from "./confluence.js";
import { listCohabitEvents } from "./bridge.js";
import { measureAppDensity } from "./projections.js";

export { findSharedByRunId };

/**
 * Prefer dense DayPack (TA phone / seed) over thin cohabit dual-write packs.
 */
function resolveConsumerPack(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return null;
  const packs = listDayPacks(cid, { limit: 60 });
  const dense = packs.find((p) => measureAppDensity(p).ok);
  if (dense) return dense;
  const withEvidence = packs.find((p) => (p.evidence || []).length >= 4);
  if (withEvidence) return withEvidence;
  return packs[0] || null;
}

/**
 * Pop / chat system context — limited life summary only.
 */
export function consumePopLifeSummary(characterId, { maxLines = 8 } = {}) {
  const pack = resolveConsumerPack(characterId);
  const block = formatLifePromptSummary({ characterId, pack, maxLines });
  const guard = assertNoPrivateLeak(block, pack);
  return {
    block,
    ok: guard.ok,
    leaked: guard.leaked,
  };
}

/**
 * Eligible observation → Pop limited reaction text (once).
 * Marks reactionState used after consumption.
 */
export function consumePopObservationReaction(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return { ok: false, text: "", evidenceId: "" };

  const pack = resolveConsumerPack(cid);
  const observations = listObservations(cid, { limit: 100 }).filter(
    (o) => o.reactionState === "eligible",
  );
  if (!observations.length || !pack) {
    return { ok: false, text: "", evidenceId: "" };
  }

  for (const obs of observations) {
    const evidence = (pack.evidence || []).find((e) => e.id === obs.evidenceId);
    if (!evidence || evidence.discoverable === false) continue;

    const title = String(evidence.title || "那条痕迹").slice(0, 28);
    const hint = String(evidence.content || "").replace(/\s+/g, " ").slice(0, 36);
    const text = hint
      ? `你刚刚在我手机里看到「${title}」了吧……${hint}`
      : `你刚刚在我手机里翻到「${title}」了吧。`;

    const linkedEvents = (pack.events || []).filter(
      (ev) => (ev.evidenceIds || []).includes(evidence.id),
    );
    let leaked = false;
    for (const ev of linkedEvents) {
      if (ev.visibility !== "private") continue;
      for (const fact of ev.privateFacts || []) {
        if (fact && text.includes(fact)) leaked = true;
      }
    }
    if (leaked) continue;

    markObservationUsed(cid, evidence.id);
    return { ok: true, text: text.slice(0, 120), evidenceId: evidence.id, title };
  }

  return { ok: false, text: "", evidenceId: "" };
}

/**
 * Moments feed candidates from shared life only (no privateFacts).
 */
export function consumeMomentsFromLife(characterId, { limit = 6 } = {}) {
  const cid = String(characterId || "").trim();
  const pack = resolveConsumerPack(cid);
  const rows = listSharedLifeSummaries(cid, { limit });
  const moments = rows.map((row) => ({
    id: `life-moment-${row.id}`,
    authorType: "character",
    authorId: cid,
    content: String(row.summary || "").slice(0, 280),
    createdAt: row.occurredAt,
    characterGenerated: true,
    source: "life",
  }));

  if (!moments.length && pack) {
    for (const ev of pack.events || []) {
      if (ev.visibility !== "shared") continue;
      moments.push({
        id: `life-moment-${ev.id}`,
        authorType: "character",
        authorId: cid,
        content: String(ev.summary || "").slice(0, 280),
        createdAt: ev.occurredAt,
        characterGenerated: true,
        source: "life",
      });
      if (moments.length >= limit) break;
    }
  }

  const block = moments.map((m) => m.content).join("\n");
  const guard = assertNoPrivateLeak(block, pack);
  return { ok: guard.ok, moments: guard.ok ? moments : [], leaked: guard.leaked };
}

function isDiarySharedRow(row = {}) {
  const t = String(row.type || row.kind || "");
  const summary = String(row.summary || "");
  return (
    t === "finale"
    || t === "publish"
    || t === "observation"
    || /谢幕|共创|情景剧/.test(summary)
  );
}

function titleForSharedRow(row = {}) {
  const t = String(row.type || row.kind || "");
  const summary = String(row.summary || "");
  if (t === "finale" || /谢幕|情景剧/.test(summary)) {
    return "共同经历 · 情景剧";
  }
  if (t === "publish" || /共创/.test(summary)) {
    return "共同经历 · 共创";
  }
  if (t === "observation" || /在 TA 的手机/.test(summary)) {
    return "TA 的手机";
  }
  return "共同经历";
}

/**
 * Diary-facing shared experiences (scenario finales, cocreate, etc.).
 * Includes type/kind `finale` and summaries containing 谢幕.
 */
export function consumeDiarySharedExperiences(characterId, { limit = 12 } = {}) {
  const cid = String(characterId || "").trim();
  const pack = resolveConsumerPack(cid);
  const seen = new Set();
  const rows = [];

  for (const row of listSharedLifeSummaries(cid, { limit: 40 })) {
    if (!isDiarySharedRow(row)) continue;
    const key = String(row.runId || row.id || "");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    rows.push(row);
  }

  // Fallback: cohabit timeline may have the finale before / without DayPack projection.
  if (cid) {
    for (const event of listCohabitEvents({ characterId: cid, limit: 40 })) {
      const row = {
        id: event.id,
        occurredAt: event.at,
        type: event.kind || "",
        kind: event.kind || "",
        summary: event.summary,
        source: "cohabit",
        runId: String(event.meta?.runId || "").trim(),
        diaryId: String(event.meta?.diaryId || "").trim(),
        meta: event.meta || {},
      };
      if (!isDiarySharedRow(row)) continue;
      const key = String(row.runId || row.id || "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      rows.push(row);
    }
  }

  const items = rows.slice(0, Math.max(1, Number(limit) || 12)).map((row) => ({
    id: row.id,
    title: titleForSharedRow(row),
    body: row.summary,
    at: row.occurredAt,
    runId: String(row.runId || row.meta?.runId || "").trim(),
    eventId: String(row.id || "").trim(),
    diaryId: String(row.diaryId || row.meta?.diaryId || "").trim(),
  }));
  const block = items.map((i) => i.body).join("\n");
  const guard = assertNoPrivateLeak(block, pack);
  return { ok: guard.ok, items: guard.ok ? items : [], leaked: guard.leaked };
}

/**
 * Proactive message context line — permission-filtered.
 */
export function consumeProactiveLifeContext(characterId) {
  const { block, ok, leaked } = consumePopLifeSummary(characterId, { maxLines: 4 });
  if (!ok || !block) return { ok, line: "", leaked };
  const line = block
    .split("\n")
    .filter((l) => l.startsWith("-"))
    .slice(0, 3)
    .join(" ");
  return { ok: true, line: line.slice(0, 200), leaked };
}
