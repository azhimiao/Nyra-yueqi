/**
 * Cold-start intro: the Nyra wordmark written stroke by stroke.
 *
 * The animation owns only its own completion (`html.splash-done`). The boot
 * screen stays up until the app is also ready (`html.app-boot-ready` /
 * `html.immediate-phone-ready`), so a slow start holds on the finished
 * wordmark instead of flashing an empty shell.
 */

const CONFIG = {
  speed: 0.68, // <1 draws faster than the reference timing
  holdMs: 420, // dwell on the finished wordmark before handing over
  // The warm bloom and the brand line fade in over the last stroke, so they are
  // settled by the time the wordmark is finished rather than during the hold.
  bloomLeadMs: 420,
  samples: 72, // sample points per stroke
  reduceMotionHoldMs: 900,
  // Bootstrapping the app blocks the main thread in bursts. A wall-clock
  // timeline would charge those stalls to the animation and jump straight to
  // the finished wordmark, so a starved frame may only advance this much.
  maxFrameStepMs: 48,
  // ...and however starved the thread is, the intro stops holding the shell
  // after this much real time once it starts writing.
  maxRealMs: 6000,
  // The app bundle waits until the wordmark is written, but other work on the
  // same thread can still stall a stroke. The pen waits for a quiet window
  // before the first mark; a starved timeline would only delay the same stall.
  warmupQuietMs: 160,
  warmupFrameMs: 36,
  maxWarmupMs: 2800,
};

/**
 * Centre line plus a width curve per stroke. Widths are CSS px and are
 * converted to user units at paint time, so a phone and a desktop get the same
 * apparent nib weight.
 */
const STROKES = [
  // N
  { d: "M74 70 C79 63 87 59 96 60", w0: 0.8, wm: 2.0, mp: 0.5, w1: 1.4, delay: 0.05, dur: 0.14 },
  { d: "M96 60 C94 96 91 136 88 176", w0: 2.2, wm: 3.2, mp: 0.45, w1: 2.0, delay: 0.15, dur: 0.3 },
  { d: "M97 64 C118 94 142 128 166 158 C173 167 180 173 186 176", w0: 2.6, wm: 4.8, mp: 0.5, w1: 2.2, delay: 0.42, dur: 0.4 },
  { d: "M186 176 C189 140 192 100 195 62", w0: 2.2, wm: 3.0, mp: 0.4, w1: 1.1, delay: 0.78, dur: 0.3 },
  // y
  { d: "M226 108 C235 131 246 153 260 176", w0: 1.9, wm: 3.4, mp: 0.55, w1: 2.8, delay: 1.02, dur: 0.26 },
  {
    d: "M302 106 C293 130 281 154 264 178 C257 198 246 214 230 224 C220 230 210 229 204 223",
    w0: 2.0, wm: 3.4, mp: 0.3, w1: 0.35, delay: 1.24, dur: 0.46,
  },
  // r
  { d: "M336 106 C334 130 332 152 331 176", w0: 2.1, wm: 3.3, mp: 0.5, w1: 2.4, delay: 1.62, dur: 0.24 },
  {
    d: "M337 122 C345 111 356 104 368 105 C378 106 385 111 390 119",
    w0: 2.6, wm: 2.8, mp: 0.35, w1: 0.9, delay: 1.8, dur: 0.24,
  },
  // a
  {
    d: "M470 116 C462 106 446 105 436 116 C424 129 424 154 437 165 C449 175 466 171 472 158",
    w0: 1.5, wm: 3.2, mp: 0.5, w1: 2.2, delay: 2.0, dur: 0.34,
  },
  {
    d: "M472 108 C471 132 470 154 472 172 C478 186 492 190 508 184 C528 176 552 158 576 134 C594 116 610 102 624 92",
    w0: 2.2, wm: 3.3, mp: 0.2, w1: 0.3, delay: 2.28, dur: 0.52,
  },
];

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWBOX_W = 700;

/**
 * QA scripts drive the product through a real browser and click as soon as the
 * shell is ready; a blocking intro would stall every one of them.
 */
function shouldSkip() {
  let forced = "";
  try {
    forced = new URLSearchParams(window.location.search).get("splash") || "";
  } catch {
    forced = "";
  }
  if (forced === "1") return false;
  if (forced === "0") return true;
  try {
    if (window.localStorage.getItem("yueqi.splash") === "0") return true;
  } catch {
    /* private mode */
  }
  return navigator.webdriver === true;
}

function markDone(scene) {
  scene.dataset.splashState = "done";
  document.documentElement.classList.add("splash-done");
  document.dispatchEvent(new CustomEvent("yueqi:splash-done"));
}

function ease(x) {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

function easeStroke(x) {
  return 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, x))) / 2;
}

export function startBootSplash() {
  const scene = document.querySelector("[data-boot-screen]");
  if (!scene || scene.dataset.splashState) return;
  const svg = scene.querySelector("[data-boot-wordmark]");
  const inkGroup = scene.querySelector("[data-boot-ink]");
  const bloomGroup = scene.querySelector("[data-boot-bloom]");
  const srcGroup = scene.querySelector("[data-boot-src]");
  if (!svg || !inkGroup || !bloomGroup || !srcGroup) {
    markDone(scene);
    return;
  }
  if (shouldSkip()) {
    markDone(scene);
    return;
  }

  scene.dataset.splashState = "drawing";
  scene.dataset.splashPhase = "warmup";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const strokes = STROKES.map((spec) => {
    const src = document.createElementNS(SVG_NS, "path");
    src.setAttribute("d", spec.d);
    srcGroup.appendChild(src);
    const ink = document.createElementNS(SVG_NS, "path");
    inkGroup.appendChild(ink);
    const bloom = document.createElementNS(SVG_NS, "path");
    bloomGroup.appendChild(bloom);
    return {
      spec,
      src,
      ink,
      bloom,
      start: spec.delay * CONFIG.speed * 1000,
      duration: spec.dur * CONFIG.speed * 1000,
      points: [],
      settled: false,
    };
  });

  const drawEnd = Math.max(...strokes.map((stroke) => stroke.start + stroke.duration));

  function sample(stroke) {
    const total = stroke.src.getTotalLength();
    const step = Math.max(0.35, total * 0.002);
    const points = [];
    for (let i = 0; i <= CONFIG.samples; i++) {
      const t = i / CONFIG.samples;
      const at = t * total;
      const here = stroke.src.getPointAtLength(at);
      const back = stroke.src.getPointAtLength(Math.max(0, at - step));
      const ahead = stroke.src.getPointAtLength(Math.min(total, at + step));
      let tx = ahead.x - back.x;
      let ty = ahead.y - back.y;
      const mag = Math.hypot(tx, ty) || 1;
      tx /= mag;
      ty /= mag;
      points.push({ x: here.x, y: here.y, tx, ty, nx: -ty, ny: tx, t });
    }
    stroke.points = points;
  }

  let unitsPerPixel = 1;
  function measureScale() {
    const rendered = svg.getBoundingClientRect().width;
    unitsPerPixel = rendered > 0 ? VIEWBOX_W / rendered : 1;
  }

  function widthAt(spec, t) {
    const { w0, wm, mp, w1 } = spec;
    const px = t <= mp
      ? w0 + (wm - w0) * ease(t / (mp || 1e-6))
      : wm + (w1 - wm) * ease((t - mp) / (1 - mp || 1e-6));
    return px * unitsPerPixel;
  }

  function capPoints(point, radius, forward) {
    const out = [];
    const steps = 7;
    for (let k = 1; k <= steps; k++) {
      const phase = (Math.PI * k) / steps;
      const c = Math.cos(phase);
      const s = Math.sin(phase);
      const dx = forward ? point.nx * c + point.tx * s : -point.nx * c - point.tx * s;
      const dy = forward ? point.ny * c + point.ty * s : -point.ny * c - point.ty * s;
      out.push([point.x + dx * radius, point.y + dy * radius]);
    }
    return out;
  }

  function ribbon(stroke, progress) {
    if (progress <= 0) return "";
    const points = stroke.points;
    const last = points.length - 1;
    const cursor = progress * last;
    const index = Math.floor(cursor);
    const frac = cursor - index;

    const active = points.slice(0, index + 1);
    if (frac > 0.001 && index < last) {
      const a = points[index];
      const b = points[index + 1];
      let tx = a.tx + (b.tx - a.tx) * frac;
      let ty = a.ty + (b.ty - a.ty) * frac;
      const mag = Math.hypot(tx, ty) || 1;
      tx /= mag;
      ty /= mag;
      active.push({
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
        tx,
        ty,
        nx: -ty,
        ny: tx,
        t: a.t + (b.t - a.t) * frac,
      });
    }
    if (active.length < 2) return "";

    const radii = active.map((point) => widthAt(stroke.spec, point.t) / 2);
    const parts = [];
    active.forEach((point, i) => {
      const x = point.x + point.nx * radii[i];
      const y = point.y + point.ny * radii[i];
      parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    });
    const tip = active[active.length - 1];
    for (const [x, y] of capPoints(tip, radii[radii.length - 1], true)) {
      parts.push(`L${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    for (let i = active.length - 2; i >= 0; i--) {
      const point = active[i];
      const x = point.x - point.nx * radii[i];
      const y = point.y - point.ny * radii[i];
      parts.push(`L${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    for (const [x, y] of capPoints(active[0], radii[0], false)) {
      parts.push(`L${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return `${parts.join("")}Z`;
  }

  function paint(stroke, progress) {
    const d = ribbon(stroke, progress);
    stroke.ink.setAttribute("d", d);
    stroke.bloom.setAttribute("d", d);
  }

  function render(time) {
    if (time >= Math.max(0, drawEnd - CONFIG.bloomLeadMs)) scene.classList.add("is-ready");
    let allDone = true;
    for (const stroke of strokes) {
      const progress = stroke.duration > 0
        ? easeStroke((time - stroke.start) / stroke.duration)
        : (time >= stroke.start ? 1 : 0);
      if (progress >= 1) {
        if (!stroke.settled) {
          paint(stroke, 1);
          stroke.settled = true;
        }
      } else {
        allDone = false;
        paint(stroke, progress);
      }
    }
    if (allDone && scene.dataset.splashState === "drawing") scene.dataset.splashState = "ready";
    return allDone;
  }

  // The timeline advances per painted frame, not per wall-clock millisecond, so
  // a stalled or backgrounded main thread pauses the stroke instead of eating
  // it. `maxRealMs` keeps a pathological start from holding the shell forever.
  let animTime = 0;
  let lastFrame = 0;
  let warmupStartedAt = 0;
  let drawStartedAt = 0;
  let quietSince = 0;
  let raf = 0;
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    scene.removeEventListener("pointerdown", finish);
    window.removeEventListener("keydown", onKey);
    for (const stroke of strokes) {
      if (!stroke.points.length) sample(stroke);
    }
    animTime = drawEnd;
    scene.dataset.splashPhase = "writing";
    render(drawEnd);
    scene.classList.add("is-ready");
    markDone(scene);
  }

  function onKey(event) {
    if (event.key === "Enter" || event.key === " " || event.key === "Escape") finish();
  }

  function frame() {
    const now = performance.now();
    const delta = lastFrame ? now - lastFrame : 0;
    lastFrame = now;
    if (!drawStartedAt) {
      if (!warmupStartedAt) {
        warmupStartedAt = now;
        quietSince = now;
      }
      if (delta > CONFIG.warmupFrameMs) quietSince = now;
      const quietEnough = now - quietSince >= CONFIG.warmupQuietMs;
      const waitedLongEnough = now - warmupStartedAt >= CONFIG.maxWarmupMs;
      if (!quietEnough && !waitedLongEnough) {
        raf = requestAnimationFrame(frame);
        return;
      }
      drawStartedAt = now;
      scene.dataset.splashPhase = "writing";
    }
    animTime += Math.min(delta, CONFIG.maxFrameStepMs);
    const done = render(animTime);
    if ((done && animTime > drawEnd + CONFIG.holdMs) || now - drawStartedAt > CONFIG.maxRealMs) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  measureScale();

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      measureScale();
      for (const stroke of strokes) stroke.settled = false;
      render(animTime);
    }, 140);
  });

  scene.addEventListener("pointerdown", finish);
  window.addEventListener("keydown", onKey);

  if (reduceMotion) {
    for (const stroke of strokes) sample(stroke);
    animTime = drawEnd;
    scene.dataset.splashPhase = "writing";
    render(drawEnd);
    window.setTimeout(finish, CONFIG.reduceMotionHoldMs);
    return;
  }

  let sampleIndex = 0;
  function prepare() {
    const deadline = performance.now() + 8;
    while (sampleIndex < strokes.length && performance.now() < deadline) {
      sample(strokes[sampleIndex]);
      sampleIndex += 1;
    }
    if (sampleIndex < strokes.length) {
      raf = requestAnimationFrame(prepare);
      return;
    }
    lastFrame = performance.now();
    render(0);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(prepare);
}
