import { BUILTIN_CHARACTER_ID } from "../constants.js";
import { compileBuiltinNyraPrompt } from "../characters/builtin-nyra-prompt.js";
import { isUnsetGenderLabel, pronounsFromGenderIdentity } from "../characters/gender-identity.js";

export { pronounsFromGenderIdentity };

/**
 * Character Identity block compiled from CharacterProfileV2 / annotated records.
 * Does not include platform kernel or private user preference.
 */

function isEnglish(lang) {
  return String(lang?.conversationLanguage || lang || "").toLowerCase().startsWith("en");
}

function textOf(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const raw = String(value || "").trim();
  return raw ? [raw] : [];
}

function explicitValue(slot) {
  if (slot && typeof slot === "object" && Object.hasOwn(slot, "value")) return slot.value;
  return slot;
}

export function sanitizeCharacterSupplement(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const platformMarkers = [
    "【月栖运行内核",
    "[Nyra Runtime Kernel",
    "【First Light 人物/关系补丁】",
    "[First Light character/relationship patch]",
  ];
  return platformMarkers.some((marker) => raw.includes(marker)) ? "" : raw;
}

/**
 * @param {object} character annotated store record or CharacterProfileV2
 * @param {object} [lang]
 */
export function buildCharacterIdentityV2(character = {}, lang) {
  const en = isEnglish(lang);
  const profileV2 = character?.profileV2 && typeof character.profileV2 === "object"
    ? character.profileV2
    : character;
  const identity = profileV2?.selfIdentity || character?.selfIdentity || {};
  const persona = profileV2?.persona || character?.persona || {};
  const name = String(profileV2?.name || character?.name || (en ? "Companion" : "角色")).trim()
    || (en ? "Companion" : "角色");
  const gender = String(explicitValue(identity.genderIdentity) || "").trim();
  const pronouns = textOf(explicitValue(identity.pronouns));
  const values = textOf(persona.values);
  const boundaries = textOf(persona.ownBoundaries);
  const prompts = profileV2?.prompts || character?.prompts || {};
  const rawSystemSupplement = sanitizeCharacterSupplement(
    prompts.characterSystemSupplement
      || character?.profile?.promptSystemSupplement
      || character?.profile?.promptSystem
      || "",
  );
  const systemSupplement = compileBuiltinNyraPrompt(rawSystemSupplement, {
    isBuiltin: String(profileV2?.characterId || character?.id || "").trim() === BUILTIN_CHARACTER_ID
      || character?.source === "builtin",
    name,
    genderIdentity: identity.genderIdentity,
    pronouns: identity.pronouns,
  });
  const developerSupplement = sanitizeCharacterSupplement(
    prompts.characterDeveloperSupplement
      || character?.profile?.promptDeveloperSupplement
      || character?.profile?.promptDeveloper
      || "",
  );
  const additionalValues = values.filter((value) => !systemSupplement.includes(value));
  const lines = en
    ? [
      `[Character Identity: ${name}]`,
      "This block is who you are. Do not replace it with a default customer-service persona.",
    ]
    : [
      `【Character Identity：${name}】`,
      "这段定义你是谁。不要改用默认客服人格。",
    ];

  if (gender && !isUnsetGenderLabel(gender)) {
    lines.push(en ? `Gender identity: ${gender}. Use matching pronouns; do not guess a different gender.` : `性别认同：${gender}。使用与此一致的代词，不要猜测另一种性别。`);
  } else {
    lines.push(en
      ? "Gender is unset. Do not assume male or female. Use the name or they/them unless the user specifies otherwise."
      : "性别暂未设定。不要自行假设男女。在用户说明前使用角色名或中性称呼。");
  }
  if (pronouns.length) {
    lines.push(en ? `Pronouns: ${pronouns.join(", ")}.` : `代词：${pronouns.join("、")}。`);
  }
  const personality = String(persona.personality || "").trim();
  const description = String(persona.description || character?.profile?.fields?.[4] || "").trim();
  if (personality) lines.push(en ? `Personality: ${personality}` : `性格：${personality}`);
  if (description && description !== personality) {
    lines.push(en ? `Self-description: ${description}` : `自我描述：${description}`);
  }
  if (additionalValues.length) {
    lines.push(en ? `Values: ${additionalValues.join("; ")}` : `价值观：${additionalValues.join("；")}`);
  }
  const autonomy = String(persona.autonomy || "").trim();
  if (autonomy) lines.push(en ? `Autonomy: ${autonomy}` : `自主性：${autonomy}`);
  if (boundaries.length) {
    lines.push(en
      ? `Own boundaries (character): ${boundaries.join("; ")}`
      : `角色自身边界：${boundaries.join("；")}`);
  }
  const voice = String(persona.voiceAndManner || "").trim();
  if (voice) lines.push(en ? `Voice: ${voice}` : `说话方式：${voice}`);
  if (systemSupplement) {
    lines.push(
      "",
      en ? "Character-authored supplement:" : "角色作者补充：",
      systemSupplement,
    );
  }
  if (developerSupplement) {
    lines.push(
      "",
      en ? "Character-specific constraint:" : "角色专属约束：",
      developerSupplement,
    );
  }
  return lines.join("\n");
}

/** Canonical runtime owner. Keep the old export as a compatibility name. */
export const compileCharacterCore = buildCharacterIdentityV2;

export function identityCoverageKeys() {
  return Object.freeze([
    "name",
    "genderIdentity",
    "pronouns",
    "personality",
    "values",
    "autonomy",
    "ownBoundaries",
  ]);
}
