/**
 * Agent capability preferences — briefing, Local Agent kill-switch, resource ACL.
 */

export const AGENT_PREFS_KEY = "yueqi.agent.prefs.v1";

export const AGENT_RESOURCE_KEYS = Object.freeze([
  "character",
  "worldbook",
  "scenario",
  "diary",
  "chat",
  "gallery",
  "settings",
]);

/** deny | read_once | ask_write | allow_read */
export const DEFAULT_RESOURCE_POLICY = Object.freeze({
  character: "ask_write",
  worldbook: "ask_write",
  scenario: "ask_write",
  diary: "deny",
  chat: "deny",
  gallery: "deny",
  settings: "ask_write",
});

/** @type {{ getItem: (k: string) => string|null, setItem: (k: string, v: string) => void, removeItem?: (k: string) => void } | null} */
let _storage = null;

function defaultStorage() {
  if (typeof localStorage !== "undefined") return localStorage;
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

function storage() {
  return _storage || defaultStorage();
}

/**
 * @param {{ getItem: Function, setItem: Function, removeItem?: Function } | null} s
 */
export function __setAgentPrefsStorageForTests(s) {
  _storage = s;
}

function normalizeResources(raw = {}) {
  const out = { ...DEFAULT_RESOURCE_POLICY };
  for (const key of AGENT_RESOURCE_KEYS) {
    const v = String(raw[key] || out[key]);
    out[key] = ["deny", "read_once", "ask_write", "allow_read"].includes(v) ? v : out[key];
  }
  return out;
}

export function getAgentPrefs() {
  try {
    const raw = storage().getItem(AGENT_PREFS_KEY);
    if (!raw) {
      return {
        schemaVersion: 2,
        dailyBriefingEnabled: true,
        authorizedFileRoots: [],
        localAgentEnabled: true,
        exploreFilesEnabled: true,
        showPlanBeforeRun: true,
        askBeforeWrite: true,
        allowInstallSkills: true,
        resources: { ...DEFAULT_RESOURCE_POLICY },
      };
    }
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: 2,
      dailyBriefingEnabled: parsed.dailyBriefingEnabled !== false,
      authorizedFileRoots: Array.isArray(parsed.authorizedFileRoots)
        ? parsed.authorizedFileRoots.map(String)
        : [],
      localAgentEnabled: parsed.localAgentEnabled !== false,
      exploreFilesEnabled: parsed.exploreFilesEnabled !== false,
      showPlanBeforeRun: parsed.showPlanBeforeRun !== false,
      askBeforeWrite: parsed.askBeforeWrite !== false,
      allowInstallSkills: parsed.allowInstallSkills !== false,
      resources: normalizeResources(parsed.resources || {}),
    };
  } catch {
    return {
      schemaVersion: 2,
      dailyBriefingEnabled: true,
      authorizedFileRoots: [],
      localAgentEnabled: true,
      exploreFilesEnabled: true,
      showPlanBeforeRun: true,
      askBeforeWrite: true,
      allowInstallSkills: true,
      resources: { ...DEFAULT_RESOURCE_POLICY },
    };
  }
}

/**
 * @param {Partial<ReturnType<typeof getAgentPrefs>>} patch
 */
export function saveAgentPrefs(patch = {}) {
  const cur = getAgentPrefs();
  const next = {
    schemaVersion: 2,
    dailyBriefingEnabled:
      patch.dailyBriefingEnabled !== undefined
        ? Boolean(patch.dailyBriefingEnabled)
        : cur.dailyBriefingEnabled,
    authorizedFileRoots:
      patch.authorizedFileRoots !== undefined
        ? [...new Set(patch.authorizedFileRoots.map(String))]
        : cur.authorizedFileRoots,
    localAgentEnabled:
      patch.localAgentEnabled !== undefined
        ? Boolean(patch.localAgentEnabled)
        : cur.localAgentEnabled,
    exploreFilesEnabled:
      patch.exploreFilesEnabled !== undefined
        ? Boolean(patch.exploreFilesEnabled)
        : cur.exploreFilesEnabled,
    showPlanBeforeRun:
      patch.showPlanBeforeRun !== undefined
        ? Boolean(patch.showPlanBeforeRun)
        : cur.showPlanBeforeRun,
    askBeforeWrite:
      patch.askBeforeWrite !== undefined
        ? Boolean(patch.askBeforeWrite)
        : cur.askBeforeWrite,
    allowInstallSkills:
      patch.allowInstallSkills !== undefined
        ? Boolean(patch.allowInstallSkills)
        : cur.allowInstallSkills,
    resources: normalizeResources({
      ...cur.resources,
      ...(patch.resources && typeof patch.resources === "object" ? patch.resources : {}),
    }),
  };
  storage().setItem(AGENT_PREFS_KEY, JSON.stringify(next));
  return next;
}

export function setDailyBriefingEnabled(enabled) {
  return saveAgentPrefs({ dailyBriefingEnabled: Boolean(enabled) });
}

export function isDailyBriefingEnabled() {
  return getAgentPrefs().dailyBriefingEnabled === true;
}

export function assertBriefingAllowed() {
  if (!isDailyBriefingEnabled()) {
    return { ok: false, reason: "briefing_disabled" };
  }
  return { ok: true };
}

export function isLocalAgentEnabled() {
  return getAgentPrefs().localAgentEnabled === true;
}

export function assertLocalAgentAllowed() {
  if (!isLocalAgentEnabled()) {
    return { ok: false, reason: "local_agent_disabled" };
  }
  return { ok: true };
}

export function isExploreFilesEnabled() {
  return getAgentPrefs().exploreFilesEnabled === true;
}

export function assertExploreFilesAllowed() {
  if (!isExploreFilesEnabled()) {
    return { ok: false, reason: "explore_files_disabled" };
  }
  return { ok: true };
}

export function assertSkillInstallAllowed() {
  if (!getAgentPrefs().allowInstallSkills) {
    return { ok: false, reason: "skill_install_disabled" };
  }
  return { ok: true };
}

/**
 * @param {string} resourceKey
 * @param {"read"|"write"|"delete"|"install"} action
 */
export function assertAgentResourceAccess(resourceKey, action = "read") {
  const prefs = getAgentPrefs();
  const key = String(resourceKey || "");
  const policy = prefs.resources[key] || "deny";
  if (policy === "deny") {
    return { ok: false, reason: "resource_denied", policy };
  }
  if (action === "read") {
    if (policy === "allow_read" || policy === "read_once" || policy === "ask_write") {
      return { ok: true, policy, needsApproval: false };
    }
  }
  if (action === "write" || action === "delete" || action === "install") {
    if (prefs.askBeforeWrite || policy === "ask_write") {
      return { ok: true, policy, needsApproval: true };
    }
    if (policy === "allow_read") {
      return { ok: false, reason: "write_requires_approval", policy, needsApproval: true };
    }
  }
  return { ok: false, reason: "resource_denied", policy };
}

export function setAuthorizedFileRoots(roots) {
  return saveAgentPrefs({ authorizedFileRoots: Array.isArray(roots) ? roots : [] });
}

export function getAuthorizedFileRoots() {
  return getAgentPrefs().authorizedFileRoots;
}

export function isPathAuthorized(path, roots = getAuthorizedFileRoots()) {
  const p = normalizePath(path);
  if (!p || p.includes("..")) return false;
  if (!roots.length) return false;
  return roots.some((root) => {
    const r = normalizePath(root);
    return p === r || p.startsWith(r.endsWith("/") ? r : `${r}/`);
  });
}

function normalizePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .trim();
}
