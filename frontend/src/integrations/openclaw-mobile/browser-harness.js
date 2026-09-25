/**
 * Browser-safe harness — bundled into openclaw-mobile-slice for Playwright.
 * Uses in-memory workspace only (no node:fs).
 */
import {
  runAgentLoop,
  convertToLlm,
  createAssistantMessageEventStream,
} from "./openclaw-mobile-entry.js";
import { OpenClawMobileWorkspace } from "./OpenClawMobileEnvironment.js";
import { UnsupportedRuntimeCapabilityError } from "./shims/kill-tree.js";

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function makeAssistant(content, stopReason = "toolUse") {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "fake",
    model: "fake",
    usage: { ...EMPTY_USAGE },
    stopReason,
    timestamp: Date.now(),
  };
}

/**
 * @param {object} [opts]
 */
export async function runMobileCharacterFix(opts = {}) {
  const workspace = new OpenClawMobileWorkspace("browser");
  await workspace.writeText(
    "input/character.json",
    JSON.stringify({
      name: "角色",
      description: "",
    }),
  );

  const events = [];
  let turn = 0;
  const streamFn = async (_m, context, options) => {
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      if (options?.signal?.aborted) {
        const msg = makeAssistant([{ type: "text", text: "aborted" }], "aborted");
        stream.push({ type: "start", partial: msg });
        stream.push({ type: "done", message: msg });
        stream.end();
        return;
      }
      const n = (context.messages || []).filter((m) => m.role === "assistant").length;
      let msg;
      if (n === 0) {
        msg = makeAssistant([
          { type: "toolCall", id: "i1", name: "character.inspect", arguments: {} },
        ]);
      } else if (n === 1) {
        let inspect = {};
        for (let i = context.messages.length - 1; i >= 0; i -= 1) {
          const m = context.messages[i];
          if (m.role === "toolResult" && m.toolName === "character.inspect") {
            const text = (m.content || []).map((c) => c.text || "").join("");
            try {
              inspect = JSON.parse(text);
            } catch {
              inspect = {};
            }
            break;
          }
        }
        const fixed = {
          name: "角色",
          description: "",
          personality: inspect?.suggestedDefaults?.personality || "温和、克制、具有持续记忆",
        };
        msg = makeAssistant([
          {
            type: "toolCall",
            id: "w1",
            name: "workspace.write_text",
            arguments: {
              path: "output/character.fixed.json",
              content: JSON.stringify(fixed, null, 2),
            },
          },
        ]);
      } else {
        msg = makeAssistant([{ type: "text", text: "done" }], "stop");
      }
      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", message: msg });
      stream.end();
    });
    return stream;
  };

  const tools = [
    {
      name: "character.inspect",
      label: "inspect",
      description: "inspect",
      parameters: { type: "object", properties: {} },
      async execute() {
        const raw = await workspace.readText("input/character.json");
        const character = JSON.parse(raw);
        const payload = {
          valid: false,
          missingFields: ["personality"],
          suggestedDefaults: { personality: "温和、克制、具有持续记忆" },
          character,
        };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "workspace.write_text",
      label: "write",
      description: "write",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
      async execute(_id, params) {
        const art = await workspace.createArtifact(params.path, params.content);
        return { content: [{ type: "text", text: JSON.stringify(art) }], details: art };
      },
    },
  ];

  await runAgentLoop(
    [{ role: "user", content: "fix character", timestamp: Date.now() }],
    { systemPrompt: "tools only", messages: [], tools },
    {
      model: {
        id: "fake",
        name: "fake",
        api: "openai-completions",
        provider: "fake",
        baseUrl: "http://127.0.0.1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
      convertToLlm,
      shouldStopAfterTurn: async () => {
        turn += 1;
        return turn >= (opts.maxSteps || 8);
      },
    },
    (e) => events.push(e.type + (e.toolName ? `:${e.toolName}` : "")),
    opts.signal,
    streamFn,
  );

  const fixedRaw = await workspace.readText("output/character.fixed.json");
  return {
    events,
    fixed: JSON.parse(fixedRaw),
    artifacts: [...workspace.artifactIds],
  };
}

export async function assertKillTreeFails() {
  const { killProcessTree } = await import("./shims/kill-tree.js");
  try {
    killProcessTree(1);
    return { ok: false, reason: "should throw" };
  } catch (err) {
    return {
      ok: err?.code === "UNSUPPORTED_RUNTIME_CAPABILITY",
      code: err?.code,
      message: err?.message,
    };
  }
}

export { UnsupportedRuntimeCapabilityError };
