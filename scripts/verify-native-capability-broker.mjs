import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAPABILITY_IDS,
  getDeviceCapability,
  listDeviceCapabilities,
} from "../src/capabilities/device-registry.js";
import {
  CAPABILITY_STATUS,
  CapabilityPermissionBroker,
  capabilityFailure,
} from "../src/capabilities/permission-broker.js";
import { executeDeviceTool } from "../src/capabilities/device-tools.js";

function ok(name) {
  console.log(`PASS ${name}`);
}

const expected = [
  "desktop.overlay",
  "microphone.capture",
  "voice.input",
  "voice.output",
  "camera.capture",
  "camera.preview",
  "location.current",
  "location.background",
  "screen.capture",
  "screen.observe",
  "notification.send",
  "calendar.internal",
  "calendar.read",
  "calendar.write",
];

assert.deepEqual(CAPABILITY_IDS, expected);
assert.equal(listDeviceCapabilities().length, expected.length);
assert.deepEqual(getDeviceCapability("calendar.read").androidPermissions, [
  "android.permission.READ_CALENDAR",
]);
assert.equal(getDeviceCapability("screen.capture").sessionScoped, true);
assert.equal(getDeviceCapability("screen.observe").implemented, false);
assert.equal(getDeviceCapability("location.background").implemented, false);
assert.equal(getDeviceCapability("voice.output").internalPermission, "voice.output");
assert.equal(getDeviceCapability("calendar.read").internalPermission, "calendar.read");
assert.notEqual(
  getDeviceCapability("calendar.read").internalPermission,
  "storage",
  "system calendar must never alias storage",
);
ok("device capability registry is complete and calendar is not storage");

const internal = new Map();
const nativeStates = new Map([
  ["microphone.capture", { status: CAPABILITY_STATUS.OS_GRANTED, granted: true }],
  ["camera.capture", { status: CAPABILITY_STATUS.OS_NOT_REQUESTED, granted: false, canAskAgain: true }],
  ["screen.capture", {
    status: CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED,
    granted: false,
    canAskAgain: true,
    sessionScoped: true,
  }],
]);
const requested = [];
const nativeAdapter = {
  async getCapabilityStatus(capability) {
    return nativeStates.get(capability) || {
      status: CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE,
      granted: false,
    };
  },
  async requestCapability(capability) {
    requested.push(capability);
    nativeStates.set(capability, { status: CAPABILITY_STATUS.OS_GRANTED, granted: true });
    return nativeStates.get(capability);
  },
  async openSystemPermissionSettings() {
    return { opened: true };
  },
};
const internalStore = {
  isGranted: (permission) => internal.get(permission) === true,
  grant: (permission) => internal.set(permission, true),
  revoke: (permission) => internal.set(permission, false),
};
const broker = new CapabilityPermissionBroker({ nativeAdapter, internalStore });

let unavailable = await broker.getCapabilityStatus("screen.observe");
assert.equal(unavailable.status, CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE);
assert.equal(unavailable.reason, "CAPABILITY_NOT_IMPLEMENTED");

let state = await broker.getCapabilityStatus("microphone.capture");
assert.equal(state.status, CAPABILITY_STATUS.AVAILABLE);
assert.equal(state.osStatus, CAPABILITY_STATUS.OS_GRANTED);
assert.equal(internal.size, 0, "persistent OS capabilities must not create a duplicate app grant");

state = await broker.requestCapability("microphone.capture", { userGesture: true });
assert.equal(state.granted, true);
assert.equal(state.status, CAPABILITY_STATUS.AVAILABLE);
assert.deepEqual(requested, [], "already-granted OS permission must not be requested again");

state = await broker.ensureCapability("camera.capture");
assert.equal(state.ok, false);
assert.equal(state.code, "USER_GESTURE_REQUIRED");
assert.equal(state.canRequestNow, true);
assert.deepEqual(requested, [], "agent preflight must not open permission UI");

state = await broker.ensureCapability("camera.capture", {
  allowRequest: true,
  userGesture: true,
});
assert.equal(state.ok, true);
assert.deepEqual(requested, ["camera.capture"]);

nativeStates.set("camera.capture", {
  status: CAPABILITY_STATUS.OS_DENIED_PERMANENTLY,
  granted: false,
  canAskAgain: false,
  needsSettings: true,
});
state = await broker.getCapabilityStatus("camera.capture");
assert.equal(state.status, CAPABILITY_STATUS.OS_DENIED_PERMANENTLY);
assert.equal(state.granted, false);
assert.equal(state.needsSettings, true);

state = await broker.requestCapability("screen.capture", { userGesture: true });
assert.equal(state.status, CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED);
assert.equal(state.sessionScoped, true);
state = await broker.ensureCapability("screen.capture", {
  allowSessionConsent: true,
  userGesture: true,
});
assert.equal(state.ok, true);
assert.equal(state.sessionConsentRequired, true);

await broker.revokeInternalCapability("microphone.capture");
state = await broker.getCapabilityStatus("microphone.capture");
assert.equal(state.status, CAPABILITY_STATUS.AVAILABLE);

const failure = capabilityFailure("camera.capture", {
  status: CAPABILITY_STATUS.OS_DENIED_PERMANENTLY,
  canAskAgain: false,
  needsSettings: true,
});
assert.deepEqual(failure, {
  ok: false,
  code: "PERMISSION_REQUIRED",
  capability: "camera.capture",
  status: CAPABILITY_STATUS.OS_DENIED_PERMANENTLY,
  canRequestNow: false,
  needsSettings: true,
  sessionScoped: false,
  reason: "OS_DENIED_PERMANENTLY",
});
ok("permission broker combines internal consent, OS state and session consent");

const deniedTool = await executeDeviceTool("calendar.list_events", {}, {
  broker: {
    ensureCapability: async () => ({
      ok: false,
      code: "PERMISSION_REQUIRED",
      capability: "calendar.read",
      canRequestNow: true,
    }),
  },
});
assert.deepEqual(deniedTool, {
  ok: false,
  code: "PERMISSION_REQUIRED",
  capability: "calendar.read",
  canRequestNow: true,
  tool: "calendar.list_events",
});
ok("real-device tools stop at broker preflight and return structured failure");

const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
for (const permission of [
  "SYSTEM_ALERT_WINDOW",
  "RECORD_AUDIO",
  "CAMERA",
  "ACCESS_COARSE_LOCATION",
  "ACCESS_FINE_LOCATION",
  "ACCESS_BACKGROUND_LOCATION",
  "POST_NOTIFICATIONS",
  "READ_CALENDAR",
  "WRITE_CALENDAR",
  "FOREGROUND_SERVICE_MEDIA_PROJECTION",
]) {
  assert.match(manifest, new RegExp(`android\\.permission\\.${permission}`));
}
assert.match(manifest, /foregroundServiceType="specialUse\|mediaProjection"/);
ok("targetSdk 34 manifest declares concrete capability permissions and service types");

const executor = readFileSync(new URL("../src/turn-understanding/executor.js", import.meta.url), "utf8");
assert.match(executor, /executeDeviceTool/);
assert.match(executor, /calendar\.read\.list_events/);
assert.match(executor, /camera\.capture\.capture/);
assert.match(executor, /allowPermissionRequest/);
assert.match(executor, /forceApproval/);
assert.match(executor, /dispatchEphemeralDeviceMedia/);
assert.match(executor, /temporary_image_attachment/);
ok("companion ActionProposal execution routes device actions through brokered tools");

const overlayApp = readFileSync(new URL("../src/overlay/overlay-app.js", import.meta.url), "utf8");
assert.match(overlayApp, /function captureViaAndroid/);
assert.match(overlayApp, /__yueqiNativeCaptureResult/);
assert.match(overlayApp, /getAndroidBridge\(\)\?\.captureScreen/);
ok("Android overlay capture uses native MediaProjection instead of getDisplayMedia");

const permissionUi = readFileSync(new URL("../src/ui/permissions-ui.js", import.meta.url), "utf8");
assert.match(permissionUi, /data-permission-action/);
assert.doesNotMatch(permissionUi, /checkbox\.checked = false/);
ok("permission center uses the OS state without a duplicate app switch");
