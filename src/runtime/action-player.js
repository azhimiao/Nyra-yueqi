import { findAction, resolveActionForState } from "../avatar/looks-model.js";
import { timelineToPlayQueue } from "../avatar/timeline.js";

/**
 * ActionPlayer with optional enter/loop/exit timeline (Editor B).
 * Uses a generation token so interrupted plays cannot schedule stale steps.
 */
export function createActionPlayer({
  getAvatarState,
  resolveMediaUrl,
  onChange,
} = {}) {
  let playState = "idle";
  let currentActionId = "idle_default";
  let mediaUrl = "";
  let expressionId = "";
  let stage = "loop";
  let timer = 0;
  let queueTimers = [];
  let playGen = 0;

  function clearTimers() {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    queueTimers.forEach((id) => window.clearTimeout(id));
    queueTimers = [];
  }

  function snapshot() {
    return {
      playState,
      actionId: currentActionId,
      mediaUrl,
      expressionId,
      stage,
    };
  }

  function emit(reason = "play") {
    onChange?.(snapshot(), reason);
    try {
      document.dispatchEvent(new CustomEvent("yueqi:avatar-action", {
        detail: { ...snapshot(), reason },
      }));
    } catch {
      /* non-DOM */
    }
  }

  async function resolveActionMedia(mediaId, actionId = "") {
    if (mediaId && resolveMediaUrl) {
      const url = await resolveMediaUrl(mediaId);
      if (url) return url;
    }
    if (actionId) {
      try {
        const { defaultPoseAssetUrl } = await import("../avatar/default-pose-assets.js");
        return defaultPoseAssetUrl(actionId) || "";
      } catch {
        return "";
      }
    }
    return "";
  }

  function scheduleKeyframes(keyframes, gen) {
    for (const kf of keyframes || []) {
      const at = Math.max(0, Number(kf.atMs) || 0);
      const handle = window.setTimeout(() => {
        if (gen !== playGen) return;
        if (kf.expressionId) {
          expressionId = kf.expressionId;
          emit("keyframe");
        }
      }, at);
      queueTimers.push(handle);
    }
  }

  async function playQueue(action, nextState, gen) {
    const { queue, keyframes } = timelineToPlayQueue(action);
    if (!queue.length) {
      if (gen !== playGen) return;
      mediaUrl = await resolveActionMedia(action.mediaId, action.id);
      if (gen !== playGen) return;
      expressionId = "";
      stage = "loop";
      emit("play");
      scheduleKeyframes(keyframes, gen);
      if (!action.loop && action.durationMs > 0) {
        timer = window.setTimeout(() => {
          if (gen === playGen) play("idle");
        }, action.durationMs);
      }
      return;
    }

    let index = 0;
    const runStep = async () => {
      if (gen !== playGen) return;
      const step = queue[index];
      if (!step) {
        if (nextState !== "idle" && gen === playGen) play("idle");
        return;
      }
      stage = step.stage;
      expressionId = step.expressionId || "";
      mediaUrl = await resolveActionMedia(step.mediaId, action.id);
      if (gen !== playGen) return;
      emit("timeline-step");
      if (step.stage === "loop") scheduleKeyframes(keyframes, gen);
      if (step.loop) return;
      const wait = Math.max(120, step.durationMs || 200);
      const handle = window.setTimeout(() => {
        if (gen !== playGen) return;
        index += 1;
        runStep();
      }, wait);
      queueTimers.push(handle);
    };
    await runStep();
  }

  async function play(nextState = "idle", { actionId = "", force = false } = {}) {
    const state = getAvatarState?.() || {};
    let action = actionId ? findAction(state, actionId) : null;
    if (!action) action = resolveActionForState(state, nextState);
    if (!action && actionId) {
      action = resolveActionForState(state, nextState === "reacting" ? "idle" : nextState);
    }
    if (!action) {
      playState = "idle";
      currentActionId = "";
      mediaUrl = "";
      expressionId = "";
      stage = "loop";
      emit("empty");
      return snapshot();
    }

    if (!force && playState !== "idle" && currentActionId) {
      const current = findAction(state, currentActionId);
      if (current && current.interruptible === false) {
        const incomingPriority = Number(action.priority) || 0;
        const currentPriority = Number(current.priority) || 0;
        if (incomingPriority <= currentPriority && action.id !== current.id) {
          return snapshot();
        }
      }
    }

    const gen = ++playGen;
    clearTimers();
    playState = nextState;
    currentActionId = action.id;
    await playQueue(action, nextState, gen);
    return snapshot();
  }

  function stop() {
    playGen += 1;
    clearTimers();
    return play("idle", { force: true });
  }

  return {
    getState: snapshot,
    play,
    stop,
    talking: () => play("talking"),
    react: (actionId = "") => play("reacting", { actionId }),
    comfort: () => play("reacting", { actionId: "comfort", force: true }),
    idle: () => play("idle", { force: true }),
    playAction: (actionId) => play("reacting", { actionId }),
  };
}
