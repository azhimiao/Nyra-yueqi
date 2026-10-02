/**
 * Format Pop token messages (转账) — same wire format as phone token cards.
 */

export function formatTransferText(amount, note = "") {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "";
  const memo = String(note || "转账").trim().slice(0, 60);
  return `[转账|${n.toFixed(2)}|${memo}]`;
}

export function formatLocationText(title = "当前位置", subtitle = "") {
  const place = String(title || "当前位置").trim() || "当前位置";
  const detail = String(subtitle || "").trim();
  return detail ? `[位置] ${place} - ${detail}` : `[位置] ${place}`;
}
