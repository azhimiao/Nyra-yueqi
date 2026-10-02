/**
 * CapabilityOperationV2 registry — one descriptor per catalogue operation.
 *
 * Risk, approval, schemas and executorId are hardcoded here. They are never
 * read from the model, imported character text, or runtime.parameters.
 * Availability is computed by intersecting descriptor gates with runtime state.
 */

import {
  createCapabilityOperationV2,
  validateCapabilityOperationV2,
} from "../contracts/capability-operation-v2.js";
import { listCapabilities } from "./registry.js";

export const CAPABILITY_OPERATION_V2_REGISTRY_VERSION = "2.0";

export const OPERATION_REASON_CODES = Object.freeze({
  notImplemented: "not_implemented",
  featureFlag: "feature_flag",
  platformUnsupported: "platform_unsupported",
  permissionRequired: "permission_required",
  networkRequired: "network_required",
  accountRequired: "account_required",
  providerRequired: "provider_required",
  foregroundRequired: "foreground_required",
  approvalRequired: "approval_required",
  unknownOperation: "unknown_operation",
});

const ALIASES = Object.freeze({
  "calendar-crud": "calendar",
  "web.retrieval": "web.search",
  "web.fetch": "web.search",
});

const APPROVAL_ALWAYS_BLOCKS = Object.freeze([
  "requiresApproval",
  "required",
  "writes",
  "always",
  "always-twice",
]);

const FORBIDDEN_FN_KEYS = Object.freeze(["executor", "undoExecutor", "fn", "handler"]);

/** @type {Map<string, object>} */
const OPERATIONS = new Map();

function schema(properties = {}, required) {
  const out = { type: "object", properties };
  if (Array.isArray(required) && required.length) out.required = required;
  return out;
}

function operationKey(capabilityId, operation) {
  const rawId = String(capabilityId || "").trim();
  const id = ALIASES[rawId] || rawId;
  return `${id}.${String(operation || "").trim()}`;
}

function freezeDescriptor(created) {
  return Object.freeze({
    ...created,
    inputSchema: Object.freeze({ ...created.inputSchema }),
    outputSchema: Object.freeze({ ...created.outputSchema }),
    reasonCodes: Object.freeze([...created.reasonCodes]),
    requires: Object.freeze({ ...created.requires }),
    ...(Array.isArray(created.platforms) ? { platforms: Object.freeze([...created.platforms]) } : {}),
  });
}

function registerOperation(input) {
  const created = createCapabilityOperationV2(input);
  for (const key of FORBIDDEN_FN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(created, key)) {
      throw new Error(`CapabilityOperationV2 forbids ${key} on ${created.capabilityId}.${created.operation}`);
    }
  }
  const validated = validateCapabilityOperationV2(created);
  if (!validated.ok) {
    throw new Error(
      `Invalid CapabilityOperationV2 ${created.capabilityId}.${created.operation}: ${JSON.stringify(validated.errors)}`,
    );
  }
  const frozen = freezeDescriptor(created);
  OPERATIONS.set(`${frozen.capabilityId}.${frozen.operation}`, frozen);
  return frozen;
}

function define(partial) {
  const implemented = partial.implemented !== false;
  const { implemented: _implemented, ...fields } = partial;
  return registerOperation({
    discoverable: true,
    requestable: implemented,
    executable: implemented,
    reasonCodes: implemented ? [] : [OPERATION_REASON_CODES.notImplemented],
    receiptRequired: true,
    reversible: false,
    idempotencyKeyPolicy: "none",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    requires: {},
    ...fields,
  });
}

function cloneOperation(op) {
  return {
    ...op,
    inputSchema: { ...op.inputSchema },
    outputSchema: { ...op.outputSchema },
    reasonCodes: [...(op.reasonCodes || [])],
    requires: { ...(op.requires || {}) },
    ...(op.platforms ? { platforms: [...op.platforms] } : {}),
  };
}

const sourceList = { type: "array", items: { type: "object" } };

define({
  capabilityId: "web.weather",
  operation: "lookup",
  description: "查询指定城市或坐标的天气；若用户已经分享坐标，直接使用它，不要再次读取设备定位权限。",
  risk: "R0",
  approval: "none",
  executorId: "turn-understanding/weather",
  idempotencyKeyPolicy: "per-request",
  reversible: true,
  requires: { network: true },
  inputSchema: schema({
    city: { type: "string" },
    location: { type: "string" },
    whenText: { type: "string" },
    query: { type: "string" },
  }),
  outputSchema: schema({
    summary: { type: "string" },
    weather: { type: "object" },
    sources: sourceList,
    fetchedAt: { type: "string" },
  }),
});

define({
  capabilityId: "web.search",
  operation: "search",
  risk: "R0",
  approval: "none",
  featureFlag: "webRetrievalV1",
  executorId: "turn-understanding/web-search",
  idempotencyKeyPolicy: "per-request",
  reversible: true,
  requires: { network: true },
  inputSchema: schema({ query: { type: "string" } }, ["query"]),
  outputSchema: schema({
    summary: { type: "string" },
    evidence: sourceList,
    sources: sourceList,
    fetchedAt: { type: "string" },
    memoryPolicy: { type: "object" },
  }),
});

const calendarReadOut = schema({
  summary: { type: "string" },
  preview: { type: "object" },
  events: { type: "array" },
  freeSlots: { type: "array" },
});

define({
  capabilityId: "calendar",
  operation: "list",
  risk: "R0",
  approval: "none",
  executorId: "turn-understanding/calendar",
  reversible: true,
  requires: { permission: "calendar.internal" },
  inputSchema: schema({ date: { type: "string" } }),
  outputSchema: calendarReadOut,
});

define({
  capabilityId: "calendar",
  operation: "read",
  risk: "R0",
  approval: "none",
  executorId: "turn-understanding/calendar",
  reversible: true,
  requires: { permission: "calendar.internal" },
  inputSchema: schema({ date: { type: "string" }, eventId: { type: "string" } }),
  outputSchema: calendarReadOut,
});

define({
  capabilityId: "calendar",
  operation: "free",
  risk: "R0",
  approval: "none",
  executorId: "turn-understanding/calendar",
  reversible: true,
  requires: { permission: "calendar.internal" },
  inputSchema: schema({ date: { type: "string" } }),
  outputSchema: calendarReadOut,
});

const calendarWriteIn = schema({
  title: { type: "string" },
  date: { type: "string" },
  time: { type: "string" },
  startsAt: { type: "string" },
  whenText: { type: "string" },
  hour: { type: "number" },
  minute: { type: "number" },
  prompt: { type: "string" },
});
const calendarWriteOut = schema({
  eventId: { type: "string" },
  event: { type: "object" },
  summary: { type: "string" },
  artifactId: { type: "string" },
});

define({
  capabilityId: "calendar",
  operation: "create",
  risk: "R2",
  approval: "requiresApproval",
  executorId: "turn-understanding/calendar",
  idempotencyKeyPolicy: "proposalId",
  reversible: true,
  requires: { permission: "calendar.internal" },
  inputSchema: calendarWriteIn,
  outputSchema: calendarWriteOut,
});

define({
  capabilityId: "calendar",
  operation: "create_reminder",
  risk: "R2",
  approval: "requiresApproval",
  executorId: "turn-understanding/calendar",
  idempotencyKeyPolicy: "proposalId",
  reversible: true,
  requires: { permission: "calendar.internal" },
  inputSchema: calendarWriteIn,
  outputSchema: calendarWriteOut,
});

define({
  capabilityId: "calendar-draft",
  operation: "create_draft",
  risk: "R1",
  approval: "explicit-command",
  executorId: "turn-understanding/calendar-draft",
  idempotencyKeyPolicy: "proposalId",
  reversible: true,
  inputSchema: schema({
    text: { type: "string" },
    title: { type: "string" },
    whenText: { type: "string" },
  }),
  outputSchema: schema({
    artifactId: { type: "string" },
    artifact: { type: "object" },
    summary: { type: "string" },
  }),
});

define({
  capabilityId: "companion.diary",
  operation: "create",
  risk: "R1",
  approval: "explicit-command",
  executorId: "companion/diary-action",
  idempotencyKeyPolicy: "proposalId",
  reversible: true,
  inputSchema: schema({
    companionId: { type: "string" },
    diaryDay: { type: "string" },
    overwrite: { type: "boolean" },
  }),
  outputSchema: schema({
    artifactId: { type: "string" },
    summary: { type: "string" },
  }),
});

define({
  capabilityId: "companion.selfie",
  operation: "create",
  risk: "R1",
  approval: "explicit-command",
  executorId: "companion/selfie",
  idempotencyKeyPolicy: "proposalId",
  requires: { provider: "imagegen" },
  inputSchema: schema({
    companionId: { type: "string" },
    request: { type: "string" },
  }),
  outputSchema: schema({
    artifactId: { type: "string" },
    mediaId: { type: "string" },
    summary: { type: "string" },
  }),
});

define({
  capabilityId: "assistant.task",
  operation: "create",
  risk: "R1",
  approval: "policy",
  executorId: "studio-assist/task-runtime",
  idempotencyKeyPolicy: "proposalId",
  reversible: true,
  inputSchema: schema({
    title: { type: "string" },
    prompt: { type: "string" },
    kind: { type: "string" },
  }),
  outputSchema: schema({
    taskId: { type: "string" },
    summary: { type: "string" },
  }),
});

define({
  capabilityId: "runtime.avatar",
  operation: "act",
  risk: "R0",
  approval: "none",
  executorId: "runtime/protocol-v1",
  reversible: true,
  inputSchema: schema({ action: { type: "string" } }, ["action"]),
  outputSchema: schema({ applied: { type: "boolean" }, action: { type: "string" } }),
});

define({
  capabilityId: "runtime.avatar",
  operation: "express",
  risk: "R0",
  approval: "none",
  executorId: "runtime/protocol-v1",
  reversible: true,
  inputSchema: schema({ expression: { type: "string" } }, ["expression"]),
  outputSchema: schema({ applied: { type: "boolean" }, expression: { type: "string" } }),
});

define({
  capabilityId: "artifact.show",
  operation: "show",
  risk: "R0",
  approval: "none",
  executorId: "artifacts/delivery",
  reversible: true,
  inputSchema: schema({ artifactId: { type: "string" } }, ["artifactId"]),
  outputSchema: schema({ artifactId: { type: "string" }, delivered: { type: "boolean" } }),
});

define({
  capabilityId: "microphone.capture",
  operation: "get_status",
  risk: "R1",
  approval: "user-gesture",
  executorId: "device-tools/microphone",
  reversible: true,
  inputSchema: schema({}),
  outputSchema: schema({ state: { type: "object" } }),
});

define({
  capabilityId: "voice.input",
  operation: "listen",
  risk: "R1",
  approval: "user-gesture",
  executorId: "device-tools/voice-input",
  idempotencyKeyPolicy: "per-request",
  requires: { permission: "voice.input", foreground: true },
  inputSchema: schema({ durationMs: { type: "number" } }),
  outputSchema: schema({ transcript: { type: "string" }, durationMs: { type: "number" } }),
});

define({
  capabilityId: "voice.output",
  operation: "speak",
  risk: "R0",
  approval: "none",
  executorId: "device-tools/voice-output",
  idempotencyKeyPolicy: "per-request",
  reversible: true,
  inputSchema: schema({ text: { type: "string" } }, ["text"]),
  outputSchema: schema({ spoken: { type: "boolean" } }),
});

define({
  capabilityId: "camera.capture",
  operation: "get_status",
  risk: "R1",
  approval: "user-gesture",
  executorId: "device-tools/camera",
  reversible: true,
  inputSchema: schema({}),
  outputSchema: schema({ state: { type: "object" } }),
});

define({
  capabilityId: "camera.capture",
  operation: "capture",
  risk: "R2",
  approval: "always",
  executorId: "device-tools/camera",
  idempotencyKeyPolicy: "per-request",
  requires: { permission: "camera", foreground: true },
  inputSchema: schema({ facingMode: { type: "string" } }),
  outputSchema: schema({
    artifactId: { type: "string" },
    mimeType: { type: "string" },
    representation: { type: "string" },
  }),
});

define({
  capabilityId: "location.current",
  operation: "get_current",
  risk: "R1",
  approval: "user-gesture",
  executorId: "device-tools/location",
  idempotencyKeyPolicy: "per-request",
  requires: { permission: "location", foreground: true },
  inputSchema: schema({ accuracy: { type: "string" } }),
  outputSchema: schema({ location: { type: "object" } }),
});

define({
  capabilityId: "screen.capture",
  operation: "capture",
  risk: "R2",
  approval: "always",
  executorId: "device-tools/screen-capture",
  idempotencyKeyPolicy: "per-request",
  platforms: ["android", "electron", "web"],
  requires: { permission: "screen.capture", foreground: true },
  inputSchema: schema({}),
  outputSchema: schema({
    artifactId: { type: "string" },
    representation: { type: "string" },
  }),
});

define({
  capabilityId: "screen.observe",
  operation: "start",
  implemented: false,
  risk: "R2",
  approval: "always",
  executorId: "device-tools/screen-observe",
  platforms: ["android", "electron", "web"],
  requires: { permission: "screen.observe", foreground: true },
  inputSchema: schema({}),
  outputSchema: schema({ sessionId: { type: "string" } }),
});

define({
  capabilityId: "screen.observe",
  operation: "stop",
  implemented: false,
  risk: "R2",
  approval: "always",
  executorId: "device-tools/screen-observe",
  platforms: ["android", "electron", "web"],
  requires: { permission: "screen.observe" },
  inputSchema: schema({ sessionId: { type: "string" } }),
  outputSchema: schema({ stopped: { type: "boolean" } }),
});

define({
  capabilityId: "notification.send",
  operation: "send",
  risk: "R1",
  approval: "user-gesture",
  executorId: "device-tools/notification",
  idempotencyKeyPolicy: "per-request",
  requires: { permission: "notification" },
  inputSchema: schema({
    title: { type: "string" },
    body: { type: "string" },
  }, ["body"]),
  outputSchema: schema({ sent: { type: "boolean" } }),
});

const androidCalendarReadIn = schema({
  calendarId: { type: "string" },
  eventId: { type: "string" },
  start: { type: "string" },
  end: { type: "string" },
});

define({
  capabilityId: "calendar.read",
  operation: "list_calendars",
  risk: "R1",
  approval: "user-gesture",
  executorId: "device-tools/calendar-read",
  platforms: ["android"],
  requires: { permission: "calendar.read", foreground: true },
  inputSchema: schema({}),
  outputSchema: schema({ calendars: { type: "array" } }),
});

define({
  capabilityId: "calendar.read",
  operation: "list_events",
  risk: "R1",
  approval: "user-gesture",
  executorId: "device-tools/calendar-read",
  platforms: ["android"],
  requires: { permission: "calendar.read", foreground: true },
  inputSchema: androidCalendarReadIn,
  outputSchema: schema({ events: { type: "array" } }),
});

define({
  capabilityId: "calendar.read",
  operation: "get_event",
  risk: "R1",
  approval: "user-gesture",
  executorId: "device-tools/calendar-read",
  platforms: ["android"],
  requires: { permission: "calendar.read", foreground: true },
  inputSchema: schema({ eventId: { type: "string" } }, ["eventId"]),
  outputSchema: schema({ event: { type: "object" } }),
});

const androidCalendarWriteOut = schema({
  eventId: { type: "string" },
  event: { type: "object" },
  summary: { type: "string" },
});

define({
  capabilityId: "calendar.write",
  operation: "create_event",
  risk: "R2",
  approval: "requiresApproval",
  executorId: "device-tools/calendar-write",
  idempotencyKeyPolicy: "proposalId",
  reversible: true,
  platforms: ["android"],
  requires: { permission: "calendar.write", foreground: true },
  inputSchema: schema({
    title: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    calendarId: { type: "string" },
  }, ["title"]),
  outputSchema: androidCalendarWriteOut,
});

define({
  capabilityId: "calendar.write",
  operation: "update_event",
  risk: "R2",
  approval: "requiresApproval",
  executorId: "device-tools/calendar-write",
  idempotencyKeyPolicy: "proposalId",
  reversible: true,
  platforms: ["android"],
  requires: { permission: "calendar.write", foreground: true },
  inputSchema: schema({
    eventId: { type: "string" },
    title: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
  }, ["eventId"]),
  outputSchema: androidCalendarWriteOut,
});

define({
  capabilityId: "calendar.write",
  operation: "delete_event",
  risk: "R2",
  approval: "requiresApproval",
  executorId: "device-tools/calendar-write",
  idempotencyKeyPolicy: "proposalId",
  platforms: ["android"],
  requires: { permission: "calendar.write", foreground: true },
  inputSchema: schema({ eventId: { type: "string" } }, ["eventId"]),
  outputSchema: schema({ deleted: { type: "boolean" }, eventId: { type: "string" } }),
});

define({
  capabilityId: "messaging.external",
  operation: "send_message",
  implemented: false,
  risk: "R3",
  approval: "always-twice",
  executorId: "host-adapter-required",
  idempotencyKeyPolicy: "proposalId",
  requires: { permission: "messaging.external", account: "host-contacts" },
  inputSchema: schema({
    to: { type: "string" },
    body: { type: "string" },
  }, ["to", "body"]),
  outputSchema: schema({ sent: { type: "boolean" } }),
});

(function assertRegistryCoverage() {
  const missing = [];
  for (const row of listCapabilities({ includeUnavailable: true })) {
    for (const operation of row.operations) {
      const key = `${row.id}.${operation}`;
      if (!OPERATIONS.has(key)) missing.push(key);
    }
  }
  if (missing.length) {
    throw new Error(`CapabilityOperationV2 coverage missing: ${missing.join(", ")}`);
  }
}());

export function getCapabilityOperation(capabilityId, operation = "") {
  const found = OPERATIONS.get(operationKey(capabilityId, operation));
  return found ? cloneOperation(found) : null;
}

export function listCapabilityOperations() {
  return [...OPERATIONS.values()].map(cloneOperation);
}

export const getCapabilityOperationV2 = getCapabilityOperation;
export const listCapabilityOperationsV2 = listCapabilityOperations;

function featureFlagsFrom(runtime) {
  const flags = runtime?.featureFlags || runtime?.flags;
  return flags && typeof flags === "object" ? flags : {};
}

function hasNamedGrant(bag, required) {
  if (required === true) {
    return bag === true || (typeof bag === "string" && bag.length > 0);
  }
  if (typeof required !== "string" || !required) return true;
  if (bag === true) return true;
  if (bag === required) return true;
  if (Array.isArray(bag)) return bag.includes(required);
  if (bag && typeof bag === "object") return bag[required] === true;
  return false;
}

function approvalBlocksExecution(desc, runtime) {
  const approval = String(desc.approval || "");
  const granted = runtime?.approved === true || runtime?.approvalGranted === true;
  if (desc.risk === "R2" || desc.risk === "R3") return !granted;
  if (APPROVAL_ALWAYS_BLOCKS.includes(approval)) return !granted;
  if (approval === "user-gesture") return runtime?.userGesture !== true && !granted;
  return false;
}

function pushReason(reasons, code) {
  if (code && !reasons.includes(code)) reasons.push(code);
}

/**
 * Intersect a descriptor's advertised ceiling with runtime feature/platform/
 * permission/network/account/provider/foreground/approval state.
 * Ignores model-supplied risk (op.risk, runtime.risk, runtime.parameters.risk).
 *
 * @param {object} op
 * @param {object} [runtime]
 * @returns {{ discoverable: boolean, requestable: boolean, executable: boolean, reasonCodes: string[] }}
 */
export function resolveOperationAvailability(op, runtime = {}) {
  const registered = OPERATIONS.get(operationKey(op?.capabilityId, op?.operation));
  const desc = registered || null;
  if (!desc) {
    return {
      discoverable: false,
      requestable: false,
      executable: false,
      reasonCodes: [OPERATION_REASON_CODES.unknownOperation],
    };
  }

  let discoverable = desc.discoverable === true;
  let requestable = desc.requestable === true;
  let executable = desc.executable === true;
  const reasons = [];
  for (const code of Array.isArray(desc.reasonCodes) ? desc.reasonCodes : []) {
    pushReason(reasons, String(code));
  }

  const flag = String(desc.featureFlag || "").trim();
  if (flag) {
    const flags = featureFlagsFrom(runtime);
    if (flags[flag] !== true) {
      requestable = false;
      executable = false;
      pushReason(reasons, OPERATION_REASON_CODES.featureFlag);
      pushReason(reasons, flag);
    }
  }

  if (Array.isArray(desc.platforms) && desc.platforms.length) {
    const platform = String(runtime?.platform || "").trim();
    if (!desc.platforms.includes(platform)) {
      discoverable = false;
      requestable = false;
      executable = false;
      pushReason(reasons, OPERATION_REASON_CODES.platformUnsupported);
    }
  }

  const requires = desc.requires && typeof desc.requires === "object" ? desc.requires : {};
  if (requires.permission && !hasNamedGrant(runtime?.permissions, requires.permission)) {
    executable = false;
    pushReason(reasons, OPERATION_REASON_CODES.permissionRequired);
  }
  if (requires.network === true && runtime?.network !== true && runtime?.networkOnline !== true) {
    executable = false;
    pushReason(reasons, OPERATION_REASON_CODES.networkRequired);
  }
  if (requires.account !== undefined && requires.account !== false && !hasNamedGrant(runtime?.account, requires.account)) {
    executable = false;
    pushReason(reasons, OPERATION_REASON_CODES.accountRequired);
  }
  if (requires.provider !== undefined && requires.provider !== false && !hasNamedGrant(runtime?.provider, requires.provider)) {
    executable = false;
    pushReason(reasons, OPERATION_REASON_CODES.providerRequired);
  }
  if (requires.foreground === true && runtime?.foreground !== true) {
    executable = false;
    pushReason(reasons, OPERATION_REASON_CODES.foregroundRequired);
  }

  if (approvalBlocksExecution(desc, runtime)) {
    executable = false;
    pushReason(reasons, OPERATION_REASON_CODES.approvalRequired);
  }

  if (reasons.includes(OPERATION_REASON_CODES.notImplemented)) {
    executable = false;
    requestable = false;
  }

  if (!discoverable) requestable = false;
  if (!requestable) executable = false;

  return {
    discoverable,
    requestable,
    executable,
    reasonCodes: reasons,
  };
}

export function listRequestableOperations(runtime = {}) {
  const out = [];
  for (const op of OPERATIONS.values()) {
    const availability = resolveOperationAvailability(op, runtime);
    if (!availability.requestable) continue;
    out.push({
      ...cloneOperation(op),
      discoverable: availability.discoverable,
      requestable: availability.requestable,
      executable: availability.executable,
      reasonCodes: availability.reasonCodes,
    });
  }
  return out;
}

export function capabilityOperationManifest(runtime = {}, lang) {
  const en = String(lang?.conversationLanguage || lang || "").toLowerCase().startsWith("en");
  const rows = listRequestableOperations(runtime).map(
    (op) => `- ${op.capabilityId}.${op.operation}; risk=${op.risk}; approval=${op.approval}`,
  );
  return [
    en
      ? `[Requestable capability operations v${CAPABILITY_OPERATION_V2_REGISTRY_VERSION}]`
      : `【可请求能力操作 v${CAPABILITY_OPERATION_V2_REGISTRY_VERSION}】`,
    ...rows,
    en
      ? "Requestable is not proof of execution. Only a trusted receipt proves success."
      : "可请求不等于已执行；只有可信 receipt 可以证明成功。",
  ].join("\n");
}

export function listMissingImplementedOperations() {
  const missing = [];
  for (const row of listCapabilities({ includeUnavailable: false })) {
    for (const operation of row.operations) {
      if (!OPERATIONS.has(`${row.id}.${operation}`)) missing.push(`${row.id}.${operation}`);
    }
  }
  return missing;
}
