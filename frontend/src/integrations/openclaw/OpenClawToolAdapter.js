/**
 * OpenClawToolAdapter — maps NyraToolDefinition → OpenClaw AgentTool.
 *
 * Pipeline: Capability Check → Schema Validation (upstream) → Workspace Boundary → Execute → Normalize
 *
 * Upstream: OpenClaw 2026.7.1-2
 * Public export: openclaw/plugin-sdk/agent-core (AgentTool shape)
 * Symbols: (tools passed into runAgentLoop context)
 */
import { importTypebox } from "./resolve-openclaw.js";
import { checkToolCapabilities } from "./openclaw-capabilities.js";
import { capabilityForTool } from "../../capabilities/device-registry.js";
import { capabilityPermissionBroker } from "../../platform/native-capabilities.js";

/**
 * Convert a plain JSON Schema object into a TypeBox-ish schema OpenClaw accepts.
 * Prefer Type.Object when possible; fall back to raw JSON Schema (OpenClaw validates both).
 * @param {object} jsonSchema
 * @param {any} Type
 */
function toParametersSchema(jsonSchema, Type) {
  if (!jsonSchema || typeof jsonSchema !== "object") {
    return Type.Object({});
  }
  // Pass through JSON Schema — OpenClaw validateToolArguments supports plain JSON Schema.
  return jsonSchema;
}

/**
 * @param {import('./nyra-agent-runtime.types.js').NyraToolDefinition[]} nyraTools
 * @param {import('./OpenClawWorkspaceAdapter.js').OpenClawWorkspaceAdapter} workspace
 * @param {{ grantedCapabilities?: string[] }} [opts]
 */
export async function toOpenClawTools(nyraTools, workspace, opts = {}) {
  const { Type } = await importTypebox();
  const granted = opts.grantedCapabilities || ["workspace.read", "workspace.write"];

  return nyraTools.map((tool) => {
    const timeoutMs = tool.timeoutMs ?? 10_000;
    return {
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: toParametersSchema(tool.parametersJsonSchema, Type),
      /**
       * @param {string} toolCallId
       * @param {object} params
       * @param {AbortSignal} [signal]
       */
      async execute(toolCallId, params, signal) {
        const cap = checkToolCapabilities(tool.name, granted);
        if (!cap.ok) {
          const err = new Error(cap.reason);
          err.code = "CAPABILITY_DENIED";
          throw err;
        }
        const deviceCapability = capabilityForTool(tool.name);
        if (deviceCapability) {
          const preflight = await capabilityPermissionBroker.ensureCapability(deviceCapability);
          if (!preflight.ok) {
            return {
              content: [{ type: "text", text: JSON.stringify(preflight) }],
              details: preflight,
            };
          }
        }

        return withTimeout(toolCallId, timeoutMs, signal, async () => {
          // Workspace boundary is enforced inside tool execute / workspace adapter.
          const result = await tool.execute(params || {}, {
            signal,
            callId: toolCallId,
            workspace,
          });
          const text =
            typeof result?.content === "string"
              ? result.content
              : JSON.stringify(result?.content ?? result ?? {});
          return {
            content: [{ type: "text", text }],
            details: result?.details ?? {},
          };
        });
      },
    };
  });
}

/**
 * character.inspect / workspace.read_text / workspace.write_text
 * @param {import('./OpenClawWorkspaceAdapter.js').OpenClawWorkspaceAdapter} workspace
 */
export function createSpikeNyraTools(workspace) {
  return [
    {
      name: "character.inspect",
      description: "Inspect input/character.json and report missing fields.",
      parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
      riskLevel: "low",
      requiredCapabilities: ["workspace.read"],
      timeoutMs: 10_000,
      async execute(_args, ctx) {
        const raw = await ctx.workspace.readText("input/character.json");
        const character = JSON.parse(raw);
        const payload = {
          valid: false,
          missingFields: ["personality"],
          suggestedDefaults: {
            personality: "温和、克制、具有持续记忆",
          },
          character,
        };
        return { content: JSON.stringify(payload), details: payload };
      },
    },
    {
      name: "workspace.read_text",
      description: "Read a text file inside the sandbox workspace.",
      parametersJsonSchema: {
        type: "object",
        properties: { path: { type: "string", minLength: 1 } },
        required: ["path"],
        additionalProperties: false,
      },
      riskLevel: "low",
      requiredCapabilities: ["workspace.read"],
      timeoutMs: 10_000,
      async execute(args, ctx) {
        const text = await ctx.workspace.readText(args.path);
        return { content: text, details: { path: args.path, bytes: text.length } };
      },
    },
    {
      name: "workspace.write_text",
      description: "Write a text file inside the sandbox workspace.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1 },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      riskLevel: "medium",
      requiredCapabilities: ["workspace.write"],
      timeoutMs: 10_000,
      async execute(args, ctx) {
        const artifact = await ctx.workspace.createArtifact(args.path, args.content);
        return {
          content: JSON.stringify(artifact),
          details: artifact,
        };
      },
    },
  ];
}

async function withTimeout(toolCallId, timeoutMs, signal, fn) {
  if (signal?.aborted) {
    throw Object.assign(new Error("Aborted"), { code: "ABORTED" });
  }
  if (!timeoutMs || timeoutMs <= 0) return fn();

  let timer;
  let onAbort;
  try {
    const races = [
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error(`Tool timeout after ${timeoutMs}ms (${toolCallId})`), {
              code: "TOOL_TIMEOUT",
            }),
          );
        }, timeoutMs);
      }),
    ];
    if (signal) {
      races.push(
        new Promise((_, reject) => {
          onAbort = () =>
            reject(Object.assign(new Error("Aborted"), { code: "ABORTED" }));
          signal.addEventListener("abort", onAbort, { once: true });
        }),
      );
    }
    return await Promise.race(races);
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}
