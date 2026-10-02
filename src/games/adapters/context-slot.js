/**
 * Minimal context extension slot for game observations.
 * Avoids refactoring Context Builder / assemble pipeline.
 */

/** @type {Map<string, object>} */
const byConversation = new Map();

/**
 * @param {string} conversationId
 * @param {object|null} observation
 */
export function setGameContextExtension(conversationId, observation) {
  const id = String(conversationId || "").trim();
  if (!id) return;
  if (!observation) {
    byConversation.delete(id);
    return;
  }
  byConversation.set(id, {
    ...observation,
    memoryPolicy: observation.memoryPolicy || "game_only",
  });
}

/**
 * @param {string} conversationId
 */
export function getGameContextExtension(conversationId) {
  const id = String(conversationId || "").trim();
  if (!id) return null;
  return byConversation.get(id) || null;
}

/**
 * Format the prompt block for the character agent.
 * Engine observations are already actor-scoped — dump them. Dropping
 * fields here is what made poetic titles (e.g. 心跳同步) get roleplayed
 * as intimacy instead of as the actual number-card game.
 * @param {object|null} obs
 */
export function formatGameObservationBlock(obs) {
  if (!obs || typeof obs !== "object" || obs.error) return "";
  const lines = [
    "<yueqi-game-context>",
    "这是一局正在进行的规则游戏。标题只是名字，不要按字面做无关的情景扮演。",
    `gameId: ${obs.gameId || ""}`,
  ];
  if (obs.title) lines.push(`title: ${obs.title}`);
  if (obs.description) lines.push(`description: ${obs.description}`);
  if (obs.rules) lines.push(`rules: ${obs.rules}`);
  if (obs.role || obs.yourRole) lines.push(`role: ${obs.role || obs.yourRole}`);
  if (obs.phase) lines.push(`phase: ${obs.phase}`);
  if (obs.round != null || obs.roundIndex != null) {
    lines.push(`round: ${obs.round ?? obs.roundIndex}`);
  }
  if (obs.currentObjective || obs.objective) {
    lines.push(`objective: ${obs.currentObjective || obs.objective}`);
  }
  if (obs.publicState != null) {
    lines.push(`publicState: ${safeJson(obs.publicState)}`);
  }
  if (obs.privateState != null) {
    lines.push(`privateState: ${safeJson(obs.privateState)}`);
  }
  const allowed = Array.isArray(obs.allowedActions) ? obs.allowedActions : [];
  if (allowed.length) {
    lines.push(`allowedActions: ${safeJson(allowed)}`);
  }
  if (obs.outputContract) {
    lines.push(`outputContract: ${safeJson(obs.outputContract)}`);
  }
  const already = new Set([
    "gameId",
    "title",
    "description",
    "rules",
    "role",
    "yourRole",
    "phase",
    "round",
    "roundIndex",
    "currentObjective",
    "objective",
    "publicState",
    "privateState",
    "allowedActions",
    "outputContract",
    "memoryPolicy",
    "error",
  ]);
  const leftover = {};
  for (const [key, value] of Object.entries(obs)) {
    if (!already.has(key) && value != null && value !== "") leftover[key] = value;
  }
  if (Object.keys(leftover).length) {
    lines.push(`observation: ${safeJson(leftover)}`);
  }
  lines.push("你必须按 rules 与 observation 行动；禁止只凭游戏标题发挥。");
  lines.push("可见回复保持人设，但必须对应 allowedActions 中的一个动作，并在回复里清楚体现该动作。");
  lines.push("不要编造引擎未给出的秘密信息。游戏虚构事实不得当作长期记忆。");
  lines.push("</yueqi-game-context>");
  return lines.join("\n");
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "\"\"";
  }
}
