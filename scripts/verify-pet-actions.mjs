/**
 * Desktop pet multi-action MVP — anime pose actions + context menu.
 * Run: node scripts/verify-pet-actions.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: { _data: {}, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = String(v); } },
};

const { createDefaultAvatarState, migrateAvatarState, resolveActionMediaId } = await import("../src/avatar/looks-model.js");
const { resolveSceneTrigger } = await import("../src/runtime/scene-triggers.js");
const { deliveryChecklist } = await import("../src/character-pack/pack-version.js");

const overlayHtml = readFileSync(join(root, "overlay.html"), "utf8");
const overlayApp = readFileSync(join(root, "src/overlay/overlay-app.js"), "utf8");
const preloadPet = readFileSync(join(root, "electron/preload-pet.cjs"), "utf8");
const preloadApp = readFileSync(join(root, "electron/preload-app.cjs"), "utf8");
const mainJs = readFileSync(join(root, "electron/main.mjs"), "utf8");
const desktopWire = readFileSync(join(root, "src/ui/desktop-presence-wire.js"), "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const fresh = createDefaultAvatarState();
const ids = fresh.actions.map((a) => a.id);
check("default has sleep_pose", ids.includes("sleep_pose"));
check("default has greet", ids.includes("greet"));
check("default has selfie", ids.includes("selfie"));
check("sleep scene binds sleep_pose", resolveSceneTrigger(fresh, "sleep")?.actionId === "sleep_pose");

const migrated = migrateAvatarState({
  schemaVersion: 3,
  looks: [{ id: "a", name: "A", mediaId: "m1", fileName: "a.png" }],
  currentLookId: "a",
  actions: [{ id: "idle_default", name: "待机", triggers: ["idle"] }],
  sceneTriggers: [{ id: "scene_sleep", scene: "sleep", actionId: "idle_default", lookId: "" }],
});
check("migrate adds pet actions", ["sleep_pose", "greet", "selfie"].every((id) => migrated.actions.some((a) => a.id === id)));
check("migrate remaps sleep scene", migrated.sceneTriggers.some((s) => s.scene === "sleep" && s.actionId === "sleep_pose"));

const withMedia = {
  ...fresh,
  actions: fresh.actions.map((a) => (a.id === "greet" ? { ...a, mediaId: "g1" } : a)),
};
check("resolveActionMediaId", resolveActionMediaId(withMedia, "greet") === "g1");

const checklist = deliveryChecklist(fresh);
check("delivery pet_actions check", checklist.checks.some((c) => c.id === "pet_actions" && c.ok));

check("overlay context menu UI", overlayHtml.includes("data-pet-action=\"greet\"") && overlayHtml.includes("自拍一下"));
check("overlay requestAction path", overlayApp.includes("requestPetAction") && overlayApp.includes("requestAction"));
check("overlay uses catalog sprite only", overlayApp.includes("mountBundledSprite") && overlayApp.includes('classList.remove("has-custom")'));
check("legacy boy skeleton not bundled into overlay", !overlayHtml.includes("boy-character.css"));
check("pet preload requestAction", preloadPet.includes("requestAction") && preloadPet.includes("pet:request-action"));
check("app preload onPetAction", preloadApp.includes("onPetAction") && preloadApp.includes("desktop:pet-action"));
check("main dispatches pet action", mainJs.includes("dispatchPetAction") && mainJs.includes("desktop:pet-action"));
check("desktop wire handles action", desktopWire.includes("onDesktopPetAction") && desktopWire.includes("playAction"));
check("verify script listed", Boolean(packageJson.scripts?.["verify:pet-actions"]));
check("plan note exists", readFileSync(join(root, "docs/FLOATING_COMPANION_PLATFORM_PLAN.md"), "utf8").includes("桌宠多动作 MVP"));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:", failed.map((c) => c.name).join(", "));
  process.exit(1);
}
