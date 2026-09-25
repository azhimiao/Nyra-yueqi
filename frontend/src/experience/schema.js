/**
 * Experience Runtime schema — Package / Opening / Session / SceneState / Agenda (§5.4–5.8 / §13.2).
 * W2: ScenePatch whitelist + unified model output.
 * W3: full package / session contracts (no beat graphs).
 */

export const EXPERIENCE_SCHEMA_VERSION = 1;
export const EXPERIENCE_OUTPUT_SCHEMA_VERSION = 3;
export const EXPERIENCE_STORE_KEY = "yueqi.experience.v1";

export const EXPERIENCE_SESSION_STATUSES = Object.freeze([
  "active",
  "paused",
  "ended",
  "archived",
]);

/** Whitelist fields ScenePatch may modify. */
export const SCENE_PATCH_WHITELIST = Object.freeze([
  "emotionalTone",
  "resolvedThreadIds",
  "newFacts",
  "locationHint",
  "weatherHint",
  "tension",
  "flags",
]);

/** Fields forbidden in ExperiencePackage source (fixed plot graph). */
export const FORBIDDEN_PACKAGE_GRAPH_KEYS = Object.freeze([
  "nextByChoice",
  "nextByKeyword",
  "beatCursor",
  "beats",
  "startBeatId",
]);

/**
 * @typedef {{
 *   emotionalTone?: string,
 *   resolvedThreadIds?: string[],
 *   newFacts?: string[],
 *   locationHint?: string,
 *   weatherHint?: string,
 *   tension?: number,
 *   flags?: string[],
 * }} ScenePatch
 */

/**
 * @typedef {{
 *   schemaVersion: number,
 *   contentBlocks: Array<{
 *     id: string,
 *     type: "narration"|"dialogue"|"inner",
 *     speakerId: string,
 *     speakerName: string,
 *     text: string,
 *   }>,
 *   display: { narration: string, dialogue: string, contentBlocks: unknown[] },
 *   performance: {
 *     emotion: string,
 *     expressionId: string,
 *     actionId: string,
 *     voiceStyle: string,
 *     backgroundId: string,
 *     soundId: string,
 *     camera: { shot: string, transition: string },
 *   },
 *   suggestedActions: Array<{ text: string, intent: string }>,
 *   scenePatch: ScenePatch,
 *   memorySignals: unknown[],
 *   ending: { mayEnd: boolean, reason: string },
 * }} ExperienceModelOutput
 */

/**
 * @typedef {{
 *   softGoals: string[],
 *   avoidances: string[],
 *   tensionGuidance: string,
 *   unresolvedClues: string[],
 *   endingHint: string,
 *   notes: string,
 * }} DirectorAgenda
 */

/**
 * Empty SceneState seed — §5.7 plus W2 patch aliases.
 * @param {Partial<object>} [seed]
 */
export function createEmptySceneState(seed = {}) {
  const location = String(seed.location || seed.locationHint || "");
  const weather = String(seed.weather || seed.weatherHint || "");
  const establishedFacts = Array.isArray(seed.establishedFacts)
    ? seed.establishedFacts.map(String)
    : Array.isArray(seed.newFacts)
      ? seed.newFacts.map(String)
      : [];
  const unresolvedThreads = Array.isArray(seed.unresolvedThreads)
    ? seed.unresolvedThreads.map(String)
    : [];
  const tension = Number.isFinite(Number(seed.tension)) ? Number(seed.tension) : 1;

  return {
    location,
    timeOfDay: String(seed.timeOfDay || "night"),
    weather,
    participants: Array.isArray(seed.participants) ? seed.participants.map(String) : [],
    participantPositions:
      seed.participantPositions && typeof seed.participantPositions === "object"
        ? { ...seed.participantPositions }
        : {},
    relationshipPremise: String(seed.relationshipPremise || ""),
    tensionBand: String(seed.tensionBand || tensionBandFromNumber(tension)),
    emotionalTone: String(seed.emotionalTone || "neutral"),
    activeGoal: String(seed.activeGoal || ""),
    unresolvedThreads,
    establishedFacts,
    inventoryHints: Array.isArray(seed.inventoryHints) ? seed.inventoryHints.map(String) : [],
    visualState:
      seed.visualState && typeof seed.visualState === "object" ? { ...seed.visualState } : {},
    safetyState:
      seed.safetyState && typeof seed.safetyState === "object" ? { ...seed.safetyState } : {},
    turnIndex: Number.isFinite(Number(seed.turnIndex)) ? Math.max(0, Number(seed.turnIndex)) : 0,
    // W2 patch aliases (reducer)
    locationHint: String(seed.locationHint || location),
    weatherHint: String(seed.weatherHint || weather),
    resolvedThreadIds: Array.isArray(seed.resolvedThreadIds)
      ? seed.resolvedThreadIds.map(String)
      : [],
    newFacts: Array.isArray(seed.newFacts) ? seed.newFacts.map(String) : establishedFacts.slice(),
    tension,
    flags: Array.isArray(seed.flags) ? seed.flags.map(String) : [],
    openingId: String(seed.openingId || ""),
    experienceId: String(seed.experienceId || ""),
  };
}

function tensionBandFromNumber(n) {
  if (n <= 0) return "calm";
  if (n >= 3) return "high";
  if (n >= 2) return "rising";
  return "low";
}

/**
 * Soft director agenda — never forces fixed dialogue (§5.8).
 * @param {Partial<DirectorAgenda>} [partial]
 * @returns {DirectorAgenda}
 */
export function createDirectorAgenda(partial = {}) {
  return {
    softGoals: Array.isArray(partial.softGoals) ? partial.softGoals.map(String) : [],
    avoidances: Array.isArray(partial.avoidances) ? partial.avoidances.map(String) : [],
    tensionGuidance: String(partial.tensionGuidance || ""),
    unresolvedClues: Array.isArray(partial.unresolvedClues)
      ? partial.unresolvedClues.map(String)
      : [],
    endingHint: String(partial.endingHint || ""),
    notes: String(partial.notes || ""),
  };
}

/**
 * Full opening snapshot — not a beat graph (§5.4 / §7.1).
 * @param {object} [partial]
 */
export function createExperienceOpening(partial = {}) {
  const id = String(partial.id || "").trim();
  if (!id) throw new Error("experience_opening_requires_id");
  const initialSceneState = createEmptySceneState(partial.initialSceneState || {});
  return {
    id,
    title: String(partial.title || id),
    teaser: String(partial.teaser || ""),
    relationshipPremise: String(partial.relationshipPremise || ""),
    initialSceneState,
    openingTurns: Array.isArray(partial.openingTurns)
      ? partial.openingTurns.map((t) => ({
          role: t?.role === "user" ? "user" : "assistant",
          narration: String(t?.narration || ""),
          dialogue: String(t?.dialogue || t?.content || ""),
          performance:
            t?.performance && typeof t.performance === "object" ? { ...t.performance } : {},
        }))
      : [],
    suggestedActions: Array.isArray(partial.suggestedActions)
      ? partial.suggestedActions
          .map((a) => ({
            text: String(a?.text || a?.label || "").trim(),
            intent: String(a?.intent || "").trim(),
          }))
          .filter((a) => a.text)
          .slice(0, 3)
      : [],
    initialPerformance:
      partial.initialPerformance && typeof partial.initialPerformance === "object"
        ? { ...partial.initialPerformance }
        : {
            emotion: "warm",
            expressionId: "soft_smile",
            actionId: "greet",
            backgroundId: "rain_station",
            camera: { shot: "medium", transition: "soft" },
          },
    enabledLoreIds: Array.isArray(partial.enabledLoreIds)
      ? partial.enabledLoreIds.map(String).filter(Boolean)
      : [],
    creatorNote: String(partial.creatorNote || ""),
    directorAgenda: createDirectorAgenda(partial.directorAgenda || {}),
  };
}

/**
 * @param {object} [partial]
 */
export function createExperiencePackage(partial = {}) {
  const id = String(partial.id || "").trim();
  if (!id) throw new Error("experience_package_requires_id");
  const openings = Array.isArray(partial.openings)
    ? partial.openings.map((o) => createExperienceOpening(o))
    : [];
  return {
    schemaVersion: Number(partial.schemaVersion) || EXPERIENCE_SCHEMA_VERSION,
    id,
    version: String(partial.version || "1.0.0"),
    title: String(partial.title || id),
    subtitle: String(partial.subtitle || ""),
    synopsis: String(partial.synopsis || ""),
    cover: String(partial.cover || ""),
    tags: Array.isArray(partial.tags) ? partial.tags.map(String) : [],
    contentRating: String(partial.contentRating || "teen"),
    author: String(partial.author || ""),
    compatibleCharacterRules:
      partial.compatibleCharacterRules && typeof partial.compatibleCharacterRules === "object"
        ? { ...partial.compatibleCharacterRules }
        : { requireSameCharacter: false },
    playerRole: String(partial.playerRole || "同行的人"),
    scenarioOverride: String(partial.scenarioOverride || ""),
    cast: partial.cast && typeof partial.cast === "object"
      ? {
          leadName: String(partial.cast.leadName || "").trim(),
          persona: String(partial.cast.persona || "").trim(),
        }
      : {},
    openings,
    embeddedLorebook: Array.isArray(partial.embeddedLorebook)
      ? partial.embeddedLorebook.map((entry) => ({ ...entry }))
      : [],
    directorPolicy:
      partial.directorPolicy && typeof partial.directorPolicy === "object"
        ? { ...partial.directorPolicy }
        : {},
    responseContract:
      partial.responseContract && typeof partial.responseContract === "object"
        ? { ...partial.responseContract }
        : { schemaVersion: EXPERIENCE_OUTPUT_SCHEMA_VERSION },
    initialAssets:
      partial.initialAssets && typeof partial.initialAssets === "object"
        ? { ...partial.initialAssets }
        : {},
    rendererProfile: String(partial.rendererProfile || "immersive-stage-v1"),
    memoryPolicy:
      partial.memoryPolicy && typeof partial.memoryPolicy === "object"
        ? { ...partial.memoryPolicy }
        : { requireUserAccept: true },
    permissions:
      partial.permissions && typeof partial.permissions === "object"
        ? { ...partial.permissions }
        : {},
    resources: Array.isArray(partial.resources)
      ? partial.resources.map((r) => ({
          id: String(r?.id || "").trim(),
          license: String(r?.license || "").trim(),
          source: String(r?.source || r?.origin || "").trim(),
          url: String(r?.url || r?.href || "").trim(),
          hash: r?.hash != null ? String(r.hash) : "",
          note: String(r?.note || "").trim(),
        }))
      : [],
    customCss:
      partial.customCss && partial.permissions?.allowCustomCss
        ? String(partial.customCss)
        : "",
    migration:
      partial.migration && typeof partial.migration === "object" ? { ...partial.migration } : {},
    legacyScriptId: partial.legacyScriptId ? String(partial.legacyScriptId) : "",
  };
}

/**
 * ExperienceSession — runtime pointer onto Conversation V2 (§5.5).
 * @param {object} [partial]
 */
export function createExperienceSession(partial = {}) {
  const now = new Date().toISOString();
  const id = String(partial.id || createExperienceId("exps"));
  const status = EXPERIENCE_SESSION_STATUSES.includes(partial.status)
    ? partial.status
    : "active";
  const branchSnapshots = {};
  if (partial.branchSnapshots && typeof partial.branchSnapshots === "object") {
    for (const [branchId, snapshot] of Object.entries(partial.branchSnapshots)) {
      if (!branchId || !snapshot || typeof snapshot !== "object") continue;
      branchSnapshots[branchId] = createExperienceBranchSnapshot(snapshot);
    }
  }
  return {
    id,
    packageId: String(partial.packageId || ""),
    packageVersion: String(partial.packageVersion || "1.0.0"),
    characterId: String(partial.characterId || ""),
    conversationSessionId: String(partial.conversationSessionId || ""),
    activeBranchId: String(partial.activeBranchId || ""),
    openingId: String(partial.openingId || ""),
    status,
    sceneState: createEmptySceneState(partial.sceneState || {}),
    directorAgenda: createDirectorAgenda(partial.directorAgenda || {}),
    acceptedMemoryCandidateIds: Array.isArray(partial.acceptedMemoryCandidateIds)
      ? partial.acceptedMemoryCandidateIds.map(String)
      : [],
    suggestedActions: Array.isArray(partial.suggestedActions)
      ? partial.suggestedActions
          .map((a) => ({
            text: String(a?.text || "").trim(),
            intent: String(a?.intent || "").trim(),
          }))
          .filter((a) => a.text)
          .slice(0, 3)
      : [],
    lastPerformance:
      partial.lastPerformance && typeof partial.lastPerformance === "object"
        ? { ...partial.lastPerformance }
        : null,
    lastDisplay:
      partial.lastDisplay && typeof partial.lastDisplay === "object"
        ? { ...partial.lastDisplay }
        : null,
    branchSnapshots,
    inputDraft: partial.inputDraft != null ? String(partial.inputDraft) : "",
    legacyRunId: partial.legacyRunId ? String(partial.legacyRunId) : "",
    startedAt: String(partial.startedAt || now),
    updatedAt: String(partial.updatedAt || now),
    endedAt: partial.endedAt ? String(partial.endedAt) : "",
    meta: partial.meta && typeof partial.meta === "object" ? { ...partial.meta } : {},
  };
}

/**
 * Branch-local stage state. Conversation owns the text graph; Experience owns
 * the visual/runtime projection for each branch.
 * @param {object} [partial]
 */
export function createExperienceBranchSnapshot(partial = {}) {
  return {
    sceneState: createEmptySceneState(partial.sceneState || {}),
    suggestedActions: Array.isArray(partial.suggestedActions)
      ? partial.suggestedActions
          .map((item) => ({
            text: String(item?.text || item?.label || "").trim(),
            intent: String(item?.intent || "").trim(),
          }))
          .filter((item) => item.text)
          .slice(0, 3)
      : [],
    lastPerformance:
      partial.lastPerformance && typeof partial.lastPerformance === "object"
        ? { ...partial.lastPerformance }
        : null,
    lastDisplay:
      partial.lastDisplay && typeof partial.lastDisplay === "object"
        ? { ...partial.lastDisplay }
        : null,
    updatedAt: String(partial.updatedAt || new Date().toISOString()),
  };
}

/** @param {unknown} raw */
export function normalizeExperienceContentBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((block, index) => {
      const rawType = String(block?.type || block?.kind || "dialogue").trim();
      const type = ["narration", "dialogue", "inner"].includes(rawType)
        ? rawType
        : "dialogue";
      return {
        id: String(block?.id || `block-${index + 1}`),
        type,
        speakerId: String(block?.speakerId || ""),
        speakerName: String(block?.speakerName || block?.speaker || ""),
        text: String(block?.text || block?.content || "").trim(),
      };
    })
    .filter((block) => block.text)
    .slice(0, 24);
}

let _idSeq = 0;

/**
 * @param {string} [prefix]
 */
export function createExperienceId(prefix = "exp") {
  _idSeq += 1;
  const rand = Math.random().toString(16).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${_idSeq}-${rand}`;
}

/**
 * @param {unknown} value
 */
export function __resetExperienceIdSeqForTests() {
  _idSeq = 0;
}

/**
 * Normalize model JSON into ExperienceModelOutput (lenient).
 * @param {unknown} raw
 * @returns {{ ok: boolean, errors: string[], value: ExperienceModelOutput|null }}
 */
export function normalizeExperienceOutput(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["output_not_object"], value: null };
  }
  /** @type {any} */
  const o = raw;
  const errors = [];

  const schemaVersion = Number(o.schemaVersion) || EXPERIENCE_OUTPUT_SCHEMA_VERSION;
  const display = o.display && typeof o.display === "object" ? o.display : {};
  const performance = o.performance && typeof o.performance === "object" ? o.performance : {};
  const camera =
    performance.camera && typeof performance.camera === "object" ? performance.camera : {};

  let contentBlocks = normalizeExperienceContentBlocks(
    o.contentBlocks || display.contentBlocks,
  );
  let narration = String(display.narration ?? o.narration ?? "").trim();
  let dialogue = String(display.dialogue ?? o.dialogue ?? o.reply ?? "").trim();
  if (!contentBlocks.length) {
    contentBlocks = [
      narration ? { id: "block-1", type: "narration", speakerId: "", speakerName: "", text: narration } : null,
      dialogue ? { id: "block-2", type: "dialogue", speakerId: "lead", speakerName: "", text: dialogue } : null,
    ].filter(Boolean);
  }
  if (!narration) {
    narration = contentBlocks
      .filter((block) => block.type === "narration")
      .map((block) => block.text)
      .join("\n");
  }
  if (!dialogue) {
    dialogue = contentBlocks
      .filter((block) => block.type !== "narration")
      .map((block) => block.text)
      .join("\n");
  }
  if (!narration && !dialogue) errors.push("empty_display");

  const suggestedIn = Array.isArray(o.suggestedActions)
    ? o.suggestedActions
    : Array.isArray(o.choices)
      ? o.choices
      : [];
  const suggestedActions = suggestedIn
    .map((item) => ({
      text: String(item?.text || item?.label || "").trim(),
      intent: String(item?.intent || "").trim(),
      _droppedId: item?.id ? String(item.id) : "",
    }))
    .filter((item) => item.text)
    .slice(0, 3)
    .map(({ text, intent }) => ({ text, intent }));

  const scenePatchRaw = o.scenePatch && typeof o.scenePatch === "object" ? o.scenePatch : {};
  /** @type {ScenePatch} */
  const scenePatch = {};
  for (const key of SCENE_PATCH_WHITELIST) {
    if (Object.prototype.hasOwnProperty.call(scenePatchRaw, key)) {
      scenePatch[key] = scenePatchRaw[key];
    }
  }

  const endingRaw = o.ending && typeof o.ending === "object" ? o.ending : {};
  const memorySignals = Array.isArray(o.memorySignals) ? o.memorySignals.slice(0, 12) : [];

  /** @type {ExperienceModelOutput} */
  const value = {
    schemaVersion,
    contentBlocks,
    display: { narration, dialogue, contentBlocks },
    performance: {
      emotion: String(performance.emotion || o.emotion || "warm").trim() || "warm",
      expressionId: String(performance.expressionId || o.expressionId || "").trim(),
      actionId: String(performance.actionId || o.actionId || "").trim(),
      voiceStyle:
        String(performance.voiceStyle || performance.voice?.style || o.voice?.style || "soft").trim() ||
        "soft",
      backgroundId: String(performance.backgroundId || o.backgroundId || "").trim(),
      soundId: String(performance.soundId || o.soundId || "").trim(),
      camera: {
        shot: String(camera.shot || o.camera?.shot || "medium").trim() || "medium",
        transition: String(camera.transition || o.camera?.transition || "soft").trim() || "soft",
      },
    },
    suggestedActions,
    scenePatch,
    memorySignals,
    ending: {
      mayEnd: Boolean(endingRaw.mayEnd ?? o.suggestEnding),
      reason: String(endingRaw.reason || "").trim(),
    },
  };

  return { ok: errors.length === 0, errors, value };
}

/**
 * One structural repair pass: extract JSON object and re-normalize.
 * @param {string} rawText
 * @returns {{ ok: boolean, errors: string[], value: ExperienceModelOutput|null, repaired: boolean }}
 */
export function repairExperienceOutput(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return { ok: false, errors: ["empty_raw"], value: null, repaired: false };
  }

  let parsed = null;
  let extracted = false;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
        extracted = true;
      } catch {
        parsed = null;
      }
    }
  }

  if (!parsed) {
    return { ok: false, errors: ["unparseable_json"], value: null, repaired: false };
  }

  const first = normalizeExperienceOutput(parsed);
  if (first.ok) {
    return { ...first, repaired: extracted };
  }

  const lifted = {
    schemaVersion: EXPERIENCE_OUTPUT_SCHEMA_VERSION,
    display: {
      narration: parsed.narration || parsed.display?.narration || "",
      dialogue: parsed.dialogue || parsed.reply || parsed.display?.dialogue || "",
    },
    performance: {
      emotion: parsed.emotion || parsed.performance?.emotion,
      expressionId: parsed.expressionId || parsed.performance?.expressionId,
      actionId: parsed.actionId || parsed.performance?.actionId,
      voiceStyle: parsed.voice?.style || parsed.performance?.voiceStyle,
      backgroundId: parsed.backgroundId || parsed.performance?.backgroundId,
      soundId: parsed.soundId || parsed.performance?.soundId,
      camera: parsed.camera || parsed.performance?.camera,
    },
    suggestedActions: parsed.suggestedActions || parsed.choices,
    scenePatch: parsed.scenePatch || {},
    memorySignals: parsed.memorySignals || [],
    ending: parsed.ending || { mayEnd: Boolean(parsed.suggestEnding), reason: "" },
  };

  const second = normalizeExperienceOutput(lifted);
  return { ...second, repaired: true };
}

/**
 * Format package + opening + scene for canonical assembler blocks.
 * @param {ReturnType<typeof createExperiencePackage>} pkg
 * @param {ReturnType<typeof createExperienceOpening>|null} opening
 * @param {ReturnType<typeof createEmptySceneState>} sceneState
 * @param {DirectorAgenda} [agenda]
 */
export function formatExperiencePromptBlocks(pkg, opening, sceneState, agenda) {
  const packageText = [
    `作品：${pkg?.title || ""}`,
    pkg?.subtitle ? `副标题：${pkg.subtitle}` : "",
    pkg?.synopsis ? `梗概：${pkg.synopsis}` : "",
    pkg?.playerRole ? `玩家身份：${pkg.playerRole}` : "",
    pkg?.scenarioOverride ? `情境覆盖：${pkg.scenarioOverride}` : "",
    pkg?.directorPolicy?.styleHint
      ? `导演风格：${pkg.directorPolicy.styleHint}`
      : "",
    pkg?.directorPolicy?.rules
      ? `导演规则：${Array.isArray(pkg.directorPolicy.rules) ? pkg.directorPolicy.rules.join("；") : String(pkg.directorPolicy.rules)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const openingText = opening
    ? [
        `开场：${opening.title}`,
        opening.teaser ? `提要：${opening.teaser}` : "",
        opening.relationshipPremise ? `关系前提：${opening.relationshipPremise}` : "",
        opening.creatorNote ? `创作者注：${opening.creatorNote}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const scene = sceneState || createEmptySceneState();
  const agendaText = agenda
    ? [
        agenda.softGoals?.length ? `软目标：${agenda.softGoals.join("；")}` : "",
        agenda.avoidances?.length ? `回避：${agenda.avoidances.join("；")}` : "",
        agenda.tensionGuidance ? `张力：${agenda.tensionGuidance}` : "",
        agenda.unresolvedClues?.length ? `未决线索：${agenda.unresolvedClues.join("；")}` : "",
        agenda.endingHint ? `结束提示：${agenda.endingHint}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const sceneText = [
    openingText,
    `地点：${scene.location || scene.locationHint || ""}`,
    `时段：${scene.timeOfDay || ""}`,
    `天气：${scene.weather || scene.weatherHint || ""}`,
    `关系前提：${scene.relationshipPremise || ""}`,
    `情绪：${scene.emotionalTone || ""}`,
    `张力：${scene.tensionBand || scene.tension}`,
    `当前目标：${scene.activeGoal || ""}`,
    scene.unresolvedThreads?.length
      ? `未解线索：${scene.unresolvedThreads.join("；")}`
      : "",
    scene.establishedFacts?.length
      ? `已确立事实：${scene.establishedFacts.slice(-8).join("；")}`
      : "",
    `回合：${scene.turnIndex ?? 0}`,
    agendaText,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    experiencePackage: packageText,
    openingSceneState: sceneText,
  };
}
