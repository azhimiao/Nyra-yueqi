const DAY_MS = 86400000;

function evidenceDate(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  // YYYY-MM-DD represents the user's local calendar date, not midnight UTC.
  const day = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (day) {
    const [year, month, date] = day.slice(1).map(Number);
    const local = new Date(year, month - 1, date);
    if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== date) return null;
    return local;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function localDayNumber(date) {
  // Compare calendar dates in UTC after extracting local components: a
  // daylight-saving day can have 23 or 25 hours and still counts as one day.
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

export function togetherDaysFromAnniversary(anniversaryDate, now = Date.now()) {
  const start = evidenceDate(anniversaryDate);
  const today = evidenceDate(now);
  if (!start || !today || start > today) return null;
  return localDayNumber(today) - localDayNumber(start) + 1;
}

/**
 * Derive a relationship day count only from lived, character-scoped
 * evidence. Authored origin memories describe the character's canon and must
 * never make a brand-new relationship look older than it is.
 */
export function togetherDaysFromMemoryEvidence(records = [], characterId = "", now = Date.now()) {
  const cid = String(characterId || "").trim();
  const today = evidenceDate(now);
  if (!cid || !Array.isArray(records) || !today) return null;
  let first = null;
  for (const row of records) {
    if (!row || typeof row !== "object" || row.tombstone || row.invalidatedAt || row.deletedAt || row.quarantined) continue;
    const ref = row.sourceRef && typeof row.sourceRef === "object" ? row.sourceRef : {};
    const owners = [row.companionId, row.characterId, ref.companionId, ref.characterId]
      .map((value) => String(value || "").trim()).filter(Boolean);
    // Conflicting ownership is not evidence for either character.
    if (!owners.length || owners.some((owner) => owner !== cid)) continue;
    const provenance = [row.source, row.sourceType, row.authoredBy, row.truthDomain, row.authority,
      ref.source, ref.sourceType, ref.authoredBy, ref.truthDomain, ref.authority];
    if (provenance.some((value) => ["character.history", "authored_origin_memory", "character_author", "character_canon"].includes(value))) continue;
    if (Array.isArray(row.tags) && row.tags.some((tag) => ["authored-origin", "character-history"].includes(tag))) continue;
    if ([row.realityNamespace, ref.realityNamespace].some((value) => value && value !== "reality")) continue;
    if (!["chat.memory", "diary.memory", "manual.memory"].includes(row.source)) continue;
    // Do not use normalizeMemory here: its display fallback creates a
    // current timestamp for undated rows, which is not historical evidence.
    const created = evidenceDate(row.createdAt || row.diaryDay || row.when);
    if (!created || created > today) continue;
    if (!first || created < first) first = created;
  }
  return first ? localDayNumber(today) - localDayNumber(first) + 1 : null;
}

export function isAnniversaryToday(anniversaryDate, today = new Date()) {
  if (!anniversaryDate) return false;
  const start = evidenceDate(anniversaryDate);
  if (!start) return false;
  return start.getMonth() === today.getMonth() && start.getDate() === today.getDate();
}

export function anniversaryYearCount(anniversaryDate, today = new Date()) {
  if (!anniversaryDate) return 0;
  const start = evidenceDate(anniversaryDate);
  if (!start) return 0;
  let years = today.getFullYear() - start.getFullYear();
  const anniversaryThisYear = new Date(today.getFullYear(), start.getMonth(), start.getDate());
  if (today < anniversaryThisYear) years -= 1;
  return Math.max(1, years);
}

export function anniversaryEventForToday(anniversaryDate, label = "在一起") {
  if (!isAnniversaryToday(anniversaryDate)) return null;
  const years = anniversaryYearCount(anniversaryDate);
  return {
    title: `${label} ${years} 周年`,
    mode: "proactive_message",
    time: "09:00",
    date: new Date().toISOString().slice(0, 10),
    source: "anniversary",
    prompt: `今天是${label} ${years} 周年，到点后温柔提醒对方这件事。`,
  };
}
