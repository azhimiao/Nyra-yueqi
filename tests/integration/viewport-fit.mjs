import assert from "node:assert/strict";
import { measureKeyboardInset } from "../../src/platform/viewport-fit.js";

const cases = [
  {
    name: "uses the native IME inset",
    args: { innerHeight: 844, nativeIme: 320 },
    expected: 320,
  },
  {
    name: "uses the visual viewport inset when native data is unavailable",
    args: {
      innerHeight: 844,
      visualViewport: { height: 524, offsetTop: 0 },
    },
    expected: 320,
  },
  {
    name: "keeps the larger measured source",
    args: {
      innerHeight: 844,
      visualViewport: { height: 564, offsetTop: 0 },
      nativeIme: 320,
    },
    expected: 320,
  },
  {
    name: "never invents an inset from focus alone",
    args: { innerHeight: 844, guessedIme: 321 },
    expected: 0,
  },
  {
    name: "clamps stale or wrongly scaled native values",
    args: { innerHeight: 844, nativeIme: 1200 },
    expected: 608,
  },
  {
    name: "normalizes negative values",
    args: {
      innerHeight: 844,
      visualViewport: { height: 900, offsetTop: 0 },
      nativeIme: -50,
    },
    expected: 0,
  },
];

for (const testCase of cases) {
  assert.equal(
    measureKeyboardInset(testCase.args),
    testCase.expected,
    testCase.name,
  );
  console.log(`PASS ${testCase.name}`);
}

console.log("All viewport-fit checks passed.");
