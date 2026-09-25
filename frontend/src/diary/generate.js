import { callModel } from "../model/client.js";
import {
  buildDiarySystemPrompt,
  buildDiaryUserPrompt,
  getDiaryStyle,
  parseDiaryJson,
} from "./styles.js";
import { buildContextEnvelope, formatImplicitEnvelope } from "../context/index.js";
import { buildLanguageContext, formatLanguageDirective, outputLanguageRule } from "../i18n/language-context.js";
import { renderPrompt } from "../prompts/registry.js";

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const EXCERPT_MESSAGE_LIMIT = 20;
const MEMORY_HINT_LIMIT = 4;

function resolveSpeakerLabels(deps) {
  const profile = deps.collectCharacterProfile?.() || {};
  return {
    characterId: profile.id || profile.characterId || "",
    characterName: profile.name || profile.alias || "角色",
    userName: "你",
  };
}

function messagesWithinWindow(messages, sinceMs) {
  return messages.filter((message) => {
    const created = new Date(message.createdAt).getTime();
    return Number.isFinite(created) && created >= sinceMs;
  });
}

function buildExcerpt(windowMessages, labels) {
  if (!windowMessages.length) return "";
  const truncated = windowMessages.length > EXCERPT_MESSAGE_LIMIT;
  const shown = truncated
    ? windowMessages.slice(-EXCERPT_MESSAGE_LIMIT)
    : windowMessages;
  const lines = shown.map((message) => {
    const speaker = message.role === "user" ? labels.userName : labels.characterName;
    return `${speaker}：${message.content}`;
  });
  if (truncated) {
    lines.push(
      `（过去 24 小时内共 ${windowMessages.length} 条消息，此处展示最近 ${EXCERPT_MESSAGE_LIMIT} 条）`
    );
  }
  return lines.join("\n");
}

function buildMemoryHints(memories, sinceMs) {
  const chatInWindow = memories
    .filter((record) => {
      if (record.source !== "chat.memory") return false;
      return new Date(record.createdAt).getTime() >= sinceMs;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const diaryHints = memories
    .filter((record) => record.source === "diary.memory")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const picked = [];
  for (const record of chatInWindow) {
    if (picked.length >= MEMORY_HINT_LIMIT) break;
    picked.push(record);
  }
  for (const record of diaryHints) {
    if (picked.length >= MEMORY_HINT_LIMIT) break;
    if (!picked.includes(record)) picked.push(record);
  }

  return picked
    .map((record) => `- ${record.rawText.slice(0, 80)}${record.rawText.length > 80 ? "…" : ""}`)
    .join("\n");
}

export async function buildDiaryContext(deps) {
  const {
    sessionId,
    currentDailyStatus,
  } = deps;

  const today = new Date().toISOString().slice(0, 10);
  const sinceMs = Date.now() - TWENTY_FOUR_H_MS;
  const labels = resolveSpeakerLabels(deps);
  const envelope = labels.characterId
    ? await buildContextEnvelope({
      purpose: "diary",
      appId: "diary",
      characterId: labels.characterId,
      chatSessionId: sessionId,
      currentInput: `为 ${today} 写共同日记`,
      turnIntent: "user_message",
      budgetProfile: "deep",
      historyMaxMessages: 240,
      reconcileLegacy: true,
    })
    : { historyMessages: [], blocks: [] };
  let messages = Array.isArray(envelope.historyMessages) ? envelope.historyMessages : [];
  if (!messages.length && typeof deps.getMessagesBySession === "function" && sessionId) {
    try {
      const fallback = await deps.getMessagesBySession(sessionId, 240);
      if (Array.isArray(fallback)) messages = fallback;
    } catch {
      // The enterprise context envelope remains authoritative; this fallback
      // only prevents a transient projection failure from producing an empty diary.
    }
  }
  const windowMessages = messagesWithinWindow(messages, sinceMs);
  const excerpt = buildExcerpt(windowMessages, labels);

  const memoryHints = formatImplicitEnvelope(envelope, { excludeIds: ["branch_summary"] })
    .split("\n")
    .filter((line) => line.trim())
    .slice(0, MEMORY_HINT_LIMIT + 2)
    .join("\n");

  const status = currentDailyStatus;
  const statusLine = status
    ? `${status.mood || "平静"} · ${status.weather?.label || "未知天气"} · ${status.asleep ? "休息中" : "醒着"}`
    : "平静 · 今日状态待刷新";

  return {
    date: today,
    excerpt,
    memoryHints,
    statusLine,
    messageCount: windowMessages.length,
    windowHours: 24,
    characterName: labels.characterName,
    userName: labels.userName,
  };
}

export async function generateTodayDiary(styleId, deps) {
  const style = getDiaryStyle(styleId);
  const context = await buildDiaryContext(deps);
  const config = deps.collectProviderConfig();
  const lang = buildLanguageContext({
    conversationLanguage: deps.conversationLanguage,
    appLocale: deps.appLocale,
  });
  const diaryContext = { ...context, conversationLanguage: lang.conversationLanguage };

  // P0: never persist template fallback as lived diary experience.
  if (!config.baseUrl || !config.apiKey || !config.model) {
    return {
      ok: false,
      reason: "PROVIDER_REQUIRED",
      source: "none",
      styleId: style.id,
      message: "当前不可生成日记：请先配置可用的模型接口。",
    };
  }

  try {
    const result = await callModel(
      config,
      [
        {
          role: "system",
          content: [
            String(renderPrompt("diary.system", { language: lang })),
            buildDiarySystemPrompt(style, {
              characterName: context.characterName,
              userName: context.userName,
              conversationLanguage: lang.conversationLanguage,
            }),
            formatLanguageDirective(lang),
            outputLanguageRule(lang),
          ].join("\n\n"),
        },
        { role: "user", content: buildDiaryUserPrompt(diaryContext) },
      ],
      {
        temperature: 0.82,
        stream: false,
        companionId: context.characterId || context.companionId || "",
        businessPurpose: "diary.generate",
        capability: "chat",
      },
    );
    const parsed = parseDiaryJson(result.content);
    if (parsed) {
      return {
        ok: true,
        ...parsed,
        styleId: style.id,
        source: "model",
      };
    }
    return {
      ok: false,
      reason: "PARSE_FAILED",
      source: "none",
      styleId: style.id,
      message: "模型返回无法解析为日记，未写入档案。",
    };
  } catch (error) {
    return {
      ok: false,
      reason: "MODEL_FAILED",
      source: "none",
      styleId: style.id,
      message: `日记生成失败：${error?.message || "unknown"}`,
    };
  }
}

export function diaryStyleLabel(styleId) {
  return getDiaryStyle(styleId).label;
}
