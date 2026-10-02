/**
 * CP-AV6 — product host IPC mapping + deepLink receipt (no Electron).
 */
import assert from "node:assert/strict";
import {
  resolvePetV2PushChannel,
  handlePetV2DeepLinkPayload,
  isPetV2LaunchEnabled,
  isConcretePetDeepLink,
} from "../../../electron/pet-v2/product-ipc.mjs";
import { buildOpenedReceipt } from "../src/product-adapter.mjs";
import { createPetV2Bridge } from "../../../src/host/pet-v2-bridge.js";

assert.equal(resolvePetV2PushChannel("pet-v2:embodimentStateChanged"), "pet-v2:embodimentStateChanged");
assert.equal(resolvePetV2PushChannel("pet-v2:characterChanged"), "pet-v2:characterChanged");
assert.equal(resolvePetV2PushChannel("pet-v2:artifactReady"), "pet-v2:artifactReady");
assert.equal(resolvePetV2PushChannel("pet-v2:speechAmplitude"), "pet-v2:speechAmplitude");
assert.equal(resolvePetV2PushChannel("pet-v2:playAction"), "pet-v2:playAction");
assert.equal(resolvePetV2PushChannel("pet-v2:push-embodiment"), "pet-v2:embodimentStateChanged");
assert.equal(resolvePetV2PushChannel("pet-v2:evil"), null);

assert.equal(isConcretePetDeepLink("/diary/diary_1"), true);
assert.equal(isConcretePetDeepLink("/phone"), false);

assert.equal(isPetV2LaunchEnabled(["node", "main.mjs", "--pet-v2"], {}), true);
assert.equal(isPetV2LaunchEnabled(["node", "main.mjs"], { YUEQI_PET_V2: "1" }), true);
assert.equal(isPetV2LaunchEnabled(["node", "main.mjs"], {}), false);

const opened = handlePetV2DeepLinkPayload(
  { artifactId: "diary_1", deepLink: "/diary/diary_1" },
  { buildOpenedReceipt },
);
assert.equal(opened.ok, true);
assert.equal(opened.route.deepLink, "/diary/diary_1");
assert.equal(opened.receipt.type, "artifact.opened");

const rejected = handlePetV2DeepLinkPayload(
  { artifactId: "x", deepLink: "/phone" },
  { buildOpenedReceipt },
);
assert.equal(rejected.ok, false);
assert.equal(rejected.reason, "phone_home_forbidden");

const sent = [];
const bridge = createPetV2Bridge({
  sendToPet: (channel, payload) => sent.push({ channel, payload }),
  openDeepLink: async (url) => {
    sent.push({ channel: "open", payload: url });
  },
});
bridge.dispatch({ type: "pop.generating" });
assert.ok(sent.some((s) => s.channel === "pet-v2:embodimentStateChanged"));
assert.ok(sent.some((s) => s.channel === "pet-v2:playAction" && s.payload === "thinking"));

bridge.dispatch({
  type: "artifact.ready",
  payload: {
    artifactId: "diary_1",
    type: "diary",
    deepLink: "/diary/diary_1",
  },
});
assert.ok(sent.some((s) => s.channel === "pet-v2:artifactReady"));

const receipt = await bridge.onPetDeepLink({
  artifactId: "diary_1",
  deepLink: "/diary/diary_1",
});
assert.equal(receipt.ok, true);
assert.equal(receipt.receipt.type, "artifact.opened");

const home = await bridge.onPetDeepLink({ deepLink: "/phone" });
assert.equal(home.ok, false);

console.log(JSON.stringify({ ok: true, suite: "avatar-product-host" }));
