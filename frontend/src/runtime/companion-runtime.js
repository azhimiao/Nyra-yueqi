import { resolvePetAction, resolveIdleAction, PET_IDLE_POSE_ID } from "../avatar/pet-action-protocol.js";
import { derivePetPresenceFromLifeState } from "../companion/pet-presence-bridge.js";
import { t } from "../i18n/index.js";
import { formatSleepDisplay, labelLifeMood, labelMood } from "../status/labels.js";

function defaultRuntimeState() {
  return {
    characterName: t("nav.companion"),
    lookId: "",
    lookName: "",
    lookMediaId: "",
    lookUrl: "",
    display: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      flipX: false,
      anchor: "center",
      floatSize: 64,
    },
    playState: "idle",
    actionId: PET_IDLE_POSE_ID,
    emotion: "neutral",
    expression: "",
    panel: "chat",
    mood: labelMood("平静"),
    weatherLabel: t("status.sleep.weatherPending"),
    asleep: false,
    sleepLabel: t("status.sleep.awake"),
    bpm: "",
    statusText: t("status.sleep.waiting"),
    lifeContext: "生活 · —",
    capabilityText: "能力待检查",
    capabilityKind: "idle",
    unreadCount: 0,
    lastIntent: "随时可以开始聊天",
    lastMessageAt: 0,
    lastUserActivityAt: 0,
    lastProactiveAt: 0,
    lastMessageText: "",
    companionMood: "calm",
    presenceLabel: labelLifeMood("calm"),
    updatedAt: "",
  };
}

const DEFAULT_STATE = defaultRuntimeState();

const ACTIVE_PLAY_STATES = new Set([
  "talking",
  "thinking",
  "listening",
  "capturing",
  "reacting",
]);

function formatSleepLabel(status = {}) {
  return formatSleepDisplay(status);
}

function compactStatusLine(state) {
  const parts = [
    state.mood,
    state.weatherLabel,
    state.sleepLabel,
    state.bpm,
  ].filter(Boolean);
  return parts.join(" · ") || t("status.sleep.waiting");
}

export function createCompanionRuntime(deps = {}) {
  const defaults = defaultRuntimeState();
  let state = {
    ...defaults,
    display: { ...defaults.display },
    updatedAt: new Date().toISOString(),
  };
  const subscribers = new Set();
  let playbackGeneration = 0;

  function snapshot() {
    return {
      ...state,
      display: { ...state.display },
      statusText: compactStatusLine(state),
    };
  }

  function emit(reason = "update") {
    const current = snapshot();
    subscribers.forEach((listener) => listener(current, reason));
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("yueqi:runtime", {
        detail: { state: current, reason },
      }));
    }
  }

  function samePresence(a = {}, b = {}) {
    if (a === b) return true;
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const key of keys) {
      if (key === "updatedAt") continue;
      if (key === "display") {
        if (!samePresence(a.display || {}, b.display || {})) return false;
        continue;
      }
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  function syncLifePresence(reason = "life-sync") {
    const characterId = String(deps.getCompanionCharacterId?.() || "").trim();
    if (!characterId) return snapshot();
    const presence = derivePetPresenceFromLifeState(characterId, state);
    const runtimeActive = ACTIVE_PLAY_STATES.has(String(state.playState || "").toLowerCase());
    const patch = {
      companionMood: presence.currentMood,
      presenceLabel: presence.presenceLabel,
      todayLine: presence.todayLine || "",
      openLoop: presence.openLoop || null,
      continuityFingerprint: presence.continuityFingerprint || null,
    };
    if (!runtimeActive) {
      patch.emotion = presence.emotion;
      patch.asleep = presence.asleep;
      patch.playState = presence.playState;
      patch.actionId = presence.actionId;
    }
    return update(patch, reason);
  }

  function update(patch = {}, reason = "update") {
    const next = {
      ...state,
      ...patch,
      display: patch.display ? { ...state.display, ...patch.display } : state.display,
    };
    if (samePresence(state, next)) {
      return snapshot();
    }
    state = {
      ...next,
      updatedAt: new Date().toISOString(),
    };
    emit(reason);
    return snapshot();
  }

  function refreshCharacter(reason = "character") {
    const companionId = deps.getCompanionCharacterId?.();
    const character = (companionId
      ? deps.collectCharacterProfile?.(companionId)
      : deps.collectCharacterProfile?.()) || {};
    return update({
      characterName: character.name || t("nav.companion"),
    }, reason);
  }

  async function refreshLook(reason = "look", lookPatch = null) {
    const look = lookPatch || deps.getAvatarLook?.() || {};
    const mediaId = look.mediaId || look.lookMediaId || "";
    let lookUrl = "";
    if (mediaId) {
      if (mediaId === state.lookMediaId && state.lookUrl) {
        lookUrl = state.lookUrl;
      } else {
        lookUrl = (await deps.resolveAvatarLookUrl?.()) || "";
      }
    }
    return update({
      lookId: look.lookId || "",
      lookName: look.lookName || "",
      lookMediaId: mediaId,
      lookUrl,
      display: look.display || state.display,
      playState: look.playState || state.playState,
      actionId: look.actionId || state.actionId,
    }, reason);
  }

  function updateDailyStatus(status = null, reason = "daily-status") {
    if (!status) return snapshot();
    return update({
      mood: status.mood || labelMood("平静"),
      weatherLabel: status.weather?.label || t("status.sleep.weatherPending"),
      asleep: Boolean(status.asleep),
      sleepLabel: formatSleepLabel(status),
      bpm: status.bpm ? `${status.bpm}bpm` : "",
      location: status.location || "",
      yesterdayTone: status.yesterdayTone || "",
    }, reason);
  }

  async function refreshDailyStatus(force = false, reason = "daily-refresh") {
    const status = await deps.refreshDailyStatus?.(force);
    updateDailyStatus(status, reason);
    return status;
  }

  function updateLifeContext(text = "", reason = "life-context") {
    if (!text) return snapshot();
    return update({ lifeContext: text }, reason);
  }

  function updateCapability(payload = {}, reason = "capability") {
    return update({
      capabilityText: payload.text || state.capabilityText,
      capabilityKind: payload.kind || state.capabilityKind,
      capabilityScore: payload.score,
    }, reason);
  }

  function setPanel(panel = "chat") {
    update({
      panel,
      unreadCount: panel === "chat" ? 0 : state.unreadCount,
      lastIntent: panel === "chat" ? "点开就能陪你" : state.lastIntent,
    }, "panel");
  }

  function markUserActivity() {
    update({
      unreadCount: 0,
      lastUserActivityAt: Date.now(),
      lastIntent: "正在回应你",
    }, "user-activity");
  }

  function recordMessage({
    role = "ai",
    text = "",
    source = "chat",
    actionId = "",
    emotion = "",
    expression = "",
  } = {}) {
    const now = Date.now();
    const generation = ++playbackGeneration;
    const isUser = role === "user";
    const isProactive = source === "system.proactive" || source === "proactive";
    const mapped = isUser
      ? resolvePetAction({ actionId: "thinking", source: "chat" })
      : resolvePetAction({
          actionId: String(actionId || "").trim() || "talk_loop",
          emotion,
          expressionId: expression,
          source: isProactive ? "proactive" : "chat",
        });
    const nextActionId = mapped.actionId;
    const nextPlayState = isUser
      ? "thinking"
      : (mapped.isIdle ? "talking" : mapped.loop && nextActionId.includes("talk") ? "talking" : "reacting");
    const patch = {
      lastMessageAt: now,
      lastIntent: isUser
        ? "正在整理你的这句话"
        : (isProactive ? "主动发来了消息" : "刚刚回复过你"),
      playState: nextPlayState,
      actionId: nextActionId === "idle_loop" ? PET_IDLE_POSE_ID : nextActionId,
      emotion: isUser ? state.emotion : (mapped.emotion || "neutral"),
      expression: isUser ? state.expression : String(mapped.expressionId || expression || "").trim(),
    };
    if (isUser) {
      patch.unreadCount = 0;
      patch.lastUserActivityAt = now;
    } else if (isProactive && state.panel !== "chat") {
      patch.unreadCount = state.unreadCount + 1;
      patch.lastProactiveAt = now;
      patch.lastProactiveText = String(text || "").slice(0, 80);
      patch.lastMessageText = String(text || "").slice(0, 160);
    } else if (!isUser) {
      patch.lastMessageText = String(text || "").slice(0, 160);
    }
    const result = update(patch, isUser ? "user-message" : source);
    if (!isUser) {
      deps.onAiSpeaking?.({
        actionId: patch.actionId,
        emotion: patch.emotion,
        expression: patch.expression,
      });
      window.setTimeout(() => {
        if (generation !== playbackGeneration) return;
        const idle = resolveIdleAction({ source: "system" });
        update({
          playState: "idle",
          actionId: PET_IDLE_POSE_ID,
          expression: idle.expressionId || "",
        }, "talking-done");
        syncLifePresence("talking-done");
        deps.onAiIdle?.();
      }, 1800);
    }
    return result;
  }

  function recordProactivePart({
    text = "",
    eventTitle = "",
    segmentIndex = 0,
    segmentTotal = 1,
    status = null,
  } = {}) {
    if (status) updateDailyStatus(status, "proactive-status");
    const firstPart = Number(segmentIndex) === 0;
    return update({
      unreadCount: state.panel === "chat" ? 0 : state.unreadCount + (firstPart ? 1 : 0),
      lastIntent: eventTitle ? `主动消息 · ${eventTitle}` : "主动消息",
      lastProactiveAt: Date.now(),
      lastProactiveText: String(text || "").slice(0, 80),
      proactiveSegment: `${Number(segmentIndex) + 1}/${Number(segmentTotal) || 1}`,
      playState: "talking",
      actionId: "talking_default",
    }, "proactive-part");
  }

  function subscribe(listener) {
    subscribers.add(listener);
    listener(snapshot(), "init");
    return () => subscribers.delete(listener);
  }

  refreshCharacter("init-character");
  syncLifePresence("init-life");

  if (typeof document !== "undefined") {
    document.addEventListener("yueqi:companion-life", () => {
      syncLifePresence("companion-life");
    });
  }

  return {
    getState: snapshot,
    subscribe,
    update,
    refreshCharacter,
    refreshLook,
    updateDailyStatus,
    refreshDailyStatus,
    updateLifeContext,
    updateCapability,
    setPanel,
    markUserActivity,
    recordMessage,
    recordProactivePart,
    syncLifePresence,
  };
}
