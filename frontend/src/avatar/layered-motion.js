/**
 * Pure motion math for layered 2D (testable without DOM).
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function breatheOffset(nowMs, { amplitude = 0.018, periodMs = 3200 } = {}) {
  const t = (nowMs % Math.max(200, periodMs)) / Math.max(200, periodMs);
  const wave = Math.sin(t * Math.PI * 2);
  return {
    scaleY: 1 + wave * amplitude,
    y: wave * amplitude * 18,
  };
}

export function swayRotation(nowMs, { amplitudeDeg = 1.4, periodMs = 4200 } = {}) {
  const t = (nowMs % Math.max(200, periodMs)) / Math.max(200, periodMs);
  return Math.sin(t * Math.PI * 2) * amplitudeDeg;
}

/**
 * Blink state machine: returns eye scaleY (1 open, closedScaleY closed).
 */
export function createBlinkController({
  intervalMs = [2600, 5400],
  durationMs = 120,
  closedScaleY = 0.12,
} = {}) {
  let nextBlinkAt = 0;
  let closingUntil = 0;
  let openingUntil = 0;

  function schedule(nowMs) {
    const lo = Array.isArray(intervalMs) ? Number(intervalMs[0]) || 2600 : 2600;
    const hi = Array.isArray(intervalMs) ? Number(intervalMs[1]) || lo : lo;
    const span = Math.max(0, hi - lo);
    nextBlinkAt = nowMs + lo + Math.random() * span;
  }

  schedule(0);

  return {
    sample(nowMs) {
      if (!nextBlinkAt) schedule(nowMs);
      if (nowMs >= nextBlinkAt && !closingUntil && !openingUntil) {
        closingUntil = nowMs + durationMs / 2;
        openingUntil = nowMs + durationMs;
        schedule(nowMs + durationMs);
      }
      if (closingUntil && nowMs < closingUntil) {
        const p = (nowMs - (closingUntil - durationMs / 2)) / (durationMs / 2);
        return 1 - (1 - closedScaleY) * clamp(p, 0, 1);
      }
      if (openingUntil && nowMs < openingUntil) {
        const p = (nowMs - closingUntil) / (durationMs / 2);
        return closedScaleY + (1 - closedScaleY) * clamp(p, 0, 1);
      }
      closingUntil = 0;
      openingUntil = 0;
      return 1;
    },
    reset(nowMs = 0) {
      closingUntil = 0;
      openingUntil = 0;
      schedule(nowMs);
    },
  };
}

/** Map analyser volume (0–1) to mouth open + coarse viseme key. */
export function volumeToLip(open01, lipSync = {}) {
  const minOpen = Number(lipSync.minOpen) || 0.04;
  const maxOpen = Number(lipSync.maxOpen) || 0.42;
  const open = clamp(Number(open01) || 0, 0, 1);
  const scaleY = minOpen + open * (maxOpen - minOpen) * 2.2;
  let viseme = "closed";
  if (open > 0.55) viseme = "A";
  else if (open > 0.32) viseme = "O";
  else if (open > 0.12) viseme = "E";
  const map = lipSync.visemeMap || {};
  const preset = map[viseme] || map.closed || {};
  return {
    open,
    viseme,
    scaleY: Number(preset.scaleY) > 0 ? Number(preset.scaleY) * (0.35 + open * 0.65) : clamp(scaleY, 0.2, 1.35),
  };
}

export function createParticleBurst(def = {}, origin = { x: 0, y: 0 }) {
  const count = Math.max(1, Math.min(40, Number(def.count) || 8));
  const durationMs = Math.max(200, Number(def.durationMs) || 900);
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 40 + Math.random() * 80;
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: durationMs,
      maxLife: durationMs,
      size: 2 + Math.random() * 3,
      color: def.color || "#f6e7c8",
    });
  }
  return particles;
}

export function stepParticles(particles, dtMs) {
  const next = [];
  for (const p of particles) {
    const life = p.life - dtMs;
    if (life <= 0) continue;
    next.push({
      ...p,
      x: p.x + (p.vx * dtMs) / 1000,
      y: p.y + (p.vy * dtMs) / 1000,
      vy: p.vy + (120 * dtMs) / 1000,
      life,
    });
  }
  return next;
}
