/**
 * Refresh Codex audit extracts into docs/qa/companion-os/CODEX_AUDIT_EXTRACTS_2026-08-02/
 * Sources: PRODUCT_RED §0.1 / CODEX_AUDIT_SOURCES.md
 */
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/qa/companion-os/CODEX_AUDIT_EXTRACTS_2026-08-02");

const SOURCES = [
  {
    id: "delivery",
    file: "F:/codex/.codex/sessions/2026/08/02/rollout-2026-08-02T10-40-02-019fc057-b767-7c93-adda-dfb68b8210dd.jsonl",
  },
  {
    id: "crosschar",
    file: "F:/codex/.codex/sessions/2026/08/02/rollout-2026-08-02T10-39-36-019fc057-54dd-7ce1-9ef8-f44a06f80015.jsonl",
  },
  {
    id: "openclaw",
    file: "F:/codex/.codex/sessions/2026/08/02/rollout-2026-08-02T10-39-48-019fc057-8404-7d92-9341-563d2cf10a8a.jsonl",
  },
];

async function extract(file) {
  let bestAssistant = "";
  const finals = [];
  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type === "event_msg" && obj.payload?.type === "task_complete") {
      const msg = obj.payload.last_agent_message;
      if (msg) finals.push(msg);
    }
    if (obj.type === "response_item" && obj.payload?.role === "assistant") {
      const text = (obj.payload.content || []).map((p) => p.text || "").join("");
      if (text.length > bestAssistant.length) bestAssistant = text;
    }
  }
  const longestFinal = [...finals].sort((a, b) => b.length - a.length)[0] || "";
  const body = longestFinal.length >= bestAssistant.length ? longestFinal : bestAssistant;
  return { body, finalsCount: finals.length, bodyChars: body.length };
}

mkdirSync(OUT, { recursive: true });
for (const src of SOURCES) {
  const { body, finalsCount, bodyChars } = await extract(src.file);
  const outPath = join(OUT, `${src.id}-final.md`);
  writeFileSync(
    outPath,
    `# Source: ${src.file}\n\n` +
      `<!-- extracted by scripts/extract-codex-audit-finals.mjs; task_complete count=${finalsCount} chars=${bodyChars} -->\n\n` +
      `${body}\n`,
    "utf8",
  );
  console.log(`${src.id}: ${bodyChars} chars → ${outPath}`);
}
