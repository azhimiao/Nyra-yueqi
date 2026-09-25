/**
 * Atomic First Light V2 commit via repository transaction.
 * Careful/quick: character + preference + opening must persist.
 * Import does not rewrite persona; the first spoken line still goes out.
 */

import { createUserCompanionPreferenceV2 } from "../contracts/user-companion-preference-v2.js";
import { runRepositoryTransaction } from "../storage/db.js";
import { saveAutonomyPrefs } from "../companion/autonomy-prefs.js";
import { saveProactiveWakePrefs, TWO_HOUR_WAKE } from "../proactive/config.js";
import { annotateCharacterV2 } from "../characters/migration-v2.js";
import {
  setActiveCharacterId,
  syncCharacterCacheRecord,
  syncLegacyProfileMirror,
} from "../characters/store.js";
import {
  draftToCharacterInput,
  draftToPreferenceInput,
} from "./state-v2.js";
import { resolveCallUserAs, resolveCharacterOpeningLine } from "../chat/opening-intro.js";
import { pronounsFromGenderIdentity } from "../prompt/character-identity-v2.js";
import { getLocale } from "../i18n/index.js";

export function preferenceRecordId(userId, characterId) {
  return `pref:${String(userId || "local").trim()}:${String(characterId || "").trim()}`;
}

export function onboardingRecordId(characterId) {
  return `onboarding:${String(characterId || "").trim()}`;
}

export function openingMessageId(characterId) {
  return `fl-first-${String(characterId || "").trim()}`;
}

function slotText(slot) {
  if (slot && typeof slot === "object" && Object.hasOwn(slot, "value")) {
    const value = slot.value;
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join("、");
    return String(value || "").trim();
  }
  return String(slot || "").trim();
}

function slotSource(slot) {
  return slot && typeof slot === "object" ? String(slot.source || "") : "";
}

export function firstMessageFromV2Draft(draft, characterId, character = {}) {
  void characterId;
  return resolveCharacterOpeningLine(character, {
    characterName: slotText(draft?.character?.name),
    callUserAs: slotText(draft?.preference?.callUserAs),
    relationshipType: slotText(draft?.preference?.relationshipType),
    relationshipStart: slotText(draft?.preference?.relationshipStart),
    sharedHistory: slotText(draft?.preference?.sharedHistory),
    customRelationshipText: slotText(draft?.preference?.customRelationshipText),
  }, getLocale());
}

/**
 * @param {object} state First Light V2 state
 * @param {{
 *   characterId?: string,
 *   userId?: string,
 *   existingCharacter?: object,
 *   backend?: { runTransaction: Function },
 *   runTransaction?: Function,
 * }} [opts]
 */
export async function commitFirstLightV2(state, opts = {}) {
  const draft = state?.draft || {};
  const characterId = String(opts.characterId || state?.committedCharacterId || "").trim();
  if (!characterId) {
    return { ok: false, reason: "missing_character_id", draftPreserved: true };
  }
  const userId = String(opts.userId || "local").trim() || "local";
  const characterInput = draftToCharacterInput(draft);
  const preferenceInput = draftToPreferenceInput(draft);
  const importedRelationshipOnly = state?.path === "import";
  const characterNameIsExplicit = ["explicit", "import_review"].includes(slotSource(characterInput.name));
  const name = !importedRelationshipOnly && characterNameIsExplicit
    ? slotText(characterInput.name) || opts.existingCharacter?.name || "未命名"
    : opts.existingCharacter?.name || slotText(characterInput.name) || "未命名";
  const genderIdentity = slotText(characterInput.selfIdentity?.genderIdentity);
  const pronounsSlot = characterInput.selfIdentity?.pronouns;
  const pronouns = Array.isArray(pronounsSlot?.value)
    ? pronounsSlot.value
    : slotText(pronounsSlot)
      ? [slotText(pronounsSlot)]
      : [];
  const existingIdentity = {
    ...(opts.existingCharacter?.selfIdentity || {}),
    ...(opts.existingCharacter?.profileV2?.selfIdentity || {}),
  };
  const existingPersona = {
    ...(opts.existingCharacter?.persona || {}),
    ...(opts.existingCharacter?.profileV2?.persona || {}),
  };
  const genderIsExplicit = ["explicit", "import_review"].includes(slotSource(characterInput.selfIdentity?.genderIdentity));
  const pronounsAreExplicit = ["explicit", "import_review"].includes(slotSource(characterInput.selfIdentity?.pronouns));
  const resolvedPronouns = pronounsAreExplicit && pronouns.length
    ? pronouns
    : (genderIsExplicit ? pronounsFromGenderIdentity(genderIdentity) : []);
  const valuesAreExplicit = ["explicit", "import_review"].includes(slotSource(characterInput.persona?.values));
  const callUserAs = resolveCallUserAs(slotText(draft?.preference?.callUserAs));
  const alias = callUserAs
    || opts.existingCharacter?.alias
    || opts.existingCharacter?.profile?.fields?.[1]
    || "";
  const rawCharacterRecord = {
    ...(opts.existingCharacter || {}),
    id: characterId,
    name,
    alias,
    selfIdentity: {
      ...existingIdentity,
      ...(!importedRelationshipOnly && genderIsExplicit ? { genderIdentity } : {}),
      ...(!importedRelationshipOnly && resolvedPronouns.length ? { pronouns: resolvedPronouns } : {}),
    },
    persona: {
      ...existingPersona,
      ...(!importedRelationshipOnly && valuesAreExplicit
        ? {
          values: Array.isArray(characterInput.persona?.values?.value)
            ? characterInput.persona.values.value
            : [],
        }
        : {}),
    },
    profile: {
      ...(opts.existingCharacter?.profile || {}),
      fields: [
        name,
        alias,
        opts.existingCharacter?.profile?.fields?.[2] || "",
        opts.existingCharacter?.profile?.fields?.[3] || "",
        opts.existingCharacter?.profile?.fields?.[4] || "",
      ],
    },
    source: opts.existingCharacter?.source || "user",
    skipOpeningIntro: false,
    createdAt: opts.existingCharacter?.createdAt || state.updatedAt || opts.clock?.nowIso?.(),
    updatedAt: opts.existingCharacter?.updatedAt || state.updatedAt || opts.clock?.nowIso?.(),
  };
  const preference = createUserCompanionPreferenceV2({
    userId,
    characterId,
    userIdentity: preferenceInput.userIdentity,
    relationship: preferenceInput.relationship,
    interaction: preferenceInput.interaction,
    boundaries: preferenceInput.boundaries,
    onboardingVersion: 2,
  }, { clock: opts.clock });
  const sessionId = `char:${characterId}`;
  const messageId = openingMessageId(characterId);
  const firstMessage = firstMessageFromV2Draft(draft, characterId, opts.existingCharacter);
  const opening = {
    id: messageId,
    sessionId,
    role: "assistant",
    content: firstMessage,
    characterId,
    kind: "first_light_opening",
    notLivedExperience: true,
    status: firstMessage ? "ready" : "placeholder",
  };
  const characterRecord = annotateCharacterV2(rawCharacterRecord);
  const marker = {
    id: onboardingRecordId(characterId),
    characterId,
    completed: true,
    onboardingVersion: 2,
    skipOpeningIntro: false,
    path: state?.path || "",
  };
  const ops = [
    { type: "put", store: "characters", record: characterRecord },
    { type: "put", store: "preferences", record: { id: preferenceRecordId(userId, characterId), ...preference } },
    { type: "put", store: "onboarding", record: marker },
  ];
  if (opening) ops.push({ type: "put", store: "openings", record: opening });
  const tx = opts.runTransaction || runRepositoryTransaction;
  const result = await tx(
    {
      idempotencyKey: `first-light-v2:${characterId}`,
      ops,
    },
    opts.backend ? { backend: opts.backend } : {},
  );
  if (!result?.ok) {
    return {
      ok: false,
      reason: result?.error?.code || "commit_failed",
      draftPreserved: true,
      duplicate: Boolean(result?.duplicate),
    };
  }
  // The repository transaction is the source of truth. Refresh the in-memory
  // and legacy UI projections immediately so a renamed character is not
  // replaced by the old profile value on the next render.
  syncCharacterCacheRecord(characterRecord);
  try {
    setActiveCharacterId(characterId);
  } catch {
    /* non-browser verification backends may not expose an active character */
  }
  syncLegacyProfileMirror(characterRecord);
  const quietHours = preferenceInput.boundaries?.quietHours?.value;
  const autoDiary = draft?.preference?.autoDiary?.source === "explicit"
    && draft.preference.autoDiary.value === true;
  const autoMoments = draft?.preference?.autoMoments?.source === "explicit"
    && draft.preference.autoMoments.value === true;
  saveAutonomyPrefs({
    onboardingComplete: true,
    preset: "custom",
    aiAutonomousLife: true,
    proactiveMessage: true,
    autoDiary,
    autoMoments,
    dailyCap: 8,
    dailyProactiveBudget: 8,
    quietStart: quietHours?.start,
    quietEnd: quietHours?.end,
  });
  saveProactiveWakePrefs(TWO_HOUR_WAKE);
  if (firstMessage && !result.duplicate) {
    try {
      const { writeCompanionTurn } = await import("../conversation/companion-write.js");
      const { saveChatMessage } = await import("../storage/db.js");
      await writeCompanionTurn({
        role: "assistant",
        text: firstMessage,
        characterId,
        chatSessionId: sessionId,
        messageId,
        meta: {
          kind: "first_light_opening",
          source: "first_light_v2",
          notLivedExperience: true,
        },
        saveChatMessage,
      });
    } catch {
      // Openings record still holds the intro; empty transcripts show the letter.
    }
  }
  return {
    ok: true,
    duplicate: Boolean(result.duplicate),
    characterId,
    sessionId,
    messageId,
    firstMessage,
    preference,
    character: characterRecord,
  };
}
