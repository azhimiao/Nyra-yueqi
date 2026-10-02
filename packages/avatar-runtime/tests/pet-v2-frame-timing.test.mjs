import assert from "node:assert/strict";
import { loopFrameIndex, onceFinished, onceFrameIndex } from "../../../electron/pet-v2/frame-timing.mjs";

assert.equal(loopFrameIndex(0, 2, 8), 0);
assert.equal(loopFrameIndex(0.12, 2, 8), 0);
assert.equal(loopFrameIndex(0.13, 2, 8), 1);
assert.equal(loopFrameIndex(0.25, 2, 8), 0);

assert.equal(onceFrameIndex(0, 2, 8), 0);
assert.equal(onceFrameIndex(0.2, 2, 8), 1);
assert.equal(onceFinished(0.2, 2, 8), false);
assert.equal(onceFinished(0.25, 2, 8), true);

console.log(JSON.stringify({ ok: true, suite: "pet-v2-frame-timing" }));
