/**
 * Bridge legacy library metadata into an open ExperiencePackage.
 * Fixed beat graphs are intentionally not copied into the production package.
 * User-owned archives: 名字 / 介绍 / 开场 / 剧情指令.
 */

import { createExperiencePackage } from "./schema.js";
import { registerPackage, getRegisteredPackage } from "./store.js";
import {
  bibleFromScript,
  formatWorkBiblePrompt,
  isUserOwnedScript,
  sceneSeedFromBible,
  splitOpening,
} from "../scenario/work-bible.js";

function safeId(value) {
  return String(value || "scenario")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "scenario";
}

function openingBlocks(script, bible) {
  const split = splitOpening(script?.openingBeat || bible.openingBeat || "");
  const narration = split.narration || String(bible.premise || script?.premise || "").trim();
  const dialogue = split.dialogue || String(bible.openingDialogue || "").trim();
  if (!narration && !dialogue) return [];
  return [{
    role: "assistant",
    narration,
    dialogue,
    performance: {
      emotion: String(script?.mood || "warm"),
      expressionId: "soft_smile",
      actionId: "talking_default",
      backgroundId: String(script?.backgroundId || ""),
      camera: { shot: "medium", transition: "soft" },
    },
  }];
}

/** @param {object} script */
export function createExperiencePackageFromScenario(script = {}) {
  if (!script?.id) throw new Error("scenario_package_requires_script_id");

  const bible = bibleFromScript(script);
  const packageId = String(script.experiencePackageId || `exp-${safeId(script.id)}`);
  const title = String(script.title || "未命名情景");
  const premise = String(script.premise || bible.premise || "").trim();
  const turns = openingBlocks(script, bible);
  const instruction = String(bible.instruction || bible.worldview || "").trim();
  const worldviewEntry = instruction
    ? [{
        id: `lore-${safeId(script.id)}-instruction`,
        title: "剧情指令",
        keys: [],
        content: instruction,
        scope: "experience",
        enabled: true,
        priority: 90,
        constant: true,
        matchMode: "any",
        insertPosition: "before_scenario",
        role: "system",
        sourcePackageId: packageId,
      }]
    : [];

  return createExperiencePackage({
    id: packageId,
    version: "1.0.0",
    legacyScriptId: String(script.id),
    title,
    subtitle: premise.slice(0, 48),
    synopsis: premise,
    cover: String(script.cover || ""),
    tags: Array.isArray(script.tags) ? script.tags : [],
    author: isUserOwnedScript(script) ? "User" : "Yueqi",
    compatibleCharacterRules: { requireSameCharacter: false },
    cast: {
      leadName: String(bible.leadName || "对方").trim() || "对方",
      persona: [instruction, "按本场开场关系演出，不是日常陪伴。"].filter(Boolean).join("\n"),
    },
    playerRole: "与ta共同经历这一场的人",
    worldSetting: premise,
    worldview: instruction,
    scenarioOverride: formatWorkBiblePrompt(script),
    openings: [{
      id: `${safeId(script.id)}-opening`,
      title: "开场",
      teaser: premise,
      relationshipPremise: premise,
      leadName: "对方",
      initialSceneState: {
        ...sceneSeedFromBible(bible),
        location: bible.location || title,
        weather: bible.weather || String(script.weather || script.mood || ""),
        emotionalTone: String(script.mood || "warm"),
        visualState: {
          backgroundId: String(script.backgroundId || ""),
          sceneId: String(script.sceneId || ""),
        },
      },
      openingTurns: turns,
      suggestedActions: [
        { text: "说出你此刻想说的话", intent: "speak" },
        { text: "先观察四周", intent: "observe" },
      ],
      initialPerformance: turns[0]?.performance || {},
      enabledLoreIds: Array.isArray(script.loreEntryIds) ? script.loreEntryIds : [],
      creatorNote: instruction,
      directorAgenda: {
        softGoals: ["Follow the user's free action", "Let the relationship change through concrete events"],
        avoidances: ["Do not force a fixed plot", "Do not speak for the user", "Do not rush to an ending"],
        tensionGuidance: "Advance naturally from the current scene and relationship state.",
      },
    }],
    embeddedLorebook: [
      ...worldviewEntry,
      ...(Array.isArray(script.embeddedLorebook) ? script.embeddedLorebook : []),
    ],
    directorPolicy: {
      openEnded: true,
      freeInputPrimary: true,
      defaultAgenda: {
        softGoals: ["Maintain character continuity", "Respond to the user's concrete action"],
        avoidances: ["No fixed-node convergence"],
      },
    },
    responseContract: {
      schemaVersion: 3,
      instructions:
        "Return JSON only. Use ordered contentBlocks with type narration, dialogue, or inner. " +
        "Keep the user's actions under user control. Suggested actions are optional natural-language ideas.",
    },
    initialAssets: {
      backgroundId: String(script.backgroundId || ""),
      sceneId: String(script.sceneId || ""),
    },
    memoryPolicy: { requireUserAccept: true },
  });
}

/** Register or refresh one scenario package. @param {object} script */
export function ensureScenarioExperiencePackage(script) {
  if (!script?.id) return null;
  const pkg = createExperiencePackageFromScenario(script);
  const registered = registerPackage(pkg);
  return registered.ok ? registered.value : null;
}

/** @param {object[]} scripts */
export function registerScenarioExperiencePackages(scripts = []) {
  return (Array.isArray(scripts) ? scripts : [])
    .map(ensureScenarioExperiencePackage)
    .filter(Boolean);
}
