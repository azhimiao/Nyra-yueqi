import assert from "node:assert/strict";
import { listLibraryItems, openingGreeting, workCoverSrc } from "./index.js";
import { getScript } from "../store.js";

const works = listLibraryItems();
assert.ok(works.length >= 5, `library should list built-in works, got ${works.length}`);
assert.ok(works.some((item) => item.id === "script-rain-station"));
assert.ok(works.some((item) => item.id === "script-rooftop"));
assert.ok(works.some((item) => item.id === "script-cafe"));
assert.ok(
  works.filter((item) => item.source !== "user").every((item) => (
    (item.tags || []).includes("样例") || item.durationHint === "样例"
  )),
);
const rain = getScript("script-rain-station");
assert.match(rain?.instruction || "", /雨是第三角色/);
assert.equal(rain?.experiencePackageId, undefined);
assert.ok(workCoverSrc({ id: "script-rain-station" }).includes("night-rain-station"));
assert.ok(getScript("script-rooftop")?.id === "script-rooftop");

const greet = openingGreeting({
  teaser: "fallback",
  openingTurns: [
    { role: "assistant", narration: "雨丝斜过灯柱。", dialogue: "……车还要多久？" },
  ],
});
assert.match(greet, /雨丝斜过灯柱/);
assert.match(greet, /车还要多久/);

console.log("scenario-library: ok", { works: works.map((item) => item.id) });
