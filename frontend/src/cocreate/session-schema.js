/**
 * C5 — CreationSession / CreationTurn / ArtifactVersion contracts.
 */

export const CREATION_SESSION_SCHEMA_VERSION = 1;

/** @typedef {"backstory"|"date_scene"|"world_setting"} CreationTaskType */
/** @typedef {"active"|"paused"|"published"|"archived"} CreationSessionStatus */
/** @typedef {"user"|"character"|"assistant"} CreationTurnRole */
/** @typedef {"pending"|"accepted"|"rejected"|"edited"} ProposalStatus */

export const TASK_TEMPLATES = Object.freeze([
  {
    type: "backstory",
    title: "一起补完角色往事",
    goal: "把一段ta不曾说完的往事写成可写入人设的片段。",
    publishTarget: "character",
  },
  {
    type: "date_scene",
    title: "一起写一幕约会剧情",
    goal: "共写一幕可离线演出的约会剧本。",
    publishTarget: "script",
  },
  {
    type: "world_setting",
    title: "一起建立关系与共同世界设定",
    goal: "约定你们之间的关系语气，并留下可注入的世界书条目。",
    publishTarget: "worldbook",
  },
]);

/** Character card field whitelist for cocreate publish (never avatar/action/voice). */
export const CHARACTER_FIELD_WHITELIST = Object.freeze([2, 4]); // identity, base/description
export const CHARACTER_TOKEN_WHITELIST = true;

export const MIN_TURNS_FOR_COMPLETE = 3;

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

/**
 * @param {string} type
 */
export function getTaskTemplate(type) {
  return TASK_TEMPLATES.find((t) => t.type === type) || null;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, value: object|null, errors: string[] }}
 */
export function normalizeProposal(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, value: null, errors: ["not_object"] };
  const p = /** @type {Record<string, unknown>} */ (raw);
  const status = ["pending", "accepted", "rejected", "edited"].includes(String(p.status))
    ? String(p.status)
    : "pending";
  const value = {
    id: String(p.id || "").trim() || uid("prop"),
    text: String(p.text || "").trim(),
    patch: p.patch && typeof p.patch === "object" ? p.patch : {},
    status,
  };
  if (!value.text && !Object.keys(value.patch).length) errors.push("empty_proposal");
  return { ok: errors.length === 0, value, errors };
}

/**
 * @param {unknown} raw
 */
export function normalizeCreationTurn(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, value: null, errors: ["not_object"] };
  const t = /** @type {Record<string, unknown>} */ (raw);
  const role = ["user", "character", "assistant"].includes(String(t.role)) ? String(t.role) : "";
  if (!role) errors.push("bad_role");
  const proposalsRaw = Array.isArray(t.proposals) ? t.proposals : [];
  const proposals = [];
  for (const item of proposalsRaw) {
    const n = normalizeProposal(item);
    if (n.value) proposals.push(n.value);
    else errors.push(...n.errors.map((e) => `proposal:${e}`));
  }
  const value = {
    id: String(t.id || "").trim() || uid("turn"),
    role,
    text: String(t.text || "").trim(),
    emotion: String(t.emotion || "").trim() || (role === "character" ? "warm" : ""),
    thinking: Boolean(t.thinking),
    proposals,
    createdAt: String(t.createdAt || nowIso()),
  };
  if (!value.text && role !== "assistant") errors.push("empty_text");
  return { ok: errors.length === 0, value, errors };
}

/**
 * @param {unknown} raw
 */
export function normalizeArtifactVersion(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, value: null, errors: ["not_object"] };
  const v = /** @type {Record<string, unknown>} */ (raw);
  const content = v.content && typeof v.content === "object" ? v.content : null;
  if (!content) errors.push("missing_content");
  const value = {
    id: String(v.id || "").trim() || uid("ver"),
    artifactId: String(v.artifactId || "").trim(),
    parentVersionId: v.parentVersionId ? String(v.parentVersionId) : null,
    content: content || { kind: "empty" },
    summary: String(v.summary || "").trim(),
    sourceTurnIds: Array.isArray(v.sourceTurnIds) ? v.sourceTurnIds.map(String) : [],
    createdAt: String(v.createdAt || nowIso()),
  };
  if (!value.artifactId) errors.push("missing_artifactId");
  return { ok: errors.length === 0, value, errors };
}

/**
 * @param {unknown} raw
 */
export function normalizeArtifact(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, value: null, errors: ["not_object"] };
  const a = /** @type {Record<string, unknown>} */ (raw);
  const type = ["backstory", "date_scene", "world_setting"].includes(String(a.type))
    ? String(a.type)
    : "";
  if (!type) errors.push("bad_type");
  const value = {
    id: String(a.id || "").trim() || uid("art"),
    schemaVersion: Number(a.schemaVersion) || CREATION_SESSION_SCHEMA_VERSION,
    characterId: String(a.characterId || "").trim(),
    type,
    title: String(a.title || "").trim() || "未命名作品",
    sessionId: String(a.sessionId || "").trim(),
    currentVersionId: String(a.currentVersionId || "").trim(),
    versionIds: Array.isArray(a.versionIds) ? a.versionIds.map(String) : [],
    undoStack: Array.isArray(a.undoStack) ? a.undoStack.map(String) : [],
    redoStack: Array.isArray(a.redoStack) ? a.redoStack.map(String) : [],
    complete: Boolean(a.complete),
    publishedAt: a.publishedAt ? String(a.publishedAt) : null,
    publishTargetId: a.publishTargetId ? String(a.publishTargetId) : null,
    createdAt: String(a.createdAt || nowIso()),
    updatedAt: String(a.updatedAt || nowIso()),
  };
  return { ok: errors.length === 0, value, errors };
}

/**
 * @param {unknown} raw
 */
export function normalizeCreationSession(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, value: null, errors: ["not_object"] };
  const s = /** @type {Record<string, unknown>} */ (raw);
  const type = ["backstory", "date_scene", "world_setting"].includes(String(s.type))
    ? String(s.type)
    : "";
  if (!type) errors.push("bad_type");
  const status = ["active", "paused", "published", "archived"].includes(String(s.status))
    ? String(s.status)
    : "active";
  const turnsRaw = Array.isArray(s.turns) ? s.turns : [];
  const turns = [];
  for (const item of turnsRaw) {
    const n = normalizeCreationTurn(item);
    if (n.value) turns.push(n.value);
    else errors.push(...n.errors.map((e) => `turn:${e}`));
  }
  const tmpl = getTaskTemplate(type);
  const value = {
    id: String(s.id || "").trim() || uid("sess"),
    schemaVersion: Number(s.schemaVersion) || CREATION_SESSION_SCHEMA_VERSION,
    characterId: String(s.characterId || "").trim(),
    type,
    title: String(s.title || tmpl?.title || "共创").trim(),
    goal: String(s.goal || tmpl?.goal || "").trim(),
    status,
    turns,
    artifactId: String(s.artifactId || "").trim(),
    activeVersionId: String(s.activeVersionId || "").trim(),
    createdAt: String(s.createdAt || nowIso()),
    updatedAt: String(s.updatedAt || nowIso()),
  };
  if (!value.characterId) errors.push("missing_characterId");
  if (!value.artifactId) errors.push("missing_artifactId");
  return { ok: errors.length === 0, value, errors };
}

/**
 * Interactive turns (user + character) count toward "完整作品".
 * @param {{ turns?: object[] }} session
 */
export function countInteractiveTurns(session) {
  const turns = Array.isArray(session?.turns) ? session.turns : [];
  // A round is earned by an actual user contribution. Seed greetings and
  // assistant retries must never make a one-message draft look complete.
  return turns.filter((t) => t.role === "user").length;
}

/**
 * @param {{ turns?: object[], complete?: boolean }} sessionOrArtifact
 */
export function isCompleteWork(sessionOrArtifact) {
  if (sessionOrArtifact?.complete === true) return true;
  return countInteractiveTurns(sessionOrArtifact) >= MIN_TURNS_FOR_COMPLETE;
}

/**
 * Empty seed content by task type.
 * @param {CreationTaskType} type
 * @param {{ characterName?: string }} [opts]
 */
export function emptyArtifactContent(type, opts = {}) {
  const name = String(opts.characterName || "ta").trim() || "ta";
  if (type === "date_scene") {
    return {
      kind: "date_scene",
      title: `${name}与你的一幕`,
      premise: "还在起草：一次尚未命名的约会。",
      openingBeat: "灯光偏暖。你们相对坐下，先安静片刻。",
      mood: "warm",
      beats: [],
    };
  }
  if (type === "world_setting") {
    return {
      kind: "world_setting",
      relationshipSummary: `${name}与你之间的关系设定仍待共同约定。`,
      worldEntries: [],
    };
  }
  return {
    kind: "backstory",
    text: `${name}的一段往事，还等你们一起补完。`,
    fieldIndex: 4,
    tokens: [],
  };
}

/**
 * Human-readable canvas summary.
 * @param {object} content
 */
export function summarizeContent(content) {
  if (!content || typeof content !== "object") return "空作品";
  if (content.kind === "date_scene") {
    return `${content.title || "约会一幕"} · ${(content.premise || "").slice(0, 48)}`;
  }
  if (content.kind === "world_setting") {
    const n = Array.isArray(content.worldEntries) ? content.worldEntries.length : 0;
    return `关系设定 · ${n} 条世界书 · ${(content.relationshipSummary || "").slice(0, 36)}`;
  }
  return String(content.text || "").slice(0, 72) || "往事片段";
}

export { uid, nowIso };
