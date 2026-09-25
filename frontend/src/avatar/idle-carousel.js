/**
 * Standing idle pose carousel for sprite pets.
 * Placeholder stills count as poses — excluding them freezes the pet on idle_loop.
 */

export const PET_IDLE_CAROUSEL = Object.freeze([
  "idle_loop",
  "listen",
  "thinking",
  "greet",
  "shy_look_away",
  "react_tap",
  "comfort",
  "lean_close",
  "welcome_home",
  "selfie",
]);

const SKIP = new Set([
  "drag",
  "talk_loop",
  "sleep_loop",
  "sit_idle",
  "sit_to_sleep",
  "stand_to_sit",
]);

export function listIdleCarouselClips(player) {
  const clips = new Set((player?.getClips?.() || []).map((id) => String(id || "")));
  const meta = player?.getClipMeta?.() || {};
  return PET_IDLE_CAROUSEL.filter((id) => clips.has(id) && meta[id] && !SKIP.has(id));
}

export function clipDwellMs(player, clipId) {
  const meta = player?.getClipMeta?.()?.[clipId] || {};
  const frames = Math.max(1, Number(meta.frameCount) || 1);
  const fps = Math.max(1, Number(meta.fps) || 1);
  const hold = Number(meta.holdMs) || 0;
  const playMs = frames > 1 ? (frames / fps) * 1000 + hold : hold;
  return Math.max(1800, Math.min(3200, playMs || 2200));
}

/**
 * @param {{ play: Function, getClips?: Function, getClipMeta?: Function }} player
 * @param {{ enabled?: () => boolean }} [opts]
 */
export function createIdleCarousel(player, opts = {}) {
  let timer = 0;
  let index = -1;
  let lastId = "";
  let destroyed = false;
  let generation = 0;

  function stop() {
    if (timer) clearTimeout(timer);
    timer = 0;
    generation += 1;
  }

  function canRun() {
    if (destroyed) return false;
    if (typeof opts.enabled === "function" && opts.enabled() === false) return false;
    return Boolean(player?.play);
  }

  async function tick() {
    const token = generation;
    if (!canRun()) return;
    const pool = listIdleCarouselClips(player);
    if (pool.length < 1) {
      timer = setTimeout(() => {
        timer = 0;
        void tick();
      }, 480);
      return;
    }
    index = (index + 1) % pool.length;
    if (pool.length > 1 && pool[index] === lastId) {
      index = (index + 1) % pool.length;
    }
    const clipId = pool[index];
    lastId = clipId;
    const frames = Math.max(1, Number(player?.getClipMeta?.()?.[clipId]?.frameCount) || 1);
    try {
      await player.play(clipId, {
        playback: frames <= 1 ? "loop" : "once",
        returnClip: false,
        reason: "idle_carousel",
        force: true,
      });
    } catch {
      /* pack may omit a clip */
    }
    if (destroyed || token !== generation || !canRun()) return;
    const wait = clipDwellMs(player, clipId);
    timer = setTimeout(() => {
      timer = 0;
      void tick();
    }, wait);
  }

  function start(delayMs = 640) {
    stop();
    if (!canRun()) return;
    const token = generation;
    timer = setTimeout(() => {
      timer = 0;
      if (token !== generation) return;
      void tick();
    }, Math.max(0, Number(delayMs) || 0));
  }

  return {
    start,
    stop,
    destroy() {
      destroyed = true;
      stop();
    },
  };
}
