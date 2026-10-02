import assert from "node:assert/strict";
import {
  bibleFromScript,
  formatWorkBiblePrompt,
  forkScriptToUserDraft,
  isUserOwnedScript,
  normalizeWorkBible,
  sceneSeedFromBible,
  splitOpening,
} from "./work-bible.js";
import { createExperiencePackageFromScenario } from "../experience/scenario-package.js";
import { validateExperiencePackage } from "../experience/package-io.js";
import { SCENARIO_PRESETS } from "./presets.js";

assert.equal(isUserOwnedScript({ source: "user" }), true);
assert.equal(isUserOwnedScript({ source: "preset" }), false);

const split = splitOpening("雨打在顶棚上。\n「……车还要多久？」");
assert.match(split.narration, /顶棚/);
assert.match(split.dialogue, /车还要多久/);

const bible = normalizeWorkBible({
  premise: "末班渡轮经常误点，雨里只剩一把伞。",
  openingBeat: "浪拍在木桩上。\n「……船还开吗？」",
  instruction: "雨夜码头。对方刚下船，还握着湿掉的船票。语气克制，不要写成日常陪伴。",
});
assert.equal(bible.leadName, "对方");
assert.match(bible.premise, /渡轮/);
assert.match(bible.instruction, /船票/);

const prompt = formatWorkBiblePrompt({
  title: "误点渡轮",
  ...bible,
});
assert.match(prompt, /介绍：/);
assert.match(prompt, /剧情指令：/);
assert.doesNotMatch(prompt, /第\d+幕/);
assert.doesNotMatch(prompt, /大背景：/);

const forked = forkScriptToUserDraft({
  id: "script-rain-station",
  title: "夜雨车站",
  premise: "末班车误点。",
  openingBeat: "雨打在站台顶棚上。",
  castHint: "语气克制，留白。",
  source: "preset",
});
assert.equal(forked.source, "user");
assert.ok(!forked.id);
assert.match(forked.premise, /末班车/);
assert.match(forked.instruction, /克制/);

const seed = sceneSeedFromBible(bible);
assert.match(seed.worldSetting, /渡轮/);
assert.match(seed.worldview, /船票/);

const pkg = createExperiencePackageFromScenario({
  id: "script-user-bible",
  title: "误点渡轮",
  source: "user",
  ...bible,
});
const validated = validateExperiencePackage(pkg);
assert.equal(validated.ok, true, validated.errors?.join(",") || "");
assert.match(pkg.scenarioOverride, /介绍：/);
assert.match(pkg.scenarioOverride, /剧情指令：/);
assert.equal(pkg.openings[0].title, "开场");
assert.match(pkg.openings[0].openingTurns[0].dialogue, /船还开吗/);
assert.ok(pkg.embeddedLorebook.some((entry) => entry.title === "剧情指令"));

const fromPkg = bibleFromScript({ id: "script-user-bible", title: "误点渡轮", source: "user" }, pkg);
assert.match(fromPkg.premise, /渡轮/);

const rain = SCENARIO_PRESETS.find((item) => item.id === "script-rain-station");
const rainPkg = createExperiencePackageFromScenario(rain);
assert.equal(rainPkg.openings.length, 1, "placeholder rain-station is one opening, not the old 3-pack");
assert.equal(rainPkg.id, "exp-script-rain-station");
assert.equal(rainPkg.openings[0].title, "开场");
assert.equal(validateExperiencePackage(rainPkg).ok, true, validateExperiencePackage(rainPkg).errors?.join(",") || "");
assert.match(rain.instruction, /雨是第三角色/);
assert.match(formatWorkBiblePrompt(rain), /剧情指令：/);
assert.ok(SCENARIO_PRESETS.every((item) => item.instruction && item.openingBeat && item.premise));

console.log("scenario-work-bible: ok");
