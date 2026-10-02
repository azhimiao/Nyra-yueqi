import assert from "node:assert/strict";
import { resolveUpdatePolicy } from "./update-policy.mjs";

const base = {
  schemaVersion: 2,
  channel: "stable",
  latestVersion: "1.2.0",
  minimumVersion: "1.0.0",
  mandatory: false,
  downloadUrl: "https://download.memprism.com/nyra-latest.apk",
  notes: { "zh-CN": "修复与体验更新", en: "Fixes and improvements" },
};

assert.equal(resolveUpdatePolicy("1.2.0", base, "zh-CN").kind, "none");

const optional = resolveUpdatePolicy("1.1.0", base, "en");
assert.equal(optional.kind, "optional");
assert.equal(optional.notes, "Fixes and improvements");

const minimumForced = resolveUpdatePolicy("0.9.9", base, "zh-CN");
assert.equal(minimumForced.kind, "forced");
assert.equal(minimumForced.reason, "minimum_version");

const releaseForced = resolveUpdatePolicy("1.1.0", {
  ...base,
  mandatory: true,
}, "zh-CN");
assert.equal(releaseForced.kind, "forced");
assert.equal(releaseForced.reason, "release_mandatory");

assert.equal(resolveUpdatePolicy("1.0.0", {
  ...base,
  latestVersion: "not-a-version",
}, "zh-CN").kind, "invalid");

assert.equal(resolveUpdatePolicy("1.0.0", {
  ...base,
  downloadUrl: "http://download.memprism.com/app.apk",
}, "zh-CN").kind, "invalid");

console.log("update-policy.test: ok");
