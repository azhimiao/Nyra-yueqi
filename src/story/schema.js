/**
 * E1 剧章 — chapter/node schema + validate + reachability.
 */

/**
 * @typedef {{ id: string, label: string, nextNodeId: string }} StoryChoice
 * @typedef {{
 *   id: string,
 *   kind: "beat"|"choice"|"ending",
 *   body?: string,
 *   choices?: StoryChoice[],
 *   endingTitle?: string,
 *   endingSummary?: string,
 * }} StoryNode
 * @typedef {{
 *   id: string,
 *   title: string,
 *   hook: string,
 *   theme: "mint"|"coral"|"ink"|"yellow",
 *   startNodeId: string,
 *   nodes: StoryNode[],
 *   version: 1,
 * }} StoryChapter
 */

const THEMES = new Set(["mint", "coral", "ink", "yellow"]);
const KINDS = new Set(["beat", "choice", "ending"]);

/**
 * @param {unknown} chapter
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateChapter(chapter) {
  /** @type {string[]} */
  const errors = [];
  if (!chapter || typeof chapter !== "object") {
    return { ok: false, errors: ["chapter_not_object"] };
  }
  const ch = /** @type {Record<string, unknown>} */ (chapter);
  if (!String(ch.id || "").trim()) errors.push("missing_id");
  if (!String(ch.title || "").trim()) errors.push("missing_title");
  if (!String(ch.hook || "").trim()) errors.push("missing_hook");
  if (!THEMES.has(String(ch.theme || ""))) errors.push("bad_theme");
  if (!String(ch.startNodeId || "").trim()) errors.push("missing_startNodeId");
  if (ch.version !== 1) errors.push("bad_version");
  if (!Array.isArray(ch.nodes) || !ch.nodes.length) {
    errors.push("nodes_empty");
    return { ok: false, errors };
  }

  const ids = new Set();
  for (const node of ch.nodes) {
    if (!node || typeof node !== "object") {
      errors.push("node_not_object");
      continue;
    }
    const n = /** @type {StoryNode} */ (node);
    const id = String(n.id || "").trim();
    if (!id) {
      errors.push("node_missing_id");
      continue;
    }
    if (ids.has(id)) errors.push(`dup_node:${id}`);
    ids.add(id);
    if (!KINDS.has(n.kind)) errors.push(`bad_kind:${id}`);
    if (n.kind === "choice") {
      const choices = Array.isArray(n.choices) ? n.choices : [];
      if (choices.length < 2 || choices.length > 4) {
        errors.push(`choice_count:${id}`);
      }
      for (const choice of choices) {
        if (!String(choice?.id || "").trim()) errors.push(`choice_id:${id}`);
        if (!String(choice?.label || "").trim()) errors.push(`choice_label:${id}`);
        if (!String(choice?.nextNodeId || "").trim()) errors.push(`choice_next:${id}`);
      }
    }
    if (n.kind === "ending") {
      if (!String(n.endingTitle || "").trim() && !String(n.body || "").trim()) {
        errors.push(`ending_empty:${id}`);
      }
    }
  }

  const start = String(ch.startNodeId || "").trim();
  if (start && !ids.has(start)) errors.push("start_missing");

  for (const node of /** @type {StoryNode[]} */ (ch.nodes)) {
    if (node.kind !== "choice") continue;
    for (const choice of node.choices || []) {
      const next = String(choice.nextNodeId || "").trim();
      if (next && !ids.has(next)) errors.push(`dangling:${node.id}->${next}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * BFS from startNodeId. For beat/ending, follows implicit single edge via
 * `choices[0]` if present; otherwise only choice nodes branch.
 * Beat nodes without choices are terminal for reachability unless they have
 * a `nextNodeId` — we treat beat→next via optional `nextNodeId` on beat,
 * or via first choice. Spec uses choice nodes for branching; beat bodies
 * advance via `advanceNode` which for beat without choice uses `nextNodeId`.
 *
 * @param {StoryChapter} chapter
 * @returns {Set<string>}
 */
export function reachability(chapter) {
  const nodes = Array.isArray(chapter?.nodes) ? chapter.nodes : [];
  /** @type {Map<string, StoryNode>} */
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = String(chapter?.startNodeId || "").trim();
  /** @type {Set<string>} */
  const seen = new Set();
  if (!start || !byId.has(start)) return seen;

  /** @type {string[]} */
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    if (node.kind === "choice") {
      for (const choice of node.choices || []) {
        const next = String(choice.nextNodeId || "").trim();
        if (next && !seen.has(next)) queue.push(next);
      }
    } else if (node.kind === "beat") {
      const next = String(/** @type {{ nextNodeId?: string }} */ (node).nextNodeId || "").trim();
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}
