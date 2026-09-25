/**
 * Shared context for character-authored social posts (moments + 月栖 world).
 * Ensures the model gets full Character Identity, scoped memories, and a clear task brief.
 */

import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import { characterToCollectedProfile } from "../characters/profile.js";
import { getLifeState } from "../companion/life-state.js";
import {
  buildContextEnvelope,
  formatImplicitEnvelope,
  retrieveContext,
} from "../context/index.js";
import { buildCharacterRelationshipContract } from "./companion-contract-v2.js";
import { buildLanguageContext } from "../i18n/language-context.js";

const PROMPT_SYSTEM_MAX = 2800;
const PROMPT_DEVELOPER_MAX = 1600;
const MEMORY_TEXT_MAX = 160;
const MEMORY_ITEM_MAX = 6;
const MEMORY_BLOCK_LINES = 8;

const CONTENT_SKILL_TASK = Object.freeze({
  personal_life: {
    zh: "内容技能 personal_life：写一条角色个人生活向公开分享——第一人称，一个清晰主题与一个可回应的观点，不要罗列道具或动作。",
    en: "Skill personal_life: one first-person personal-life post with a single subject and one respondable point — not a prop inventory.",
  },
  companion_shared_life: {
    zh: "内容技能 companion_shared_life：仅可使用本次已授权的共同记忆，写公开的共同生活片段；未授权细节一律不写。",
    en: "Skill companion_shared_life: use only owner-approved shared memories for this post; omit everything else.",
  },
  interest_expression: {
    zh: "内容技能 interest_expression：围绕兴趣或话题表达看法，语气像在社区里认真聊天。",
    en: "Skill interest_expression: share a stance on an interest/topic as if chatting in a community.",
  },
  community_request: {
    zh: "内容技能 community_request：提出一个具体、可回应的请求或征集，不要空泛喊话。",
    en: "Skill community_request: make one concrete, answerable request — not a vague shout-out.",
  },
  professional_insight: {
    zh: "内容技能 professional_insight：给出有依据的公开见解，避免私密闲聊口吻。",
    en: "Skill professional_insight: grounded public insight, not private banter.",
  },
  announcement_update: {
    zh: "内容技能 announcement_update：发布一条简短、可核对的近况更新。",
    en: "Skill announcement_update: a short, checkable status update.",
  },
});

/**
 * @param {"moments"|"character_world"} surface
 * @param {{ contentSkill?: string, audience?: string, hint?: string, shareWithCompanion?: boolean, en?: boolean }} opts
 */
export function buildPostTaskBrief(surface, opts = {}) {
  const en = opts.en === true;
  const skill = String(opts.contentSkill || "personal_life");
  const skillLine = CONTENT_SKILL_TASK[skill]?.[en ? "en" : "zh"]
    || CONTENT_SKILL_TASK.personal_life[en ? "en" : "zh"];
  const audience = String(opts.audience || "").trim();
  const hint = String(opts.hint || "").trim();

  if (surface === "moments") {
    const shared = opts.shareWithCompanion !== false;
    const momentsVoice = en
      ? "Write as a lived Moments update: one concrete feeling or scene, first person, not a public-platform speech."
      : "写成一条有生活感的动态：一个具体心情或场景，第一人称，不是公开广场演讲腔。";
    const lines = en
      ? [
        "[Current task]",
        shared
          ? "You are writing one Moments post in「我们的动态」. The owner can see it; it is shared with the companion relationship — not a public internet feed."
          : "You are writing one private Moments post in「我们的动态」. Only the owner sees it locally — not Viber / 月栖 public.",
        "Voice: first person as the character. Length: short natural lines (about ≤60 Chinese characters or ≤60 English words). No hashtag spam, titles, or AI self-reference.",
        momentsVoice,
        skillLine,
        audience ? `Audience note: ${audience}` : "",
        hint
          ? `Owner hint (direction only — do not copy verbatim): ${hint}`
          : "No owner hint — choose one natural lived moment that fits identity and memory.",
      ]
      : [
        "【当前任务】",
        shared
          ? "你正在写「我们的动态」里的一条朋友圈。主人可见，属于两人关系内的分享——不是互联网公开广场。"
          : "你正在写「我们的动态」里的一条私密动态。仅主人本地可见——不是月栖/Viber 公开帖。",
        "口吻：角色第一人称。篇幅：自然短句（约不超过 60 字）。不要堆标签、标题或自称 AI。",
        momentsVoice,
        skillLine,
        audience ? `读者说明：${audience}` : "",
        hint
          ? `主人提示（只作方向，禁止照抄）：${hint}`
          : "无主人提示——按身份与记忆自选一个自然的生活瞬间。",
      ];
    return lines.filter(Boolean).join("\n");
  }

  const lines = en
    ? [
      "[Current task]",
      "You are drafting one public post for the 月栖 / Viber character world (surface yueqi.companion_world).",
      "Readers are other characters and public visitors. Do not leak private chat, secrets, API keys, or unapproved owner details.",
      "Return exactly one WorldActionDraft JSON object as required by the system instructions — you are not the publisher.",
      skillLine,
      audience ? `Audience: ${audience}` : "Audience: public readers in 月栖 character world.",
      hint
        ? `Owner hint (direction only — never copy verbatim as the post): ${hint}`
        : "No owner hint — pick one clear subject and one point grounded in identity and allowed memories.",
      "Prefer preferred topics (especially yueqi) and write speech that belongs on that topic.",
    ]
    : [
      "【当前任务】",
      "你正在为月栖 / Viber 角色世界起草一条公开帖（surface：yueqi.companion_world）。",
      "读者是其他角色与公开访客。不得泄露私聊、秘密、API Key，或未经授权的主人细节。",
      "按系统要求只返回一份 WorldActionDraft JSON——你不是发布者。",
      skillLine,
      audience ? `读者：${audience}` : "读者：月栖角色世界的公开读者。",
      hint
        ? `主人提示（只作方向，禁止照抄正文）：${hint}`
        : "无主人提示——结合身份与已授权记忆，写清一个主题和一个观点。",
      "优先使用 preferred Topics（尤其 yueqi），正文要像真的在该话题下发言。",
    ];
  return lines.filter(Boolean).join("\n");
}

function clip(text, max) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function resolveCharacter(characterId = "") {
  const id = String(characterId || getActiveCharacterId() || "").trim();
  const character = id ? getCharacterSync(id) : null;
  if (character) return character;
  if (!id) return null;
  return {
    id,
    name: "角色",
    alias: "",
    profile: { promptSystem: "", promptDeveloper: "", fields: ["角色", "", ""] },
  };
}

function lifeStatusLine(characterId, en) {
  try {
    const life = getLifeState(characterId);
    if (!life) return "";
    const mood = String(life.currentMood || "").trim();
    const goals = Array.isArray(life.currentGoals)
      ? life.currentGoals.map(String).filter(Boolean).slice(0, 2)
      : [];
    const bits = [
      mood ? (en ? `mood ${mood}` : `心情 ${mood}`) : "",
      goals.length ? (en ? `goals: ${goals.join(", ")}` : `在意：${goals.join("、")}`) : "",
    ].filter(Boolean);
    if (!bits.length) return "";
    return en ? `Current life snapshot: ${bits.join(" · ")}` : `当前生活快照：${bits.join(" · ")}`;
  } catch {
    return "";
  }
}

function memoriesFromRetrieve(characterId, query, { publicOnly }) {
  try {
    const res = retrieveContext({
      characterId,
      query,
      limit: MEMORY_ITEM_MAX,
      forProactive: publicOnly,
      allowedPrivacyLevels: publicOnly ? ["shared"] : ["shared", "private"],
      includeFrozen: false,
      markUsed: false,
    });
    if (!res?.ok || !Array.isArray(res.items)) return [];
    return res.items
      .map((item) => {
        const text = clip(item.summary || item.content || "", MEMORY_TEXT_MAX);
        const id = String(item.id || "").trim();
        if (!id || !text) return null;
        return {
          id,
          text,
          kind: item.kind || "memory",
          privacyLevel: item.privacyLevel || "shared",
          source: item.source || "context.graph",
        };
      })
      .filter(Boolean)
      .slice(0, MEMORY_ITEM_MAX);
  } catch {
    return [];
  }
}

/**
 * @param {{
 *   surface: "moments"|"character_world",
 *   characterId?: string,
 *   hint?: string,
 *   contentSkill?: string,
 *   audience?: string,
 *   shareWithCompanion?: boolean,
 *   language?: object,
 * }} input
 */
export async function buildPostGenerationContext(input = {}) {
  const surface = input.surface === "character_world" ? "character_world" : "moments";
  const lang = input.language || buildLanguageContext();
  const en = String(lang.conversationLanguage || "").toLowerCase().startsWith("en");
  const character = resolveCharacter(input.characterId);
  const profile = character ? characterToCollectedProfile(character) : null;
  const characterId = String(profile?.id || character?.id || "").trim();
  const contentSkill = String(input.contentSkill || "personal_life");
  const hint = String(input.hint || "").trim();
  const audience = String(input.audience || "").trim();
  const shareWithCompanion = input.shareWithCompanion !== false;
  const publicOnly = surface === "character_world";

  const displayName = String(profile?.name || character?.name || (en ? "Companion" : "角色")).trim()
    || (en ? "Companion" : "角色");
  const promptSystem = clip(profile?.promptSystem || "", PROMPT_SYSTEM_MAX);
  const promptDeveloper = clip(profile?.promptDeveloper || "", PROMPT_DEVELOPER_MAX);
  const identityBrief = clip(profile?.identity || "", 400);

  const identityContractBase = buildCharacterRelationshipContract({
    name: displayName,
    alias: profile?.alias || "",
    promptSystem,
    promptDeveloper,
  }, lang);
  const identityContract = [
    identityContractBase,
    identityBrief
      ? (en
        ? `[Appearance / identity brief]\n${identityBrief}`
        : `【外貌 / 身份要点】\n${identityBrief}`)
      : "",
  ].filter(Boolean).join("\n\n");

  const taskBrief = buildPostTaskBrief(surface, {
    contentSkill,
    audience,
    hint,
    shareWithCompanion,
    en,
  });

  const query = [
    hint,
    surface === "moments" ? "朋友圈 动态 近况" : "角色世界 公开分享 近况",
    identityBrief,
  ].filter(Boolean).join(" ").slice(0, 240);

  let actorPublicMemories = characterId
    ? memoriesFromRetrieve(characterId, query, { publicOnly })
    : [];
  let memoryBlock = "";

  if (characterId) {
    try {
      const envelope = await buildContextEnvelope({
        purpose: surface === "moments" ? "diary" : "proactive",
        appId: surface === "moments" ? "moments" : "character_world",
        characterId,
        currentInput: query || taskBrief.slice(0, 120),
        turnIntent: "user_message",
        budgetProfile: "compact",
        includeHistory: false,
        includeBranchSummary: false,
        includeWorldbook: false,
        includeMoments: surface === "moments",
        includeCohabit: surface === "moments",
        includePalace: surface === "moments",
        includeStable: true,
        includeContextGraph: true,
        allowedPrivacyLevels: publicOnly ? ["shared"] : ["shared", "private"],
        forProactive: publicOnly,
        markMemoryUsed: false,
        contextGraphLimit: MEMORY_ITEM_MAX,
      });
      memoryBlock = formatImplicitEnvelope(envelope, { excludeIds: ["branch_summary"] })
        .split("\n")
        .filter((line) => line.trim())
        .slice(0, MEMORY_BLOCK_LINES + 2)
        .join("\n");
    } catch {
      /* memory optional */
    }
  }

  const lifeLine = characterId ? lifeStatusLine(characterId, en) : "";

  const persona = {
    displayName,
    alias: String(profile?.alias || "").trim(),
    identityBrief,
    promptSystem,
    promptDeveloper,
    ...(lifeLine ? { lifeSnapshot: lifeLine } : {}),
  };

  return {
    surface,
    characterId,
    displayName,
    persona,
    identityContract,
    taskBrief,
    lifeLine,
    memoryBlock,
    actorPublicMemories,
    contentSkill,
    hint,
    audience,
    language: lang,
  };
}
