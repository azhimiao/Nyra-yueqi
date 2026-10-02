/**
 * Curated Hosted TTS voices for the default speech SKU (`volc.tts.default`).
 *
 * These IDs are TTS 1.0 / classic speakers. SeedTTS 2.0 speakers are
 * excluded: the operator project has not granted that resource.
 *
 * Preference lives on the user (voice settings), never inside a character pack.
 */

export const HOSTED_VOICES = Object.freeze([
  Object.freeze({
    id: "zh_female_cancan_mars_bigtts",
    nameZh: "灿灿",
    nameEn: "Cancan",
    gender: "female",
  }),
  Object.freeze({
    id: "zh_female_shuangkuaisisi_moon_bigtts",
    nameZh: "爽快思思",
    nameEn: "Sisi",
    gender: "female",
  }),
  Object.freeze({
    id: "BV001_streaming",
    nameZh: "通用女声",
    nameEn: "General female",
    gender: "female",
  }),
  Object.freeze({
    id: "zh_male_M392_conversation_wvae_bigtts",
    nameZh: "沉稳男声",
    nameEn: "Calm male",
    gender: "male",
  }),
  Object.freeze({
    id: "BV002_streaming",
    nameZh: "通用男声",
    nameEn: "General male",
    gender: "male",
  }),
  Object.freeze({
    id: "BV700_streaming",
    nameZh: "磁性男声",
    nameEn: "Warm male",
    gender: "male",
  }),
]);

const HOSTED_VOICE_IDS = new Set(HOSTED_VOICES.map((voice) => voice.id));

export function normalizeHostedVoiceId(value) {
  const id = String(value || "").trim();
  return HOSTED_VOICE_IDS.has(id) ? id : "";
}

/** Paid / Hosted speech always has a speaker: preferred catalog id, else 灿灿. */
export function defaultHostedVoiceId(preferred = "") {
  return normalizeHostedVoiceId(preferred) || HOSTED_VOICES[0]?.id || "";
}

export function isHostedVoiceId(value) {
  return Boolean(normalizeHostedVoiceId(value));
}

export function listHostedVoices() {
  return HOSTED_VOICES.map((voice) => ({ ...voice }));
}

export function hostedVoiceLabel(voice, locale = "zh-CN") {
  if (!voice) return "";
  return String(locale || "").toLowerCase().startsWith("zh") ? voice.nameZh : voice.nameEn;
}

function groupLabel(gender, locale, femaleLabel, maleLabel) {
  if (gender === "male") return maleLabel;
  return femaleLabel;
}

/**
 * Rebuilds a <select> with curated voices. `selected` "" means follow default.
 */
export function populateHostedVoiceSelect(select, {
  selected = "",
  includeFollowDefault = false,
  followDefaultLabel = "Follow default",
  femaleLabel = "Female",
  maleLabel = "Male",
  locale = "zh-CN",
} = {}) {
  if (!select) return;
  const current = normalizeHostedVoiceId(selected);
  const groups = [
    { gender: "female", label: groupLabel("female", locale, femaleLabel, maleLabel) },
    { gender: "male", label: groupLabel("male", locale, femaleLabel, maleLabel) },
  ];
  const parts = [];
  if (includeFollowDefault) {
    parts.push(`<option value="">${escapeSelectText(followDefaultLabel)}</option>`);
  }
  for (const group of groups) {
    const voices = HOSTED_VOICES.filter((voice) => voice.gender === group.gender);
    if (!voices.length) continue;
    parts.push(`<optgroup label="${escapeSelectText(group.label)}">`);
    for (const voice of voices) {
      const label = hostedVoiceLabel(voice, locale);
      parts.push(`<option value="${escapeSelectText(voice.id)}">${escapeSelectText(label)}</option>`);
    }
    parts.push("</optgroup>");
  }
  select.innerHTML = parts.join("");
  const next = includeFollowDefault ? (current || "") : (current || HOSTED_VOICES[0]?.id || "");
  if (next && [...select.options].some((option) => option.value === next)) {
    select.value = next;
  } else if (includeFollowDefault) {
    select.value = "";
  }
}

function escapeSelectText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
