/**
 * Frame index helpers used by pet-v2 renderer (kept pure for tests).
 */
export function loopFrameIndex(elapsedSec, frameCount, fps = 8) {
  const n = Math.max(1, frameCount | 0);
  const f = Math.max(1, fps);
  return Math.floor(elapsedSec * f) % n;
}

export function onceFrameIndex(elapsedSec, frameCount, fps = 8) {
  const n = Math.max(1, frameCount | 0);
  const f = Math.max(1, fps);
  return Math.min(n - 1, Math.floor(elapsedSec * f));
}

export function onceFinished(elapsedSec, frameCount, fps = 8) {
  const n = Math.max(1, frameCount | 0);
  const f = Math.max(1, fps);
  return elapsedSec >= n / f;
}
