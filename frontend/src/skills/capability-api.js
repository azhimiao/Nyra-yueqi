/**
 * Typed capability API for third-party skill packages.
 * Bridges to agent capability registry shape without granting undeclared host power.
 */

import { CAPABILITY_IDS } from "../agent/schema.js";
import { canBindCapability } from "./compatibility.js";
import { checkSkillRisk } from "./risk.js";
import { createSandbox } from "./sandbox.js";
import { validateSkillManifest } from "./schema.js";

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   risk: "R0"|"R1"|"R2"|"R3",
 *   description: string,
 *   validateInput: (input: Record<string, unknown>) => { ok: boolean, reason?: string, value?: Record<string, unknown> },
 *   plan: (intent: object) => { nodes: object[], edges?: object[] },
 *   previewEffect: (input: Record<string, unknown>, ctx?: object) => { exactEffect: string, dataUsed: string[], affects: string[] },
 *   execute: (input: Record<string, unknown>, ctx: object) => Promise<object>|object,
 *   compensates?: (artifact: object, ctx: object) => object,
 * }} SkillCapability
 */

/**
 * Build a typed capability from a skill manifest + handlers.
 * @param {{
 *   manifest: object,
 *   handlers: {
 *     validateInput?: SkillCapability["validateInput"],
 *     plan?: SkillCapability["plan"],
 *     previewEffect?: SkillCapability["previewEffect"],
 *     execute: SkillCapability["execute"],
 *     compensates?: SkillCapability["compensates"],
 *   },
 *   grantedPermissions?: string[],
 * }} input
 */
export function defineSkillCapability(input) {
  const validated = validateSkillManifest(input.manifest);
  if (!validated.ok) return validated;
  const manifest = validated.value;

  const bind = canBindCapability(manifest.id, CAPABILITY_IDS);
  if (!bind.ok) return bind;

  const riskCheck = checkSkillRisk({
    manifestRisk: manifest.risk,
    requestedRisk: manifest.risk,
    permissions: manifest.permissions,
  });
  if (!riskCheck.ok) return riskCheck;

  const granted = Array.isArray(input.grantedPermissions)
    ? input.grantedPermissions
    : [];

  /** @type {SkillCapability} */
  const capability = {
    id: manifest.id,
    label: manifest.name,
    risk: manifest.risk,
    description: manifest.description,

    validateInput(raw = {}) {
      if (typeof input.handlers.validateInput === "function") {
        return input.handlers.validateInput(raw);
      }
      return { ok: true, value: { ...raw } };
    },

    plan(intent) {
      if (typeof input.handlers.plan === "function") {
        return input.handlers.plan(intent);
      }
      return {
        nodes: [
          {
            id: "step-1",
            stepId: "step-1",
            capabilityId: manifest.id,
            label: manifest.name,
            risk: manifest.risk,
            requiresApproval: riskCheck.requiresApproval,
            inputSummary: String(intent?.summary || manifest.name),
            effectSummary: manifest.description,
          },
        ],
        edges: [],
      };
    },

    previewEffect(execInput, ctx) {
      if (typeof input.handlers.previewEffect === "function") {
        return input.handlers.previewEffect(execInput, ctx);
      }
      return {
        exactEffect: `运行技能 ${manifest.name}（${manifest.id}@${manifest.version}）`,
        dataUsed: [],
        affects: [`skill:${manifest.id}`],
      };
    },

    async execute(execInput, ctx = {}) {
      const sandbox = createSandbox({
        skillId: manifest.id,
        manifestRisk: manifest.risk,
        declaredPermissions: manifest.permissions,
        grantedPermissions: granted,
        offline: Boolean(ctx.offline),
      });
      const risk = sandbox.checkRisk(manifest.risk);
      if (!risk.ok) {
        return { ok: false, reason: risk.reason, sandboxViolations: sandbox.violations };
      }
      const result = await input.handlers.execute(execInput, { ...ctx, sandbox, manifest });
      return result;
    },

    compensates: input.handlers.compensates,
  };

  return { ok: true, value: capability, manifest };
}

/**
 * Register skill capability into an agent-like registry map (test / runtime).
 * @param {Map<string, object>|{ set: Function, has: Function }} registry
 * @param {SkillCapability} capability
 * @param {{ allowReserved?: boolean }} [opts]
 */
export function bindCapabilityToRegistry(registry, capability, opts = {}) {
  if (!capability?.id) return { ok: false, reason: "missing_id" };
  if (!opts.allowReserved) {
    const bind = canBindCapability(capability.id, CAPABILITY_IDS);
    if (!bind.ok) return bind;
  }
  if (typeof registry.has === "function" && registry.has(capability.id)) {
    return { ok: false, reason: "already_registered", id: capability.id };
  }
  registry.set(capability.id, capability);
  return { ok: true, id: capability.id };
}
