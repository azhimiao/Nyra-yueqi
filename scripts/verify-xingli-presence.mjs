import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCompanionRuntime } from "../src/runtime/companion-runtime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass) {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}

const read = (relative) => readFile(path.join(root, ...relative.split("/")), "utf8");
const manifest = JSON.parse(await read("public/assets/characters/xingli/manifest.json"));
const overlayHtml = await read("overlay.html");
const overlayApp = await read("src/overlay/overlay-app.js");
const desktopWire = await read("src/ui/desktop-presence-wire.js");
const androidWire = await read("src/ui/overlay-presence-wire.js");
const app = await read("src/app.js");
const electron = await read("electron/main.mjs");

check("runtime pack exposes portrait and all 16 clips",
  manifest.portrait === "portrait.png" && Object.keys(manifest.clips).length === 16);
check("overlay starts on the catalog sprite pet and can mount the atlas",
  overlayHtml.includes('id="spriteMount"')
    && overlayApp.includes("mountSpriteCharacter")
    && overlayApp.includes("DEFAULT_PET_ID")
    && overlayApp.includes("getPet"));
check("overlay provides auto and manual action controls",
  overlayHtml.includes('data-pose-mode="auto"')
    && overlayHtml.includes('data-pose-mode="manual"')
    && overlayApp.includes("playManualPose"));
check("drag gesture owns its restricted animation path",
  overlayApp.includes('sprite.play("drag"') && overlayApp.includes('reason: "gesture"'));
check("catalog sprite is the only desktop-pet look",
  overlayApp.includes("mountBundledSprite")
    && overlayApp.includes('classList.remove("has-custom")')
    && overlayApp.includes('spritePack === "legacy" ? DEFAULT_PET_ID')
    && !overlayApp.includes("mountBoyCharacter"));
check("catalog hosts build lightweight overlay state",
  desktopWire.includes("buildCatalogPetOverlayState")
    && androidWire.includes("buildCatalogPetOverlayState")
    && !desktopWire.includes("getMediaBlobById")
    && !androidWire.includes("getMediaBlobById"));
check("overlay no longer mounts the boy skeleton",
  !overlayApp.includes("mountBoyCharacter")
    && !overlayHtml.includes('id="boyMount"')
    && !overlayHtml.includes('id="customLook"')
    && !overlayHtml.includes("boy-character.css"));
check("Electron strips legacy wardrobe blobs from pet state",
  electron.includes('next[key] = ""') && electron.includes("lookDataUrl"));
check("Windows and Android hosts resolve the same selected pet pack",
  desktopWire.includes("buildCatalogPetOverlayState") && androidWire.includes("buildCatalogPetOverlayState"));
check("LLM runtime catalog includes Xingli reply actions",
  app.includes("XINGLI_REPLY_ACTION_IDS") && app.includes("...XINGLI_REPLY_ACTION_IDS"));
check("Electron accepts sprite and sleep state",
  electron.includes('"spritePack"') && electron.includes('"asleep"'));

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const previousCustomEvent = globalThis.CustomEvent;
const timers = [];
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
};
globalThis.document = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.window = { setTimeout(callback) { timers.push(callback); return timers.length; } };

try {
  const runtime = createCompanionRuntime({ collectCharacterProfile: () => ({ name: "星梨" }) });
  runtime.recordMessage({ role: "user", text: "在吗" });
  check("user message enters thinking animation",
    runtime.getState().playState === "thinking" && runtime.getState().actionId === "thinking");

  runtime.recordMessage({ role: "ai", text: "我在", actionId: "comfort", emotion: "caring" });
  check("reply metadata reaches action and emotion state",
    runtime.getState().playState === "reacting"
      && runtime.getState().actionId === "comfort"
      && runtime.getState().emotion === "caring");

  runtime.recordMessage({ role: "user", text: "再想想" });
  timers[0]?.();
  check("stale reply timer cannot cancel a newer thinking state",
    runtime.getState().playState === "thinking" && runtime.getState().actionId === "thinking");
} finally {
  globalThis.document = previousDocument;
  globalThis.window = previousWindow;
  globalThis.CustomEvent = previousCustomEvent;
}

const failed = checks.filter((item) => !item.pass);
console.log(`\nXingli presence verification: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) process.exitCode = 1;
