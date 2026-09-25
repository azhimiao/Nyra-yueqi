/**
 * Local skill simulator:
 * permission deny, offline, timeout, cancel, duplicate call.
 */

import { createSandbox } from "./sandbox.js";
import { validateSkillManifest } from "./schema.js";
import { defineSkillCapability } from "./capability-api.js";
import { createEventBus } from "./event-api.js";

/**
 * @typedef {{
 *   mode?: "permission_deny"|"offline"|"timeout"|"cancel"|"duplicate"|"normal",
 *   denyPermission?: string,
 *   timeoutMs?: number,
 *   now?: () => number,
 * }} SimulatorOptions
 */

/**
 * Run a skill package through the local simulator.
 * @param {{
 *   manifest: object,
 *   entrySource?: string,
 *   execute: (input: object, ctx: object) => Promise<object>|object,
 *   input?: object,
 *   grantedPermissions?: string[],
 * }} skill
 * @param {SimulatorOptions} [opts]
 */
export async function runSkillSimulator(skill, opts = {}) {
  const mode = opts.mode || "normal";
  const bus = createEventBus();
  const validated = validateSkillManifest(skill.manifest);
  if (!validated.ok) {
    return { ok: false, reason: "invalid_manifest", details: validated };
  }
  const manifest = validated.value;

  let granted = Array.isArray(skill.grantedPermissions)
    ? skill.grantedPermissions
    : [...manifest.permissions];

  if (mode === "permission_deny") {
    const deny = opts.denyPermission || manifest.permissions[0] || "network";
    granted = granted.filter((p) => p !== deny);
    // Force a require of denied permission inside sandbox wrapper
  }

  const defined = defineSkillCapability({
    manifest,
    grantedPermissions: granted,
    handlers: {
      execute: skill.execute,
    },
  });
  if (!defined.ok) return defined;

  const invokeKey = `${manifest.id}:${JSON.stringify(skill.input || {})}`;
  /** @type {Map<string, object>} */
  const inflight = runSkillSimulator._inflight || new Map();
  runSkillSimulator._inflight = inflight;

  if (mode === "duplicate") {
    if (inflight.has(invokeKey)) {
      bus.emit("skill.invoke.error", { skillId: manifest.id, reason: "duplicate_call" });
      return {
        ok: false,
        reason: "duplicate_call",
        mode,
        prior: inflight.get(invokeKey),
      };
    }
  }

  const controller = { cancelled: false };
  const cancel = () => {
    controller.cancelled = true;
  };

  if (mode === "cancel") {
    // Cancel before execute completes
    queueMicrotask(() => cancel());
  }

  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 50;
  const started = (opts.now || Date.now)();

  bus.emit("skill.invoke.start", { skillId: manifest.id, mode });
  inflight.set(invokeKey, { started, mode });

  try {
    if (mode === "timeout") {
      await new Promise((r) => setTimeout(r, timeoutMs + 5));
      const elapsed = (opts.now || Date.now)() - started;
      if (elapsed >= timeoutMs) {
        bus.emit("skill.invoke.error", { skillId: manifest.id, reason: "timeout" });
        return { ok: false, reason: "timeout", mode, timeoutMs, elapsed };
      }
    }

    if (controller.cancelled || mode === "cancel") {
      bus.emit("skill.invoke.error", { skillId: manifest.id, reason: "cancelled" });
      return { ok: false, reason: "cancelled", mode };
    }

    const sandbox = createSandbox({
      skillId: manifest.id,
      manifestRisk: manifest.risk,
      declaredPermissions: manifest.permissions,
      grantedPermissions: granted,
      offline: mode === "offline",
    });

    if (mode === "permission_deny") {
      const deny = opts.denyPermission || "network";
      const denied = sandbox.require(deny);
      bus.emit("skill.permission.denied", { skillId: manifest.id, permission: deny });
      return {
        ok: false,
        reason: "permission_denied",
        mode,
        permission: deny,
        detail: denied,
      };
    }

    if (mode === "offline") {
      const net = sandbox.requestNetwork({ url: "https://example.invalid" });
      if (!net.ok) {
        return { ok: false, reason: "offline", mode, detail: net };
      }
    }

    const result = await defined.value.execute(skill.input || {}, {
      sandbox,
      offline: mode === "offline",
      simulator: true,
      cancel,
      isCancelled: () => controller.cancelled,
    });

    if (controller.cancelled) {
      return { ok: false, reason: "cancelled", mode };
    }

    bus.emit("skill.invoke.end", { skillId: manifest.id, mode, ok: true });
    return {
      ok: true,
      mode,
      result,
      capability: { id: defined.value.id, risk: defined.value.risk },
      bus,
    };
  } finally {
    if (mode !== "duplicate") {
      inflight.delete(invokeKey);
    }
  }
}

/** @type {Map<string, object>|undefined} */
runSkillSimulator._inflight = undefined;

/**
 * Reset simulator inflight map (tests).
 */
export function __resetSimulatorForTests() {
  runSkillSimulator._inflight = new Map();
}

/**
 * Convenience: run all fault modes against a skill (for docs / verify).
 * @param {Parameters<typeof runSkillSimulator>[0]} skill
 */
export async function runSimulatorFaultMatrix(skill) {
  const modes = /** @type {const} */ ([
    "normal",
    "permission_deny",
    "offline",
    "timeout",
    "cancel",
    "duplicate",
  ]);
  /** @type {Record<string, object>} */
  const results = {};

  // Seed duplicate mode with a prior inflight entry
  __resetSimulatorForTests();
  const key = `${skill.manifest.id}:${JSON.stringify(skill.input || {})}`;
  runSkillSimulator._inflight = new Map([[key, { started: Date.now(), mode: "seed" }]]);

  for (const mode of modes) {
    if (mode !== "duplicate") {
      // keep seed only for duplicate
      if (!runSkillSimulator._inflight?.has(key)) {
        runSkillSimulator._inflight = new Map();
      }
    }
    if (mode === "duplicate") {
      runSkillSimulator._inflight = new Map([[key, { started: Date.now(), mode: "seed" }]]);
    } else {
      runSkillSimulator._inflight = new Map();
    }
    results[mode] = await runSkillSimulator(skill, {
      mode,
      denyPermission: "network",
      timeoutMs: 10,
    });
  }
  __resetSimulatorForTests();
  return results;
}
