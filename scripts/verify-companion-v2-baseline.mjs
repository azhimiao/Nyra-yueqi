#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const analysisErrors = [];
const results = [];

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function readSource(relativePath) {
  try {
    return readFileSync(join(root, relativePath), "utf8");
  } catch (error) {
    analysisErrors.push({
      path: normalizePath(relativePath),
      error: String(error?.message || error),
    });
    return "";
  }
}

function listSourceFiles(dir, output = []) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        listSourceFiles(absolutePath, output);
      } else if ([".js", ".mjs"].includes(extname(entry.name).toLowerCase())) {
        output.push(absolutePath);
      }
    }
  } catch (error) {
    analysisErrors.push({
      path: normalizePath(relative(root, dir) || "."),
      error: String(error?.message || error),
    });
  }
  return output;
}

function lineOf(source, pattern) {
  const match = typeof pattern === "string"
    ? { index: source.indexOf(pattern) }
    : pattern.exec(source);
  if (!match || match.index < 0) return null;
  return source.slice(0, match.index).split(/\r?\n/).length;
}

function location(path, source, pattern) {
  return {
    path: normalizePath(path),
    line: lineOf(source, pattern),
  };
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function record({ id, status, baselineMatched, summary, evidence }) {
  results.push({
    id,
    status,
    baselineMatched: Boolean(baselineMatched),
    summary,
    evidence,
  });
}

function recordGap({ id, present, summary, evidence }) {
  record({
    id,
    status: present ? "FAIL" : "PASS",
    baselineMatched: present,
    summary,
    evidence,
  });
}

function recordObservation({ id, present, summary, evidence }) {
  record({
    id,
    status: present ? "OBSERVED" : "PASS",
    baselineMatched: present,
    summary,
    evidence,
  });
}

const paths = {
  app: "src/app.js",
  assemble: "src/prompt/assemble.js",
  chat: "src/panels/chat.js",
  client: "src/model/client.js",
  cutover: "src/features/cutover-profile.js",
  firstLightCommit: "src/first-light/commit.js",
  firstLightPresets: "src/first-light/presets.js",
  genericImport: "src/characters/import.js",
  profilePanel: "src/panels/profile.js",
  characterStore: "src/characters/store.js",
  c8: "docs/qa/product-cutover/C8_RELEASE_GATE.md",
  cutoverStatus: "docs/qa/product-cutover/STATUS.md",
};

const source = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, readSource(path)]),
);

const sourceFiles = listSourceFiles(join(root, "src"));
const allApplicationSource = sourceFiles
  .map((absolutePath) => readSource(relative(root, absolutePath)))
  .join("\n");

const legacyDefault =
  /DEFAULT_CUTOVER_PROFILE[\s\S]{0,120}\("legacy"\)/.test(source.cutover)
  && /const on = name !== "legacy";/.test(source.cutover)
  && /for \(const key of CUTOVER_NEW_PATH_FLAGS\)[\s\S]{0,80}out\[key\] = on;/.test(source.cutover);
recordObservation({
  id: "legacy-cutover-default",
  present: legacyDefault,
  summary: "Fresh installs resolve to legacy and legacy forces governed V1 path flags off.",
  evidence: [
    location(paths.cutover, source.cutover, "export const DEFAULT_CUTOVER_PROFILE"),
    location(paths.cutover, source.cutover, 'const on = name !== "legacy";'),
  ],
});

const fiveLinePreview =
  /export function formatCompiledPreview\(compiled\)/.test(source.assemble)
  && ["system:", "developer:", "character:", "daily_status:", "history_turns:"]
    .every((label) => source.assemble.includes(label));
const fixedPreviewSeed =
  source.profilePanel.includes('compilePrompt("今晚下雨，我有点睡不着")')
  && source.profilePanel.includes("promptPreview.textContent = formatCompiledPreview(compiled)");
const finalRequestPath =
  source.chat.includes("await buildModelMessages(compiled")
  && source.chat.includes("finalizeModelRequest(messages")
  && source.chat.includes("callModel(config, finalized.messages");
recordGap({
  id: "prompt-preview-not-final-request",
  present: fiveLinePreview && fixedPreviewSeed && finalRequestPath,
  summary: "Prompt preview renders a fixed-seed five-line summary while chat sends finalized messages.",
  evidence: [
    location(paths.profilePanel, source.profilePanel, 'compilePrompt("今晚下雨，我有点睡不着")'),
    location(paths.assemble, source.assemble, "export function formatCompiledPreview"),
    location(paths.chat, source.chat, "callModel(config, finalized.messages"),
  ],
});

const domPromptReader =
  /function collectPromptTexts\(\)[\s\S]{0,220}promptSystemInput\?\.value[\s\S]{0,120}promptDeveloperInput\?\.value/.test(source.app);
const storeAndDomPassedTogether =
  /collectCharacterProfile:\s*\(\)\s*=>\s*collectCharacterProfile\(profileId\)[\s\S]{0,180}collectPromptTexts/.test(source.app);
const assemblerConsumesBoth =
  source.assemble.includes("const baseTexts = collectPromptTexts?.() || {};")
  && source.assemble.includes("const profile = collectCharacterProfile();");
recordGap({
  id: "prompt-store-dom-dual-authority",
  present: domPromptReader && storeAndDomPassedTogether && assemblerConsumesBoth,
  summary: "Prompt assembly consumes Character Store profile data and desktop DOM Prompt text in the same compile.",
  evidence: [
    location(paths.app, source.app, "function collectPromptTexts()"),
    location(paths.app, source.app, "collectCharacterProfile: () => collectCharacterProfile(profileId)"),
    location(paths.assemble, source.assemble, "const baseTexts = collectPromptTexts?.() || {};"),
  ],
});

const companionChangeCallbacks = [
  ...source.app.matchAll(
    /document\.addEventListener\(COMPANION_CHANGED_EVENT,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\);/g,
  ),
].map((match) => match[1]);
const switchDispatches =
  /export function setActiveCharacterId\(id\)[\s\S]{0,500}dispatch\(COMPANION_CHANGED_EVENT/.test(
    source.characterStore,
  );
const switchDoesNotReloadProfile =
  switchDispatches
  && companionChangeCallbacks.length > 0
  && companionChangeCallbacks.every((body) => !body.includes("applyProfileState"));
recordGap({
  id: "character-switch-does-not-reload-prompt-dom",
  present: switchDoesNotReloadProfile,
  summary: "Companion-change listeners refresh runtime/chrome but do not reload the active card into Prompt DOM fields.",
  evidence: [
    location(paths.characterStore, source.characterStore, "export function setActiveCharacterId"),
    location(paths.app, source.app, "document.addEventListener(COMPANION_CHANGED_EVENT"),
    location(paths.app, source.app, "if (active?.profile) applyProfileState(active.profile)"),
  ],
});

const firstLightWritesStructuralPrefs =
  source.firstLightCommit.includes("writeCompanionPrefs(characterId, structural)")
  && ["purposes:", "conflictStyle:", "allowNudge:"]
    .every((field) => source.firstLightPresets.includes(field));
const firstLightLoaderCallCount = countMatches(
  allApplicationSource,
  /\bloadCompanionFirstLightPrefs\s*\(/g,
);
const firstLightPreferenceKeyFiles = sourceFiles
  .filter((absolutePath) =>
    readSource(relative(root, absolutePath)).includes("yueqi.firstLight.companionPrefs.v1"))
  .map((absolutePath) => normalizePath(relative(root, absolutePath)));
const firstLightPrefsHaveNoRuntimeReader =
  firstLightWritesStructuralPrefs
  && firstLightLoaderCallCount === 1
  && firstLightPreferenceKeyFiles.length === 1
  && firstLightPreferenceKeyFiles[0] === paths.firstLightCommit;
recordGap({
  id: "first-light-structural-fields-unread",
  present: firstLightPrefsHaveNoRuntimeReader,
  summary: "First Light persists purposes/conflictStyle/allowNudge, but the exported loader has no call site.",
  evidence: {
    writer: location(
      paths.firstLightCommit,
      source.firstLightCommit,
      "writeCompanionPrefs(characterId, structural)",
    ),
    fields: location(paths.firstLightPresets, source.firstLightPresets, "export function draftToStructuralPrefs"),
    loaderDefinition: location(
      paths.firstLightCommit,
      source.firstLightCommit,
      "export function loadCompanionFirstLightPrefs",
    ),
    loaderCallCountIncludingDefinition: firstLightLoaderCallCount,
    preferenceKeyFiles: firstLightPreferenceKeyFiles,
  },
});

const mainChatCallExists = source.chat.includes("callModel(config, finalized.messages, {");
const mainChatOffersNoTools =
  mainChatCallExists
  && !/\btools\s*:/.test(source.chat)
  && !/\btoolChoice\s*:/.test(source.chat);
recordGap({
  id: "main-chat-tools-absent",
  present: mainChatOffersNoTools,
  summary: "The main companion chat call sends streaming options without tools or toolChoice.",
  evidence: [
    location(paths.chat, source.chat, "callModel(config, finalized.messages, {"),
    location(paths.client, source.client, "tools: Array.isArray(options.tools) ? options.tools : undefined"),
  ],
});

const streamReadsTextOnly =
  source.client.includes('const delta = payload.choices?.[0]?.delta?.content || "";')
  && !source.client.includes("tool_calls");
recordGap({
  id: "stream-tool-calls-unhandled",
  present: streamReadsTextOnly,
  summary: "Streaming response parsing accumulates delta.content and has no tool_calls parser.",
  evidence: [
    location(paths.client, source.client, 'const delta = payload.choices?.[0]?.delta?.content || "";'),
  ],
});

const mapperStart = source.genericImport.indexOf("export function mapParsedCardToCharacter");
const mapperEnd = source.genericImport.indexOf("/**\n * Extract embedded JSON", mapperStart);
const genericMapper = mapperStart >= 0 && mapperEnd > mapperStart
  ? source.genericImport.slice(mapperStart, mapperEnd)
  : "";
const parsedGreetingAndScenario =
  source.genericImport.includes("firstMessage: asString(data.first_mes)")
  && source.genericImport.includes("scenario: asString(data.scenario)");
const parsedFieldsDropped =
  parsedGreetingAndScenario
  && genericMapper.length > 0
  && !genericMapper.includes("parsed?.firstMessage")
  && !genericMapper.includes("parsed?.scenario");
recordGap({
  id: "generic-card-first-message-scenario-dropped",
  present: parsedFieldsDropped,
  summary: "Generic import parses first_mes and scenario, but the Character mapper persists neither field.",
  evidence: [
    location(paths.genericImport, source.genericImport, "scenario: asString(data.scenario)"),
    location(paths.genericImport, source.genericImport, "firstMessage: asString(data.first_mes)"),
    location(paths.genericImport, source.genericImport, "export function mapParsedCardToCharacter"),
  ],
});

const unsupportedGenericFields = [
  "alternate_greetings",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "character_book",
];
const genericFieldsUnrecognized = unsupportedGenericFields.every(
  (field) => !source.genericImport.includes(field),
);
recordGap({
  id: "generic-card-extended-fields-unrecognized",
  present: genericFieldsUnrecognized,
  summary: "Generic import has no mapping for alternate greetings, examples, system/post-history prompts, or character_book.",
  evidence: {
    parser: location(paths.genericImport, source.genericImport, "export function parseJsonCharacterCard"),
    absentFields: unsupportedGenericFields,
  },
});

const c8Fail =
  /> Status:\s*\*\*FAIL\*\*/.test(source.c8)
  && /\|\s*C8 Release gate\s*\|[\s\S]{0,80}\*\*FAIL\*\*/.test(source.cutoverStatus);
recordGap({
  id: "c8-release-gate-fail",
  present: c8Fail,
  summary: "The current C8 artifact and cutover status both report FAIL.",
  evidence: [
    location(paths.c8, source.c8, "> Status: **FAIL**"),
    location(paths.cutoverStatus, source.cutoverStatus, "| C8 Release gate"),
  ],
});

record({
  id: "source-analysis",
  status: analysisErrors.length === 0 ? "PASS" : "FAIL",
  baselineMatched: analysisErrors.length === 0,
  summary: analysisErrors.length === 0
    ? `Read ${sourceFiles.length} application source files without analysis errors.`
    : "One or more required source files could not be analyzed.",
  evidence: analysisErrors.length === 0
    ? { sourceRoot: "src", filesRead: sourceFiles.length }
    : analysisErrors,
});

const missingBaselineEvidence = results
  .filter((result) => !result.baselineMatched)
  .map((result) => result.id);
const exitCode = analysisErrors.length > 0 || missingBaselineEvidence.length > 0 ? 1 : 0;
const report = {
  schemaVersion: 1,
  verifier: "companion-v2-baseline",
  mode: "read-only-static-source-scan",
  statusLegend: {
    PASS: "Desired invariant or analyzer integrity check is currently satisfied.",
    FAIL: "A known product gap or failing release gate is confirmed; expected for this frozen baseline.",
    OBSERVED: "A neutral current-state fact is confirmed.",
  },
  exitSemantics: {
    zero: "All expected Task 0.1 baseline evidence was observed, even though product-level FAIL rows remain.",
    nonZero: "Source analysis failed or one or more expected baseline facts changed/disappeared.",
  },
  results,
  summary: {
    baselineMatched: missingBaselineEvidence.length === 0 && analysisErrors.length === 0,
    pass: results.filter((result) => result.status === "PASS").length,
    fail: results.filter((result) => result.status === "FAIL").length,
    observed: results.filter((result) => result.status === "OBSERVED").length,
    missingBaselineEvidence,
    analysisErrors,
    exitCode,
  },
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = exitCode;
