/**
 * Match chat cues like「那张雨夜的」against album title / summary.
 */

const RECALL_RE = /那张(.{0,24}?)(?:的|照片|图|图片|相片)?(?:呢|吗|呀|啊|嘛)?[？?！!。.\s]*$/;
const RECALL_PREFIX = /(?:看看|看看那张|记得|还记得|翻到|找找)?那张/;

export function isPhotoRecallQuery(query = "") {
  const text = String(query || "").trim();
  if (!text) return false;
  return /那张/.test(text) || /看看那[张幅]/.test(text);
}

export function extractPhotoRecallCue(query = "") {
  const text = String(query || "").trim();
  if (!text) return "";
  const matched = text.match(RECALL_RE);
  if (matched?.[1]) return matched[1].replace(/[的地得]$/, "").trim();
  const loose = text.replace(RECALL_PREFIX, "").replace(/[？?！!。.\s]+$/g, "").trim();
  return loose.slice(0, 24);
}

function scorePhoto(photo, cue) {
  if (!cue) return 0;
  const title = String(photo.title || "");
  const summary = String(photo.summary || "");
  const blob = `${title} ${summary}`;
  if (!blob.trim()) return 0;
  if (title.includes(cue) || summary.includes(cue)) return 100 + cue.length;
  // char overlap for short Chinese cues
  let hits = 0;
  for (const ch of cue) {
    if (/\s/.test(ch)) continue;
    if (blob.includes(ch)) hits += 1;
  }
  const ratio = hits / Math.max(1, [...cue].filter((ch) => !/\s/.test(ch)).length);
  return ratio >= 0.5 ? Math.round(ratio * 80) : 0;
}

export function matchPhotoRecall(query, photos = []) {
  if (!isPhotoRecallQuery(query)) return null;
  const cue = extractPhotoRecallCue(query);
  if (!cue && !/那张/.test(query)) return null;

  let best = null;
  let bestScore = 0;
  for (const photo of photos || []) {
    const score = scorePhoto(photo, cue || String(photo.title || "").slice(0, 2));
    // Without a cue, prefer photos that have a summary when user just says「那张」
    const fallback = !cue && photo.summary ? 10 : 0;
    const finalScore = Math.max(score, fallback);
    if (finalScore > bestScore) {
      bestScore = finalScore;
      best = photo;
    }
  }
  if (!best || bestScore < 10) return null;
  return {
    photo: best,
    cue,
    score: bestScore,
    summary: best.summary || best.title || "",
  };
}

export function formatPhotoRecallContextLine(hit) {
  if (!hit?.photo) return "";
  const title = hit.photo.title || "图片";
  const summary = hit.summary || hit.photo.summary || "";
  return summary
    ? `相册回忆命中：${title} — ${summary}`
    : `相册回忆命中：${title}`;
}

/** Fixed eval helper used by verify:x4 */
export function evalPhotoRecallPhrase(phrase, photos) {
  return matchPhotoRecall(phrase, photos);
}
