/**
 * E1 剧章 — advance + progress normalize.
 */

/**
 * @typedef {{
 *   activeChapterId: string,
 *   activeNodeId: string,
 *   completedChapterIds: string[],
 *   updatedAt: string,
 * }} StoryProgress
 */

/**
 * @param {import("./schema.js").StoryChapter} chapter
 * @param {string} nodeId
 * @param {string} [choiceId]
 * @returns {{ nextNodeId: string|null, error?: string }}
 */
export function advanceNode(chapter, nodeId, choiceId) {
  try {
    const nodes = Array.isArray(chapter?.nodes) ? chapter.nodes : [];
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return { nextNodeId: null, error: "unknown_node" };

    if (node.kind === "ending") {
      return { nextNodeId: null, error: "at_ending" };
    }

    if (node.kind === "beat") {
      const next = String(/** @type {{ nextNodeId?: string }} */ (node).nextNodeId || "").trim();
      if (!next) return { nextNodeId: null, error: "beat_no_next" };
      return { nextNodeId: next };
    }

    if (node.kind === "choice") {
      const cid = String(choiceId || "").trim();
      if (!cid) return { nextNodeId: null, error: "missing_choice" };
      const choice = (node.choices || []).find((item) => item.id === cid);
      if (!choice) return { nextNodeId: null, error: "bad_choice" };
      const next = String(choice.nextNodeId || "").trim();
      if (!next) return { nextNodeId: null, error: "choice_no_next" };
      return { nextNodeId: next };
    }

    return { nextNodeId: null, error: "bad_kind" };
  } catch {
    return { nextNodeId: null, error: "advance_failed" };
  }
}

/**
 * @param {unknown} raw
 * @returns {StoryProgress}
 */
export function normalizeProgress(raw) {
  const empty = {
    activeChapterId: "",
    activeNodeId: "",
    completedChapterIds: [],
    updatedAt: "",
  };
  if (!raw || typeof raw !== "object") return { ...empty };
  try {
    const bag = /** @type {Record<string, unknown>} */ (raw);
    const completed = Array.isArray(bag.completedChapterIds)
      ? bag.completedChapterIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    return {
      activeChapterId: String(bag.activeChapterId || "").trim(),
      activeNodeId: String(bag.activeNodeId || "").trim(),
      completedChapterIds: [...new Set(completed)],
      updatedAt: String(bag.updatedAt || "").trim(),
    };
  } catch {
    return { ...empty };
  }
}
