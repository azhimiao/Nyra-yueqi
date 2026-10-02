/** Render/repair the IDB view from the active V2 branch without creating turns. */
export function projectChatHistory(rows = [], existingMessages = [], { sessionId, conversationSessionId } = {}) {
  const aliases = (row) => [row.id, row.messageId, row.meta?.clientMessageId, row.meta?.legacyMessageId,
    row.metadata?.clientMessageId, row.metadata?.legacyMessageId, row.metadata?.conversationNodeId,
    row.metadata?.conversationTurnId].filter(Boolean).map(String);
  const existingById = new Map();
  for (const row of existingMessages) for (const id of aliases(row)) existingById.set(id, row);
  const repairs = [];
  const used = new Set();
  const messages = rows.map((row) => {
    const previous = aliases(row).map(id => existingById.get(id)).find(Boolean);
    if (previous) used.add(previous);
    const metadata = {
      ...(row.meta || {}), ...(previous?.metadata || {}),
      conversationSessionId,
      conversationNodeId: row.messageId || row.id,
      conversationTurnId: row.messageId || row.id,
      conversationCandidateId: row.candidateId || "",
    };
    if (row.role === "assistant") {
      // These fields belong to the active candidate, including an intentional
      // absence after regenerating while inner-state output is disabled.
      metadata.turnActivity = row.meta?.turnActivity;
      metadata.characterAffect = row.meta?.characterAffect;
    }
    const projected = {
      id: previous?.id || row.meta?.clientMessageId || row.meta?.legacyMessageId || row.id,
      sessionId, role: row.role, content: String(row.content ?? row.text ?? ""),
      createdAt: previous?.createdAt || row.meta?.originalCreatedAt || row.createdAt,
      metadata,
    };
    if (!previous || previous.content !== projected.content
      || (row.candidateId && previous.metadata?.conversationCandidateId !== row.candidateId)
      || JSON.stringify(previous.metadata?.turnActivity) !== JSON.stringify(metadata.turnActivity)
      || JSON.stringify(previous.metadata?.characterAffect) !== JSON.stringify(metadata.characterAffect)) {
      repairs.push(projected);
    }
    return projected;
  });
  // Local system cards need not be model history. User/assistant rows from a
  // deleted or inactive branch must never reappear through the IDB mirror.
  messages.push(...existingMessages.filter(row => row.role === "system" && !used.has(row)));
  messages.sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""));
  return { messages, repairs };
}
