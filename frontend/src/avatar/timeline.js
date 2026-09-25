/** Action timeline helpers for Editor B (enter / loop / exit + keyframes). */

export function createEmptyTimeline() {
  return {
    enter: { durationMs: 280, mediaId: "", fileName: "", expressionId: "" },
    loop: { durationMs: 0, mediaId: "", fileName: "", expressionId: "" },
    exit: { durationMs: 220, mediaId: "", fileName: "", expressionId: "" },
    keyframes: [],
    soundMediaId: "",
    soundFileName: "",
  };
}

export function normalizeTimeline(raw = null) {
  if (!raw || typeof raw !== "object") return createEmptyTimeline();
  const seg = (value = {}) => ({
    durationMs: Math.max(0, Number(value.durationMs) || 0),
    mediaId: String(value.mediaId || "").trim(),
    fileName: String(value.fileName || "").trim(),
    expressionId: String(value.expressionId || "").trim(),
  });
  const keyframes = Array.isArray(raw.keyframes)
    ? raw.keyframes
      .map((item) => ({
        atMs: Math.max(0, Number(item?.atMs) || 0),
        expressionId: String(item?.expressionId || "").trim(),
      }))
      .filter((item) => item.expressionId)
    : [];
  return {
    enter: seg(raw.enter),
    loop: seg(raw.loop),
    exit: seg(raw.exit),
    keyframes,
    soundMediaId: String(raw.soundMediaId || "").trim(),
    soundFileName: String(raw.soundFileName || "").trim(),
  };
}

/**
 * Flatten timeline into play queue for ActionPlayer.
 * Default empty enter/exit (no segment media / keyframes / sfx) → empty queue
 * so the player uses the simple action.mediaId path without fake lag.
 */
export function timelineToPlayQueue(action) {
  const timeline = normalizeTimeline(action?.timeline);
  const fallbackMedia = action?.mediaId || "";
  const hasSegmentMedia = ["enter", "loop", "exit"].some((stage) => Boolean(timeline[stage]?.mediaId));
  const hasKeyframes = (timeline.keyframes || []).length > 0;
  const hasSound = Boolean(timeline.soundMediaId);

  if (!hasSegmentMedia && !hasKeyframes && !hasSound) {
    return { queue: [], keyframes: [], soundMediaId: "" };
  }

  const stages = ["enter", "loop", "exit"];
  const queue = [];
  for (const stage of stages) {
    const seg = timeline[stage];
    const mediaId = seg.mediaId || (stage === "loop" ? fallbackMedia : "");
    const durationMs = seg.durationMs
      || (stage === "loop" ? (action.loop ? 1200 : (action.durationMs || 800)) : 0);
    if (!mediaId && !durationMs && stage !== "loop") continue;
    queue.push({
      stage,
      mediaId: mediaId || fallbackMedia,
      durationMs: durationMs || (stage === "loop" ? 800 : 200),
      expressionId: seg.expressionId || "",
      loop: stage === "loop" && Boolean(action.loop),
    });
  }
  if (!queue.length && fallbackMedia) {
    queue.push({
      stage: "loop",
      mediaId: fallbackMedia,
      durationMs: action.durationMs || 1000,
      expressionId: "",
      loop: Boolean(action.loop),
    });
  }
  return { queue, keyframes: timeline.keyframes, soundMediaId: timeline.soundMediaId };
}
