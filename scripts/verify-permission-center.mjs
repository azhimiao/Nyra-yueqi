import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAPABILITY_STATUS,
  CapabilityPermissionBroker,
} from "../src/capabilities/permission-broker.js";
import { capabilityRowKind, resolveCapabilityRow } from "../src/ui/capability-row.js";

function pass(name) {
  console.log(`PASS ${name}`);
}

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const external = html.match(
  /<section data-settings-view="external"[\s\S]*?<\/section>\s*<section data-settings-view="identity"/,
)?.[0] || "";
assert.ok(external, "permission center markup must exist");

const rows = [...external.matchAll(/data-permission-action="([^"]+)"/g)].map((match) => match[1]);

// 1. Authorization and activation are one operation: no row pairs an authorize
//    control with a second app-level enable toggle.
assert.doesNotMatch(external, /data-mcp-context/);
assert.doesNotMatch(external, /data-request-permission/);
assert.doesNotMatch(external, /<input[^>]+type="checkbox"/);
assert.doesNotMatch(external, /class="[^"]*switch/);
assert.equal(new Set(rows).size, rows.length, "each capability appears exactly once");
pass("no capability exposes both an authorize action and a separate enable toggle");

// 2. Every intended user-facing capability keeps a row.
for (const id of [
  "calendar.read",
  "location.current",
  "notification.send",
  "microphone",
  "camera",
  "media.audio",
  "media.photos",
  "screen.capture",
  "desktop.overlay",
]) {
  assert.ok(rows.includes(id), `capability row missing: ${id}`);
}
assert.ok(!rows.includes("calendar.write"), "calendar write must not be a separate top-level row");
assert.doesNotMatch(external, /原生媒体能力待接入|Photo Picker 待接入/);
pass("intended capability rows are present, including music, photos and screen");

// 3. Successful authorization immediately enables the capability — the OS grant
//    is the whole story, with no internal grant to flip afterwards.
const internalCalls = [];
const internalStore = {
  isGranted(permission) {
    internalCalls.push(["read", permission]);
    return false;
  },
  grant(permission) {
    internalCalls.push(["grant", permission]);
  },
  revoke(permission) {
    internalCalls.push(["revoke", permission]);
  },
};
const broker = new CapabilityPermissionBroker({
  internalStore,
  nativeAdapter: {
    async getCapabilityStatus() {
      return { status: CAPABILITY_STATUS.OS_GRANTED, granted: true };
    },
    async requestCapability() {
      return { status: CAPABILITY_STATUS.OS_GRANTED, granted: true };
    },
  },
});

const microphone = await broker.requestCapability("microphone.capture", { userGesture: true });
assert.equal(microphone.status, CAPABILITY_STATUS.AVAILABLE);
assert.equal(microphone.granted, true);
assert.deepEqual(internalCalls, [], "granting the OS permission must not write an app-level grant");
assert.deepEqual(resolveCapabilityRow("system", "granted"), { state: "on", action: "none" });
pass("granting the system permission immediately enables the capability");

// 4. Session/one-shot capabilities stay visible and tell the truth.
const sessionBroker = new CapabilityPermissionBroker({
  internalStore: { isGranted: () => false, grant() {}, revoke() {} },
  nativeAdapter: {
    async getCapabilityStatus() {
      return { status: CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED, granted: false, sessionScoped: true };
    },
    async requestCapability() {
      return { status: CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED, granted: false, sessionScoped: true };
    },
  },
});
const screen = await sessionBroker.getCapabilityStatus("screen.capture");
assert.equal(screen.status, CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED);
assert.equal(capabilityRowKind("screen.capture"), "session");
assert.deepEqual(resolveCapabilityRow("session", "prompt"), { state: "session", action: "session" });
assert.notEqual(resolveCapabilityRow("session", "prompt").state, "on");
pass("session capabilities stay listed with a truthful per-use status");

// 5. Picker-based capabilities never reach for a broad media/storage permission.
for (const id of ["media.audio", "media.photos"]) {
  assert.equal(capabilityRowKind(id), "picker");
  assert.deepEqual(resolveCapabilityRow("picker", "unsupported"), { state: "session", action: "picker" });
}
const permissionUi = readFileSync(new URL("../src/ui/permissions-ui.js", import.meta.url), "utf8");
assert.match(permissionUi, /capabilityRowKind\(id\) !== "picker"/);
assert.match(permissionUi, /action === "picker" \|\| action === "session"[\s\S]{0,200}return;/);
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
assert.match(app, /async function openFileImport[\s\S]*?inputNode\.click\(\)/);
assert.doesNotMatch(app, /openFileImport[\s\S]{0,300}ensureImportPermission/);
pass("picker capabilities keep their row without requesting broad access");

// Feature entry points still ask just in time.
const voice = readFileSync(new URL("../src/phone-shell/phone-voice.js", import.meta.url), "utf8");
const call = readFileSync(new URL("../src/call/video-call.js", import.meta.url), "utf8");
const assist = readFileSync(new URL("../src/studio-assist/assist-ui.js", import.meta.url), "utf8");
const locationShare = readFileSync(new URL("../src/chat/share-location.js", import.meta.url), "utf8");
assert.match(voice, /ensurePermission\("microphone"\)/);
assert.match(call, /ensurePermission\("camera"\)/);
assert.match(call, /ensurePermission\("microphone"\)/);
assert.match(assist, /ensurePermission\("microphone"\)/);
assert.match(locationShare, /ensurePermission\("location\.current"\)/);
pass("microphone, camera and location remain just-in-time requests");

console.log("Permission center verification PASSED");
