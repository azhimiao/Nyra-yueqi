/**
 * Companion OS domain contracts — R1 surface.
 * Implementation migrations begin in R2+; do not invent new localStorage authorities.
 */

export * from "./ids.js";
export * from "./timeline-event-v1.js";
export * from "./temporal-snapshot-v1.js";
export * from "./temporal-event-v1.js";
export * from "./turn-understanding-v1.js";
export * from "./action-proposal-v1.js";
export * from "./understanding-candidate-v1.js";
export * from "./stable-memory-v1.js";
export * from "./relationship-continuity-v1.js";
export * from "./unified-task-v1.js";
export * from "./capability-grant-approval-audit-v1.js";
export * from "./package-manifest-v1.js";
export * from "./model-provider-contract-v1.js";
export * from "./web-evidence-v1.js";
export * from "./source-ref-v1.js";
export * from "./memory-index-entry-v1.js";
export * from "./character-profile-v2.js";
export * from "./user-companion-preference-v2.js";
export * from "./turn-execution-snapshot-v1.js";
export * from "./prepared-model-request-v1.js";
export * from "./capability-operation-v2.js";
export * from "./tool-run-v1.js";
export * from "./character-import-report-v1.js";
export * from "./truth-envelope-v1.js";

/** Ban list reminder for reviewers / static checks. */
export const FORBIDDEN_NEW_LOCALSTORAGE_AUTHORITIES = Object.freeze([
  "Do not add new yueqi.*.vN keys as sole truth for conversation, timeline, task, grant, or billing.",
  "Ephemeral UI caches are allowed only when marked non-authoritative and rebuildable from repositories.",
  "yueqi.relationship.continuity.cache.v1 is a rebuildable Continuity projection cache, not an authority.",
]);
