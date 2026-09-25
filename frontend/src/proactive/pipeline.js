import { callModel } from "../model/client.js";
import { getTodayDiary } from "../diary/records.js";
import { deliverSegmentedText } from "../chat/segmented-send.js";
import { sanitizeImChatText } from "../chat/im-sanitize.js";
import { buildTypedProactiveFallback, eventPromptOf } from "../calendar/event-types.js";
import { localizeCalendarEvent } from "../calendar/seed-labels.js";
import { buildProactiveStrategy, formatProactiveStrategy } from "./strategy.js";
import { loadProactiveWakePrefs } from "./config.js";
import { buildContextEnvelope, formatImplicitEnvelope } from "../context/broker.js";
import { dmSessionId } from "../characters/ids.js";
import {
  isNoLinkMode,
  isNotificationOnlyMode,
  isProactiveMessageMode,
  normalizeEventMode,
} from "../calendar/modes.js";
import { buildLanguageContext, formatLanguageDirective, outputLanguageRule } from "../i18n/language-context.js";
import { renderPrompt } from "../prompts/registry.js";
import { getBrandName } from "../i18n/index.js";
import { toPackLocale } from "../i18n/language-prefs.js";
import { isFeatureEnabled } from "../features/flags.js";
import { evaluateContinuityProactiveGate } from "./continuity-gate.js";
import { getCompanionSurfaceModel } from "../relationship/surface-service.js";
import { assembleAcceptedExperienceContribution } from "../experience/memory.js";
import { assertAutonomyAllowed, recordAutonomyProactiveUse } from "../companion/autonomy-prefs.js";

const SILENCE_MARKERS = /^(SILENCE|静默|不说话|保持安静)\s*$/i;

function proactiveLang(deps = {}) {
  return buildLanguageContext({
    conversationLanguage: deps.conversationLanguage,
    appLocale: deps.appLocale,
  });
}

async function prepareProactiveEnvelope(profile, query) {
  const characterId = String(profile?.id || profile?.characterId || "").trim();
  if (!characterId) return null;
  try {
    return await buildContextEnvelope({
      purpose: "proactive",
      appId: "proactive",
      characterId,
      chatSessionId: dmSessionId(characterId),
      currentInput: String(query || ""),
      budgetProfile: "compact",
      // purpose policy defaults: moments off for proactive unless explicitly enabled
    });
  } catch (error) {
    console.warn("[yueqi.context] proactive envelope unavailable", error);
    return null;
  }
}

/**
 * Calendar / user-written reminder path (kept).
 */
export async function generateProactiveBody(event, status, deps) {
  const {
    collectProviderConfig,
    collectCharacterProfile,
    buildDiaryDeps,
    collectLibraryState,
    getRuntimeState,
    getProactiveFrequency,
  } = deps;
  const profile = collectCharacterProfile?.() || {};
  const lang = proactiveLang(deps);
  const en = lang.conversationLanguage === "en-US";
  const characterName = profile.name || (en ? "Companion" : "角色");
  const config = collectProviderConfig?.() || {};
  const localized = localizeCalendarEvent(event, en ? "en" : "zh-CN");
  const prompt = eventPromptOf(localized);
  const strategy = buildProactiveStrategy(event, status, {
    library: collectLibraryState?.() || {},
    runtimeState: getRuntimeState?.() || {},
    frequency: getProactiveFrequency?.(),
    mode: event.mode,
  });
  const envelope = await prepareProactiveEnvelope(profile, `${localized.title || ""} ${prompt}`.trim());

  let contextLine = en
    ? `Calendar reminder "${localized.title}" is due.`
    : `日程提醒「${localized.title}」到了。`;
  contextLine += en
    ? `\nEvent hint (user-written reminder material): ${prompt || localized.title || "gentle on-time reminder"}.`
    : `\n事件提示（用户写给角色的提醒素材）：${prompt || localized.title || "到点轻声提醒对方"}。`;
  contextLine += en
    ? `\nProactive strategy: ${formatProactiveStrategy(strategy)}.`
    : `\n主动消息策略：${formatProactiveStrategy(strategy)}。`;
  contextLine += en
    ? `\nCurrent status: ${status.mood}, ${status.weather?.label || "unknown weather"}.`
    : `\n当前状态：${status.mood}，${status.weather?.label || "未知天气"}。`;
  const implicit = envelope ? formatImplicitEnvelope(envelope, { excludeIds: [] }) : "";
  if (implicit) contextLine += `\n${implicit}`;
  const acceptedExperience = assembleAcceptedExperienceContribution({
    characterId: String(profile?.id || profile?.characterId || "").trim(),
    mode: "chat",
    query: `${localized.title || ""} ${prompt}`.trim(),
    limit: 3,
  });
  if (acceptedExperience.text) contextLine += `\n${acceptedExperience.text}`;
  contextLine += en
    ? "\nSend one short reminder as if you remembered this yourself — not as a system announcement."
    : "\n请据此发一条很短的提醒消息，像记得今天有这件事，而不是在播报系统功能。";

  try {
    const diary = await getTodayDiary(profile?.id || profile?.characterId || "");
    if (diary?.title) {
      contextLine += en ? ` Today's diary: ${diary.title}.` : ` 今日日记：${diary.title}。`;
    }
  } catch {
    // optional context
  }

  if (!config.baseUrl || !config.apiKey || !config.model) {
    return buildTypedProactiveFallback(localized, status);
  }

  try {
    const system = en
      ? `You are ${characterName}. Using the user's event hint, send one short calendar reminder (under 40 words). Sound like you remembered it — do not explain system mechanics. Follow proactive tone: ${strategy.tone}.\n${formatLanguageDirective(lang)}\n${outputLanguageRule(lang)}`
      : `你是${characterName}。根据用户写下的「事件提示」，发一条很短的日程提醒消息，不超过 40 字。像记得今天有这件事、轻轻提醒对方，不要解释系统机制。必须遵循主动消息策略：${strategy.tone}。\n${formatLanguageDirective(lang)}\n${outputLanguageRule(lang)}`;
    const result = await callModel(
      config,
      [
        { role: "system", content: system },
        ...(envelope?.historyMessages || []).slice(-6).map((item) => ({ role: item.role, content: item.content })),
        { role: "user", content: contextLine },
      ],
      { temperature: 0.8, stream: false },
    );
    return result.content.trim();
  } catch {
    return buildTypedProactiveFallback(localized, status);
  }
}

/**
 * Wake the character once for a deferred proactive turn:
 * run a real character generation — may speak or stay silent.
 * Never uses a fixed canned line like「想你了」.
 *
 * @returns {Promise<{ ok: boolean, spoke: boolean, text?: string, reason?: string }>}
 */
export async function wakeCharacterOnce(deps = {}) {
  const {
    isWithinDnd,
    notificationSettings,
    addMessage,
    ingestMemoryAndRender,
    showCompanionNotification,
    collectCharacterProfile,
    collectProviderConfig,
    buildDiaryDeps,
    collectLibraryState,
    getRuntimeState,
    beginSummaryGeneration,
    isSummaryGenerationCurrent,
    updateSegmentSummary,
    refreshDailyStatus,
    onCharacterWoke,
  } = deps;

  if (!isFeatureEnabled("proactive")) {
    return { ok: false, spoke: false, reason: "proactive_flag_off" };
  }

  const autonomyGate = assertAutonomyAllowed("message", deps.resourcePolicyEnv || {});
  if (!autonomyGate.ok) {
    return { ok: false, spoke: false, reason: autonomyGate.reason };
  }

  if (isWithinDnd?.(new Date(), notificationSettings)) {
    return { ok: false, spoke: false, reason: "dnd" };
  }

  const profile = collectCharacterProfile?.() || {};
  // freeze target companion at wake start — do not re-read UI active character later.
  const frozenCompanionId = String(
    deps.targetCompanionId || profile?.id || profile?.characterId || "",
  ).trim();
  if (!frozenCompanionId) {
    return { ok: false, spoke: false, reason: "missing_companionId" };
  }

  // C3: Continuity-backed wakes require confirmed openLoop / evidence; dedupe fingerprint+sourceRef.
  if (deps.gateContinuity !== false && isFeatureEnabled("relationshipContinuityV1")) {
    const gate = evaluateContinuityProactiveGate({
      companionId: frozenCompanionId,
      userId: deps.userId || "local",
      relationshipId: deps.relationshipId,
      sourceRef: deps.continuitySourceRef || deps.sourceRef || "",
      wakeSource: deps.wakeSource || "long_offline",
      locale: deps.appLocale === "en" || deps.conversationLanguage === "en-US" ? "en" : "zh-CN",
      markNotified: true,
    });
    if (!gate.ok) {
      return { ok: false, spoke: false, reason: gate.reason || "continuity_gate", continuity: gate.model };
    }
    deps._continuitySurface = gate.model;
  }
  const lang = proactiveLang(deps);
  const en = lang.conversationLanguage === "en-US";
  const characterName = profile.name || (en ? "Companion" : "角色");
  const scopedAddMessage = async (text, type = "ai", options = {}) => addMessage?.(text, type, {
    ...options,
    characterId: frozenCompanionId,
    companionId: frozenCompanionId,
    userId: deps.userId || "local",
  });
  const config = collectProviderConfig?.() || {};
  const status = (await refreshDailyStatus?.(true)) || { mood: en ? "calm" : "平静", weather: {}, asleep: false };
  const prefs = loadProactiveWakePrefs();
  const runtime = getRuntimeState?.() || {};
  const envelope = await prepareProactiveEnvelope(
    profile,
    en
      ? "User has been quiet; decide whether a gentle check-in fits"
      : "用户一段时间没有出现；判断是否适合主动联系",
  );

  let contextLine = en
    ? "The user has not reached out for a while."
    : "用户已经一段时间没有找你。";
  contextLine += en
    ? `\nThis is a character wake: speak as ${characterName}, or stay quiet.`
    : `\n这是一次「启动角色」：请以${characterName}本人开口，或决定保持安静。`;
  contextLine += en
    ? `\nCurrent status: ${status.mood || "calm"}, ${status.weather?.label || "unknown weather"}${status.asleep ? ", seems asleep" : ""}.`
    : `\n当前状态：${status.mood || "平静"}，${status.weather?.label || "未知天气"}${status.asleep ? "，像在睡着" : ""}。`;
  contextLine += en
    ? `\nUser prefs: ~${prefs.probability}% trigger chance; silence window ${prefs.silenceMinMin}–${prefs.silenceMaxMin} min.`
    : `\n用户设置：触发概率约 ${prefs.probability}%，静默窗口 ${prefs.silenceMinMin}–${prefs.silenceMaxMin} 分钟。`;
  if (runtime.lastUserActivityAt) {
    const hours = Math.max(0, (Date.now() - Number(runtime.lastUserActivityAt)) / 3600000);
    contextLine += en
      ? `\nAbout ${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours since last user activity.`
      : `\n距上次用户活动约 ${hours < 10 ? hours.toFixed(1) : Math.round(hours)} 小时。`;
  }

  const implicit = envelope ? formatImplicitEnvelope(envelope, { excludeIds: [] }) : "";
  if (implicit) contextLine += `\n${implicit}`;
  const acceptedExperience = assembleAcceptedExperienceContribution({
    characterId: frozenCompanionId,
    mode: "chat",
    query: "",
    limit: 3,
  });
  if (acceptedExperience.text) contextLine += `\n${acceptedExperience.text}`;

  const continuitySurface = deps._continuitySurface || (
    isFeatureEnabled("relationshipContinuityV1")
      ? getCompanionSurfaceModel({
        companionId: frozenCompanionId,
        userId: deps.userId || "local",
        surface: "proactive",
        locale: en ? "en" : "zh-CN",
      })
      : null
  );
  if (continuitySurface?.openLoop) {
    contextLine += en
      ? `\nConfirmed open loop (use only this, do not invent): ${continuitySurface.openLoop}.`
      : `\n已确认的待跟进（仅可使用，不得编造）：${continuitySurface.openLoop}。`;
  } else if (continuitySurface?.todayLine) {
    contextLine += en
      ? `\nContinuity today line (soft/presence only if no evidence): ${continuitySurface.todayLine}.`
      : `\n今日连续性文案（无证据时仅为软陪伴）：${continuitySurface.todayLine}。`;
  }

  if (!config.baseUrl || !config.apiKey || !config.model) {
    return { ok: false, spoke: false, reason: "no_model" };
  }

  let raw = "";
  try {
    const wakeSystem = String(renderPrompt("proactive.heartbeat", {
      language: lang,
      characterName,
    }));
    const result = await callModel(
      config,
      [
        {
          role: "system",
          content: [
            wakeSystem,
            formatLanguageDirective(lang),
            outputLanguageRule(lang),
            en
              ? "Instant messaging only: no stage directions; spoken short lines. This is a scheduled two-hour check-in — send a short line. Reply SILENCE only if they clearly asked for space in recent messages."
              : "这是即时通讯：禁止（动作描写）与旁白，只打口语短句。这是约两小时一次的例行关心，请发一句短消息。只有对方刚明确说需要空间时才回复 SILENCE。",
          ].join("\n"),
        },
        ...(envelope?.historyMessages || []).slice(-6).map((item) => ({ role: item.role, content: item.content })),
        { role: "user", content: contextLine },
      ],
      { temperature: 0.85, stream: false },
    );
    raw = String(result.content || "").trim();
  } catch (error) {
    console.warn("wakeCharacterOnce failed", error);
    return { ok: false, spoke: false, reason: "model_error" };
  }

  if (!raw || SILENCE_MARKERS.test(raw)) {
    try {
      onCharacterWoke?.({ spoke: false });
    } catch {
      /* optional */
    }
    return { ok: true, spoke: false, text: "" };
  }

  const body = sanitizeImChatText(raw.replace(/^["「]|["」]$/g, "")) || (en ? "Hey." : "在吗。");
  const summaryToken = beginSummaryGeneration?.();
  await deliverSegmentedText(body, {
    addMessage: scopedAddMessage,
    delayMs: 1000,
    role: "ai",
    isCurrentGeneration: summaryToken == null
      ? null
      : () => isSummaryGenerationCurrent?.(summaryToken),
    onPart: (part, index, allParts) => {
      updateSegmentSummary?.({
        generation: summaryToken,
        status,
        segmentIndex: index,
        segmentTotal: allParts.length,
        segmentText: part,
        eventTitle: en ? "Checking in" : "主动找你",
      });
    },
  });
  await ingestMemoryAndRender?.({
    rawText: body,
    source: "system.proactive",
    weight: 0.55,
    role: characterName,
    wing: "Relationship",
    room: "Proactive",
    tags: en ? ["proactive", "wake"] : ["主动找你", "角色启动"],
    pinned: false,
    searchable: true,
    companionId: frozenCompanionId,
    characterId: frozenCompanionId,
  });
  await showCompanionNotification?.(body, characterName);
  recordAutonomyProactiveUse(1);
  try {
    onCharacterWoke?.({ spoke: true, text: body });
  } catch {
    /* optional */
  }
  return { ok: true, spoke: true, text: body };
}

export async function runProactiveAction(event, deps) {
  const {
    mode = event.mode,
    refreshDailyStatus,
    isWithinDnd,
    notificationSettings,
    addMessage,
    ingestMemoryAndRender,
    showCompanionNotification,
    collectCharacterProfile,
    collectProviderConfig,
    buildDiaryDeps,
    collectLibraryState,
    getRuntimeState,
    getProactiveFrequency,
    beginSummaryGeneration,
    isSummaryGenerationCurrent,
    updateSegmentSummary,
  } = deps;

  if (!isFeatureEnabled("proactive")) return { ok: false, reason: "proactive_flag_off" };
  if (isNoLinkMode(mode)) return { ok: false, reason: "no_link" };
  if (isWithinDnd?.(new Date(), notificationSettings)) return { ok: false, reason: "dnd" };

  // Heartbeat wake path — never use fixed「想你了」event titles
  if (event?.kind === "character_wake" || event?.wakeOnce) {
    return wakeCharacterOnce(deps);
  }

  // C3: calendar/continuity reminders dedupe by Continuity fingerprint + event sourceRef when Continuity is on.
  if (isFeatureEnabled("relationshipContinuityV1") && deps.gateContinuity !== false) {
    const profileEarly = collectCharacterProfile?.() || {};
    const companionId = String(
      deps.targetCompanionId || profileEarly?.id || profileEarly?.characterId || "",
    ).trim();
    const sourceRef = String(
      event?.sourceId
      || event?.eventId
      || event?.id
      || event?.idempotencyKey
      || "",
    ).trim();
    if (companionId && sourceRef) {
      const gate = evaluateContinuityProactiveGate({
        companionId,
        userId: deps.userId || "local",
        relationshipId: deps.relationshipId,
        sourceRef,
        wakeSource: "calendar",
        requireOpenLoop: false,
        markNotified: true,
        locale: deps.appLocale === "en" || deps.conversationLanguage === "en-US" ? "en" : "zh-CN",
      });
      // Calendar events are themselves confirmed evidence; allow when gate fails only for no_confirmed_evidence
      // but still honor proactive flag / autonomy / dedupe.
      if (!gate.ok && gate.reason === "deduped") {
        return { ok: false, reason: "deduped", fingerprint: gate.fingerprint };
      }
      if (!gate.ok && gate.reason === "autonomy_blocked") {
        return { ok: false, reason: "autonomy_blocked" };
      }
      if (!gate.ok && gate.reason === "proactive_flag_off") {
        return { ok: false, reason: "proactive_flag_off" };
      }
    }
  }

  const profile = collectCharacterProfile?.() || {};
  const frozenCompanionId = String(
    deps.targetCompanionId || profile?.id || profile?.characterId || "",
  ).trim();

  const status = await refreshDailyStatus?.(true) || { mood: "平静", weather: {}, asleep: false };
  const lang = proactiveLang(deps);
  const en = lang.conversationLanguage === "en-US";
  const rawBody = await generateProactiveBody(event, status, {
    collectProviderConfig,
    collectCharacterProfile,
    buildDiaryDeps,
    collectLibraryState,
    getRuntimeState,
    getProactiveFrequency,
    conversationLanguage: lang.conversationLanguage,
    appLocale: lang.appLocale,
  });
  const body = sanitizeImChatText(rawBody) || (en ? "Hey." : "在吗。");
  const shellTitle = event.title
    || `${getBrandName(toPackLocale(lang.appLocale))} Companion`;

  if (isProactiveMessageMode(mode)) {
    const summaryToken = beginSummaryGeneration?.();
    await deliverSegmentedText(body, {
      addMessage,
      delayMs: 1200,
      role: "ai",
      isCurrentGeneration: summaryToken == null
        ? null
        : () => isSummaryGenerationCurrent?.(summaryToken),
      onPart: (part, index, allParts) => {
        updateSegmentSummary?.({
          generation: summaryToken,
          status,
          segmentIndex: index,
          segmentTotal: allParts.length,
          segmentText: part,
          eventTitle: event.title,
        });
      },
    });
    await ingestMemoryAndRender?.({
      rawText: body,
      source: "system.proactive",
      weight: 0.62,
      role: profile.name || "system",
      wing: "Relationship",
      room: "Proactive",
      tags: en
        ? ["proactive", "calendar", event.title].filter(Boolean)
        : ["主动消息", "日程提醒", event.title].filter(Boolean),
      pinned: false,
      searchable: true,
      companionId: frozenCompanionId,
      characterId: frozenCompanionId,
    });
    await showCompanionNotification?.(body, shellTitle);
    return;
  }

  if (isNotificationOnlyMode(mode)) {
    await showCompanionNotification?.(body, shellTitle);
  }
}
