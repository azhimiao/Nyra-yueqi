/**
 * Manual turn summary — checkbox of recent rounds in the
 * one Conversation V2 thread, condensed into a single lived memory.
 * Not origin / character_canon. Does not clear the chat.
 */

import { callModel } from "../model/client.js";
import { getActiveSessionForCharacter } from "../conversation/store.js";
import { selectVisibleHistory } from "../conversation/selectors.js";
import { stripRuntimeMetadataPreview } from "../runtime/protocol.js";
import { stripInnerStatePreview } from "../chat/inner-state.js";
import { fileDrawer } from "./palace/drawer.js";
import {
  hashPalaceContent,
  PALACE_PROJECTION_VERSION,
} from "./projection/palace-index-contract.js";
import {
  buildLanguageContext,
  formatLanguageDirective,
  outputLanguageRule,
} from "../i18n/language-context.js";

export const SESSION_SUMMARY_SOURCE = "chat.memory";
export const SESSION_SUMMARY_SOURCE_TYPE = "stable_memory";
export const SESSION_SUMMARY_KIND = "conversation.turn_summary";
export const MAX_ROUNDS_SHOWN = 48;
export const MAX_MESSAGE_IDS = 80;
export const MAX_TRANSCRIPT_CHARS = 28_000;

export function sanitizeTurnText(content = "") {
  return stripRuntimeMetadataPreview(stripInnerStatePreview(content))
    .replace(/\s+/g, " ")
    .trim();
}

export function previewSnippet(text, n = 40) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return raw.length <= n ? raw : `${raw.slice(0, n)}…`;
}

/**
 * One round = user (+ following assistant), user then assistant.
 * System notes are skipped.
 * @param {{ role?: string, messageId?: string, content?: string }[]} lines
 */
export function buildChatRounds(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const rounds = [];
  let i = 0;
  let key = 0;
  while (i < rows.length) {
    const line = rows[i];
    if (line?.role === "system") {
      i += 1;
      continue;
    }
    if (line?.role === "user") {
      const next = rows[i + 1];
      if (next?.role === "assistant") {
        rounds.push({ key: key++, lineStart: i, lineEnd: i + 1 });
        i += 2;
      } else {
        rounds.push({ key: key++, lineStart: i, lineEnd: i });
        i += 1;
      }
      continue;
    }
    rounds.push({ key: key++, lineStart: i, lineEnd: i });
    i += 1;
  }
  return rounds;
}

export function messageIdsForRound(lines, round) {
  const out = [];
  if (!round) return out;
  for (let j = round.lineStart; j <= round.lineEnd; j += 1) {
    const id = String(lines[j]?.messageId || lines[j]?.id || "").trim();
    if (id) out.push(id);
  }
  return out;
}

/**
 * Recent rounds from the active conversation of this character.
 * @param {string} characterId
 * @param {{ limit?: number }} [opts]
 */
export function listRecentRoundsForSummary(characterId, opts = {}) {
  const cid = String(characterId || "").trim();
  if (!cid) {
    return { characterId: "", sessionId: "", lines: [], rounds: [] };
  }
  const session = getActiveSessionForCharacter(cid);
  if (!session) {
    return { characterId: cid, sessionId: "", lines: [], rounds: [] };
  }
  const history = selectVisibleHistory(session).map((row) => ({
    messageId: String(row.messageId || row.id || ""),
    role: String(row.role || ""),
    content: sanitizeTurnText(row.content || row.text || ""),
    createdAt: String(row.createdAt || ""),
  }));
  const allRounds = buildChatRounds(history);
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : MAX_ROUNDS_SHOWN;
  const windowed = allRounds.length > limit ? allRounds.slice(-limit) : allRounds;
  const rounds = windowed.map((round) => {
    const userLine = history[round.lineStart];
    const tail = round.lineEnd > round.lineStart ? history[round.lineEnd] : null;
    const messageIds = messageIdsForRound(history, round);
    return {
      key: round.key,
      lineStart: round.lineStart,
      lineEnd: round.lineEnd,
      messageIds,
      ready: messageIds.length > 0,
      userPreview: userLine?.role === "user" ? previewSnippet(userLine.content) : "",
      assistantPreview: tail?.role === "assistant" ? previewSnippet(tail.content) : "",
    };
  });
  return {
    characterId: cid,
    sessionId: String(session.id || ""),
    lines: history,
    rounds,
  };
}

export function collectMessageIdsForRounds(model, selectedKeys) {
  const want = new Set((selectedKeys || []).map((k) => Number(k)));
  const ids = [];
  const seen = new Set();
  for (const round of model?.rounds || []) {
    if (!want.has(Number(round.key)) || !round.ready) continue;
    for (const id of round.messageIds || []) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.slice(0, MAX_MESSAGE_IDS);
}

export function buildTranscriptFromIds(lines, messageIds) {
  const want = new Set((messageIds || []).map((id) => String(id)));
  const dialogue = (lines || []).filter((line) => {
    if (!want.has(String(line.messageId || line.id || ""))) return false;
    return line.role === "user" || line.role === "assistant";
  });
  return dialogue
    .map((line) => (line.role === "user"
      ? `USER (human): ${line.content}`
      : `ASSISTANT (in-character): ${line.content}`))
    .join("\n\n");
}

export function parseConsolidatedMemoryJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const blob = fenced?.[1] || text.match(/\{[\s\S]*\}/)?.[0];
    if (!blob) return null;
    try {
      parsed = JSON.parse(blob);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rawContent = String(parsed.rawContent || parsed.content || "").trim();
  if (!rawContent) return null;
  const impRaw = parsed.importance;
  const importance = typeof impRaw === "number" && Number.isFinite(impRaw)
    ? Math.min(10, Math.max(1, Math.round(impRaw)))
    : 6;
  return {
    rawContent,
    importance,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}

function weightFromImportance(importance) {
  const n = Number(importance) || 6;
  if (n >= 9) return 1.7;
  if (n >= 7) return 1.45;
  if (n >= 5) return 1.2;
  return 0.95;
}

function titleFromContent(rawText) {
  const first = String(rawText || "").split(/[。！？\n]/).find((part) => part.trim()) || "";
  const clean = first.trim();
  if (!clean) return "";
  return clean.length > 24 ? `${clean.slice(0, 24)}…` : clean;
}

function providerReady(config) {
  return Boolean(config?.baseUrl && config?.apiKey && config?.model);
}

/**
 * @param {object} input
 * @param {string} input.characterId
 * @param {number[]} input.roundKeys
 * @param {() => object|Promise<object>} input.collectProviderConfig
 * @param {(record: object, opts?: object) => Promise<object|null>} [input.fileDrawer]
 * @param {typeof callModel} [input.callModel]
 * @param {string} [input.characterName]
 */
export async function summarizeSelectedTurns(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const model = listRecentRoundsForSummary(characterId);
  if (!model.sessionId) {
    return { ok: false, reason: "NO_SESSION", message: "还没有可总结的对话。" };
  }
  const messageIds = collectMessageIdsForRounds(model, input.roundKeys);
  if (!messageIds.length) {
    return {
      ok: false,
      reason: "EMPTY_SELECTION",
      message: "请勾选至少一轮已经落库的对话。",
    };
  }
  const transcript = buildTranscriptFromIds(model.lines, messageIds);
  if (!transcript.trim()) {
    return { ok: false, reason: "EMPTY_TRANSCRIPT", message: "勾选的轮次没有可总结的正文。" };
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return {
      ok: false,
      reason: "TOO_LONG",
      message: `勾选内容过长（${transcript.length} 字，上限 ${MAX_TRANSCRIPT_CHARS}）。请少选几轮。`,
    };
  }

  const config = typeof input.collectProviderConfig === "function"
    ? await input.collectProviderConfig()
    : (input.collectProviderConfig || {});
  if (!providerReady(config)) {
    return {
      ok: false,
      reason: "PROVIDER_REQUIRED",
      message: "当前不能总结：请先配置可用的模型接口。",
    };
  }

  const lang = buildLanguageContext({
    conversationLanguage: input.conversationLanguage,
    appLocale: input.appLocale,
  });
  const runModel = typeof input.callModel === "function" ? input.callModel : callModel;
  const userPrompt = [
    "Consolidate the selected transcript into ONE long-term lived memory of time together (not character backstory / origin canon).",
    "",
    "Rules:",
    '- Output JSON only: {"rawContent":"...","importance":1-10,"rationale":"..."}',
    "- rawContent: third-person or shared-life tone about what happened between the user and the companion.",
    "- Do not treat in-character assistant lines as the human user's biography.",
    "- Do not invent origin history. Distill durable facts, feelings, and agreements — do not copy the whole transcript.",
    "- importance: 1 trivial … 10 life-changing for the relationship.",
    "",
    "Transcript:",
    transcript,
  ].join("\n");

  let rawReply = "";
  try {
    const result = await runModel(
      config,
      [
        {
          role: "system",
          content: [
            "You consolidate selected chat turns into a single lived memory note. Output one JSON object only.",
            formatLanguageDirective(lang),
            outputLanguageRule(lang),
          ].join("\n\n"),
        },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.2,
        stream: false,
        companionId: characterId,
        businessPurpose: "memory.turn_summary",
        capability: "chat",
      },
    );
    rawReply = String(result?.content || "");
  } catch (error) {
    return {
      ok: false,
      reason: "MODEL_FAILED",
      message: `总结失败：${error?.message || "unknown"}`,
    };
  }

  const consolidated = parseConsolidatedMemoryJson(rawReply);
  if (!consolidated) {
    return { ok: false, reason: "PARSE_FAILED", message: "模型返回无法解析为记忆，未写入。" };
  }

  const nowIso = new Date().toISOString();
  const sourceId = `turn-summary:${characterId}:${Date.now().toString(16)}`;
  const rawText = consolidated.rawContent;
  const sourceRef = {
    kind: SESSION_SUMMARY_KIND,
    sourceType: SESSION_SUMMARY_SOURCE_TYPE,
    conversationId: model.sessionId,
    sessionId: model.sessionId,
    messageIds,
    characterId,
  };
  const drawer = typeof input.fileDrawer === "function" ? input.fileDrawer : fileDrawer;
  const saved = await drawer({
    id: sourceId,
    drawerId: sourceId,
    title: titleFromContent(rawText) || "会话总结",
    rawText,
    source: SESSION_SUMMARY_SOURCE,
    sourceType: SESSION_SUMMARY_SOURCE_TYPE,
    sourceId,
    sourceRef,
    projectionKind: "turn_summary",
    projectionVersion: PALACE_PROJECTION_VERSION,
    contentHash: hashPalaceContent(rawText),
    authority: "projection",
    wing: "Relationship",
    room: "Chat",
    companionId: characterId,
    characterId,
    tags: ["session_summary", "summarized_turns"],
    weight: weightFromImportance(consolidated.importance),
    pinned: consolidated.importance >= 8,
    searchable: true,
    role: String(input.characterName || "").trim(),
    createdAt: nowIso,
    indexedAt: nowIso,
    allowProjectionWrite: true,
  }, { allowProjectionWrite: true });

  if (!saved) {
    return { ok: false, reason: "WRITE_FAILED", message: "记忆没有写入。" };
  }

  return {
    ok: true,
    record: saved,
    sessionId: model.sessionId,
    messageIds,
    importance: consolidated.importance,
  };
}
