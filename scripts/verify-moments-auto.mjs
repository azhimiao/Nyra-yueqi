/**
 * Moments auto-post — schedule + publish without 查手机.
 * Run: node scripts/verify-moments-auto.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
    removeItem(key) {
      delete this._data[key];
    },
  },
  setInterval() {
    return 1;
  },
  clearInterval() {},
};
globalThis.document = {
  dispatchEvent() {},
};

const {
  MOMENTS_AUTO_SCHEDULE_KEY,
  postMomentForCharacter,
  startMomentsAutoPost,
  stopMomentsAutoPost,
  __testOnly,
} = await import("../src/moments/auto-post.js");
const { loadMoments } = await import("../src/moments/store.js");
const { FROZEN_HOME_APP_IDS, C1_GRID_ORDER, LAYOUT_VERSION_C1 } = await import("../src/phone-shell/home-layout.js");
const { PHONE_APP_MAP } = await import("../src/phone-shell/apps-catalog.js");

const t = __testOnly();

check("layout frozen includes sidewrite", FROZEN_HOME_APP_IDS.includes("sidewrite"));
check("grid excludes sidewrite", !C1_GRID_ORDER.includes("sidewrite"));
check("catalog excludes sidewrite", !PHONE_APP_MAP.sidewrite);
check("layout version is current", LAYOUT_VERSION_C1 === "c14-scenario-icon");

const shell = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check("shell starts auto-post", shell.includes("startMomentsAutoPost") && shell.includes("stopMomentsAutoPost"));
check("shell does not mount sidewrite", !shell.includes("mountSidewriteApp"));

const character = {
  id: "char-verify-moments",
  name: "测测",
  profile: { promptSystem: "话少，偶尔发朋友圈。", fields: ["测测", "测"] },
};

const before = loadMoments().length;
const posted = await postMomentForCharacter(character);
check("no-model generation returns null", posted === null);
check("no-model generation does not persist", loadMoments().length === before);

const bag = t.readScheduleBag();
const row = bag.characters.find((item) => item.characterId === character.id);
check("failed generation does not claim a post", !row?.lastPostAt);

const delay = t.nextDelayMs(true);
check(
  "first delay in 15–45 min",
  delay >= t.FIRST_DELAY.minMs && delay <= t.FIRST_DELAY.maxMs,
  String(delay),
);

startMomentsAutoPost({ getProviderConfig: async () => null });
stopMomentsAutoPost();
check("disabled scheduler remains fail-safe", !window.localStorage.getItem(MOMENTS_AUTO_SCHEDULE_KEY));

const failed = checks.filter((item) => !item.pass);
if (failed.length) {
  console.error(`\nverify-moments-auto: ${failed.length} failed`);
  process.exit(1);
}
console.log("\nverify-moments-auto: ok");
