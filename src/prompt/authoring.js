/**
 * Author-controlled prompt layout.
 *
 * This is the small compatibility layer between Tavern/float-style prompt
 * authorship and Yueqi's semantic context blocks.  Authors may reorder blocks,
 * choose system/developer transport, and place a block before/after history or
 * at a bounded history depth.  Platform safety and the current user message
 * remain outside this layout. Optional platform prose is controlled separately.
 */

export const PROMPT_LAYOUT_BLOCKS = Object.freeze([
  "character",
  "character_scenario",
  "example_dialogue",
  "relationship_context",
  "world_context",
  "relevant_memories",
  "runtime_context",
  "branch_summary",
  "world_context_after",
  "post_history_contract",
  "character_post_history",
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
  { id: "character_scenario", role: "system", position: "before_history", depth: 0, enabled: true },
  { id: "example_dialogue", role: "system", position: "before_history", depth: 0, enabled: true },
  { id: "relationship_context", role: "system", position: "before_history", depth: 0, enabled: true },
  { id: "world_context", role: "system", position: "before_history", depth: 2, enabled: true },
  { id: "relevant_memories", role: "system", position: "before_history", depth: 4, enabled: true },
  { id: "runtime_context", role: "system", position: "before_history", depth: 0, enabled: true },
  { id: "branch_summary", role: "system", position: "before_history", depth: 6, enabled: true },
  { id: "world_context_after", role: "system", position: "after_history", depth: 0, enabled: true },
  { id: "post_history_contract", role: "system", position: "after_history", depth: 0, enabled: true },
  { id: "character_post_history", role: "system", position: "after_history", depth: 0, enabled: true },
]);

function normalizeId(value) {
  const raw = String(value || "").trim().toLowerCase();
  return Object.hasOwn(LEGACY_SECTION_TO_BLOCK, raw) ? LEGACY_SECTION_TO_BLOCK[raw]
    : (PROMPT_LAYOUT_BLOCKS.includes(raw) ? raw : "");
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
    enabled: source.enabled === undefined ? fallback?.enabled !== false : source.enabled !== false,
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

/** Arrange authored context around real history; examples remain system/developer data. */
export function applyPromptLayout(blocks = [], history = [], layout, currentMessage = null) {
  const rows = Array.isArray(history) ? history : [];
  const byId = new Map((Array.isArray(blocks) ? blocks : []).map((block) => [block.id, block]));
  const before = [];
  const after = [];
  const at = new Map();
  const platform = byId.get("platform_safety");
  if (platform?.text?.trim()) before.push({ role: "system", content: platform.text, blockId: platform.id, provenance: platform.source || "prompt.platform" });
  for (const item of normalizePromptLayout(layout)) {
    const block = byId.get(item.id);
    if (!item.enabled || !String(block?.text || "").trim()) continue;
    const message = { role: item.role, content: block.text, blockId: item.id, provenance: block.source || `prompt.${item.id}` };
    if (item.position === "after_history") after.push(message);
    else if (item.position === "at_depth") {
      const index = Math.max(0, rows.length - item.depth);
      if (!at.has(index)) at.set(index, []);
      at.get(index).push(message);
    } else before.push(message);
  }
  const result = [...before];
  for (let index = 0; index <= rows.length; index += 1) {
    result.push(...(at.get(index) || []));
    if (index < rows.length) result.push(rows[index]);
  }
  result.push(...after);
  if (currentMessage) result.push(currentMessage);
  return result;
}

export function normalizePromptPreset(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_prompt_preset");
  if (input.format !== undefined && input.format !== "nyra.prompt-preset") throw new Error("invalid_prompt_preset_format");
  if (input.version !== undefined && input.version !== 1) throw new Error("unsupported_prompt_preset_version");
  if (!Array.isArray(input.promptLayout)) throw new Error("prompt_layout_required");
  if (input.name !== undefined && typeof input.name !== "string") throw new Error("invalid_prompt_preset_name");
  if (input.platformAdditionsEnabled !== undefined && typeof input.platformAdditionsEnabled !== "boolean") throw new Error("invalid_prompt_preset_switch");
  const seen = new Set();
  for (const item of input.promptLayout) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !normalizeId(item.id || item.blockId || item.section)) throw new Error("invalid_prompt_preset_block");
    const id = normalizeId(item.id || item.blockId || item.section);
    if (seen.has(id)) throw new Error("duplicate_prompt_preset_block");
    seen.add(id);
    if (item.role !== undefined && !PROMPT_LAYOUT_ROLES.includes(item.role)) throw new Error("invalid_prompt_preset_role");
    if (item.position !== undefined && !PROMPT_LAYOUT_POSITIONS.includes(item.position)) throw new Error("invalid_prompt_preset_position");
    if (item.enabled !== undefined && typeof item.enabled !== "boolean") throw new Error("invalid_prompt_preset_enabled");
    if (item.depth !== undefined && (!Number.isInteger(item.depth) || item.depth < 0 || item.depth > 64)) throw new Error("invalid_prompt_preset_depth");
  }
  return {
    format: "nyra.prompt-preset",
    version: 1,
    name: String(input.name || "Prompt").trim().slice(0, 100) || "Prompt",
    promptLayout: normalizePromptLayout(input.promptLayout),
    platformAdditionsEnabled: input.platformAdditionsEnabled !== false,
  };
}
