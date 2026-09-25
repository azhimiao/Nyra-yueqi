/**
 * OpenClawModelAdapter / NyraModelAdapter
 *
 * Translates Nyra provider messages into OpenClaw streamFn.
 * Does NOT implement an Agent Loop.
 *
 * Modes:
 * - fake: deterministic style Fake Model (tests only; not production path)
 * - mock-nyra: unit-test format adapter (OpenAI-like tool_calls → OpenClaw stream)
 * - byok: live provider when keys are present
 *
 * Upstream: OpenClaw 2026.7.1-2
 * Public export: openclaw/plugin-sdk/llm
 * Symbols: createAssistantMessageEventStream
 */
import { importOpenClaw } from "./resolve-openclaw.js";

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function countAssistantTurns(messages) {
  return (messages || []).filter((m) => m?.role === "assistant").length;
}

function lastToolResultText(messages, toolName) {
  for (let i = (messages?.length || 0) - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "toolResult" && m.toolName === toolName) {
      return (m.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
    }
  }
  return "";
}

function makeAssistantMessage(content, stopReason = "toolUse", errorMessage, usage = EMPTY_USAGE) {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "nyra",
    model: "nyra-adapter",
    usage: { ...usage },
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  };
}

/**
 * @param {object} opts
 * @param {import('./nyra-agent-runtime.types.js').NyraAgentModel} opts.model
 * @param {string} [opts.scenario]
 * @param {object} [opts.fixedCharacter]
 * @param {number} [opts.delayMs]
 * @param {(messages: object[], tools: object[]) => Promise<object>} [opts.mockProvider]
 */
export function createNyraModelAdapter(opts = {}) {
  const mode = opts.model?.mode || "fake";
  const scenario = opts.scenario || "happy";
  const fixedCharacter = opts.fixedCharacter || {
    name: "角色",
    description: "",
  };
  let calls = 0;

  return {
    mode,
    calls: () => calls,

    createFakeModelDescriptor() {
      return {
        id: opts.model?.modelId || "local-fake-model",
        name: "Nyra Fake Model",
        api: "openai-completions",
        provider: opts.model?.provider || "local-fake",
        baseUrl: opts.model?.baseUrl || "http://127.0.0.1:0",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      };
    },

    /**
     * OpenClaw StreamFn
     */
    async streamFn(model, context, streamOptions) {
      calls += 1;
      const { createAssistantMessageEventStream } = await importOpenClaw("openclaw/plugin-sdk/llm");
      const stream = createAssistantMessageEventStream();
      const signal = streamOptions?.signal;

      const pushDone = (msg) => {
        stream.push({ type: "start", partial: msg });
        stream.push({ type: "done", message: msg });
        stream.end();
      };

      queueMicrotask(async () => {
        try {
          if (signal?.aborted) {
            pushDone(makeAssistantMessage([{ type: "text", text: "aborted" }], "aborted", "Cancelled"));
            return;
          }
          if (opts.delayMs) {
            await new Promise((r) => setTimeout(r, opts.delayMs));
          }
          if (signal?.aborted) {
            pushDone(makeAssistantMessage([{ type: "text", text: "aborted" }], "aborted", "Cancelled"));
            return;
          }

          if (mode === "byok") {
            pushDone(
              makeAssistantMessage(
                [
                  {
                    type: "text",
                    text: "Model stream is not available in this adapter mode.",
                  },
                ],
                "error",
                "IMPLEMENTED_PENDING_EXTERNAL",
              ),
            );
            return;
          }

          if (mode === "mock-nyra") {
            const response = await (opts.mockProvider || defaultMockProvider)(
              context.messages || [],
              context.tools || [],
            );
            pushDone(nyraProviderResponseToAssistant(response));
            return;
          }

          // fake mode
          const turn = countAssistantTurns(context.messages);
          pushDone(decideFakeMessage(scenario, turn, context, fixedCharacter));
        } catch (err) {
          pushDone(
            makeAssistantMessage(
              [{ type: "text", text: String(err?.message || err) }],
              "error",
              String(err?.message || err),
            ),
          );
        }
      });

      return stream;
    },
  };
}

/** Alias name requested by  */
export const createOpenClawModelAdapter = createNyraModelAdapter;

function decideFakeMessage(scenario, turn, context, fixedCharacter) {
  if (scenario === "unknown_tool") {
    if (turn === 0) {
      return makeAssistantMessage([
        { type: "toolCall", id: "tc-unknown", name: "does.not.exist", arguments: {} },
      ]);
    }
    return makeAssistantMessage([{ type: "text", text: "Unknown tool path finished." }], "stop");
  }

  if (scenario === "bad_schema") {
    if (turn === 0) {
      return makeAssistantMessage([
        {
          type: "toolCall",
          id: "tc-bad",
          name: "workspace.write_text",
          arguments: { notPath: true },
        },
      ]);
    }
    return makeAssistantMessage([{ type: "text", text: "Bad schema path finished." }], "stop");
  }

  if (scenario === "max_steps") {
    return makeAssistantMessage([
      {
        type: "toolCall",
        id: `tc-loop-${turn}`,
        name: "character.inspect",
        arguments: {},
      },
    ]);
  }

  if (scenario === "tool_timeout") {
    if (turn === 0) {
      return makeAssistantMessage([
        {
          type: "toolCall",
          id: "tc-slow",
          name: "character.inspect",
          arguments: { __slowMs: 5000 },
        },
      ]);
    }
    return makeAssistantMessage([{ type: "text", text: "Timeout path finished." }], "stop");
  }

  if (scenario === "path_escape") {
    if (turn === 0) {
      return makeAssistantMessage([
        { type: "toolCall", id: "tc-inspect", name: "character.inspect", arguments: {} },
      ]);
    }
    if (turn === 1) {
      return makeAssistantMessage([
        {
          type: "toolCall",
          id: "tc-escape",
          name: "workspace.write_text",
          arguments: { path: "../outside.json", content: '{"pwned":true}' },
        },
      ]);
    }
    return makeAssistantMessage([{ type: "text", text: "Escape path finished." }], "stop");
  }

  // happy
  if (turn === 0) {
    return makeAssistantMessage([
      { type: "toolCall", id: "tc-inspect", name: "character.inspect", arguments: {} },
    ]);
  }
  if (turn === 1) {
    const inspectText = lastToolResultText(context.messages, "character.inspect");
    let inspect;
    try {
      inspect = JSON.parse(inspectText);
    } catch {
      inspect = null;
    }
    const personality =
      inspect?.suggestedDefaults?.personality || "温和、克制、具有持续记忆";
    const fixed = { ...fixedCharacter, personality };
    return makeAssistantMessage([
      {
        type: "toolCall",
        id: "tc-write",
        name: "workspace.write_text",
        arguments: {
          path: "output/character.fixed.json",
          content: JSON.stringify(fixed, null, 2),
        },
      },
    ]);
  }
  return makeAssistantMessage(
    [
      {
        type: "text",
        text: "Character card inspected and fixed; wrote output/character.fixed.json.",
      },
    ],
    "stop",
    undefined,
    { input: 12, output: 24, cacheRead: 0, cacheWrite: 0 },
  );
}

/**
 * Convert a Nyra/OpenAI-compatible provider response into AssistantMessage.
 * @param {object} response
 */
export function nyraProviderResponseToAssistant(response) {
  if (response?.error) {
    return makeAssistantMessage(
      [{ type: "text", text: response.error }],
      "error",
      response.error,
      response.usage || EMPTY_USAGE,
    );
  }
  const content = [];
  if (response?.content) {
    content.push({ type: "text", text: String(response.content) });
  }
  for (const tc of response?.tool_calls || []) {
    let args = tc.arguments || tc.function?.arguments || {};
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    content.push({
      type: "toolCall",
      id: tc.id || `tc-${content.length}`,
      name: tc.name || tc.function?.name,
      arguments: args,
    });
  }
  const stopReason = content.some((c) => c.type === "toolCall") ? "toolUse" : "stop";
  if (!content.length) {
    content.push({ type: "text", text: "" });
  }
  return makeAssistantMessage(content, stopReason, undefined, response?.usage || EMPTY_USAGE);
}

async function defaultMockProvider(messages) {
  const turn = countAssistantTurns(messages);
  if (turn === 0) {
    return {
      tool_calls: [{ id: "m1", name: "character.inspect", arguments: {} }],
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    };
  }
  if (turn === 1) {
    const inspectText = lastToolResultText(messages, "character.inspect");
    let inspect;
    try {
      inspect = JSON.parse(inspectText);
    } catch {
      inspect = {};
    }
    const fixed = {
      name: "角色",
      description: "",
      personality: inspect?.suggestedDefaults?.personality || "温和、克制、具有持续记忆",
    };
    return {
      tool_calls: [
        {
          id: "m2",
          name: "workspace.write_text",
          arguments: {
            path: "output/character.fixed.json",
            content: JSON.stringify(fixed, null, 2),
          },
        },
      ],
    };
  }
  return {
    content: "done via mock-nyra provider",
    usage: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0 },
  };
}
