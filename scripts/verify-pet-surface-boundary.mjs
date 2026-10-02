/**
 * Product boundary: the animated pet runtime belongs to floating hosts only.
 * Phone apps, chat, moments and open-scene UI may use ordinary character media,
 * but must not mount the pet renderer or pet action protocol.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const read = (rel) => readFileSync(join(root, rel), "utf8");
const check = (name, pass, detail = "") => {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const phone = read("src/phone-shell/phone-shell.js");
const screens = read("src/phone-shell/app-screens.js");
const stage = `${read("src/scenario/player/stage-controller.js")}\n${read("src/scenario/player/stage-renderer.js")}`;
const app = read("src/app.js");
const world = read("src/world/world-page.js");
const float = read("src/ui/companion-float.js");
const layout = read("src/phone-shell/home-layout.js");

const forbiddenRuntime = /mountPet|mountXingliCharacter|pet-action-protocol|data-phone-pet-boy|data-phone-boy/;
check("phone shell contains no animated-pet mount", !forbiddenRuntime.test(phone));
check("phone control screen contains no pet preview", !/data-phone-pet-boy|mini-pet-avatar|data-phone-pets/.test(screens));
check("open scene contains no pet or character-pose renderer", !/mountPet|pet-action-protocol|resolvePetAction|character-pose-assets|data-stage-figure|data-stage-sprite/.test(stage));
check("main chat contains no duplicate animated character", !/mountXingliCharacter|data-chat-boy/.test(app));
check("moments contains no animated pet", !/mountBoyCharacter|companion-boy\.svg|data-moments-boy/.test(world));
check("floating companion remains the pet host", /mountPet/.test(float) && /data-companion-float/.test(float));
check(
  "phone dock enters apps, not pet preview",
  /C1_DOCK_ORDER\s*=\s*\[/.test(layout)
    && !/pet|boy-character|mountPet/.test(layout.match(/C1_DOCK_ORDER[^;]+/)?.[0] || "")
    && /"(moments|qishi|shop|settings|pop|calendar|listen)"/.test(
      layout.match(/C1_DOCK_ORDER[^;]+/)?.[0] || "",
    ),
);

const failed = checks.filter((item) => !item.pass);
console.log(`\nPet surface boundary: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
