/**
 * OpenClawMobileRuntimeAdapter — NyraAgentRuntime over mobile-safe OpenClaw slice.
 *
 * Upstream: OpenClaw 2026.7.1-2 (vendored narrow chunks + kill-tree stub)
 * Symbols: runAgentLoop, convertToLlm, createAssistantMessageEventStream
 *
 * Does not reimplement Agent Loop.
 */
import {
  runAgentLoop,
  convertToLlm,
  createAssistantMessageEventStream,
} from "./openclaw-mobile-entry.js";
import { OpenClawMobileWorkspace } from "./OpenClawMobileEnvironment.js";
import { UnsupportedRuntimeCapabilityError } from "./OpenClawMobileProcessController.js";

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function makeAssistant(content, stopReason = "toolUse") {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "nyra-mobile-fake",
    model: "fake",
    usage: { ...EMPTY_USAGE },
    stopReason,
    timestamp: Date.now(),
  };
}

function countAssistant(messages) {
  return (messages || []).filter((m) => m?.role === "assistant").length;
}

function lastToolText(messages, name) {
  for (let i = (messages?.length || 0) - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "toolResult" && m.toolName === name) {
      return (m.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    }
  }
  return "";
}

/**
 * Minimal TypeBox-free JSON Schema tools for OpenClaw validation.
 */
function createMobileTools(workspace, scenario) {
  return [
    {
      name: "character.inspect",
      label: "inspect",
      description: "Inspect character.json",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async execute(toolCallId, _params, signal) {
        if (signal?.aborted) throw Object.assign(new Error("Aborted"), { code: "ABORTED" });
        if (scenario === "tool_timeout") {
          await new Promise((r) => setTimeout(r, 500));
        }
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
      description: "Write workspace text",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1 },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        if (params?.path === "__shell__" || params?.path === "shell") {
          throw new UnsupportedRuntimeCapabilityError("Shell is unavailable in Nyra mobile runtime.");
        }
        const art = await workspace.createArtifact(params.path, params.content);
        return { content: [{ type: "text", text: JSON.stringify(art) }], details: art };
      },
    },
    {
      name: "shell.exec",
      label: "shell",
      description: "Forbidden shell",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      async execute() {
        throw new UnsupportedRuntimeCapabilityError("Shell is unavailable in Nyra mobile runtime.");
      },
    },
  ];
}

function createFakeStreamFn(scenario, fixedCharacter) {
  return async function streamFn(_model, context, options) {
    const stream = createAssistantMessageEventStream();
    const signal = options?.signal;
    queueMicrotask(() => {
      if (signal?.aborted) {
        const msg = makeAssistant([{ type: "text", text: "aborted" }], "aborted");
        stream.push({ type: "start", partial: msg });
        stream.push({ type: "done", message: msg });
        stream.end();
        return;
      }
      const turn = countAssistant(context.messages);
      let msg;
      if (scenario === "unknown_tool" && turn === 0) {
        msg = makeAssistant([{ type: "toolCall", id: "u1", name: "does.not.exist", arguments: {} }]);
      } else if (scenario === "bad_schema" && turn === 0) {
        msg = makeAssistant([
          { type: "toolCall", id: "b1", name: "workspace.write_text", arguments: { notPath: true } },
        ]);
      } else if (scenario === "max_steps") {
        msg = makeAssistant([
          { type: "toolCall", id: `m${turn}`, name: "character.inspect", arguments: {} },
        ]);
      } else if (scenario === "shell" && turn === 0) {
        msg = makeAssistant([
          { type: "toolCall", id: "s1", name: "shell.exec", arguments: { command: "ls" } },
        ]);
      } else if (scenario === "process" && turn === 0) {
        msg = makeAssistant([
          {
            type: "toolCall",
            id: "p1",
            name: "workspace.write_text",
            arguments: { path: "__process__", content: "x" },
          },
        ]);
      } else if (scenario === "path_escape" && turn === 1) {
        msg = makeAssistant([
          {
            type: "toolCall",
            id: "e1",
            name: "workspace.write_text",
            arguments: { path: "../outside.json", content: "{}" },
          },
        ]);
      } else if (turn === 0) {
        msg = makeAssistant([
          { type: "toolCall", id: "i1", name: "character.inspect", arguments: {} },
        ]);
      } else if (turn === 1) {
        const inspect = JSON.parse(lastToolText(context.messages, "character.inspect") || "{}");
        const fixed = {
          ...fixedCharacter,
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
      if (scenario === "path_escape" && turn === 0) {
        msg = makeAssistant([
          { type: "toolCall", id: "i1", name: "character.inspect", arguments: {} },
        ]);
      }
      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", message: msg });
      stream.end();
    });
    return stream;
  };
}

export class OpenClawMobileRuntimeAdapter {
  constructor() {
    /** @type {Map<string, AbortController>} */
    this.controllers = new Map();
    /** @type {Map<string, OpenClawMobileWorkspace>} */
    this.workspaces = new Map();
    try {
      globalThis.__NYRA_OPENCLAW_SLICE_LOADED__ = true;
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {object} request
   */
  run(request) {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        yield* self.#run(request);
      },
    };
  }

  async cancel(runId) {
    this.controllers.get(runId)?.abort();
  }

  async *#run(request) {
    const runId = request.runId || `mobile-${Date.now()}`;
    const scenario = request.testScenario || "happy";
    const maxSteps = request.maxSteps ?? 8;
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const workspace = new OpenClawMobileWorkspace(request.workspaceId || runId);
    this.workspaces.set(runId, workspace);
    const characterPayload = request.characterPayload || {
      name: "角色",
      description: "",
    };
    await workspace.writeText(
      "input/character.json",
      JSON.stringify(characterPayload, null, 2),
    );
    if (request.seedFiles && typeof request.seedFiles === "object") {
      for (const [path, content] of Object.entries(request.seedFiles)) {
        await workspace.writeText(path, typeof content === "string" ? content : JSON.stringify(content, null, 2));
      }
    }

    /** @type {object[]} */
    const queue = [];
    let wake = null;
    const push = (ev) => {
      queue.push(ev);
      wake?.();
      wake = null;
    };
    const wait = () =>
      new Promise((r) => {
        if (queue.length) r();
        else wake = r;
      });

    let done = false;
    let modelStep = 0;
    /** @type {object[]} */
    let tools = typeof request.toolsFactory === "function"
      ? request.toolsFactory(workspace)
      : Array.isArray(request.tools)
        ? request.tools
        : createMobileTools(workspace, scenario);
    tools = tools.map((t) => {
      if (scenario === "tool_timeout" && (t.name === "character.inspect" || t.name === "nyra.character.inspect")) {
        return { ...t, timeoutMs: 50 };
      }
      return t;
    });

    // OpenClaw may not honor timeoutMs on tool object — wrap execute for timeout scenario
    if (scenario === "tool_timeout") {
      const inspect = tools.find(
        (t) => t.name === "character.inspect" || t.name === "nyra.character.inspect",
      );
      if (inspect) {
        const orig = inspect.execute.bind(inspect);
        inspect.execute = async (id, params, signal) => {
          const timeout = new Promise((_, rej) =>
            setTimeout(() => rej(Object.assign(new Error("Tool timeout"), { code: "TOOL_TIMEOUT" })), 50),
          );
          return Promise.race([orig(id, params, signal), timeout]);
        };
      }
    }

    // P0: production must supply a real BYOK streamFn. Fake stream is tests-only.
    let streamFn = typeof request.streamFn === "function" ? request.streamFn : null;
    if (!streamFn) {
      if (request.allowFakeStream === true) {
        streamFn = createFakeStreamFn(scenario, characterPayload);
      } else {
        const err = new Error(
          "OpenClaw Mobile Runtime requires streamFn (BYOK). Fake stream is disabled in production.",
        );
        err.code = "STREAM_FN_REQUIRED";
        throw err;
      }
    }
    if (!request.model && request.allowFakeStream !== true) {
      const err = new Error("OpenClaw Mobile Runtime requires a real model descriptor.");
      err.code = "MODEL_REQUIRED";
      throw err;
    }

    const pump = (async () => {
      try {
        push({ type: "run_started", runId });
        let turns = 0;
        await runAgentLoop(
          [
            {
              role: "user",
              content: request.instruction || "Fix character card",
              timestamp: Date.now(),
            },
          ],
          {
            systemPrompt:
              request.systemPrompt ||
              (request.productMode
                ? "Nyra Qiji assistant mobile runtime. Use controlled tools only. Never shell. Propose candidates only."
                : "Nyra mobile adapter. Tools only. No shell."),
            messages: [],
            tools,
          },
          {
            model: request.model || {
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
              turns += 1;
              return turns >= maxSteps;
            },
          },
          (raw) => {
            if (raw.type === "message_start" && raw.message?.role === "assistant") {
              modelStep += 1;
              push({ type: "model_requested", step: modelStep });
            } else if (raw.type === "tool_execution_start") {
              push({
                type: "tool_requested",
                toolName: raw.toolName,
                callId: raw.toolCallId,
              });
            } else if (raw.type === "tool_execution_end") {
              push({
                type: "tool_completed",
                toolName: raw.toolName,
                callId: raw.toolCallId,
                isError: Boolean(raw.isError),
              });
            }
          },
          controller.signal,
          streamFn,
        );
        if (controller.signal.aborted) {
          push({ type: "run_failed", code: "CANCELLED", message: "aborted" });
        } else {
          push({
            type: "run_completed",
            summary: "mobile slice completed",
            artifactIds: [...workspace.artifactIds],
          });
        }
      } catch (err) {
        const code = err?.code || (err?.name === "UnsupportedRuntimeCapabilityError" ? "UNSUPPORTED_RUNTIME_CAPABILITY" : "RUNTIME_ERROR");
        push({ type: "run_failed", code, message: String(err?.message || err) });
      } finally {
        done = true;
        this.controllers.delete(runId);
        // Keep workspace map entry after run so callers/tests can read artifacts
        // (e.g. output/character.fixed.json). Controllers are cleared to free abort state.
        wake?.();
      }
    })();

    while (!done || queue.length) {
      if (!queue.length) await wait();
      while (queue.length) yield queue.shift();
    }
    await pump;
  }
}
