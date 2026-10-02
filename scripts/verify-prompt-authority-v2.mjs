#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import {
  assembleIdentityForCharacter,
  resolveCharacterIdentityFromRecord,
  resolvePromptTextsFromCharacter,
} from "../src/prompt/prompt-source.js";
import { projectContinuityForPrompt } from "../src/prompt/assemble.js";

const root = join(import.meta.dirname, "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function sourceFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...sourceFiles(absolute));
    else if ([".js", ".mjs"].includes(extname(entry.name))) output.push(absolute);
  }
  return output;
}

function count(text, marker) {
  return String(text || "").split(marker).length - 1;
}

const promptSources = sourceFiles(join(root, "src", "prompt"))
  .map((path) => ({ path, source: readFileSync(path, "utf8") }));
const modelSources = sourceFiles(join(root, "src", "model"))
  .map((path) => ({ path, source: readFileSync(path, "utf8") }));
const appSource = readFileSync(join(root, "src", "app.js"), "utf8");
const assembleSource = readFileSync(join(root, "src", "prompt", "assemble.js"), "utf8");
const compileStart = appSource.indexOf("async function compilePrompt(");
const compileEnd = appSource.indexOf("\nasync function ", compileStart + 1);
const compileBody = compileStart >= 0
  ? appSource.slice(compileStart, compileEnd > compileStart ? compileEnd : appSource.length)
  : "";

check(
  "prompt modules contain no DOM selectors",
  promptSources.every(({ source }) => !/\b(?:querySelector|getElementById)\s*\(/.test(source)),
);
check(
  "prompt modules contain no prompt textarea value reads",
  promptSources.every(({ source }) =>
    !/(?:promptSystem|promptDeveloper|textarea)[\s\S]{0,100}\.value\b/i.test(source)),
);
check(
  "model modules contain no prompt textarea reads",
  modelSources.every(({ source }) =>
    !/(?:promptSystem|promptDeveloper|prompt[^;\n]{0,40}textarea)[\s\S]{0,100}\.value\b/i.test(source)),
);
check(
  "compilePrompt does not use DOM prompt authority",
  Boolean(compileBody)
    && !/promptSystemInput|promptDeveloperInput|collectPromptTexts\s*\(/.test(compileBody),
);
check(
  "preview compilation selects read-only dependencies",
  /readOnlyHistory:\s*preview/.test(assembleSource)
    && /reconcileLegacy:\s*!preview/.test(assembleSource)
    && /markMemoryUsed:\s*!preview/.test(assembleSource)
    && !/getActivePreset|consumeWakeUpBlock/.test(assembleSource),
);

const records = {
  a: {
    id: "a",
    name: "芙宁娜",
    alias: "旅行者",
    profile: {
      fields: ["芙宁娜", "旅行者", "枫丹水神", "", ""],
      promptSystem: "MARKER_A_FURINA",
      promptDeveloper: "A_DEV",
    },
  },
  b: {
    id: "b",
    name: "林黛玉",
    alias: "宝玉",
    profile: {
      fields: ["林黛玉", "宝玉", "潇湘妃子", "", ""],
      promptSystem: "MARKER_B_DAIYU",
      promptDeveloper: "B_DEV",
    },
  },
};

let contaminationFailures = 0;
const maliciousDomReader = () => ({
  promptSystem: "MARKER_A_FURINA",
  promptDeveloper: "A_DOM_DEV",
});
for (let index = 0; index < 500; index += 1) {
  const key = index % 2 === 0 ? "a" : "b";
  const expected = key === "a" ? "MARKER_A_FURINA" : "MARKER_B_DAIYU";
  const forbidden = key === "a" ? "MARKER_B_DAIYU" : "MARKER_A_FURINA";
  const record = records[key];
  const promptTexts = resolvePromptTextsFromCharacter(record);
  const identity = resolveCharacterIdentityFromRecord(record);
  const compiledIdentity = assembleIdentityForCharacter(record, {
    conversationLanguage: "zh-CN",
    collectPromptTexts: maliciousDomReader,
  });
  if (
    !promptTexts.promptSystem.includes(expected)
    || identity.promptSystem !== promptTexts.promptSystem
    || !compiledIdentity.includes(expected)
    || compiledIdentity.includes(forbidden)
  ) {
    contaminationFailures += 1;
  }
}
check(
  "A/B 500-cycle contamination count is zero",
  contaminationFailures === 0,
  `failures=${contaminationFailures}`,
);

const bIdentity = assembleIdentityForCharacter(records.b, {
  conversationLanguage: "zh-CN",
  collectPromptTexts: maliciousDomReader,
});
check(
  "custom character prompt is injected once",
  count(bIdentity, "MARKER_B_DAIYU") === 1,
  `count=${count(bIdentity, "MARKER_B_DAIYU")}`,
);

let refreshWrites = 0;
let storeWrites = 0;
const projected = { companionId: "b", localDate: "2026-08-18" };
const previewContinuity = await projectContinuityForPrompt({
  preview: true,
  companionId: "b",
  userId: "local",
  snapshot: { localDate: "2026-08-18" },
  locale: "zh-CN",
}, {
  refresh: async () => {
    refreshWrites += 1;
    storeWrites += 1;
  },
  project: (input) => {
    if (input.persist !== false) storeWrites += 1;
    return projected;
  },
});
check(
  "preview continuity performs zero writes",
  refreshWrites === 0 && storeWrites === 0 && previewContinuity === projected,
  `refresh=${refreshWrites}, storeRecord=${storeWrites}`,
);

const failed = checks.filter((item) => !item.pass);
console.log(`\nPrompt authority v2: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error(`Failed: ${failed.map((item) => item.name).join("; ")}`);
  process.exitCode = 1;
}
