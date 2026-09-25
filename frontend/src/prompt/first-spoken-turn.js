/**
 * Chat Completions / SillyTavern invariant:
 *   prior transcript  +  current user turn (once)
 *
 * Continuity is the transcript. After persist-then-assemble, the current
 * sentence is already the latest user row — that row is the turn being
 * answered, not past chat. Anything after that user row is not prior either.
 *
 * @param {Array<{ role?: string, content?: string }>|null|undefined} historyMessages
 * @param {string} [currentInput]
 * @returns {{
 *   priorMessages: Array<{ role?: string, content?: string }>,
 *   currentUserContent: string,
 *   currentAlreadyInHistory: boolean,
 * }}
 */
export function splitTurnHistory(historyMessages = [], currentInput = "") {
  const rows = Array.isArray(historyMessages) ? historyMessages : [];
  const current = String(currentInput || "").trim();
  if (!current) {
    return {
      priorMessages: rows,
      currentUserContent: "",
      currentAlreadyInHistory: false,
    };
  }

  let lastUserIndex = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const item = rows[index];
    if (String(item?.role || "") === "user" && String(item?.content || "").trim()) {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) {
    return {
      priorMessages: rows,
      currentUserContent: current,
      currentAlreadyInHistory: false,
    };
  }

  const lastUserText = String(rows[lastUserIndex].content || "").trim();
  if (lastUserText !== current) {
    return {
      priorMessages: rows,
      currentUserContent: current,
      currentAlreadyInHistory: false,
    };
  }

  return {
    priorMessages: rows.slice(0, lastUserIndex),
    currentUserContent: current,
    currentAlreadyInHistory: true,
  };
}

function userTurns(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((item) => (
    String(item?.role || "") === "user" && String(item?.content || "").trim()
  ));
}

/**
 * First spoken turn = no user utterance in the prior transcript.
 * Continue/regenerate (empty current input) still counts as first when the
 * transcript has at most one user line.
 *
 * @param {Array<{ role?: string, content?: string }>|null|undefined} historyMessages
 * @param {string} [currentInput]
 * @returns {boolean}
 */
export function isFirstSpokenTurn(historyMessages = [], currentInput = "") {
  const current = String(currentInput || "").trim();
  if (!current) return userTurns(historyMessages).length <= 1;
  return userTurns(splitTurnHistory(historyMessages, current).priorMessages).length === 0;
}
