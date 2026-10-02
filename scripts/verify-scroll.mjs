import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseVnResponse } from "../src/scroll/vn-parser.js";
import { listScrollWorks } from "../src/scroll/presets.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

const source = readFileSync(path.join(ROOT, "src/scroll/scroll-app.js"), "utf8");
const shell = readFileSync(path.join(ROOT, "src/phone-shell/phone-shell.js"), "utf8");

check("phone shell mounts the dynamic character scroll app", shell.includes('from "../scroll/scroll-app.js"'));
check("retired bundled work library stays empty", listScrollWorks().length === 0);
check("character selection is the only entry", source.includes("data-scroll-pick-char"));
check("user defines the opening instead of receiving a demo", source.includes("data-compose-opening") && source.includes("用户自定义开场"));
check("dynamic continuation uses the model adapter", source.includes("generateVnCompletion({"));
check("provider configuration is injected by the host", source.includes("collectProviderConfig: deps.collectProviderConfig"));
check("model frames, options and ending are persisted", source.includes("historyMessages: nextHistory") && source.includes("liveOptions = result.options") && source.includes("liveEnding = result.ending"));
check("ending creates an experience memory projection", source.includes("projectScrollMemory(characterId"));
check("choice and free-text continuation are both wired", source.includes("data-live-choice") && source.includes("data-live-free") && source.includes("data-live-form"));
check("only implemented reader controls are rendered", source.includes("data-live-auto") && source.includes("data-live-hide") && !source.includes("<button type=\"button\" disabled title=\"回顾\"") && !source.includes("<button type=\"button\" disabled title=\"书签\""));
check("missing provider and parse failures have explicit messages", source.includes('code === "provider_missing"') && source.includes('code === "vn_parse_failed"'));
check("no bundled default story is injected", !source.includes("rainbound-journey") && !source.includes("NIGHT_RAIN_SCROLL_ID"));

const parsed = parseVnResponse(JSON.stringify({
  frames: [
    { id: "f1", speaker: "月栖", text: "窗外的雨停了。" },
    { id: "f2", speaker: "", text: "她把书页轻轻合上。" },
  ],
  options: [
    { id: "stay", label: "留下来" },
    { id: "leave", label: "先告别" },
  ],
  ending: null,
}));
check("structured model response keeps frames", parsed.ok && parsed.frames.length === 2);
check("structured model response keeps choices", parsed.options?.length === 2);

const fallback = parseVnResponse("她没有立刻回答，只把杯子推近了一点。");
check("plain-text model response degrades honestly", fallback.ok && fallback.frames.length === 1 && fallback.fallbackText);

const memory = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  },
};
const sessions = await import("../src/scroll/character-session.js");
assert.equal(sessions.saveCharacterScrollSession("char-a", {
  chapterTitle: "雨后",
  frames: parsed.frames,
  frameIndex: 1,
  options: parsed.options,
  historyMessages: [{ role: "user", content: "从雨停以后开始" }],
}).ok, true);
assert.equal(sessions.saveCharacterScrollSession("char-b", {
  chapterTitle: "清晨",
  frames: fallback.frames,
  frameIndex: 0,
}).ok, true);

const a = sessions.getCharacterScrollSession("char-a");
const b = sessions.getCharacterScrollSession("char-b");
check("scroll sessions persist by character", a.frames.length === 2 && b.frames.length === 1);
check("scroll sessions do not cross characters", a.chapterTitle === "雨后" && b.chapterTitle === "清晨");
check("scroll options and history survive reload", a.options?.length === 2 && a.historyMessages.length === 1);
check("clearing one character preserves another", sessions.clearCharacterScrollSession("char-a") && sessions.getCharacterScrollSession("char-a").frames.length === 0 && sessions.getCharacterScrollSession("char-b").frames.length === 1);

const failed = checks.filter((item) => !item.pass);
console.log(`\nverify:scroll ${checks.length - failed.length}/${checks.length}${failed.length ? " RED" : " GREEN"}`);
if (failed.length) process.exit(1);
