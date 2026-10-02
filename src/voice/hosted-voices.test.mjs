import assert from "node:assert/strict";

import {
  HOSTED_VOICES,
  defaultHostedVoiceId,
  hostedVoiceLabel,
  isHostedVoiceId,
  listHostedVoices,
  normalizeHostedVoiceId,
} from "./hosted-voices.js";

assert.ok(HOSTED_VOICES.length >= 4);
assert.ok(HOSTED_VOICES.every((voice) => voice.id && voice.nameZh && voice.nameEn && voice.gender));
assert.ok(HOSTED_VOICES.some((voice) => voice.gender === "female"));
assert.ok(HOSTED_VOICES.some((voice) => voice.gender === "male"));
assert.equal(isHostedVoiceId("zh_female_cancan_mars_bigtts"), true);
assert.equal(isHostedVoiceId("BV001_streaming"), true);
assert.equal(isHostedVoiceId("zh_male_uranus_bigtts"), false, "TTS 2.0 speakers stay off the Hosted menu");
assert.equal(normalizeHostedVoiceId("  BV700_streaming  "), "BV700_streaming");
assert.equal(normalizeHostedVoiceId("not-a-voice"), "");
assert.equal(hostedVoiceLabel(HOSTED_VOICES[0], "zh-CN"), HOSTED_VOICES[0].nameZh);
assert.equal(hostedVoiceLabel(HOSTED_VOICES[0], "en"), HOSTED_VOICES[0].nameEn);
assert.equal(listHostedVoices()[0].id, HOSTED_VOICES[0].id);
assert.notEqual(listHostedVoices()[0], HOSTED_VOICES[0], "list copies so callers cannot mutate the catalog");
assert.equal(defaultHostedVoiceId(""), HOSTED_VOICES[0].id);
assert.equal(defaultHostedVoiceId("BV002_streaming"), "BV002_streaming");
assert.equal(defaultHostedVoiceId("not-a-voice"), HOSTED_VOICES[0].id);

console.log("hosted-voices.test: ok");
