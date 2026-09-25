/**
 * C5 — Multi-turn collaboration engine (offline-first sample + optional LLM).
 */

import {
  countInteractiveTurns,
  isCompleteWork,
  MIN_TURNS_FOR_COMPLETE,
  uid,
  nowIso,
  summarizeContent,
} from "./session-schema.js";
import { appendTurn, getSession, saveSession, syncActiveVersion, updateTurn } from "./session-store.js";
import {
  commitVersion,
  getCurrentContent,
  getVersion,
  undoVersion,
  restoreVersion,
  updateArtifactMeta,
} from "./artifact-store.js";

/**
 * Character voice snippets keyed lightly by name (not identical across roles).
 * @param {string} name
 * @param {string} type
 */
function voiceFor(name, type) {
  const n = String(name || "ta").trim() || "ta";
  if (type === "date_scene") {
    return `${n}想把约会写成你们会记得的一幕，而不是说明书。`;
  }
  if (type === "world_setting") {
    return `${n}想先和你约定关系里的关键词，再写进共同世界。`;
  }
  return `${n}愿意把一段往事摊开，但需要你一起挑哪些留下。`;
}

/**
 * Build offline multi-round proposals based on task + round index.
 * @param {{
 *   type: string,
 *   characterName?: string,
 *   userText?: string,
 *   roundIndex: number,
 *   currentContent?: object,
 * }} ctx
 */
export function offlineCharacterReply(ctx) {
  const name = String(ctx.characterName || "ta").trim() || "ta";
  const round = Math.max(0, Number(ctx.roundIndex) || 0);
  const userText = String(ctx.userText || "").trim();
  const content = ctx.currentContent && typeof ctx.currentContent === "object"
    ? JSON.parse(JSON.stringify(ctx.currentContent))
    : null;
  const emotion = round === 0 ? "warm" : round === 1 ? "shy" : round >= 2 ? "soft" : "warm";

  if (ctx.type === "date_scene") {
    const title = userText
      ? `约会 · ${userText.slice(0, 10)}`
      : (content?.title || `${name}与你的雨夜`);
    const premise = userText
      ? `${name}与你约在「${userText.slice(0, 24)}」。空气里先有一阵安静，再有一句刚好的开场。`
      : (content?.premise || `${name}约你出门，却把真正想说的话藏在路线里。`);
    const openingBeat = round === 0
      ? `街灯刚亮。${name}把袖口往下拉了拉，看你一眼又移开。`
      : round === 1
        ? `你们并肩走了一段。ta忽然停住：「要不要……绕远一点？」`
        : `坐下以后，ta把话题轻轻推向你：「这一幕，我想写成我们的。」`;
    const patch = {
      kind: "date_scene",
      title,
      premise,
      openingBeat,
      mood: round >= 2 ? "night" : "warm",
      beats: [
        ...(Array.isArray(content?.beats) ? content.beats : []),
        { at: round, text: openingBeat },
      ],
    };
    return {
      text: `${voiceFor(name, "date_scene")}${userText ? ` 你刚说的「${userText.slice(0, 18)}」，我想写进开场。` : ""}`,
      emotion,
      proposals: [
        {
          id: uid("prop"),
          text: `采纳：${title}`,
          patch,
          status: "pending",
        },
        {
          id: uid("prop"),
          text: "备选：把气氛改得更克制一点",
          patch: { ...patch, mood: "cool", premise: `${premise} 语气更克制。` },
          status: "pending",
        },
      ],
    };
  }

  if (ctx.type === "world_setting") {
    const keyword = userText || "并肩、留灯、不用解释的沉默";
    const relationshipSummary = `${name}与你：以「${keyword.slice(0, 28)}」为关系底色。会吃醋，但更会先确认你还在。`;
    const entry = {
      id: uid("wb"),
      title: `共同世界 · ${name}`,
      content: relationshipSummary,
      triggers: keyword.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 4),
      category: "关系",
      linkedCharacterIds: [],
    };
    if (!entry.triggers.length) entry.triggers = ["我们", name];
    const prevEntries = Array.isArray(content?.worldEntries) ? content.worldEntries : [];
    const patch = {
      kind: "world_setting",
      relationshipSummary,
      worldEntries: [...prevEntries.filter((e) => e.title !== entry.title), entry],
    };
    return {
      text: `${voiceFor(name, "world_setting")}${userText ? ` 你提到的「${userText.slice(0, 16)}」，我想当作触发词。` : ""}`,
      emotion,
      proposals: [
        {
          id: uid("prop"),
          text: "写入关系摘要 + 世界书条目",
          patch,
          status: "pending",
        },
        {
          id: uid("prop"),
          text: "只更新关系摘要，暂不写世界书",
          patch: { kind: "world_setting", relationshipSummary, worldEntries: prevEntries },
          status: "pending",
        },
      ],
    };
  }

  // backstory
  const detail = userText || "雨停之前把灯留着";
  const text = round === 0
    ? `${name}记得那晚：${detail}。ta没把整段说完，只留下温度。`
    : round === 1
      ? `后来ta补充：那件事之后，ta更会留意你有没有回头看ta一眼。关键词仍绕着「${detail.slice(0, 12)}」。`
      : `定稿倾向：把这段往事写成ta愿意被你读到的版本——温柔、不急，细节留白给你。`;
  const patch = {
    kind: "backstory",
    text,
    fieldIndex: 4,
    tokens: [detail.slice(0, 8), "往事", name].filter(Boolean).slice(0, 6),
  };
  return {
    text: `${voiceFor(name, "backstory")}${userText ? ` 关于「${userText.slice(0, 18)}」……` : ""}`,
    emotion,
    proposals: [
      {
        id: uid("prop"),
        text: "接受这段往事写入人设摘要",
        patch,
        status: "pending",
      },
      {
        id: uid("prop"),
        text: "改得更短、更克制",
        patch: {
          ...patch,
          text: `${name}有一段关于「${detail.slice(0, 16)}」的往事，话少，但记得清。`,
        },
        status: "pending",
      },
    ],
  };
}

/**
 * Seed the first character turn so the session is never a blank chat void.
 * Consumer path — not a developer "sample" button.
 * @param {string} sessionId
 * @param {{ characterName?: string }} [opts]
 */
export function seedSessionOpening(sessionId, opts = {}) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  if ((session.turns || []).length > 0) return session;

  const name = String(opts.characterName || "ta").trim() || "ta";
  const opening = session.type === "date_scene"
    ? `${name}看着你：「我们从哪一个瞬间开始？你先说，我不替我们决定结局。」`
    : session.type === "world_setting"
      ? `${name}把空白页推到你面前：「先写下你最在意的一条。规则可以以后再长出来。」`
      : `${name}安静了一会儿：「你想先听哪一段？不确定的地方，我们一起留白。」`;

  const turn = {
    id: uid("turn"),
    role: "character",
    text: opening,
    emotion: "warm",
    proposals: [],
    createdAt: nowIso(),
  };
  return appendTurn(sessionId, turn);
}

/**
 * Test-only multi-round offline path (not exposed in consumer UI).
 * @param {string} sessionId
 * @param {{ characterName?: string, seeds?: string[] }} [opts]
 */
export function runOfflineSampleCollaboration(sessionId, opts = {}) {
  const seeds = opts.seeds || ["雨夜的灯", "想绕远一点走", "我们之间的默契"];
  const results = [];
  for (let i = 0; i < seeds.length; i += 1) {
    results.push(submitUserMessage(sessionId, seeds[i], {
      characterName: opts.characterName,
      offlineOnly: true,
    }));
  }
  return results;
}

/**
 * @param {string} sessionId
 * @param {string} text
 * @param {{ characterName?: string, offlineOnly?: boolean, llmReply?: object }} [opts]
 */
export function submitUserMessage(sessionId, text, opts = {}) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("empty_message");

  const userTurn = {
    id: uid("turn"),
    role: "user",
    text: clean,
    proposals: [],
    createdAt: nowIso(),
  };
  appendTurn(sessionId, userTurn);

  const content = getCurrentContent(session.artifactId);
  const roundIndex = Math.max(0, countInteractiveTurns(getSession(sessionId)) - 1);

  let reply = opts.llmReply;
  if (!reply) {
    reply = offlineCharacterReply({
      type: session.type,
      characterName: opts.characterName,
      userText: clean,
      roundIndex,
      currentContent: content,
    });
  }

  const charTurn = {
    id: uid("turn"),
    role: "character",
    text: String(reply.text || "").trim() || "……我想再想一想。",
    emotion: reply.emotion || "warm",
    thinking: false,
    proposals: Array.isArray(reply.proposals) ? reply.proposals : [],
    createdAt: nowIso(),
  };
  const next = appendTurn(sessionId, charTurn);

  if (isCompleteWork(next)) {
    updateArtifactMeta(session.artifactId, { complete: true });
  }

  return { session: next, userTurn, characterTurn: charTurn };
}

/**
 * Accept one proposal → new artifact version.
 * @param {string} sessionId
 * @param {string} turnId
 * @param {string} proposalId
 */
export function acceptProposal(sessionId, turnId, proposalId) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const turn = (session.turns || []).find((t) => t.id === turnId);
  if (!turn) throw new Error("turn_not_found");
  const prop = (turn.proposals || []).find((p) => p.id === proposalId);
  if (!prop) throw new Error("proposal_not_found");
  if (prop.status === "accepted") {
    return { session, version: getVersion(session.activeVersionId), already: true };
  }

  const { artifact, version } = commitVersion(session.artifactId, prop.patch, {
    summary: summarizeContent(prop.patch),
    sourceTurnIds: [turnId],
    markComplete: countInteractiveTurns(session) >= MIN_TURNS_FOR_COMPLETE,
  });

  const proposals = (turn.proposals || []).map((p) => {
    if (p.id === proposalId) return { ...p, status: "accepted" };
    if (p.status === "pending") return { ...p, status: "rejected" };
    return p;
  });
  updateTurn(sessionId, turnId, { proposals });
  const next = syncActiveVersion(sessionId, version.id);
  return { session: next, artifact, version, already: false };
}

/**
 * Reject proposal without changing artifact.
 */
export function rejectProposal(sessionId, turnId, proposalId) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const turn = (session.turns || []).find((t) => t.id === turnId);
  if (!turn) throw new Error("turn_not_found");
  const proposals = (turn.proposals || []).map((p) => (
    p.id === proposalId ? { ...p, status: "rejected" } : p
  ));
  const next = updateTurn(sessionId, turnId, { proposals });
  return { session: next, unchangedContent: getCurrentContent(session.artifactId) };
}

/**
 * Edit then accept: merge edited patch text into proposal.
 */
export function editAndAcceptProposal(sessionId, turnId, proposalId, editedPatch) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const turn = (session.turns || []).find((t) => t.id === turnId);
  if (!turn) throw new Error("turn_not_found");
  const proposals = (turn.proposals || []).map((p) => (
    p.id === proposalId
      ? { ...p, patch: editedPatch && typeof editedPatch === "object" ? editedPatch : p.patch, status: "edited", text: p.text }
      : p
  ));
  updateTurn(sessionId, turnId, { proposals });
  return acceptProposal(sessionId, turnId, proposalId);
}

export function undoArtifact(sessionId) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const result = undoVersion(session.artifactId);
  if (result?.changed && result.version) {
    syncActiveVersion(sessionId, result.version.id);
  }
  return result;
}

export function restoreArtifact(sessionId) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const result = restoreVersion(session.artifactId);
  if (result?.changed && result.version) {
    syncActiveVersion(sessionId, result.version.id);
  }
  return result;
}

export function markThinking(sessionId, thinking) {
  const session = getSession(sessionId);
  if (!session) return null;
  // Ephemeral UI flag stored on last character-shaped assistant placeholder — no-op store; UI handles.
  return saveSession({ ...session, updatedAt: nowIso() });
}

export { isCompleteWork, countInteractiveTurns, MIN_TURNS_FOR_COMPLETE };
