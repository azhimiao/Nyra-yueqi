/**
 * Capability grant normalization (shared by importer + install-flow).
 */

/** Plain-language labels for install grant UI. */
export const CAPABILITY_LABELS = Object.freeze({
  "structured-notes": "保存结构化笔记",
  "calendar-draft": "起草日历提醒",
  "note-from-chat": "从聊天提取笔记",
  "page-summary": "总结页面内容",
});

/**
 * @param {object} manifest
 * @param {unknown} granted
 */
export function normalizeGrantedCapabilities(manifest, granted) {
  const requested = new Set((manifest?.requestedCapabilities || []).map(String));
  /** @type {string[]} */
  const out = [];
  for (const cap of granted || []) {
    const s = String(cap).trim();
    if (s && requested.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * @param {object} manifest
 * @param {object|null} installation
 */
export function missingInstallGrants(manifest, installation) {
  const requested = (manifest?.requestedCapabilities || []).map(String);
  const granted = new Set((installation?.grants?.capabilities || []).map(String));
  return requested.filter((c) => !granted.has(c));
}

/**
 * @param {object} manifest
 * @param {unknown} grantedCapabilities
 */
export function validateInstallGrants(manifest, grantedCapabilities) {
  const requested = (manifest?.requestedCapabilities || []).map(String);
  if (requested.length === 0) {
    return { ok: true, granted: [], missing: [], undeclared: [] };
  }

  const raw = Array.isArray(grantedCapabilities) ? grantedCapabilities.map(String) : [];
  const undeclared = raw.filter((c) => c && !requested.includes(c));
  const normalized = normalizeGrantedCapabilities(manifest, raw);
  const grantedSet = new Set(normalized);
  const missing = requested.filter((c) => !grantedSet.has(c));

  if (undeclared.length > 0) {
    return { ok: false, reason: "undeclared_grant", missing, undeclared, granted: normalized };
  }
  if (missing.length > 0) {
    return { ok: false, reason: "grants_required", missing, undeclared, granted: normalized };
  }
  return { ok: true, granted: normalized, missing: [], undeclared: [] };
}

/**
 * @param {string} cap
 */
export function capabilityLabel(cap) {
  return CAPABILITY_LABELS[String(cap)] || String(cap);
}
