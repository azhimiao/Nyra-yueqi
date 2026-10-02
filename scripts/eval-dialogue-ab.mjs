import { readFile, writeFile } from "node:fs/promises";
import { startDialogueGateway } from "./lib/dialogue-eval-gateway.mjs";
import { parseInnerStateEnvelope } from "../src/chat/inner-state.js";
import { stripRuntimeMetadataPreview } from "../src/runtime/protocol.js";
const fixture = JSON.parse(await readFile("docs/qa/dialogue-evaluation/prompt-ab-requests.json", "utf8"));
const gateway = await startDialogueGateway({ port: 5226 });
if (!gateway.available) throw new Error(gateway.reason);
const results = [];
const jobs = fixture.cases.flatMap(c => c.variants.filter(v => c.fixture === "cold_start_builtin_worldbook" || (c.fixture === "long_20_turns" && v.id !== "remove_intent_guessing_example")).map(v => ({ fixture: c.fixture, ...v })));
// Second cold-start sample is a check on output variance, not a statistical claim.
jobs.push(...jobs.filter(j => j.fixture === "cold_start_builtin_worldbook").map(j => ({ ...j, repeat: 2 })));
try {
  for (const job of jobs) {
    const started = Date.now();
    try {
    const response = await gateway.request({ messages: job.messages, stream: false, temperature: 0.72, maxTokens: 1800 });
    const payload = await response.json();
    const raw = String(payload.content || "");
    const inner = parseInnerStateEnvelope(raw);
    const result = { fixture: job.fixture, variant: job.id, repeat: job.repeat || 1, kind: job.kind, status: response.status, model: payload.model, estimatedInputTokens: job.estimatedInputTokens, elapsedMs: Date.now() - started, reply: stripRuntimeMetadataPreview(inner.text).replace(/<think>[\s\S]*?<\/think>/gi, "").trim(), innerStatePresent: inner.found, innerStateLength: inner.innerState.length, privateReasoningLength: String(payload.reasoning || "").length, usage: payload.usage, error: payload.error || null };
    results.push(result);
    await writeFile("docs/qa/dialogue-evaluation/live-ab-results.json", JSON.stringify({ checkedAt: new Date().toISOString(), warning: "Eight diagnostic calls on one model; concurrent with live conversation run. Not a blinded or statistically powered benchmark. No production settings changed.", results }, null, 2));
    console.log(JSON.stringify(result));
    } catch (error) {
      const result = { fixture: job.fixture, variant: job.id, repeat: job.repeat || 1, kind: job.kind, estimatedInputTokens: job.estimatedInputTokens, elapsedMs: Date.now() - started, status: null, reply: null, error: { name: error.name, message: error.name === "TimeoutError" ? "Diagnostic request exceeded 120000 ms" : "Diagnostic request failed before a complete response" } };
      results.push(result);
      await writeFile("docs/qa/dialogue-evaluation/live-ab-results.json", JSON.stringify({ checkedAt: new Date().toISOString(), warning: "Small diagnostic sample; concurrent with live conversation run. Not a blinded or statistically powered benchmark. No production settings changed.", results }, null, 2));
      console.log(JSON.stringify(result));
    }
  }
} finally { await gateway.stop(); }
