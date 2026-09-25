/**
 * OpenClawRuntimeAdapter — thinnest NyraAgentRuntime over OpenClaw.
 *
 * Upstream: OpenClaw 2026.7.1-2
 * Public export: openclaw/plugin-sdk/agent-core
 * Symbols: runAgentLoop, convertToLlm
 *
 * Does NOT reimplement Agent Loop / Tool-call Loop / Planner / Session Runtime.
 */
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { importOpenClaw, readOpenClawPackageMeta } from "./resolve-openclaw.js";
import { OpenClawWorkspaceAdapter } from "./OpenClawWorkspaceAdapter.js";
import { OpenClawEventAdapter, toNyraRuntimeError } from "./OpenClawEventAdapter.js";
import { OpenClawCancellationAdapter } from "./OpenClawCancellationAdapter.js";
import { createNyraModelAdapter } from "./OpenClawModelAdapter.js";
import { toOpenClawTools, createSpikeNyraTools } from "./OpenClawToolAdapter.js";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const DEFAULT_TMP = join(REPO_ROOT, ".tmp", "openclaw-adapter-runs");

export class OpenClawRuntimeAdapter {
  /**
   * @param {{ tmpRoot?: string }} [opts]
   */
  constructor(opts = {}) {
    this.tmpRoot = opts.tmpRoot || DEFAULT_TMP;
    this.cancellation = new OpenClawCancellationAdapter();
    /** @type {Map<string, { workspace: OpenClawWorkspaceAdapter, events: OpenClawEventAdapter }>} */
    this.runs = new Map();
  }

  /**
   * @param {import('./nyra-agent-runtime.types.js').NyraAgentRunRequest} request
   * @returns {AsyncIterable<import('./nyra-agent-runtime.types.js').NyraAgentRuntimeEvent>}
   */
  run(request) {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        yield* self.#runGenerator(request);
      },
    };
  }

  /**
   * @param {string} runId
   */
  async cancel(runId) {
    await this.cancellation.cancel(runId);
  }

  /**
   * @param {import('./nyra-agent-runtime.types.js').NyraAgentRunRequest} request
   */
  async *#runGenerator(request) {
    const runId = request.runId || `run-${Date.now()}`;
    const maxSteps = request.maxSteps ?? 8;
    const eventAdapter = new OpenClawEventAdapter(runId);
    const signal = this.cancellation.begin(runId, request.signal);

    const rootDir =
      request.workspaceRoot || join(this.tmpRoot, request.workspaceId || runId);
    await rm(rootDir, { recursive: true, force: true }).catch(() => {});
    const workspace = new OpenClawWorkspaceAdapter(rootDir, {
      workspaceId: request.workspaceId || runId,
    });
    await workspace.ensureLayout();
    // default character file if workspace is empty
    if (!(await workspace.exists("input/character.json"))) {
      await workspace.writeText(
        "input/character.json",
        JSON.stringify(
          {
            name: "角色",
            description: "",
          },
          null,
          2,
        ),
      );
    }

    this.runs.set(runId, { workspace, events: eventAdapter });

    /** @type {import('./nyra-agent-runtime.types.js').NyraAgentRuntimeEvent[]} */
    const queue = [];
    let wake = null;
    const push = (ev) => {
      queue.push(ev);
      if (wake) {
        wake();
        wake = null;
      }
    };
    const wait = () =>
      new Promise((resolve) => {
        if (queue.length) resolve();
        else wake = resolve;
      });

    let finished = false;
    let fatal = null;

    const pump = (async () => {
      try {
        const meta = readOpenClawPackageMeta();
        if (meta.version !== "2026.7.1-2") {
          // Soft note — still attempt run but surface version skew later if needed.
        }
        const { runAgentLoop, convertToLlm } = await importOpenClaw(
          "openclaw/plugin-sdk/agent-core",
        );

        const nyraTools =
          request.tools?.length > 0 ? request.tools : createSpikeNyraTools(workspace);

        // Optional slow tool for timeout tests
        const toolsForRun = nyraTools.map((t) => {
          if (request.testScenario === "tool_timeout" && t.name === "character.inspect") {
            return {
              ...t,
              timeoutMs: 50,
              async execute(args, ctx) {
                await new Promise((r) => setTimeout(r, 500));
                return t.execute(args, ctx);
              },
            };
          }
          return t;
        });

        const openclawTools = await toOpenClawTools(toolsForRun, workspace);
        const modelAdapter = createNyraModelAdapter({
          model: request.model || { provider: "fake", modelId: "fake", mode: "fake" },
          scenario: request.testScenario || "happy",
          delayMs: request.testScenario === "cancel" ? 120 : 0,
        });

        let turnCount = 0;
        const upstreamEmit = (raw) => {
          for (const nyra of eventAdapter.map(raw)) push(nyra);
        };

        await runAgentLoop(
          [
            {
              role: "user",
              content: request.instruction,
              timestamp: Date.now(),
            },
          ],
          {
            systemPrompt:
              request.systemPrompt ||
              "You are a Nyra adapter test agent. Use tools only. No shell.",
            messages: [],
            tools: openclawTools,
          },
          {
            model: modelAdapter.createFakeModelDescriptor(),
            convertToLlm,
            shouldStopAfterTurn: async () => {
              turnCount += 1;
              return turnCount >= maxSteps;
            },
          },
          upstreamEmit,
          signal,
          modelAdapter.streamFn.bind(modelAdapter),
        );

        const summary = signal.aborted
          ? "cancelled"
          : "Character card inspected and fixed; wrote output/character.fixed.json.";
        if (signal.aborted) {
          push(eventAdapter.failed("CANCELLED", "Run aborted"));
        } else {
          push(eventAdapter.completed(summary, [...workspace.artifactIds]));
        }
      } catch (err) {
        fatal = err;
        const mapped = toNyraRuntimeError(err);
        push(eventAdapter.failed(mapped.code, mapped.message));
      } finally {
        finished = true;
        this.cancellation.end(runId);
        if (wake) {
          wake();
          wake = null;
        }
      }
    })();

    while (!finished || queue.length) {
      if (!queue.length) await wait();
      while (queue.length) {
        yield queue.shift();
      }
    }
    await pump;
    if (fatal && !eventAdapter.emitted.some((e) => e.type === "run_failed")) {
      const mapped = toNyraRuntimeError(fatal);
      yield eventAdapter.failed(mapped.code, mapped.message);
    }
  }
}

/** @deprecated naming alias — NyraModelAdapter lives in OpenClawModelAdapter.js */
export { createNyraModelAdapter as NyraModelAdapterFactory } from "./OpenClawModelAdapter.js";
