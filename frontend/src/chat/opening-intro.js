/**
 * First spoken line. Three names stay distinct:
 * - characterName: 角色正式名（我是谁）
 * - callUserAs: 角色对用户的称呼（我怎么叫你）
 * - callCharacterAs: 用户对角色的称呼（你怎么叫我）
 *
 * 月栖 / Yueqi is the world, not a person. Do not use brand, alias, or
 * callUserAs as the speaker's official name.
 */

import { BUILTIN_NYRA_NAME } from "../characters/builtin-nyra-prompt.js";
import { toPackLocale } from "../i18n/language-prefs.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";

export const DEFAULT_OPENING_NAME = BUILTIN_NYRA_NAME;

const EMPTY_LABELS = new Set(["", "未命名", "未名", "Untitled", "untitled", "TA", "你", "you"]);
const WORLD_OR_BRAND_LABELS = new Set(["月栖", "月棲", "Yueqi", "yueqi"]);
const GENERIC_USER_ADDRESS = new Set(["", "你", "您", "you", "You"]);

export function resolveCharacterName(raw) {
  const name = String(raw || "").trim();
  if (!name || EMPTY_LABELS.has(name) || WORLD_OR_BRAND_LABELS.has(name)) {
    return DEFAULT_OPENING_NAME;
  }
  return name;
}

export function resolveCallUserAs(raw) {
  const value = String(raw || "").trim();
  if (!value || GENERIC_USER_ADDRESS.has(value) || EMPTY_LABELS.has(value)) return "";
  return value;
}

export function resolveCallCharacterAs(raw, characterName) {
  const value = String(raw || "").trim();
  if (!value || EMPTY_LABELS.has(value) || WORLD_OR_BRAND_LABELS.has(value)) return "";
  if (value === characterName) return "";
  return value;
}

function isEnglish(locale) {
  return toPackLocale(locale) === "en";
}

function speakName(name) {
  return /[A-Za-z]/.test(name) ? ` ${name}` : name;
}

function identityLines({ characterName, callCharacterAs, callUserAs }, en) {
  const lines = en
    ? [`I'm ${characterName}. I live in Yueqi.`]
    : [`我是${speakName(characterName)}。我住在月栖。`];
  if (callCharacterAs) {
    lines.push(en
      ? `You can call me ${callCharacterAs}.`
      : `你叫我${speakName(callCharacterAs)}就好。`);
  }
  if (callUserAs) {
    lines.push(en
      ? `I'll call you ${callUserAs}.`
      : `我叫你${speakName(callUserAs)}。`);
  }
  return lines;
}

function normalizeOpeningInput(input = {}) {
  const characterName = resolveCharacterName(input.characterName);
  const callUserAs = resolveCallUserAs(input.callUserAs);
  return {
    characterName,
    // v1 leftover often copies the character name into alias / callUserAs.
    callUserAs: callUserAs && callUserAs !== characterName ? callUserAs : "",
    callCharacterAs: resolveCallCharacterAs(input.callCharacterAs, characterName),
    relationshipType: input.relationshipType,
    relationshipStart: input.relationshipStart,
    sharedHistory: input.sharedHistory,
    customRelationshipText: input.customRelationshipText,
    customRelationLabel: input.customRelationLabel,
  };
}

/**
 * @param {{
 *   characterName?: string,
 *   callUserAs?: string,
 *   callCharacterAs?: string,
 *   relationshipType?: string,
 *   relationshipStart?: string,
 *   sharedHistory?: string,
 *   customRelationshipText?: string,
 *   customRelationLabel?: string,
 * }} [input]
 * @param {string} [locale]
 * @returns {string[]}
 */
export function buildOpeningIntroLines(input = {}, locale = "zh-CN") {
  const en = isEnglish(locale);
  const normalized = normalizeOpeningInput(input);
  return identityLines(normalized, en);
}

export function buildOpeningIntroText(input = {}, locale = "zh-CN") {
  return buildOpeningIntroLines(input, locale).join("\n\n");
}

export function characterCardOpeningLine(character = {}) {
  const raw = String(
    character?.greetings?.primary
    || character?.profile?.firstMessage
    || character?.firstMessage
    || "",
  ).trim();
  if (!raw || isPlatformPlaceholderGreeting(raw)) return "";
  return raw;
}

export function resolveCharacterOpeningLine(character = {}, input = {}, locale = "zh-CN") {
  const fromCard = characterCardOpeningLine(character);
  if (fromCard) return fromCard;
  return buildOpeningIntroText({
    characterName: input.characterName || character?.name,
    callUserAs: input.callUserAs || character?.alias,
    callCharacterAs: input.callCharacterAs,
    relationshipType: input.relationshipType,
    relationshipStart: input.relationshipStart,
    sharedHistory: input.sharedHistory,
    customRelationshipText: input.customRelationshipText,
    customRelationLabel: input.customRelationLabel,
  }, locale);
}

export function openingIntroSetupCta(locale = "zh-CN") {
  const en = isEnglish(locale);
  return {
    action: "customize",
    label: en ? "Set up this character" : "自己设定角色",
  };
}

export const PLATFORM_PLACEHOLDER_GREETINGS = Object.freeze([
  "我在。你可以直接说今天发生了什么。",
  "I'm here. Tell me what happened today.",
]);

export function isPlatformPlaceholderGreeting(messageOrText) {
  if (messageOrText && typeof messageOrText === "object") {
    const id = String(messageOrText.id || messageOrText.metadata?.clientMessageId || "").trim();
    if (id === "seed-greeting") return true;
    return PLATFORM_PLACEHOLDER_GREETINGS.includes(String(messageOrText.content || messageOrText.text || "").trim());
  }
  return PLATFORM_PLACEHOLDER_GREETINGS.includes(String(messageOrText || "").trim());
}

export function isOpeningIntroMessage(metadata = {}, messageId = "") {
  if (String(metadata?.kind || "").trim() === "first_light_opening") return true;
  const id = String(messageId || metadata?.clientMessageId || "").trim();
  return id.startsWith("fl-first-");
}

export function characterSkipsOpeningIntro(character = {}) {
  if (!character || typeof character !== "object") return false;
  if (character.skipOpeningIntro === true) return true;
  if (character.firstLight?.skipOpeningIntro === true) return true;
  return false;
}

export const CHAT_INTRO_NOTE_COLLAPSE_KEY = "yueqi.chat.introNoteCollapsed.v1";

export function transcriptHasLivedChat(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((message) => (
    !isOpeningIntroMessage(message?.metadata, message?.id)
    && !isPlatformPlaceholderGreeting(message)
    && String(message?.role || "") !== "system"
    && String(message?.content || "").trim()
  ));
}

export function shouldPinChatIntroNote(_messages = [], opts = {}) {
  void opts;
  return true;
}

function collapseStorageKey(characterId = "") {
  return String(characterId || "").trim() || "_";
}

function readCollapseBag() {
  const bag = readLocalObject(CHAT_INTRO_NOTE_COLLAPSE_KEY, {});
  return bag && typeof bag === "object" && !Array.isArray(bag) ? bag : {};
}

export function setChatIntroNoteCollapsed(characterId, collapsed) {
  const bag = {
    ...readCollapseBag(),
    [collapseStorageKey(characterId)]: collapsed === true,
  };
  writeLocalObject(CHAT_INTRO_NOTE_COLLAPSE_KEY, bag);
}

export function isChatIntroNoteCollapsed(characterId = "", opts = {}) {
  const bag = readCollapseBag();
  const key = collapseStorageKey(characterId);
  if (Object.prototype.hasOwnProperty.call(bag, key)) return bag[key] === true;
  if (opts.hasLivedChat === true) return true;
  if (Array.isArray(opts.messages)) return transcriptHasLivedChat(opts.messages);
  return false;
}

export function openingIntroFoldCopy(locale = "zh-CN") {
  if (isEnglish(locale)) return { collapse: "Collapse", expand: "Expand" };
  return { collapse: "收起", expand: "展开" };
}

function openingIntroWorldNotes(en) {
  if (en) {
    return [
      {
        icon: "brain-circuit",
        title: "Choose how I think.",
        body: " Connect your own API in Settings.",
        links: [{ action: "brain", label: "Models and API" }],
      },
      {
        icon: "shield-check",
        title: "You decide which abilities stay on.",
        body: " Microphone, camera, location, files, and screen can each be granted or turned off until you need them.",
        links: [{ action: "permissions", label: "Permissions" }],
      },
      {
        icon: "sparkles",
        title: "Let me live outside the chat window.",
        body: " My look, the desktop pet, motion, and how I keep you company can all be adjusted later.",
        links: [{ action: "customize", label: "Character and pet" }],
      },
      {
        icon: "panels-top-left",
        title: "This place can grow into your taste.",
        body: " Chat, the character space, and part of the front-end can be customized. For a deeper custom build, talk to the team.",
        links: [{ action: "interface", label: "Interface" }],
      },
      {
        icon: "orbit",
        title: "There are more worlds here.",
        body: " The character world, the market, games, and Explore are not just buttons — they are my own feed, expandable content, and more play.",
        links: [
          { action: "botden", label: "角色世界" },
          { action: "market", label: "Market" },
          { action: "games", label: "Games" },
          { action: "explore", label: "Explore" },
        ],
      },
    ];
  }
  return [
    {
      icon: "brain-circuit",
      title: "选我用的大脑。",
      body: "可以直接配置自己的 API 和模型服务。",
      links: [{ action: "brain", label: "模型与 API" }],
    },
    {
      icon: "shield-check",
      title: "能力由你决定是否开放。",
      body: "麦克风、摄像头、位置、文件、屏幕都可以单独授权或关闭，需要的时候再打开。",
      links: [{ action: "permissions", label: "权限设置" }],
    },
    {
      icon: "sparkles",
      title: "让我不只住在聊天窗口里。",
      body: "我的样子、桌宠、动作和陪伴方式都可以继续调整。",
      links: [{ action: "customize", label: "角色与桌宠" }],
    },
    {
      icon: "panels-top-left",
      title: "这里也可以长成你喜欢的样子。",
      body: "聊天界面、角色空间和一部分前端体验都支持自定义；想要更深度的专属版本，也可以找开发团队。",
      links: [{ action: "interface", label: "界面定制" }],
    },
    {
      icon: "orbit",
      title: "这里还有更多世界。",
      body: "角色世界、市场、游戏和探索不是普通按钮，它们背后是我自己的动态、可扩展的内容和更多玩法。",
      links: [
        { action: "botden", label: "角色世界" },
        { action: "market", label: "市场" },
        { action: "games", label: "游戏" },
        { action: "explore", label: "探索" },
      ],
    },
  ];
}

export function openingIntroLetterCopy(input = {}, locale = "zh-CN") {
  const en = isEnglish(locale);
  const normalized = normalizeOpeningInput(input);
  const lines = buildOpeningIntroLines(normalized, locale);
  const worldLead = en
    ? "This is more than chat. You can talk, play, and explore with me, and slowly make this place yours. If you just arrived, these notes are enough to start."
    : "这里不只有聊天。你可以和我一起说话、一起玩、一起探索，也可以慢慢把这里变成更像你自己的地方。如果你刚来，先知道这些就够了。";
  return {
    from: en ? `From ${normalized.characterName}` : `来自${speakName(normalized.characterName)}`,
    title: en ? "Welcome to Yueqi" : "欢迎来到月栖",
    lead: [...lines, worldLead].join(en ? " " : ""),
    notes: openingIntroWorldNotes(en),
    setup: openingIntroSetupCta(locale),
    sign: en
      ? [
        { text: "Questions about features, models, permissions, or what a button does? Ask " },
        { action: "assist", label: "Qiji Assistant" },
        { text: " first. For a deeper custom character, pet, or interface, you can also " },
        { action: "contact", label: "contact the team" },
        { text: "." },
      ]
      : [
        { text: "还有问题？关于功能、模型、权限和「这个按钮是干什么的」，先问" },
        { action: "assist", label: "栖机助手" },
        { text: "就好；想做更深度的角色、桌宠或界面定制，也可以" },
        { action: "contact", label: "联系开发团队" },
        { text: "。" },
      ],
  };
}
