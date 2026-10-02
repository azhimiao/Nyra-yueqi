#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requestableOpenAiTools, parseOperationToolName, operationToolName } from "../src/tools/openai-tools.js";
import { putToolRun, toolRunFromModelCall } from "../src/tools/tool-run-repository.js";
import { toolResultMessages } from "../src/tools/companion-tool-loop.js";
import { mapParsedCardToCharacter, parseJsonCharacterCard } from "../src/characters/import.js";
import { createCompanionChatExecutors } from "../src/tools/companion-executors.js";
import { parseLocationMessage } from "../src/chat/share-location.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function pass(name) {
  n += 1;
  console.log(`PASS ${name}`);
}

const tools = requestableOpenAiTools({
  networkOnline: true,
  featureFlags: { webRetrievalV1: true },
  foreground: true,
});
assert.ok(Array.isArray(tools));
assert.ok(tools.some((item) => item.function?.name?.includes("weather")));
pass("requestable OpenAI tools include weather");
const weatherTools = requestableOpenAiTools({
  networkOnline: true,
  featureFlags: { webRetrievalV1: true },
  foreground: true,
  operationIds: ["web.weather.lookup"],
});
assert.deepEqual(weatherTools.map((item) => item.function?.name), ["web_weather__lookup"]);
pass("weather tool can be reintroduced for a shared-location follow-up");

assert.deepEqual(parseOperationToolName(operationToolName("web.weather", "lookup")), {
  capabilityId: "web.weather",
  operation: "lookup",
});
pass("tool name round trip");

const chatJs = readFileSync(join(root, "src/panels/chat.js"), "utf8");
assert.match(chatJs, /tools:\s*chatTools/);
assert.match(chatJs, /requestableOpenAiTools/);
assert.match(chatJs, /runCompanionToolLoop/);
assert.match(chatJs, /toolResultMessages/);
assert.match(chatJs, /for \(let toolRound = 0; toolRound < 3/);
pass("chat sends tools and records ToolRun");

const continuation = toolResultMessages([{
  id: "weather-call-1",
  type: "function",
  function: { name: "web__weather__lookup", arguments: "{\"city\":\"苏州\"}" },
}], [{ status: "succeeded", summary: "晴，24度" }], "");
assert.equal(continuation[0].role, "assistant");
assert.equal(continuation[1].role, "tool");
assert.equal(continuation[1].tool_call_id, "weather-call-1");
assert.match(continuation[1].content, /succeeded/);
pass("tool receipt continues the same model turn");

const clientJs = readFileSync(join(root, "src/model/client.js"), "utf8");
assert.match(clientJs, /tool_calls/);
assert.match(clientJs, /reasoning_content/);
assert.match(clientJs, /onReasoning/);
pass("stream client parses tool_calls");

const backend = {
  async runTransaction({ ops }) {
    this.ops = ops;
    return { ok: true, duplicate: false, committed: ops.map((op) => ({ store: op.store, id: op.record.id })) };
  },
};
const run = toolRunFromModelCall({
  capabilityId: "web.weather",
  operation: "lookup",
  parameters: { city: "苏州" },
  risk: "R0",
  idempotencyKey: "weather-suzhou",
});
const saved = await putToolRun(run, { backend });
assert.equal(saved.ok, true);
assert.equal(saved.record.status, "planned");
pass("tool run persists via transaction");

globalThis.window = {
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
};
globalThis.document = { dispatchEvent() { return true; } };
const { resetCharacterCacheForTests } = await import("../src/characters/store.js");
resetCharacterCacheForTests();
const fixture = readFileSync(join(root, "tests/fixtures/character-cards/v2-minimal.json"), "utf8");
const parsed = parseJsonCharacterCard(fixture);
const character = mapParsedCardToCharacter(parsed, { id: "imported-v2" });
assert.ok(character.greetings?.primary || character.profile?.firstMessage);
assert.ok(character.scenario || character.profile?.scenario);
pass("imported V2 card keeps greeting and scenario");

globalThis.fetch = async (url) => {
  assert.match(String(url), /open-meteo\.com/);
  if (String(url).includes("geocoding-api")) {
    return {
      ok: true,
      async json() {
        return { results: [{ latitude: 31.23, longitude: 121.47 }] };
      },
    };
  }
  return {
    ok: true,
    async json() {
      return { current: { temperature_2m: 24, relative_humidity_2m: 55, weather_code: 0 } };
    },
  };
};
const weatherExecutors = createCompanionChatExecutors({
  sharedLocation: { lat: 32.01, lon: 112.1235 },
});
const weatherResult = await weatherExecutors["web.weather.lookup"]({ location: "这里" });
assert.equal(weatherResult.ok, true);
assert.equal(weatherResult.weather.source, "open-meteo");
pass("shared location evidence is used without requesting device permission");
const cityWeather = await weatherExecutors["web.weather.lookup"]({ city: "上海" });
assert.equal(cityWeather.ok, true);
pass("weather operation supports an explicit city without device permission");
const parsedLocation = parseLocationMessage("[位置] 32.01,112.12 - 32.0100, 112.1235");
assert.equal(parsedLocation.lat, 32.01);
assert.equal(parsedLocation.lon, 112.1235);
pass("stored location card restores coordinates on a later turn");

console.log(`verify-tool-run-and-tools: ${n} PASS`);
