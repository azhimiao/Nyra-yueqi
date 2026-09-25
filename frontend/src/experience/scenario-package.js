/**
 * Bridge legacy library metadata into an open ExperiencePackage.
 * Fixed beat graphs are intentionally not copied into the production package.
 */

import { createExperiencePackage } from "./schema.js";
import { registerPackage, getRegisteredPackage } from "./store.js";
import {
  NIGHT_RAIN_STATION_PACKAGE,
  NIGHT_RAIN_PACKAGE_ID,
} from "./presets/night-rain-station.js";

function safeId(value) {
  return String(value || "scenario")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "scenario";
}

function openingBlocks(script) {
  const narration = String(script?.openingBeat || script?.premise || "").trim();
  return narration
    ? [{
        role: "assistant",
        narration,
        dialogue: "",
        performance: {
          emotion: String(script?.mood || "warm"),
          expressionId: "soft_smile",
          actionId: "talking_default",
          backgroundId: String(script?.backgroundId || ""),
          camera: { shot: "medium", transition: "soft" },
        },
      }]
    : [];
}

/** @param {object} script */
export function createExperiencePackageFromScenario(script = {}) {
  if (!script?.id) throw new Error("scenario_package_requires_script_id");
  if (script.id === "script-rain-station") return NIGHT_RAIN_STATION_PACKAGE;

  const packageId = String(script.experiencePackageId || `exp-${safeId(script.id)}`);
  const title = String(script.title || "Untitled experience");
  const premise = String(script.premise || "").trim();
  const castHint = String(script.castHint || "").trim();
  return createExperiencePackage({
    id: packageId,
    version: "1.0.0",
    legacyScriptId: String(script.id),
    title,
    subtitle: String(script.emotionTag || "Open roleplay"),
    synopsis: premise,
    cover: String(script.cover || ""),
    tags: Array.isArray(script.tags) ? script.tags : [],
    author: script.source === "preset" ? "Yueqi" : "User",
    compatibleCharacterRules: { requireSameCharacter: false },
    cast: {
      leadName: String(script.castLeadName || "对方").trim() || "对方",
      persona: [castHint, "按本场开场关系演出，不是日常陪伴。"].filter(Boolean).join("\n"),
    },
    playerRole: String(script.playerRole || "The person sharing this scene"),
    scenarioOverride: [premise, castHint].filter(Boolean).join("\n"),
    openings: [{
      id: `${safeId(script.id)}-opening`,
      title: String(script.openingTitle || "From here"),
      teaser: premise,
      relationshipPremise: String(script.relationshipPremise || premise),
      initialSceneState: {
        location: String(script.location || title),
        weather: String(script.weather || script.mood || ""),
        emotionalTone: String(script.mood || "warm"),
        relationshipPremise: String(script.relationshipPremise || premise),
        visualState: {
          backgroundId: String(script.backgroundId || ""),
          sceneId: String(script.sceneId || ""),
        },
      },
      openingTurns: openingBlocks(script),
      suggestedActions: [
        { text: "说出你此刻想说的话", intent: "speak" },
        { text: "先观察四周", intent: "observe" },
      ],
      initialPerformance: openingBlocks(script)[0]?.performance || {},
      enabledLoreIds: Array.isArray(script.loreEntryIds) ? script.loreEntryIds : [],
      creatorNote: castHint,
      directorAgenda: {
        softGoals: ["Follow the user's free action", "Let the relationship change through concrete events"],
        avoidances: ["Do not force a fixed plot", "Do not speak for the user", "Do not rush to an ending"],
        tensionGuidance: "Advance naturally from the current scene and relationship state.",
      },
    }],
    embeddedLorebook: Array.isArray(script.embeddedLorebook) ? script.embeddedLorebook : [],
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
  if (script.id === "script-rain-station") {
    registerPackage(NIGHT_RAIN_STATION_PACKAGE);
    return getRegisteredPackage(NIGHT_RAIN_PACKAGE_ID);
  }
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

