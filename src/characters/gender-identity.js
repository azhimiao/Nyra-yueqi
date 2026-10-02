/**
 * Gender is user-designed. Official Nyra seeds use ta and must not assume 她/他.
 * Compile time may rewrite ta (or a leftover 她) after the user chooses gender.
 */

function explicitValue(value) {
  return value && typeof value === "object" && Object.hasOwn(value, "value")
    ? value.value
    : value;
}

export function isUnsetGenderLabel(raw) {
  const gender = String(explicitValue(raw) || "").trim().toLowerCase();
  return !gender || ["unset", "unset_named", "unspecified", "unknown", "暂不设定"].includes(gender);
}

export function pronounsFromGenderIdentity(raw) {
  const gender = String(explicitValue(raw) || "").trim().toLowerCase();
  if (["female", "女", "女性", "woman", "f"].includes(gender)) return ["她"];
  if (["male", "男", "男性", "man", "m"].includes(gender)) return ["他"];
  if (!gender) return [];
  return ["ta"];
}

function firstPronoun(pronouns) {
  const value = explicitValue(pronouns);
  const first = Array.isArray(value) ? value[0] : value;
  return String(first || "").trim().split(/[/、,，\s]+/)[0] || "";
}

/** Third-person pronoun for authored Nyra seed text. Unset → ta, never 她. */
export function subjectPronounFromIdentity({ genderIdentity, pronouns } = {}) {
  const explicit = firstPronoun(pronouns);
  if (explicit) return explicit;
  const derived = pronounsFromGenderIdentity(genderIdentity);
  return derived[0] || "ta";
}

export function genderVoiceFromCharacter(character = {}) {
  const identity = character?.profileV2?.selfIdentity || character?.selfIdentity || {};
  return {
    name: character?.profileV2?.name || character?.name || "",
    genderIdentity: identity.genderIdentity,
    pronouns: identity.pronouns,
  };
}

/** Rewrite official Nyra placeholders. Leaves 她们 intact. */
export function adaptAuthoredNyraThirdPerson(text, identity = {}) {
  const source = String(text || "");
  if (!source) return "";
  const pronoun = subjectPronounFromIdentity(identity);
  const withoutAssumedShe = source.replace(/她(?!们)/g, "ta");
  if (pronoun === "ta") return withoutAssumedShe;
  return withoutAssumedShe.replace(/\bta\b/g, pronoun);
}

export function isNyraInitialWorldbook(entry) {
  return String(entry?.sourcePackageId || "") === "nyra-initial-content-v1"
    || String(entry?.id || "").startsWith("nyra-world-v1-");
}

export function isNyraOriginMemory(memory) {
  return String(memory?.sourceType || "") === "authored_origin_memory"
    || String(memory?.sourceRef?.sourceType || "") === "authored_origin_memory"
    || String(memory?.id || "").startsWith("nyra-origin-v1-")
    || String(memory?.sourceId || "").startsWith("nyra-origin-v1-");
}
