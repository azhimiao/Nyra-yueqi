import assert from "node:assert/strict";
import {
  reduceProductEvent,
  createIdleEmbodiment,
  buildOpenedReceipt,
  mouthFromAmplitude,
} from "../src/product-adapter.mjs";

const idle = createIdleEmbodiment();
const think = reduceProductEvent({ type: "pop.generating" }, idle);
assert.equal(think.state.mode, "thinking");
assert.equal(think.actionId, "thinking");

const speak = reduceProductEvent(
  { type: "pop.tts_start", payload: { amplitude: 0.7 } },
  think.state,
);
assert.equal(speak.state.mode, "speaking");
assert.ok(speak.state.mouthOpen >= 0.5);

const amp = mouthFromAmplitude(0.05, 0.8);
assert.equal(amp, 0); // drops to closed

assert.throws(() =>
  reduceProductEvent(
    { type: "artifact.ready", payload: { artifactId: "d1", type: "diary", deepLink: "/phone" } },
    idle,
  ),
);

const art = reduceProductEvent(
  {
    type: "artifact.ready",
    payload: {
      artifactId: "diary_1",
      type: "diary",
      deepLink: "/diary/diary_1",
      previewUrl: "/x.png",
    },
  },
  idle,
);
assert.equal(art.actionId, "show_artifact");
assert.equal(art.state.artifact.deepLink, "/diary/diary_1");

const receipt = buildOpenedReceipt({
  artifactId: art.state.artifact.artifactId,
  deepLink: art.state.artifact.deepLink,
});
assert.equal(receipt.type, "artifact.opened");

console.log(JSON.stringify({ ok: true, suite: "avatar-deep-link" }));
