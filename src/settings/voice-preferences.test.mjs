import assert from "node:assert/strict";
import { HOSTED_VOICES } from "../voice/hosted-voices.js";
import { __setHostedSpeechStatusForTests } from "../voice/speech-routing.js";
import { resolveHostedVoiceType } from "./voice-preferences.js";

const empty = { hostedVoiceType: "", hostedVoiceByCharacterId: {} };

__setHostedSpeechStatusForTests({ defaultVoice: "" });
assert.equal(
  resolveHostedVoiceType("char-xingli", empty),
  HOSTED_VOICES[0].id,
  "paid mode falls back to catalog voice without a lab pick",
);

__setHostedSpeechStatusForTests({ defaultVoice: "BV002_streaming" });
assert.equal(
  resolveHostedVoiceType("char-xingli", empty),
  "BV002_streaming",
  "operator defaultVoice wins when the user has not picked",
);

assert.equal(
  resolveHostedVoiceType("char-xingli", {
    hostedVoiceType: "BV700_streaming",
    hostedVoiceByCharacterId: {},
  }),
  "BV700_streaming",
);

assert.equal(
  resolveHostedVoiceType("char-xingli", {
    hostedVoiceType: "BV700_streaming",
    hostedVoiceByCharacterId: { "char-xingli": "zh_female_cancan_mars_bigtts" },
  }),
  "zh_female_cancan_mars_bigtts",
);

__setHostedSpeechStatusForTests({ defaultVoice: "" });
console.log("voice-preferences hosted fallback: ok");
