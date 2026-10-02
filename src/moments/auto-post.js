/**
 * Character moments auto-post — sparse scheduled posts into Pop 朋友圈.
 * Not a continuous life sim: poll + due schedule → one short post → reschedule.
 */

import { listContactCharacters } from "../characters/contacts.js";
import { getActiveCharacterId, getCharacterSync, listCharactersSync } from "../characters/store.js";
import { resolveCharacterAvatarUrl } from "../characters/avatar.js";
import { callModel } from "../model/client.js";
import { loadMoments, saveMoments, normalizeMoment } from "./store.js";
import { assertAutonomyAllowed, isAutonomyCapabilityEnabled } from "../companion/autonomy-prefs.js";
import { appendActivity } from "../companion/activity-log.js";
import { probeDevicePolicyEnv } from "../companion/resource-policy.js";
import { buildLanguageContext, formatLanguageDirective, outputLanguageRule } from "../i18n/language-context.js";
import { renderPrompt } from "../prompts/registry.js";
import { buildPostGenerationContext } from "../prompt/post-surface-context.js";

export const MOMENTS_AUTO_SCHEDULE_KEY = "yueqi.moments.auto.schedule.v1";

/** @deprecated kept for tests — scheduling is now event-driven */
const POLL_MS = 60_000;
/** First post for a character that has never auto-posted. */
const FIRST_DELAY = { minMs: 15 * 60_000, maxMs: 45 * 60_000 };
/** Later posts. */
const NEXT_DELAY = { minMs: 4 * 60 * 60_000, maxMs: 18 * 60 * 60_000 };

const FALLBACK_LINES = [
  "今天也普通地过完了。",
  "路过便利店，买了瓶水。",
  "忽然有点想和你说说话。",
  "窗外有点风，不太想出门。",
  "把今天记下一点点就好。",
  "工作告一段落，终于能喘口气。",
  "随便发一条，证明我还在。",
];

let started = false;
let pollTimer = 0;
let dueTimer = 0;
let posting = false;
/** @type {null | (() => Promise<{ baseUrl?: string, apiKey?: string, model?: string } | null>)} */
let getProviderConfig = null;

function randBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function nextDelayMs(isFirst) {
  const range = isFirst ? FIRST_DELAY : NEXT_DELAY;
  return randBetween(range.minMs, range.maxMs);
}

function readScheduleBag() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MOMENTS_AUTO_SCHEDULE_KEY) || "null");
    const rows = Array.isArray(parsed?.characters) ? parsed.characters : [];
    return {
      characters: rows
        .map((row) => ({
          characterId: String(row?.characterId || "").trim(),
          nextPostAfter: Number(row?.nextPostAfter) || 0,
          lastPostAt: String(row?.lastPostAt || ""),
        }))
        .filter((row) => row.characterId),
    };
  } catch {
    return { characters: [] };
  }
}

function writeScheduleBag(bag) {
  window.localStorage.setItem(MOMENTS_AUTO_SCHEDULE_KEY, JSON.stringify({
    schemaVersion: 1,
    characters: bag.characters || [],
  }));
}

function getOrCreateSchedule(characterId, bag = readScheduleBag()) {
  const id = String(characterId || "").trim();
  if (!id) return null;
  let row = bag.characters.find((item) => item.characterId === id);
  if (!row) {
    const isFirst = true;
    row = {
      characterId: id,
      nextPostAfter: Date.now() + nextDelayMs(isFirst),
      lastPostAt: "",
    };
    bag.characters.push(row);
    writeScheduleBag(bag);
  }
  return row;
}

function markPosted(characterId) {
  const bag = readScheduleBag();
  const row = getOrCreateSchedule(characterId, bag);
  if (!row) return;
  row.lastPostAt = new Date().toISOString();
  row.nextPostAfter = Date.now() + nextDelayMs(false);
  writeScheduleBag(bag);
}

async function eligibleCharacters() {
  try {
    const contacts = await listContactCharacters();
    if (Array.isArray(contacts) && contacts.length) {
      return contacts.filter((c) => c?.id);
    }
  } catch {
    /* ignore */
  }
  const activeId = getActiveCharacterId();
  const active = activeId ? getCharacterSync(activeId) : null;
  if (active) return [active];
  return listCharactersSync().slice(0, 1);
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function stripPostText(raw) {
  return String(raw || "")
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^["「『]|["」』]$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

async function generateContent(character, { hint = "", shareWithCompanion = true } = {}) {
  let config = null;
  try {
    if (typeof getProviderConfig === "function") {
      config = await getProviderConfig();
    }
  } catch {
    config = null;
  }
  if (!config?.baseUrl || !config?.apiKey || !config?.model) {
    // Manual invite may run before auto-post wires provider — try local settings.
    try {
      const { readLocalObject } = await import("../lib/utils.js");
      const { LOCAL_KEYS } = await import("../constants.js");
      const saved = readLocalObject(LOCAL_KEYS.providerKey, {}) || {};
      config = {
        kind: saved.kind || "OpenAI Compatible",
        baseUrl: String(saved.baseUrl || "").trim(),
        apiKey: String(saved.apiKey || "").trim(),
        model: String(saved.model || "").trim(),
      };
    } catch {
      return "";
    }
  }
  if (!config?.baseUrl || !config?.apiKey || !config?.model) return "";

  const lang = buildLanguageContext();
  const en = lang.conversationLanguage === "en-US";
  const ownerHint = String(hint || "").trim().slice(0, 200);
  const postCtx = await buildPostGenerationContext({
    surface: "moments",
    characterId: String(character?.id || "").trim(),
    hint: ownerHint,
    contentSkill: "personal_life",
    audience: en
      ? "owner-facing Moments (我们的动态), not a public internet feed"
      : "主人可见的「我们的动态」，不是公开互联网广场",
    shareWithCompanion,
    language: lang,
  });

  try {
    const system = [
      String(renderPrompt("moments.auto_post", { language: lang })),
      "Output body text only — no title, quotes, hashtags, or commentary.",
      "Character Identity is the authority for who you are; memory is evidence only.",
      "Follow the current task brief exactly for surface, privacy, and length.",
      formatLanguageDirective(lang),
      outputLanguageRule(lang),
      "",
      postCtx.identityContract,
      "",
      postCtx.taskBrief,
    ].join("\n");
    const userParts = en
      ? [
        `Character name: ${postCtx.displayName}`,
        postCtx.lifeLine || "",
        postCtx.memoryBlock ? `Authorized memory notes:\n${postCtx.memoryBlock}` : "Authorized memory notes: (none retrieved)",
        ownerHint
          ? `Owner hint (optional, do not copy): ${ownerHint}`
          : "Owner hint: (none — choose a natural everyday moment)",
        "Write one first-person Moments post now.",
      ]
      : [
        `角色名：${postCtx.displayName}`,
        postCtx.lifeLine || "",
        postCtx.memoryBlock ? `授权记忆摘录：\n${postCtx.memoryBlock}` : "授权记忆摘录：（本次未检索到）",
        ownerHint
          ? `主人提示（可选，勿照抄）：${ownerHint}`
          : "主人提示：（无 — 自己选一个自然的日常瞬间）",
        "请以第一人称发一条「我们的动态」。",
      ];
    const result = await callModel(
      config,
      [
        { role: "system", content: system },
        { role: "user", content: userParts.filter(Boolean).join("\n\n") },
      ],
      {
        stream: false,
        temperature: 0.9,
        companionId: String(character?.id || "").trim(),
        businessPurpose: "moments.character_post",
        capability: "chat",
      },
    );
    const text = stripPostText(result?.content || result?.text || result);
    if (text && text.length >= 4) return text;
  } catch {
    /* fall through */
  }
  return "";
}

function recentDuplicate(characterId, content) {
  const moments = loadMoments();
  const needle = String(content || "").trim();
  const since = Date.now() - 36 * 60 * 60_000;
  return moments.some((item) => (
    item.authorType === "character"
    && item.authorId === characterId
    && item.characterGenerated
    && item.content === needle
    && new Date(item.createdAt).getTime() >= since
  ));
}

/**
 * @param {object} character
 * @param {{ hint?: string, shareWithCompanion?: boolean }} [opts]
 * @returns {Promise<object|null>}
 */
export async function postMomentForCharacter(character, opts = {}) {
  const id = String(character?.id || "").trim();
  if (!id) return null;
  const hint = String(opts.hint || "").trim();
  const shareWithCompanion = opts.shareWithCompanion !== false;
  const content = await generateContent(character, { hint, shareWithCompanion });
  if (!content) return null;
  if (recentDuplicate(id, content)) return null;

  const moment = normalizeMoment({
    id: `moment-auto-${id}-${Date.now()}`,
    author: character.name || "TA",
    authorId: id,
    authorAvatar: resolveCharacterAvatarUrl(character) || "",
    authorType: "character",
    time: formatClock(),
    createdAt: new Date().toISOString(),
    content,
    likes: [],
    comments: [],
    characterGenerated: true,
    sourceType: "local",
    shareWithCompanion,
    privacy: shareWithCompanion ? "companion_shared" : "private",
    ownerHint: hint || undefined,
  });

  const moments = loadMoments();
  moments.unshift(moment);
  saveMoments(moments, hint ? "character_hint_post" : "character_auto_post");
  markPosted(id);
  appendActivity({
    title: "角色发布了一条动态",
    reason: hint ? "主人给了提示后邀请发布" : "到达排程时间或主动邀请",
    capability: "自动动态",
    resourcesRead: ["角色人设", hint ? "主人提示" : ""].filter(Boolean),
    changes: [String(content).slice(0, 60)],
    usedModel: true,
    costHint: "约 1 次模型调用",
    source: "moments_auto",
    characterId: id,
  });
  return moment;
}

function nextDueAtMs() {
  const bag = readScheduleBag();
  const times = bag.characters.map((row) => Number(row.nextPostAfter) || 0).filter((t) => t > 0);
  if (!times.length) return Date.now() + NEXT_DELAY.minMs;
  return Math.min(...times);
}

function scheduleNextDue() {
  if (typeof window === "undefined") return;
  if (dueTimer) {
    window.clearTimeout(dueTimer);
    dueTimer = 0;
  }
  if (!started || !isAutonomyCapabilityEnabled("autoMoments")) return;
  const delay = Math.max(5_000, nextDueAtMs() - Date.now());
  dueTimer = window.setTimeout(() => {
    void (async () => {
      await tickDuePosts();
      scheduleNextDue();
    })();
  }, Math.min(delay, 6 * 60 * 60_000));
}

async function tickDuePosts() {
  if (posting) return;
  if (!isAutonomyCapabilityEnabled("autoMoments")) return;
  const env = await probeDevicePolicyEnv();
  if (!assertAutonomyAllowed("feed", env).ok) return;
  const now = Date.now();
  const cast = await eligibleCharacters();
  const due = [];
  for (const character of cast) {
    const row = getOrCreateSchedule(character.id);
    if (row && row.nextPostAfter <= now) due.push(character);
  }
  if (!due.length) return;

  posting = true;
  try {
    // One character per tick to avoid burst.
    await postMomentForCharacter(due[0]);
  } finally {
    posting = false;
  }
}

/**
 * @param {{ getProviderConfig?: () => Promise<object|null> }} [opts]
 */
export function startMomentsAutoPost(opts = {}) {
  if (typeof window === "undefined") return;
  if (opts.getProviderConfig) getProviderConfig = opts.getProviderConfig;
  if (!isAutonomyCapabilityEnabled("autoMoments")) {
    stopMomentsAutoPost();
    return;
  }
  if (started) {
    scheduleNextDue();
    return;
  }
  started = true;

  void (async () => {
    for (const character of await eligibleCharacters()) {
      getOrCreateSchedule(character.id);
    }
    await tickDuePosts();
    scheduleNextDue();
  })();
}

export function stopMomentsAutoPost() {
  started = false;
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }
  if (dueTimer) {
    window.clearTimeout(dueTimer);
    dueTimer = 0;
  }
}

/** Test helpers */
export function __testOnly() {
  return {
    readScheduleBag,
    writeScheduleBag,
    getOrCreateSchedule,
    nextDelayMs,
    FIRST_DELAY,
    NEXT_DELAY,
    POLL_MS,
    eligibleCharacters,
    stripPostText,
    markPosted,
    scheduleNextDue,
    nextDueAtMs,
  };
}
