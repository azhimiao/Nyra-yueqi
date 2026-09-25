/**
 * Worldbook keyword matching — pure functions (F5 / F2).
 * Upgraded for Lore Activation V1 scopes + combination triggers (§6.3).
 */

/** @typedef {"global"|"character"|"persona"|"experience"|"session"} LoreScope */
/** @typedef {"any"|"all"|"not_any"} MatchMode */
/** @typedef {"before_scenario"|"after_scenario"|"before_history"|"at_depth"|"post_history"} InsertPosition */

export const LORE_SCOPES = Object.freeze([
  "global",
  "character",
  "persona",
  "experience",
  "session",
]);

export const MATCH_MODES = Object.freeze(["any", "all", "not_any"]);

/**
 * @param {object} entry
 * @returns {object}
 */
export function normalizeWorldbookEntry(entry = {}) {
  const triggers = Array.isArray(entry.triggers)
    ? entry.triggers.map((t) => String(t).trim()).filter(Boolean)
    : String(entry.triggersText || "")
        .split(/[,，]/)
        .map((s) => String(s).trim())
        .filter(Boolean);

  const keys = Array.isArray(entry.keys)
    ? entry.keys.map((k) => String(k).trim()).filter(Boolean)
    : triggers.slice();

  const secondaryKeys = Array.isArray(entry.secondaryKeys)
    ? entry.secondaryKeys.map((k) => String(k).trim()).filter(Boolean)
    : [];

  const scopeApps = Array.isArray(entry.scopeApps)
    ? entry.scopeApps.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const linkedCharacterIds = Array.isArray(entry.linkedCharacterIds)
    ? entry.linkedCharacterIds.map((s) => String(s).trim()).filter(Boolean)
    : [];

  let scope = String(entry.scope || "global").trim().toLowerCase();
  if (!LORE_SCOPES.includes(scope)) {
    if (linkedCharacterIds.length) scope = "character";
    else if (entry.experienceId || entry.experiencePackageId) scope = "experience";
    else if (entry.sessionId) scope = "session";
    else if (entry.personaId) scope = "persona";
    else scope = "global";
  }

  let matchMode = String(entry.matchMode || "any").trim().toLowerCase();
  if (!MATCH_MODES.includes(matchMode)) matchMode = "any";

  const insertPosition = String(entry.insertPosition || "after_scenario").trim() || "after_scenario";
  const role = String(entry.role || "system").trim() || "system";

  return {
    id: String(entry.id || "").trim() || `wb-${Date.now()}`,
    title: String(entry.title || "未命名").trim() || "未命名",
    category: String(entry.category || "氛围").trim() || "氛围",
    triggers: keys.length ? keys : triggers,
    keys: keys.length ? keys : triggers,
    secondaryKeys,
    regex: entry.regex ? String(entry.regex) : "",
    content: String(entry.content || ""),
    injectSlot: entry.injectSlot || "world_context",
    priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 50,
    enabled: entry.enabled !== false,
    scope,
    scopeApps,
    linkedCharacterIds,
    characterId: String(entry.characterId || linkedCharacterIds[0] || ""),
    personaId: String(entry.personaId || ""),
    experienceId: String(entry.experienceId || entry.experiencePackageId || ""),
    sessionId: String(entry.sessionId || ""),
    constant: Boolean(entry.constant),
    matchMode,
    scanDepth: Number.isFinite(Number(entry.scanDepth)) ? Number(entry.scanDepth) : 0,
    stickyTurns: Math.max(0, Number(entry.stickyTurns) || 0),
    cooldownTurns: Math.max(0, Number(entry.cooldownTurns) || 0),
    delayTurns: Math.max(0, Number(entry.delayTurns) || 0),
    insertPosition,
    role,
    tokenBudget: Number.isFinite(Number(entry.tokenBudget)) ? Number(entry.tokenBudget) : 0,
    sourcePackageId: String(entry.sourcePackageId || ""),
    sourceVersion: String(entry.sourceVersion || entry.version || ""),
    updatedAt: entry.updatedAt || "",
  };
}

/**
 * @param {object} entry
 * @param {{
 *   appId?: string,
 *   characterId?: string,
 *   personaId?: string,
 *   experienceId?: string,
 *   sessionId?: string,
 * }} ctx
 * @returns {boolean}
 */
export function entryInScope(entry, ctx = {}) {
  const e = entry || {};
  const scope = String(e.scope || "global");
  const appId = String(ctx.appId || "").trim();
  const characterId = String(ctx.characterId || "").trim();
  const personaId = String(ctx.personaId || "").trim();
  const experienceId = String(ctx.experienceId || "").trim();
  const sessionId = String(ctx.sessionId || "").trim();

  if (e.scopeApps?.length && appId && !e.scopeApps.includes(appId)) {
    return false;
  }

  if (scope === "global") return true;

  if (scope === "character") {
    const linked = e.linkedCharacterIds?.length
      ? e.linkedCharacterIds
      : (e.characterId ? [e.characterId] : []);
    if (!linked.length) return true;
    if (!characterId) return false;
    return linked.includes(characterId);
  }

  if (scope === "persona") {
    if (!e.personaId) return true;
    return Boolean(personaId) && e.personaId === personaId;
  }

  if (scope === "experience") {
    if (!e.experienceId) return true;
    return Boolean(experienceId) && e.experienceId === experienceId;
  }

  if (scope === "session") {
    if (!e.sessionId) return true;
    return Boolean(sessionId) && e.sessionId === sessionId;
  }

  // Legacy linkedCharacterIds without explicit scope
  if (e.linkedCharacterIds?.length && characterId) {
    return e.linkedCharacterIds.includes(characterId);
  }

  return true;
}

/**
 * Combination key match: any / all / not_any + optional regex + secondaryKeys.
 * @param {object} entry
 * @param {string} query
 * @param {{ caseInsensitive?: boolean, scanDepth?: number }} [opts]
 * @returns {boolean}
 */
export function entryMatchesQuery(entry, query, opts = {}) {
  const e = entry || {};
  if (e.constant) return true;

  let text = String(query || "");
  const depth = Number(opts.scanDepth ?? e.scanDepth) || 0;
  if (depth > 0 && text.length > depth) {
    // scanDepth as character window from the end (recent context)
    text = text.slice(-depth);
  }

  const caseInsensitive = opts.caseInsensitive !== false;
  const haystack = caseInsensitive ? text.toLowerCase() : text;

  if (e.regex) {
    try {
      const re = new RegExp(e.regex, caseInsensitive ? "i" : "");
      if (re.test(text)) return true;
    } catch {
      /* invalid regex → ignore */
    }
  }

  const primary = (e.keys?.length ? e.keys : e.triggers) || [];
  const secondary = e.secondaryKeys || [];
  const mode = e.matchMode || "any";

  const hit = (needle) => {
    const n = caseInsensitive ? String(needle).toLowerCase() : String(needle);
    return Boolean(n) && haystack.includes(n);
  };

  const primaryHits = primary.filter(hit);
  const secondaryHits = secondary.filter(hit);

  if (mode === "all") {
    if (!primary.length) return false;
    const allPrimary = primary.every(hit);
    if (!allPrimary) return false;
    if (secondary.length) return secondary.some(hit) || secondary.every(hit);
    return true;
  }

  if (mode === "not_any") {
    if (!primary.length && !secondary.length) return false;
    return primaryHits.length === 0 && secondaryHits.length === 0;
  }

  // any (default): primary OR secondary
  if (!primary.length && !secondary.length) return false;
  return primaryHits.length > 0 || secondaryHits.length > 0;
}

/**
 * @param {object[]} entries
 * @param {string} query
 * @param {{
 *   appId?: string,
 *   characterId?: string,
 *   personaId?: string,
 *   experienceId?: string,
 *   sessionId?: string,
 *   caseInsensitive?: boolean,
 * }} [opts]
 * @returns {object[]}
 */
export function matchWorldbookEntries(entries, query, opts = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const matched = list
    .map(normalizeWorldbookEntry)
    .filter((entry) => {
      if (entry.enabled === false) return false;
      if (!entryInScope(entry, opts)) return false;
      return entryMatchesQuery(entry, query, {
        caseInsensitive: opts.caseInsensitive,
      });
    })
    .sort((a, b) => {
      const pd = (b.priority || 0) - (a.priority || 0);
      if (pd !== 0) return pd;
      const t = String(a.title || "").localeCompare(String(b.title || ""), "en");
      if (t !== 0) return t;
      return String(a.id || "").localeCompare(String(b.id || ""), "en");
    });

  return matched;
}
