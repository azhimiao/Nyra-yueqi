import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { importXingliPack } from "./import-xingli-pack.mjs";

const root = path.resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "xingli-sprite-verify-"));
const sourceDir = path.join(tempRoot, "source");
const outputA = path.join(tempRoot, "output-a");
const outputB = path.join(tempRoot, "output-b");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

function createFrame(seed) {
  const png = new PNG({ width: 1536, height: 1536, colorType: 6 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = ((y * png.width) + x) * 4;
      png.data[index] = 238;
      png.data[index + 1] = 238;
      png.data[index + 2] = 236;
      png.data[index + 3] = (Math.floor(x / 64) + Math.floor(y / 64)) % 2 === 0 ? 255 : 0;
    }
  }
  const left = 540 + seed * 4;
  const top = 180 + seed * 3;
  const right = 990 + seed * 2;
  const bottom = 1470;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = ((y * png.width) + x) * 4;
      png.data[index] = 125 + seed;
      png.data[index + 1] = 75 + (seed * 2);
      png.data[index + 2] = 105 + (seed * 3);
      // Keep the checker alpha over the subject to verify RGB-based recovery.
    }
  }
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6, deflateLevel: 9 });
}

async function prepareSource() {
  const clips = {
    idle_loop: ["idle_000.png", "idle_001.png", "idle_002.png"],
    greet: ["greet_000.png", "greet_001.png", "greet_002.png"],
    comfort: ["comfort_000.png"],
  };
  let seed = 0;
  for (const [clipId, frames] of Object.entries(clips)) {
    const folder = path.join(sourceDir, "clips", clipId);
    await mkdir(folder, { recursive: true });
    for (const frame of frames) {
      await writeFile(path.join(folder, frame), createFrame(seed));
      seed += 1;
    }
  }
  const manifest = {
    character: "星梨",
    version: "verify",
    specs: { canvas_size: "1536x1536", transparent: true, fps_target: "10-12fps" },
    animations: Object.fromEntries(Object.entries(clips).map(([id, frames]) => [id, {
      frame_count: frames.length,
      frames,
      ...(id === "comfort" ? { hold_ms: 250 } : {}),
    }])),
  };
  await writeFile(path.join(sourceDir, "asset_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function listFiles(folder, prefix = "") {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(folder, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

async function digestTree(folder) {
  const hash = createHash("sha256");
  const files = await listFiles(folder);
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(path.join(folder, ...file.split("/"))));
  }
  return { files, hash: hash.digest("hex") };
}

function installDomMock(assetRoot) {
  let nextRaf = 1;
  let now = 0;
  const rafCallbacks = new Map();
  const timeoutCallbacks = new Map();
  let nextTimeout = 1;
  const drawCalls = [];

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.dataset = {};
      this.attributes = new Map();
      this.className = "";
      this.removed = false;
      this.style = {
        setProperty: (name, value) => { this.style[name] = value; },
      };
    }
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    dispatchEvent() { return true; }
    remove() { this.removed = true; }
    getContext() {
      return {
        clearRect() {},
        save() {},
        restore() {},
        drawImage(...args) { drawCalls.push(args); },
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
      };
    }
  }

  const rootElement = new MockElement("root");
  globalThis.document = {
    baseURI: "https://sprite.test/",
    createElement: (tagName) => new MockElement(tagName),
    querySelector: () => null,
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame(callback) {
      const id = nextRaf++;
      rafCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { rafCallbacks.delete(id); },
    setTimeout(callback, delay = 0) {
      const id = nextTimeout++;
      timeoutCallbacks.set(id, { callback, dueAt: now + Number(delay || 0) });
      return id;
    },
    clearTimeout(id) { timeoutCallbacks.delete(id); },
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const relative = decodeURIComponent(url.pathname).replace(/^\//, "");
    const file = path.join(assetRoot, ...relative.split("/"));
    try {
      const body = JSON.parse(await readFile(file, "utf8"));
      return { ok: true, status: 200, json: async () => body };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
  globalThis.Image = class MockImage {
    set src(value) {
      this._src = value;
      const relative = decodeURIComponent(new URL(value).pathname).replace(/^\//, "");
      readFile(path.join(assetRoot, ...relative.split("/"))).then((bytes) => {
        this.naturalWidth = bytes.readUInt32BE(16);
        this.naturalHeight = bytes.readUInt32BE(20);
        this.onload?.();
      }, () => this.onerror?.());
    }
    get src() { return this._src; }
  };

  return {
    rootElement,
    drawCalls,
    step(milliseconds = 100) {
      now += milliseconds;
      const due = [...timeoutCallbacks.entries()].filter(([, timer]) => timer.dueAt <= now);
      for (const [id, timer] of due) {
        timeoutCallbacks.delete(id);
        timer.callback();
      }
      const callbacks = [...rafCallbacks.values()];
      rafCallbacks.clear();
      callbacks.forEach((callback) => callback(now));
    },
    pendingFrames: () => rafCallbacks.size,
  };
}

try {
  await prepareSource();
  const first = await importXingliPack({ sourceDir, outputDir: outputA });
  const second = await importXingliPack({ sourceDir, outputDir: outputB });
  check("imports all declared clips and frames", first.clipCount === 3 && first.frameCount === 7);

  const treeA = await digestTree(outputA);
  const treeB = await digestTree(outputB);
  check("import output is byte-for-byte deterministic", treeA.hash === treeB.hash && treeA.files.join("|") === treeB.files.join("|"));

  const runtimeManifest = JSON.parse(await readFile(path.join(outputA, "manifest.json"), "utf8"));
  const idleAtlas = JSON.parse(await readFile(path.join(outputA, "clips", "idle_loop.json"), "utf8"));
  const atlasPng = PNG.sync.read(await readFile(path.join(outputA, "clips", "idle_loop.png")));
  const portraitPng = PNG.sync.read(await readFile(path.join(outputA, "portrait.png")));
  check("runtime manifest keeps a fixed 768x768 logical canvas",
    runtimeManifest.logicalSize.width === 768 && runtimeManifest.logicalSize.height === 768);
  check("runtime manifest carries a deterministic cache revision",
    /^[a-f0-9]{16}$/.test(runtimeManifest.revision || ""));
  check("transparent frames are trimmed with source offsets",
    idleAtlas.frames.every((frame) => frame.source.width < 768 && frame.source.height < 768));
  check("atlas PNG remains RGBA", atlasPng.colorType === 6 || atlasPng.alpha === true,
    `${atlasPng.width}x${atlasPng.height}`);
  const recoveredOffset = ((150 * portraitPng.width) + 108) * 4 + 3;
  check("baked checker alpha is reconstructed inside the subject",
    portraitPng.data[recoveredOffset] > 200 && portraitPng.data[3] === 0);
  check("clip playback conventions are emitted",
    runtimeManifest.clips.idle_loop.playback === "loop"
      && runtimeManifest.clips.greet.playback === "once"
      && runtimeManifest.clips.greet.returnClip === "idle_loop"
      && runtimeManifest.clips.comfort.holdMs === 250);

  const originalManifest = await readFile(path.join(sourceDir, "asset_manifest.json"), "utf8");
  const malicious = JSON.parse(originalManifest);
  malicious.animations.greet.frames[0] = "../escape.png";
  await writeFile(path.join(sourceDir, "asset_manifest.json"), JSON.stringify(malicious), "utf8");
  let traversalRejected = false;
  try {
    await importXingliPack({ sourceDir, outputDir: path.join(tempRoot, "unsafe-output") });
  } catch (error) {
    traversalRejected = /unsafe frame name/i.test(error.message);
  }
  check("path traversal in frame names is rejected", traversalRejected);
  await writeFile(path.join(sourceDir, "asset_manifest.json"), originalManifest, "utf8");

  const mockRoot = path.join(tempRoot, "http-root");
  await mkdir(path.join(mockRoot, "assets"), { recursive: true });
  await importXingliPack({ sourceDir, outputDir: path.join(mockRoot, "assets") });
  const dom = installDomMock(mockRoot);
  const { mountSpriteCharacter } = await import("../src/avatar/sprite-character.js");
  let completed = 0;
  const character = mountSpriteCharacter(dom.rootElement, {
    manifestUrl: "/assets/manifest.json",
    size: 220,
    onComplete: () => { completed += 1; },
  });
  await character.ready;
  check("player lazily loads only the initial clip",
    character.getState().clipId === "idle_loop"
      && character.getState().loadedClips.join(",") === "idle_loop");
  await character.play("greet", { playback: "once", returnClip: false, crossfadeMs: 20 });
  dom.step(100);
  dom.step(100);
  dom.step(100);
  dom.step(100);
  check("player advances and completes a once clip",
    completed === 1 && character.getState().status === "complete" && dom.drawCalls.length > 0);
  check("second clip loads on demand",
    character.getState().loadedClips.includes("greet") && character.getState().loadedClips.length === 2);
  completed = 0;
  await character.play("comfort", { playback: "once", returnClip: false, crossfadeMs: 0 });
  dom.step(249);
  const heldBeforeDeadline = completed === 0 && character.getState().clipId === "comfort";
  dom.step(1);
  check("single-frame once clips honor their manifest hold time",
    heldBeforeDeadline && completed === 1 && character.getState().status === "complete");
  completed = 0;
  await character.play("greet", { playback: "reverse-return", returnClip: false, crossfadeMs: 0 });
  for (let index = 0; index < 7; index += 1) dom.step(100);
  check("player supports forward-then-reverse clips",
    completed === 1 && character.getState().frameIndex === 0 && character.getState().direction === -1);
  character.destroy();
  check("destroy cancels animation and removes the element",
    character.getState().destroyed && dom.pendingFrames() === 0 && character.element.removed);

  const sourceCode = await readFile(path.join(root, "src", "avatar", "sprite-character.js"), "utf8");
  const css = await readFile(path.join(root, "src", "avatar", "sprite-character.css"), "utf8");
  check("runtime includes stale-request cancellation", sourceCode.includes("requestGeneration"));
  check("runtime versions atlas assets and revalidates the manifest",
    sourceCode.includes('searchParams.set("v", manifest.revision)')
      && sourceCode.includes('cache: "no-cache"'));
  check("reduced-motion is handled in JS and CSS",
    sourceCode.includes("prefers-reduced-motion") && css.includes("prefers-reduced-motion"));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

const failed = checks.filter((item) => !item.pass);
console.log(`\nSprite character verification: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) process.exitCode = 1;
