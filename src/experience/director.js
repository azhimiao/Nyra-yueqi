/**
 * Experience Director — canonical assemble + model + Conversation V2 (§13.2 / W3).
 * Production path: never uses offline fixed plot tree.
 * Inject `callModel` for tests (deterministic semantic stub).
 */

import { assembleCanonical } from "../prompt/assemble.js";
import { buildModeContribution } from "../prompt/mode-contributions.js";
import { activateWorldInfo } from "../worldbook/activation.js";
import {
  sendUser,
  appendAssistantCandidate,
  regenerate,
  getSession,
  getSharedHistory,
  getActiveCandidate,
} from "../conversation/index.js";
import {
  createExperienceBranchSnapshot,
  formatExperiencePromptBlocks,
} from "./schema.js";
import { parseAndReduceModelOutput, reduceTurn } from "./reducer.js";
import { getPackageOpening } from "./package-io.js";
import { getRegisteredPackage, getExperienceSession } from "./store.js";
import { updateExperienceAfterTurn, syncExperienceBranch } from "./runtime.js";
import { listWorldbookEntries } from "../worldbook/store.js";
import { loadContextGraphPromptBlock } from "../context/hot-path.js";
import { assembleAcceptedExperienceContribution } from "./memory.js";

/**
 * Deterministic semantic stub — reads user input; NOT a fixed plot tree (§15.4).
 * Different free-say inputs produce different assistant content.
 * @param {{ messages: Array<{role:string,content:string}>, context?: object }} input
 */
export function createDeterministicExperienceModelStub() {
  let turn = 0;
  const toneZh = {
    observant: "静观",
    tender: "温柔",
    tense: "紧绷",
    warm: "温暖",
    neutral: "平静",
    shy: "羞怯",
  };
  return async function stubCallModel({ messages, context } = {}) {
    turn += 1;
    const userMsg = [...(messages || [])].reverse().find((m) => m.role === "user");
    const userText = String(userMsg?.content || context?.userInput || "").trim();
    const openingId = String(context?.openingId || "");
    const tone = String(context?.sceneState?.emotionalTone || "neutral");
    const toneLabel = toneZh[tone] || "平静";
    const marker = userText.slice(0, 48) || "(沉默)";
    const hash = simpleHash(`${openingId}|${userText}|${turn}`);

    const narration = `雨夜站台（${openingId || "scene"}·第${turn}拍）：你做了「${marker}」，空气随之一顿。`;
    const dialogue = `……关于「${marker}」，我记下了。此刻心情偏${toneLabel}。`;

    const payload = {
      schemaVersion: 3,
      display: { narration, dialogue },
      contentBlocks: [
        { id: `stub-${turn}-n`, type: "narration", text: narration },
        { id: `stub-${turn}-d`, type: "dialogue", speakerId: "lead", text: dialogue },
      ],
      performance: {
        emotion: tone === "tense" ? "shy" : "warm",
        expressionId: "soft_smile",
        actionId: turn % 3 === 0 ? "lean_close" : "talking_default",
        voiceStyle: "soft",
        backgroundId: "rain_station",
        soundId: "rain_soft",
        camera: { shot: "medium", transition: "soft" },
      },
      suggestedActions: [
        { text: `回应「${marker.slice(0, 12)}」`, intent: "respond" },
        { text: "先听雨", intent: "pause" },
        { text: "换个话题", intent: "redirect" },
      ].slice(0, userText ? 3 : 2),
      scenePatch: {
        emotionalTone: userText.includes("离开") || userText.includes("拒绝") ? "tense" : "tender",
        newFacts: userText ? [`用户行动：${marker}`] : ["用户沉默"],
        tension: userText.includes("离开") ? 2 : 1,
        flags: [`stub_turn_${turn}`, `stub_hash_${hash % 97}`],
      },
      memorySignals: [],
      ending: {
        mayEnd: turn >= 28,
        reason: turn >= 28 ? "长夜可在此收尾" : "",
      },
    };

    return { content: JSON.stringify(payload), stub: true, turn };
  };
}

function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Build canonical messages for one experience turn.
 * @param {object} args
 */
export function assembleExperienceTurn(args = {}) {
  const {
    pkg,
    opening,
    session,
    userInput = "",
    characterName = "",
    characterBrief = "",
    loreEntries = [],
    longTermMemory = "",
    branchSummary = "",
    excludeMessageId = "",
  } = args;

  const blocks = formatExperiencePromptBlocks(
    pkg,
    opening,
    session?.sceneState,
    session?.directorAgenda,
  );

  const loreEntriesResolved = uniqueLoreEntries([
    ...(pkg?.embeddedLorebook || []),
    ...(Array.isArray(loreEntries) ? loreEntries : []),
  ]);
  const loreQuery = [
    userInput,
    session?.sceneState?.relationshipPremise || "",
    opening?.relationshipPremise || "",
  ].join("\n");
  const loreResult = activateWorldInfo(loreEntriesResolved, loreQuery, {
    scopeContext: {
      appId: "scenario",
      characterId: session?.characterId || "",
      experienceId: pkg?.id || "",
      sessionId: session?.conversationSessionId || "",
    },
    turnIndex: session?.sceneState?.turnIndex || 0,
    tokenBudget: 800,
  });

  const history = session?.conversationSessionId
    ? getSharedHistory(session.conversationSessionId, { limit: 24 })
        .filter((row) => !excludeMessageId || row.messageId !== excludeMessageId)
        .map((row) => `${row.role}: ${row.content}`)
        .join("\n")
    : "";

  const modeBlock = buildModeContribution("immersive", {
    experienceTitle: pkg?.title || "",
    openingLabel: opening?.title || "",
  });

  const assembled = assembleCanonical({
    platformSafety: "平台安全与内容边界。禁止固定剧情合流。输出必须为约定 JSON。",
    characterPackage: characterBrief || `角色：${characterName || "主演"}。保持身份连续。`,
    userPersona: "用户是与角色共同经历这一幕的人；自由输入优先。",
    relationshipState: session?.sceneState?.relationshipPremise || opening?.relationshipPremise || "",
    modeContext: modeBlock.text,
    experiencePackage: blocks.experiencePackage,
    openingSceneState: blocks.openingSceneState,
    worldInfo: loreResult?.text || "",
    longTermMemory: String(longTermMemory || ""),
    branchSummary: String(branchSummary || ""),
    branchHistory: history,
    userInput: String(userInput || "").trim() || "……",
    postHistoryContract:
      pkg?.responseContract?.instructions ||
      "输出 ExperienceModelOutput JSON：display / performance / suggestedActions / scenePatch / ending。suggestedActions 仅自然语言，不含节点 id。",
    totalBudget: 6000,
    mode: "immersive",
    loreTrace: loreResult?.trace || null,
  });

  return { assembled, loreResult };
}

function uniqueLoreEntries(entries) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!entry || typeof entry !== "object" || entry.enabled === false) return false;
    const key = String(entry.id || `${entry.title || ""}:${entry.content || ""}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadEnabledExternalLore(session, opening) {
  if (typeof window === "undefined") return [];
  try {
    const rows = await listWorldbookEntries();
    const conv = getSession(session.conversationSessionId);
    const explicitIds = new Set([
      ...(opening?.enabledLoreIds || []),
      ...(conv?.loreEntryIds || []),
      ...(session?.meta?.loreEntryIds || []),
    ].map(String));
    return rows.filter((entry) => {
      if (!entry || entry.enabled === false) return false;
      if (explicitIds.has(String(entry.id))) return true;
      if (entry.scope === "global") return true;
      if (entry.scope === "character") {
        const linked = entry.linkedCharacterIds?.length
          ? entry.linkedCharacterIds
          : (entry.characterId ? [entry.characterId] : []);
        return !linked.length || linked.includes(session.characterId);
      }
      if (entry.scope === "experience") {
        return !entry.experienceId || entry.experienceId === session.packageId;
      }
      if (entry.scope === "session") {
        return !entry.sessionId || entry.sessionId === session.conversationSessionId;
      }
      return false;
    });
  } catch {
    return [];
  }
}

function activeCandidateForMessage(conversationSessionId, messageId) {
  const conv = getSession(conversationSessionId);
  const node = conv?.messageNodes?.[String(messageId || "")];
  return node ? getActiveCandidate(node) : null;
}

function previousUserText(conversationSessionId, messageId) {
  const history = getSharedHistory(conversationSessionId, { limit: 80 });
  const end = history.findIndex((row) => row.messageId === messageId);
  const rows = end >= 0 ? history.slice(0, end) : history;
  return [...rows].reverse().find((row) => row.role === "user")?.content || "";
}

function buildBranchSummary(conversationSessionId, excludeMessageId = "") {
  const history = getSharedHistory(conversationSessionId, { limit: 80 })
    .filter((row) => !excludeMessageId || row.messageId !== excludeMessageId);
  if (history.length <= 16) return "";
  return history
    .slice(0, -12)
    .map((row) => `${row.role}: ${String(row.content || "").slice(0, 120)}`)
    .join("\n")
    .slice(0, 1600);
}

/**
 * Run one free-input turn through Experience Director.
 *
 * @param {{
 *   experienceSessionId: string,
 *   userInput?: string,
 *   callModel?: (args: object) => Promise<{ content: string }>,
 *   characterName?: string,
 *   characterBrief?: string,
 *   skipUserAppend?: boolean,
 *   regenerateMessageId?: string,
 * }} opts
 */
export async function runExperienceDirectorTurn(opts = {}) {
  const experienceSessionId = String(opts.experienceSessionId || "").trim();
  if (!experienceSessionId) {
    return { ok: false, reason: "experience_session_id_required" };
  }

  const session = getExperienceSession(experienceSessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  if (session.status !== "active") return { ok: false, reason: "session_not_active" };

  const pkg = getRegisteredPackage(session.packageId);
  if (!pkg) return { ok: false, reason: "package_not_found" };
  const opening = getPackageOpening(pkg, session.openingId);
  if (!opening) return { ok: false, reason: "opening_not_found" };

  const callModel = opts.callModel;
  if (typeof callModel !== "function") {
    return { ok: false, reason: "model_callable_required" };
  }

  const convId = session.conversationSessionId;
  const regenerateMessageId = String(opts.regenerateMessageId || "").trim();
  const userInput = String(
    opts.userInput || (regenerateMessageId ? previousUserText(convId, regenerateMessageId) : ""),
  ).trim();

  if (userInput && !opts.skipUserAppend && !regenerateMessageId && convId) {
    const sent = sendUser(convId, userInput, {
      mode: "immersive",
      experienceSessionId,
    });
    if (!sent.ok) return { ok: false, reason: sent.reason || "send_user_failed" };
  }

  const externalLore = await loadEnabledExternalLore(session, opening);
  const acceptedExperience = assembleAcceptedExperienceContribution({
    characterId: session.characterId,
    mode: "immersive",
    query: userInput,
    limit: 6,
  });
  const contextGraph = loadContextGraphPromptBlock({
    characterId: session.characterId,
    query: userInput,
    limit: 6,
  });
  const longTermMemory = [contextGraph, acceptedExperience.text].filter(Boolean).join("\n\n");
  const targetCandidate = regenerateMessageId
    ? activeCandidateForMessage(convId, regenerateMessageId)
    : null;
  const sceneBefore = targetCandidate?.meta?.sceneBefore
    || session.branchSnapshots?.[session.activeBranchId]?.sceneState
    || session.sceneState;
  const promptSession = { ...session, sceneState: sceneBefore };

  const { assembled, loreResult } = assembleExperienceTurn({
    pkg,
    opening,
    session: promptSession,
    userInput,
    characterName: opts.characterName,
    characterBrief: opts.characterBrief,
    loreEntries: externalLore,
    longTermMemory,
    branchSummary: buildBranchSummary(convId, regenerateMessageId),
    excludeMessageId: regenerateMessageId,
  });

  let rawContent = "";
  try {
    const result = await callModel({
      messages: assembled.messages,
      context: {
        userInput,
        openingId: opening.id,
        packageId: pkg.id,
        sceneState: sceneBefore,
        experienceSessionId,
      },
    });
    rawContent = String(result?.content || "");
  } catch (error) {
    return {
      ok: false,
      reason: `model_call_failed:${error?.message || error}`,
      assembled,
    };
  }

  const parsed = parseAndReduceModelOutput(rawContent, sceneBefore);
  if (!parsed.ok || !parsed.output) {
    return {
      ok: false,
      reason: parsed.errors?.[0] || "invalid_model_output",
      errors: parsed.errors,
      assembled,
      // Honest failure — do not invent dialogue
    };
  }

  // Advance turnIndex via reduceTurn (parse path only applied patch)
  const advanced = reduceTurn(sceneBefore, parsed.output.scenePatch);
  const sceneState = advanced.state;

  const displayText = parsed.output.contentBlocks
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n");

  const experienceSnapshot = createExperienceBranchSnapshot({
    sceneState,
    suggestedActions: parsed.output.suggestedActions,
    lastPerformance: parsed.output.performance,
    lastDisplay: parsed.output.display,
  });

  if (convId) {
    const assistantMeta = {
      mode: "immersive",
      narration: parsed.output.display.narration,
      contentBlocks: parsed.output.contentBlocks,
      scenePatch: parsed.output.scenePatch,
      performance: parsed.output.performance,
      suggestedActions: parsed.output.suggestedActions,
      sceneBefore,
      experienceSnapshot,
      generationSnapshot: {
        source: "experience_director",
        inspector: assembled.inspector,
        loreTrace: loreResult?.trace || null,
      },
      experienceSessionId,
    };
    const asst = regenerateMessageId
      ? regenerate(convId, displayText, assistantMeta, { messageId: regenerateMessageId })
      : appendAssistantCandidate(convId, displayText, assistantMeta);
    if (!asst.ok) {
      return { ok: false, reason: asst.reason || "append_assistant_failed", output: parsed.output };
    }
  }

  syncExperienceBranch(experienceSessionId);
  const updated = updateExperienceAfterTurn(experienceSessionId, {
    sceneState,
    suggestedActions: parsed.output.suggestedActions,
    lastPerformance: parsed.output.performance,
    lastDisplay: parsed.output.display,
  });

  return {
    ok: true,
    output: parsed.output,
    sceneState,
    session: updated.value,
    assembled,
    loreTrace: loreResult?.trace || null,
    generationSource: "model",
  };
}

/**
 * Headless multi-turn loop for verify gates (injectable stub).
 * @param {{
 *   experienceSessionId: string,
 *   turns: string[],
 *   callModel: Function,
 * }} opts
 */
export async function runExperienceHeadlessLoop(opts = {}) {
  const turns = Array.isArray(opts.turns) ? opts.turns : [];
  const results = [];
  for (const text of turns) {
    const result = await runExperienceDirectorTurn({
      experienceSessionId: opts.experienceSessionId,
      userInput: text,
      callModel: opts.callModel,
      characterName: opts.characterName,
    });
    results.push(result);
    if (!result.ok) break;
  }
  return {
    ok: results.length === turns.length && results.every((r) => r.ok),
    results,
    finalSession: getExperienceSession(opts.experienceSessionId),
  };
}
