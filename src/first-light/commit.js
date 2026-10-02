/**
 * Transactional First Light commit → character / relationship / autonomy / first message.
 * Idempotent: same message id `fl-first-${characterId}`; in-flight mutex; early exit if done.
 */

import {
  getActiveCharacterId,
  getCharacter,
  upsertCharacter,
  setActiveCharacterId,
} from "../characters/store.js";
import { BUILTIN_CHARACTER_ID } from "../constants.js";
import { saveRelationshipState, getRelationshipState } from "../experience/relationship.js";
import { saveAutonomyPrefs } from "../companion/autonomy-prefs.js";
import { saveProactiveWakePrefs, TWO_HOUR_WAKE } from "../proactive/config.js";
import { getAllRecords, saveChatMessage } from "../storage/db.js";
import { dmSessionId } from "../characters/ids.js";
import { writeCompanionTurn } from "../conversation/companion-write.js";
import {
  buildPromptSystemPatch,
  draftToAutonomyPatch,
  draftToRelationshipSeed,
  draftToStructuralPrefs,
} from "./presets.js";
import { firstMessageForDraft } from "./preview.js";
import {
  loadFirstLightState,
  markFirstLightDone,
  saveFirstLightState,
} from "./state.js";
import { BUILTIN_NYRA_NAME } from "../characters/builtin-nyra-prompt.js";
import { getLocale } from "../i18n/index.js";

export const FIRST_LIGHT_PREFS_KEY = "yueqi.firstLight.companionPrefs.v1";

/** @type {Promise<object>|null} */
let commitInflight = null;

function writeCompanionPrefs(characterId, structural) {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRST_LIGHT_PREFS_KEY) || "{}") || {};
    const byCharacter = raw.byCharacter && typeof raw.byCharacter === "object" ? raw.byCharacter : {};
    byCharacter[characterId] = { ...structural, updatedAt: new Date().toISOString() };
    localStorage.setItem(FIRST_LIGHT_PREFS_KEY, JSON.stringify({ schemaVersion: 1, byCharacter }));
  } catch {
    /* ignore */
  }
}

async function findMessageById(messageId) {
  try {
    const rows = await getAllRecords("messages");
    return rows.find((m) => m?.id === messageId) || null;
  } catch {
    return null;
  }
}

function countOpeningMessages(sessionId) {
  return getAllRecords("messages").then((rows) =>
    rows.filter(
      (m) => m?.sessionId === sessionId && (m?.metadata?.kind === "first_light_opening" || String(m?.id || "").startsWith("fl-first-")),
    ).length,
  ).catch(() => 0);
}

/**
 * @param {object} draft
 * @param {{ characterId?: string, name?: string }} [opts]
 */
export async function commitFirstLightDraft(draft, opts = {}) {
  if (commitInflight) return commitInflight;
  commitInflight = runCommit(draft, opts).finally(() => {
    commitInflight = null;
  });
  return commitInflight;
}

async function runCommit(draft, opts = {}) {
  const prior = loadFirstLightState();
  if (prior.done && prior.committedCharacterId) {
    const characterId = prior.committedCharacterId;
    const sessionId = dmSessionId(characterId);
    const messageId = `fl-first-${characterId}`;
    const existing = await findMessageById(messageId);
    return {
      ok: true,
      alreadyCommitted: true,
      characterId,
      sessionId,
      messageId,
      firstMessage: existing?.content || "",
    };
  }

  const name = String(opts.name || draft.name || "").trim() || BUILTIN_NYRA_NAME;
  let characterId = String(opts.characterId || prior.committedCharacterId || getActiveCharacterId() || "").trim();
  let character = characterId ? await getCharacter(characterId) : null;

  if (!character) {
    const { createCharacter } = await import("../characters/store.js");
    character = await createCharacter({ name });
    characterId = character.id;
    setActiveCharacterId(characterId);
  }

  const structural = draftToStructuralPrefs(draft);
  const seed = draftToRelationshipSeed(draft);
  // Legacy v1 remains available for old data, but it must not replace the
  // authored builtin Character Prompt with a questionnaire-generated blob.
  const promptSystem = characterId === BUILTIN_CHARACTER_ID
    ? String(character.profile?.promptSystem || "").trim()
    : buildPromptSystemPatch(draft, name, getLocale());
  const autonomyPatch = draftToAutonomyPatch(draft);
  const lines = firstMessageForDraft(draft, getLocale());
  const firstText = lines.join("\n\n");
  const sessionId = dmSessionId(characterId);
  const messageId = `fl-first-${characterId}`;

  try {
    saveFirstLightState({ stage: "COMMITTING", errorMessage: "" });

    try {
      const { ensureDmConversation } = await import("../characters/session-context.js");
      await ensureDmConversation(characterId);
    } catch {
      /* conversation ensure optional in non-DOM tests */
    }

    const existingMsg = await findMessageById(messageId);
    if (existingMsg) {
      markFirstLightDone({ committedCharacterId: characterId });
      return {
        ok: true,
        alreadyCommitted: true,
        characterId,
        sessionId,
        messageId,
        firstMessage: existingMsg.content || firstText,
      };
    }

    await upsertCharacter({
      id: characterId,
      name,
      alias: character.alias || name,
      profile: {
        ...(character.profile || {}),
        fields: [
          name,
          character.profile?.fields?.[1] || "",
          character.profile?.fields?.[2] || "",
          character.profile?.fields?.[3] || "",
          character.profile?.fields?.[4] || "",
        ],
        promptSystem,
        promptDeveloper: character.profile?.promptDeveloper || "",
        anniversaryDate: character.profile?.anniversaryDate || "",
      },
      source: character.source || "user",
    });

    const existingRel = getRelationshipState(characterId);
    const alreadySeeded = existingRel.events?.some((e) => e.projectionKey === `fl-init-${characterId}`);
    if (!alreadySeeded) {
      const rel = saveRelationshipState(characterId, {
        characterId,
        intimacy: seed.intimacy,
        trust: seed.trust,
        tension: seed.tension,
        flags: [...new Set([...(existingRel.flags || []), ...seed.flags])],
        events: [
          ...(existingRel.events || []),
          {
            id: `fl-init-${characterId}`,
            kind: "first_light_commit",
            summary: structural.relationshipType,
            at: new Date().toISOString(),
            projectionKey: `fl-init-${characterId}`,
            meta: {
              source: "first_light_init",
              notLivedExperience: true,
              relationshipStart: draft.relationshipStart || "",
              sharedHistoryHint: String(draft.sharedHistory || "").slice(0, 80),
              customRelationshipText: structural.customRelationshipText || "",
            },
          },
        ],
      });
      if (!rel.ok) throw new Error(rel.reason || "relationship_write_failed");
    }

    saveAutonomyPrefs(autonomyPatch);
    saveProactiveWakePrefs(TWO_HOUR_WAKE);
    writeCompanionPrefs(characterId, structural);

    const openingWrite = await writeCompanionTurn({
      role: "assistant",
      text: firstText,
      characterId,
      chatSessionId: sessionId,
      messageId,
      meta: {
        kind: "first_light_opening",
        relationshipType: draft.relationshipType || "",
        relationshipStart: draft.relationshipStart || "",
        sharedHistoryHint: String(draft.sharedHistory || "").slice(0, 80),
        customRelationshipText: structural.customRelationshipText || "",
        source: "first_light_init",
        notLivedExperience: true,
      },
      saveChatMessage,
    });
    if (!openingWrite.ok) {
      throw new Error(openingWrite.reason || "first_light_v2_write_failed");
    }

    const openingCount = await countOpeningMessages(sessionId);
    if (openingCount > 1) {
      console.warn("first_light: unexpected multiple opening messages", openingCount);
    }

    markFirstLightDone({ committedCharacterId: characterId });
    return {
      ok: true,
      characterId,
      sessionId,
      firstMessage: firstText,
      messageId,
      openingCount,
    };
  } catch (error) {
    saveFirstLightState({
      stage: "ERROR_RECOVERABLE",
      errorMessage: String(error?.message || error || "write_failed").slice(0, 200),
    });
    return {
      ok: false,
      reason: String(error?.message || error || "write_failed"),
      draftPreserved: true,
    };
  }
}

export function loadCompanionFirstLightPrefs(characterId) {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRST_LIGHT_PREFS_KEY) || "{}") || {};
    return raw.byCharacter?.[characterId] || null;
  } catch {
    return null;
  }
}

/** Test helper — clear in-flight mutex. */
export function __resetCommitInflightForTests() {
  commitInflight = null;
}
