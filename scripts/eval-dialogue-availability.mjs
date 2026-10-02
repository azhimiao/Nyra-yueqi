import { mkdir, writeFile } from "node:fs/promises";
import { startDialogueGateway } from "./lib/dialogue-eval-gateway.mjs";
const results = [];
const gateway = await startDialogueGateway();
try {
  if (!gateway.available) results.push({ available: false, reason: gateway.reason });
  else for (const tier of ["standard", "high"]) {
    await gateway.setTier(tier);
    const started = Date.now();
    const response = await gateway.request({ messages: [{ role: "user", content: "只回复：收到。" }], maxTokens: 32, temperature: 0, stream: false });
    const payload = await response.json();
    const result = { tier, available: response.ok, status: response.status, model: payload.model || payload.execution?.model || null, latencyMs: Date.now() - started, error: payload.error || null, content: response.ok ? payload.content : undefined };
    results.push(result); console.log(JSON.stringify(result));
  }
} finally {
  await gateway.stop?.();
  await mkdir("docs/qa/dialogue-evaluation", { recursive: true });
  await writeFile("docs/qa/dialogue-evaluation/model-availability.json", JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
}
