/**
 * Phase 4 — open layered 2D, Canvas/Pixi, lip-sync, sprite fallback.
 * Run: node scripts/verify-phase4.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAppBundle } from "./lib/app-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: { _data: {}, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = String(v); } },
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
};

const { migrateAvatarState, createDefaultAvatarState } = await import("../src/avatar/looks-model.js");
const {
  LAYERED_FORMAT,
  createStarterLayeredModel,
  normalizeLayeredModel,
  shouldUseLayeredRender,
  exportLayeredOpenJson,
  resolveActionBinding,
} = await import("../src/avatar/layered-model.js");
const {
  breatheOffset,
  swayRotation,
  volumeToLip,
  createBlinkController,
} = await import("../src/avatar/layered-motion.js");

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const ttsJs = readFileSync(join(root, "src/voice/tts.js"), "utf8");
const characterPage = readFileSync(join(root, "src/avatar/character-page.js"), "utf8");
const packIo = readFileSync(join(root, "src/character-pack/pack-io.js"), "utf8");

check("Phase 4 UI present", indexHtml.includes("data-layered-parts") && indexHtml.includes("data-layered-export-json"));
check("Render mode UI", indexHtml.includes("data-render-mode") && indexHtml.includes("data-layered-backend"));
check("Stage canvas host", indexHtml.includes("data-avatar-stage-canvas"));
check("No proprietary runtime in phase4 UI copy", !indexHtml.includes("Live2D Cubism") && !indexHtml.includes("Spine"));
check("pixi.js dependency MIT stack", Boolean(packageJson.dependencies?.["pixi.js"]));
check("layered modules exist", existsSync(join(root, "src/avatar/layered-model.js"))
  && existsSync(join(root, "src/avatar/layered-renderer.js"))
  && existsSync(join(root, "src/avatar/layered-pixi.js"))
  && existsSync(join(root, "src/avatar/lip-sync.js")));
check("TTS attaches lip-sync", ttsJs.includes("attachLipSyncToAudio"));
check("character page wires phase4", characterPage.includes("wirePhase4Editor") && characterPage.includes("shouldUseLayeredRender"));
check("character pack ships layered.json", packIo.includes("layered.json") && packIo.includes("assets/layers/"));
check("character pack keeps timeline", packIo.includes("timeline") && packIo.includes("enter"));

const fresh = createDefaultAvatarState();
check("schemaVersion 4", fresh.schemaVersion === 4);
check("default renderMode auto", fresh.renderMode === "auto");
check("empty layered by default", Array.isArray(fresh.layered?.parts));

const migrated = migrateAvatarState({
  schemaVersion: 3,
  looks: [{ id: "a", name: "A", mediaId: "m1", fileName: "a.png" }],
  currentLookId: "a",
  actions: [{ id: "idle_default", name: "待机", triggers: ["idle"] }],
});
check("migrate v3→v4 adds layered", migrated.schemaVersion === 4 && migrated.layered?.format === LAYERED_FORMAT);

const starter = createStarterLayeredModel();
starter.parts[0].mediaId = "body-1";
const withLayer = migrateAvatarState({ ...fresh, layered: starter, renderMode: "auto" });
check("auto uses layered when parts have media", shouldUseLayeredRender(withLayer) === true);
check("sprite force disables layered", shouldUseLayeredRender({ ...withLayer, renderMode: "sprite" }) === false);
check("lowEnd forces sprite fallback", shouldUseLayeredRender(withLayer, { lowEnd: true }) === false);

const openJson = exportLayeredOpenJson(starter);
check("open JSON format tag", openJson.format === LAYERED_FORMAT && openJson.version === 1);
check("open JSON has action bindings", Boolean(openJson.actionBindings?.talking_default?.lipSync));

const binding = resolveActionBinding(starter, "talking_default");
check("talking binding enables lipSync", binding.lipSync === true);

const breath = breatheOffset(800, { amplitude: 0.02, periodMs: 3200 });
check("breathe produces scale", breath.scaleY > 0.9 && breath.scaleY < 1.1);
check("sway produces degrees", Math.abs(swayRotation(1000, { amplitudeDeg: 2, periodMs: 4000 })) <= 2);

const blink = createBlinkController({ intervalMs: [10, 20], durationMs: 40, closedScaleY: 0.1 });
const openEye = blink.sample(0);
check("blink starts open", openEye > 0.9);

const lip = volumeToLip(0.8, { minOpen: 0.04, maxOpen: 0.4 });
check("volume maps to viseme", lip.viseme === "A" && lip.scaleY > 0.5);

const appJs = readAppBundle(root);
check("verify script wired expectation: no proprietary SDK imports in app bundle",
  !appJs.includes("live2d") && !appJs.includes("pixi-live2d") && !/from ['\"]@pixi\/spine/.test(appJs));

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:", failed.map((item) => item.name).join(", "));
  process.exit(1);
}
