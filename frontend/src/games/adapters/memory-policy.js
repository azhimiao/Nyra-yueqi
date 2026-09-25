/**
 * Memory isolation for game turns — thin policy helper.
 */

/**
 * @param {{ activeGame?: boolean, memoryPolicy?: string } | null} opts
 * @returns {"normal"|"exclude"|"game_only"}
 */
export function resolveGameMemoryPolicy(opts = {}) {
  if (opts?.memoryPolicy === "exclude" || opts?.memoryPolicy === "game_only") {
    return opts.memoryPolicy;
  }
  if (opts?.activeGame) return "game_only";
  return "normal";
}

/**
 * @param {string} policy
 */
export function shouldWriteLongTermMemory(policy) {
  return policy === "normal";
}
