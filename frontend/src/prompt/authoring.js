/**
 * Author-controlled prompt layout.
 *
 * This is the small compatibility layer between Tavern/float-style prompt
 * authorship and Yueqi's semantic context blocks.  Authors may reorder blocks,
 * choose system/developer transport, and place a block before/after history or
 * at a bounded history depth.  Platform safety and the current user message
 * remain outside this layout and cannot be moved by a preset.
 */

export const PROMPT_LAYOUT_BLOCKS = Object.freeze([
  "character",
  "relationship_context",
  "world_context",
  "relevant_memories",
  "runtime_context",
  "branch_summary",
  "world_context_after",
  "post_history_contract",
]);

export const PROMPT_LAYOUT_ROLES = Object.freeze(["system", "developer"]);
export const PROMPT_LAYOUT_POSITIONS = Object.freeze([
  "before_history",
  "after_history",
  "at_depth",
]);

const LEGACY_SECTION_TO_BLOCK = Object.freeze({
  character: "character",
  worldbook: "world_context",
  memory: "relevant_memories",
  daily: "relationship_context",
  external: "runtime_context",
  relationship: "relationship_context",
  relationship_context: "relationship_context",
  world: "world_context",
  world_context: "world_context",
  memories: "relevant_memories",
  relevant_memories: "relevant_memories",
  runtime: "runtime_context",
  runtime_context: "runtime_context",
  branch_summary: "branch_summary",
  world_context_after: "world_context_after",
  post_history_contract: "post_history_contract",
});

export const DEFAULT_PROMPT_LAYOUT = Object.freeze([
  { id: "character", role: "system", position: "before_history", depth: 0, enabled: true },
  { id: "relationship_context", role: "system", position: "before_history", depth: 0, enabled: true },
  { id: "world_context", role: "system", position: "before_history", depth: 2, enabled: true },
  { id: "relevant_memories", role: "system", position: "before_history", depth: 4, enabled: true },
  { id: "runtime_context", role: "system", position: "before_history", depth: 0, enabled: true },
  { id: "branch_summary", role: "system", position: "before_history", depth: 6, enabled: true },
  { id: "world_context_after", role: "system", position: "after_history", depth: 0, enabled: true },
  { id: "post_history_contract", role: "system", position: "after_history", depth: 0, enabled: true },
]);

function normalizeId(value) {
  const raw = String(value || "").trim().toLowerCase();
  return LEGACY_SECTION_TO_BLOCK[raw] || (PROMPT_LAYOUT_BLOCKS.includes(raw) ? raw : "");
}

function normalizeEntry(raw, fallback) {
  const source = typeof raw === "string" ? { id: raw } : (raw && typeof raw === "object" ? raw : {});
  const id = normalizeId(source.id || source.blockId || source.section) || fallback?.id || "";
  if (!id) return null;
  const role = PROMPT_LAYOUT_ROLES.includes(source.role) ? source.role : (fallback?.role || "system");
  const position = PROMPT_LAYOUT_POSITIONS.includes(source.position)
    ? source.position
    : (fallback?.position || "before_history");
  const depthRaw = Number(source.depth ?? fallback?.depth ?? 0);
  const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.min(64, Math.floor(depthRaw))) : 0;
  return {
    id,
    role,
    position,
    depth,
    enabled: source.enabled !== false && fallback?.enabled !== false,
  };
}

/**
 * Normalize both the new layout array and the old string-only injection order.
 * Unknown/duplicate entries are ignored; missing semantic blocks use defaults.
 */
export function normalizePromptLayout(raw, legacyOrder = []) {
  const source = Array.isArray(raw) && raw.length
    ? raw
    : (Array.isArray(legacyOrder) && legacyOrder.length ? legacyOrder : DEFAULT_PROMPT_LAYOUT);
  const defaults = new Map(DEFAULT_PROMPT_LAYOUT.map((entry) => [entry.id, entry]));
  const seen = new Set();
  const normalized = [];
  for (const item of source) {
    const entry = normalizeEntry(item, defaults.get(normalizeId(item?.id || item?.section || item)));
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    normalized.push(entry);
  }
  for (const fallback of DEFAULT_PROMPT_LAYOUT) {
    if (!seen.has(fallback.id)) normalized.push({ ...fallback });
  }
  return normalized;
}

export function promptLayoutLabels(layout = []) {
  return normalizePromptLayout(layout).map((entry, index) => ({ ...entry, index }));
}

