import assert from "node:assert/strict";

import { SPEECH_ROUTE, resolveSpeechRoute } from "./speech-routing.js";

// A device key always wins: it is the only route that costs the user nothing.
assert.equal(
  resolveSpeechRoute({ hasDeviceKey: true, managed: true, hostedAvailable: true, deviceVoiceAvailable: true }),
  SPEECH_ROUTE.BYOK,
);

// Subscribers get cloud speech without configuring anything.
assert.equal(
  resolveSpeechRoute({ managed: true, hostedAvailable: true, deviceVoiceAvailable: true }),
  SPEECH_ROUTE.HOSTED,
);

// Hosted speech is not handed to sessions that are not subscribed.
assert.equal(
  resolveSpeechRoute({ managed: false, hostedAvailable: true, deviceVoiceAvailable: true }),
  SPEECH_ROUTE.DEVICE,
);

// Without a supplier, the built-in system voice keeps speech working for free.
assert.equal(
  resolveSpeechRoute({ managed: true, hostedAvailable: false, deviceVoiceAvailable: true }),
  SPEECH_ROUTE.DEVICE,
);

// Only a device with no voice at all reports "none", which is the one case the
// UI should complain about.
assert.equal(resolveSpeechRoute({}), SPEECH_ROUTE.NONE);
assert.equal(
  resolveSpeechRoute({ managed: true, hostedAvailable: false, deviceVoiceAvailable: false }),
  SPEECH_ROUTE.NONE,
);

console.log("speech-routing.test: ok");
