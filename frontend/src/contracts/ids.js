/**
 * Unified ID contracts (R1). Prefixes make logs greppable; values are opaque strings.
 */

export const ID_KINDS = Object.freeze([
  "userId",
  "companionId",
  "relationshipId",
  "conversationId",
  "branchId",
  "agentId",
  "skillId",
  "taskId",
  "experienceId",
  "eventId",
  "grantId",
  "approvalId",
  "packageId",
  "requestId",
  "characterId",
  "turnExecutionId",
  "toolRunId",
  "importReportId",
]);

const PREFIX = Object.freeze({
  userId: "usr_",
  companionId: "cmp_",
  relationshipId: "rel_",
  conversationId: "cnv_",
  branchId: "br_",
  agentId: "agt_",
  skillId: "skl_",
  taskId: "tsk_",
  experienceId: "exp_",
  eventId: "evt_",
  grantId: "grn_",
  approvalId: "apr_",
  packageId: "pkg_",
  requestId: "req_",
  characterId: "chr_",
  turnExecutionId: "tex_",
  toolRunId: "trn_",
  importReportId: "imp_",
});

/**
 * @param {string} kind
 * @param {string} value
 */
export function isIdShape(kind, value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const prefix = PREFIX[kind];
  if (!prefix) return Boolean(text);
  return text.startsWith(prefix) && text.length > prefix.length;
}

/** @type {null | ((kind: string, seed?: string) => string)} */
let idFactoryForTests = null;

/**
 * Inject a deterministic ID factory for tests. Pass null to clear.
 * @param {null | ((kind: string, seed?: string) => string)} fn
 */
export function setIdFactoryForTests(fn) {
  idFactoryForTests = typeof fn === "function" ? fn : null;
}

export function resetIdFactoryForTests() {
  idFactoryForTests = null;
}

/**
 * @param {string} kind
 * @param {string} [seed]
 */
export function mintId(kind, seed = "") {
  if (idFactoryForTests) {
    return idFactoryForTests(kind, seed);
  }
  const prefix = PREFIX[kind] || "";
  const rand = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const clean = String(seed || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  return `${prefix}${clean ? `${clean}_` : ""}${rand}`;
}

export const ID_PREFIX = PREFIX;
