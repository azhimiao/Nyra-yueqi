import { mountSpriteCharacter } from "./sprite-character.js";
import { XINGLI_MANIFEST_URL, resolveXingliClip } from "./xingli-action-map.js";
import { createIdleCarousel } from "./idle-carousel.js";

/**
 * Runtime-state adapter for Xingli's atlas player. It mirrors the small API
 * used by the previous procedural character so existing surfaces can migrate
 * without owning animation timing.
 */
export function mountXingliCharacter(root, options = {}) {
  const state = {
    playState: normalizePlayState(options.state),
    actionId: options.actionId || "idle_default",
    emotion: options.emotion || "neutral",
    asleep: Boolean(options.asleep),
  };
  let signature = "";
  let destroyed = false;

  const player = mountSpriteCharacter(root, {
    manifestUrl: options.manifestUrl || XINGLI_MANIFEST_URL,
    size: options.size || "100%",
    autoPlay: false,
    initialClip: options.initialClip || "idle_loop",
    crossfadeMs: options.crossfadeMs ?? 72,
    reducedMotion: options.reducedMotion,
    matteColor: options.matteColor,
    label: options.ariaLabel || "动态桌宠",
    onReady: options.onReady,
    onClipChange: options.onClipChange,
    onFrame: options.onFrame,
    onComplete: options.onComplete,
    onError: options.onError,
  });

  const carousel = createIdleCarousel(player, {
    enabled: () => !destroyed
      && options.autoIdleMotion !== false
      && state.playState === "idle"
      && !state.asleep,
  });

  function stopAmbient() {
    carousel.stop();
  }

  function scheduleAmbient(delayMs = 720) {
    if (destroyed || options.autoIdleMotion === false || state.playState !== "idle" || state.asleep) {
      stopAmbient();
      return;
    }
    const offset = Math.max(0, Number(options.idleCarouselOffsetMs) || 0);
    carousel.start(delayMs + offset);
  }

  async function sync({ force = false, source = "reply" } = {}) {
    if (destroyed) return player.getState();
    const nextSignature = [state.playState, state.actionId, state.emotion, state.asleep, source].join("|");
    if (!force && signature === nextSignature) return player.getState();
    signature = nextSignature;
    const resolved = resolveXingliClip({ ...state, source });
    const persistent = ["thinking", "capturing", "listening"].includes(state.playState)
      && ["thinking", "listen"].includes(resolved.clipId);
    stopAmbient();
    const result = await player.play(resolved.clipId, {
      playback: persistent ? "loop" : resolved.playback,
      returnClip: persistent ? false : (resolved.returnClip || false),
      reason: source,
      force,
    });
    if (state.playState === "idle" && !state.asleep) scheduleAmbient(720);
    return result;
  }

  function setRuntimeState(patch = {}, settings = {}) {
    if (patch.playState != null) state.playState = normalizePlayState(patch.playState);
    if (patch.actionId != null) state.actionId = String(patch.actionId || "idle_default");
    if (patch.emotion != null) state.emotion = String(patch.emotion || "neutral");
    if (patch.asleep != null) state.asleep = Boolean(patch.asleep);
    return sync(settings);
  }

  function setState(nextState = "idle", settings = {}) {
    const raw = String(nextState || "idle");
    const directAction = ["greet", "selfie", "comfort", "lean_close", "shy_look_away", "react_tap", "sleep_loop"].includes(raw);
    state.playState = directAction ? "reacting" : normalizePlayState(raw);
    state.actionId = directAction ? raw : actionForPlayState(state.playState);
    return sync({ force: Boolean(settings.force), source: "reply" });
  }

  function setEmotion(emotion = "neutral") {
    state.emotion = String(emotion || "neutral");
    return sync();
  }

  function setSpeaking(speaking) {
    if (speaking) {
      state.playState = "talking";
      state.actionId = "talking_default";
    } else if (state.playState === "talking") {
      state.playState = "idle";
      state.actionId = "idle_default";
    }
    return sync();
  }

  function destroy() {
    destroyed = true;
    stopAmbient();
    carousel.destroy();
    player.destroy();
  }

  player.ready.then(() => sync({ force: true })).catch(() => {});

  return {
    element: player.element,
    canvas: player.canvas,
    ready: player.ready,
    setRuntimeState,
    setState,
    setEmotion,
    setSpeaking,
    setLookDirection() {},
    playAction(actionId, settings = {}) {
      state.actionId = String(actionId || "idle_default");
      state.playState = state.actionId === "idle_default" ? "idle" : "reacting";
      return sync({ force: true, source: settings.source || "manual" });
    },
    getState: player.getState,
    getClips: player.getClips,
    getClipMeta: player.getClipMeta,
    destroy,
  };
}

function normalizePlayState(value) {
  const state = String(value || "idle").trim().toLowerCase();
  if (["talking", "thinking", "listening", "reacting", "capturing", "idle"].includes(state)) return state;
  if (state === "sleep") return "idle";
  return "idle";
}

function actionForPlayState(playState) {
  if (playState === "talking") return "talking_default";
  if (playState === "thinking") return "thinking";
  if (playState === "listening") return "listen";
  if (playState === "reacting") return "react_tap";
  return "idle_default";
}
