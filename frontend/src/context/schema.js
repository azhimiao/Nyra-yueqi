/**
 * Personal Context Graph schemas.
 * Episodic / Semantic / Procedural / GoalProject / Relational memory items.
 */

export const CONTEXT_SCHEMA_VERSION = 1;

/** localStorage key for the unified context graph bag */
export const CONTEXT_GRAPH_KEY = "yueqi.context.graph.v1";

/** Memory kinds (plan §3.5 / P2) */
export const MEMORY_KINDS = Object.freeze([
  "episodic",
  "semantic",
  "procedural",
  "goal_project",
  "relational",
]);

export const PRIVACY_LEVELS = Object.freeze([
  "shared",
  "private",
  "sensitive",
  "forbidden",
]);

export const RETENTION_POLICIES = Object.freeze([
  "permanent",
  "rolling_30d",
  "rolling_90d",
  "until_goal",
  "session",
]);

export const CONFLICT_STATES = Object.freeze([
  "none",
  "suspected",
  "confirmed",
  "resolved",
]);

export const PIPELINE_STAGES = Object.freeze([
  "candidate",
  "dedupe",
  "conflict",
  "privacy",
  "policy",
  "store",
]);

/**
 * @typedef {{
 *   id: string,
 *   schemaVersion: number,
 *   kind: "episodic"|"semantic"|"procedural"|"goal_project"|"relational",
 *   content: string,
 *   summary: string,
 *   source: string,
 *   sourceRef: string,
 *   occurredAt: string,
 *   createdAt: string,
 *   confidence: number,
 *   characterId: string,
 *   workspaceId: string,
 *   privacyLevel: "shared"|"private"|"sensitive"|"forbidden",
 *   retention: "permanent"|"rolling_30d"|"rolling_90d"|"until_goal"|"session",
 *   expiresAt: string|null,
 *   lastUsedAt: string|null,
 *   conflictState: "none"|"suspected"|"confirmed"|"resolved",
 *   conflictWith: string[],
 *   frozen: boolean,
 *   forbidProactive: boolean,
 *   deleted: boolean,
 *   deletedAt: string|null,
 *   whyRemembered: string,
 *   tags: string[],
 *   relationHints: string[],
 *   taskHints: string[],
 *   meta: Record<string, unknown>,
 * }} ContextMemoryItem
 *
 * @typedef {{
 *   content: string,
 *   summary?: string,
 *   kind?: string,
 *   source: string,
 *   sourceRef?: string,
 *   occurredAt?: string,
 *   confidence?: number,
 *   characterId: string,
 *   workspaceId?: string,
 *   privacyLevel?: string,
 *   retention?: string,
 *   expiresAt?: string|null,
 *   whyRemembered?: string,
 *   tags?: string[],
 *   relationHints?: string[],
 *   taskHints?: string[],
 *   meta?: Record<string, unknown>,
 *   skipDedupe?: boolean,
 * }} MemoryCandidate
 */

let idSeq = 0;

/** @param {string} [prefix] */
export function nextContextId(prefix = "ctx") {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

export function __resetContextIdSeqForTests() {
  idSeq = 0;
}

/**
 * @param {unknown} item
 * @returns {{ ok: boolean, errors: string[], value?: ContextMemoryItem }}
 */
export function validateContextItem(item) {
  const errors = [];
  if (!item || typeof item !== "object") {
    return { ok: false, errors: ["item must be an object"] };
  }
  const o = /** @type {Record<string, unknown>} */ (item);
  if (!String(o.id || "").trim()) errors.push("id required");
  if (!MEMORY_KINDS.includes(/** @type {string} */ (o.kind))) errors.push("kind invalid");
  if (!String(o.content || "").trim()) errors.push("content required");
  if (!String(o.source || "").trim()) errors.push("source required");
  if (!String(o.characterId || "").trim()) errors.push("characterId required");
  if (!PRIVACY_LEVELS.includes(/** @type {string} */ (o.privacyLevel))) {
    errors.push("privacyLevel invalid");
  }
  if (!RETENTION_POLICIES.includes(/** @type {string} */ (o.retention))) {
    errors.push("retention invalid");
  }
  if (!CONFLICT_STATES.includes(/** @type {string} */ (o.conflictState))) {
    errors.push("conflictState invalid");
  }
  const conf = Number(o.confidence);
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) errors.push("confidence must be 0..1");
  if (!String(o.createdAt || "").trim()) errors.push("createdAt required");
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], value: /** @type {ContextMemoryItem} */ (o) };
}

/**
 * Normalize a candidate into a full item (not yet persisted).
 * @param {MemoryCandidate} candidate
 * @param {{ nowIso?: string, id?: string }} [opts]
 * @returns {ContextMemoryItem}
 */
export function buildContextItem(candidate, opts = {}) {
  const now = opts.nowIso || new Date().toISOString();
  const content = String(candidate.content || "").trim();
  const kind = MEMORY_KINDS.includes(/** @type {string} */ (candidate.kind))
    ? candidate.kind
    : inferKind(content, candidate.source);
  const privacy = PRIVACY_LEVELS.includes(/** @type {string} */ (candidate.privacyLevel))
    ? candidate.privacyLevel
    : "shared";
  const retention = RETENTION_POLICIES.includes(/** @type {string} */ (candidate.retention))
    ? candidate.retention
    : defaultRetention(kind);
  const confidence = clamp01(
    candidate.confidence == null ? defaultConfidence(candidate.source) : Number(candidate.confidence),
  );
  const item = {
    id: opts.id || nextContextId("ctx"),
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    kind,
    content,
    summary: String(candidate.summary || content).trim().slice(0, 240),
    source: String(candidate.source || "unknown").trim(),
    sourceRef: String(candidate.sourceRef || "").trim(),
    occurredAt: String(candidate.occurredAt || now),
    createdAt: now,
    confidence,
    characterId: String(candidate.characterId || "").trim(),
    workspaceId: String(candidate.workspaceId || candidate.characterId || "").trim(),
    privacyLevel: privacy,
    retention,
    expiresAt: candidate.expiresAt === undefined ? null : candidate.expiresAt,
    lastUsedAt: null,
    conflictState: "none",
    conflictWith: [],
    frozen: false,
    forbidProactive: privacy === "forbidden",
    deleted: false,
    deletedAt: null,
    whyRemembered: String(
      candidate.whyRemembered || whyFromSource(candidate.source, kind),
    ).trim(),
    tags: Array.isArray(candidate.tags) ? candidate.tags.map(String) : [],
    relationHints: Array.isArray(candidate.relationHints)
      ? candidate.relationHints.map(String)
      : [],
    taskHints: Array.isArray(candidate.taskHints) ? candidate.taskHints.map(String) : [],
    meta: candidate.meta && typeof candidate.meta === "object" ? { ...candidate.meta } : {},
    authority: String(candidate.authority || candidate.meta?.authority || "").trim(),
    memoryStatus: ["pending", "accepted", "confirmed", "disputed", "superseded", "projection"].includes(
      candidate.memoryStatus,
    )
      ? candidate.memoryStatus
      : "accepted",
    evidenceRefs: Array.isArray(candidate.evidenceRefs)
      ? candidate.evidenceRefs.map(String).filter(Boolean).slice(0, 32)
      : (candidate.sourceRef ? [String(candidate.sourceRef)] : []),
    subjectType: String(candidate.subjectType || "user"),
    subjectId: String(candidate.subjectId || "local-user"),
    audienceCharacterIds: Array.isArray(candidate.audienceCharacterIds)
      ? candidate.audienceCharacterIds.map(String).filter(Boolean)
      : [String(candidate.characterId || "")].filter(Boolean),
    consentState: String(candidate.consentState || "in_app_context"),
    version: Math.max(1, Number(candidate.version) || 1),
    supersedesId: String(candidate.supersedesId || ""),
    updatedAt: now,
    idempotencyKey: String(candidate.idempotencyKey || candidate.sourceRef || ""),
  };
  // M5: fiction isolation — preserve namespace when callers tag shared_fiction / etc.
  const ns = String(
    candidate.namespace
      || candidate.realityNamespace
      || (candidate.meta && candidate.meta.realityNamespace)
      || "",
  ).trim();
  if (ns) {
    item.namespace = ns;
    item.realityNamespace = ns;
  }
  return item;
}

/** @param {string} content @param {string} [source] */
export function inferKind(content, source = "") {
  const t = `${source} ${content}`.toLowerCase();
  if (/偏好|喜欢|讨厌|习惯|always|prefer|hate/.test(t)) return "semantic";
  if (/目标|项目|deadline|todo|计划推进|goal/.test(t)) return "goal_project";
  if (/边界|承诺|关系|我们约定|anniversary|relational/.test(t)) return "relational";
  if (/怎么做|流程|步骤|先.*再|procedural|习惯做法/.test(t)) return "procedural";
  if (/life\.|diary\.|cohabit\.|事件|那天|一起/.test(t)) return "episodic";
  return "episodic";
}

/** @param {string} kind */
function defaultRetention(kind) {
  if (kind === "episodic") return "rolling_90d";
  if (kind === "goal_project") return "until_goal";
  if (kind === "procedural") return "permanent";
  return "permanent";
}

/** @param {string} source */
function defaultConfidence(source) {
  if (source.startsWith("user") || source === "diary.memory") return 0.92;
  if (source.startsWith("life.") || source.startsWith("cohabit.")) return 0.8;
  if (source.startsWith("kg.") || source.startsWith("relation.")) return 0.75;
  if (source.startsWith("model") || source.startsWith("chat")) return 0.55;
  return 0.6;
}

/** @param {string} source @param {string} kind */
function whyFromSource(source, kind) {
  const kindLabel = {
    episodic: "发生过的具体事件",
    semantic: "稳定事实或偏好",
    procedural: "做事方式",
    goal_project: "正在推进的目标/项目",
    relational: "关系边界或共同约定",
  }[kind] || "上下文";
  return `来自 ${source} 的${kindLabel}，用于长期跟进与角色一致回复`;
}

/** @param {number} n */
function clamp01(n) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
