/** Aggregate existing diagnostic artifacts only; no model calls or user data. */
import fs from "node:fs";
const dir = "docs/qa/dialogue-evaluation";
const read = name => JSON.parse(fs.readFileSync(`${dir}/${name}`, "utf8"));
const live = read("live-conversations.json");
const visible = read("visible-turns.json");
const reload = read("reload-live-results.json");
const thinking = read("thinking-mode-results.json");
const ab = read("live-ab-results.json");
const median = values => values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
const byTier = ["standard", "high"].map(tier => {
  const rows = live.results.filter(row => row.tier === tier);
  const completed = rows.filter(row => row.status === "completed");
  const latencies = completed.map(row => row.firstVisibleMs).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    tier, attemptedTurns: rows.length, completedTurns: completed.length,
    harnessLimitedTurns: rows.filter(row => row.traceError?.message === "evaluation_call_limit").length,
    publicReplyTextAvailable: visible.turns.filter(row => row.tier === tier && row.runStatus === "completed" && row.reply).length,
    inputToFirstVisibleMs: { sampleCount: latencies.length, min: latencies[0], median: median(latencies), max: latencies.at(-1) },
    characterEstimatedTokens: completed.map(row => ({ turn: row.turn, tokens: row.blockStats.find(block => block.id === "character")?.tokens ?? null })),
    visibleProtocolLeakObserved: completed.some(row => row.protocolLeak),
  };
});
const result = {
  generatedAt: new Date().toISOString(), scope: "Current dirty workspace, default Nyra, isolated data, no production modifications",
  baselineCommit: "be1d533", live: { byTier, forwardedModelCalls: read("live-request-snapshots.json").length, interceptedAttemptsIncludingHarnessRejections: live.callCount, pageErrors: live.runtimeErrors, missingPublicReply: "standard turn 13 completed but reply unavailable in original capture; do not claim its recall content passed" },
  reload: { fixture: "Independent three-turn standard run, correction then refresh; does not replace the missing thirteen-turn reply", calls: reload.callCount, completedTurns: reload.results.filter(row => row.status === "completed").length, pageErrors: reload.pageErrors, lastTurn: reload.results.at(-1), publicTextSourcesAgree: reload.results.every(row => row.traceReply && [row.uiReply, row.eventReply, row.v2Reply, row.finalProgressReply].every(value => value === row.traceReply)) },
  thinking: { calls: thinking.callCount, concurrency: thinking.concurrency, results: thinking.results.map(row => ({ tier: row.tier, mode: row.mode, completed: row.completed, firstReasoningDeltaMs: row.firstReasoningDeltaMs, firstContentDeltaMs: row.firstContentDeltaMs, elapsedMs: row.elapsedMs, reasoningTokens: row.usage?.completion_tokens_details?.reasoning_tokens })) },
  ab: ab.execution,
  controlledDiagnostics: { promptFixtures: 9, memoryObservations: 15, memoryHealthyControls: 3, memoryIssueObservations: 12, streamScenarios: 19, note: "Counts include reproduced defects and are not pass counts or independent bug counts" },
  limitations: ["Small non-blinded samples; no statistical model ranking", "Concurrent network/provider tests; not an SLA", "Fault injection uses synthetic upstream responses", "No Android SQLite/native BYOK/production account testing", "No raw provider private reasoning collected in report"],
};
fs.writeFileSync(`${dir}/measurement-summary.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ tiers: byTier.map(({ tier, completedTurns, inputToFirstVisibleMs }) => ({ tier, completedTurns, inputToFirstVisibleMs })), reloadCompleted: result.reload.completedTurns, reloadTextSourcesAgree: result.reload.publicTextSourcesAgree, pageErrors: live.runtimeErrors.length + reload.pageErrors.length }));
