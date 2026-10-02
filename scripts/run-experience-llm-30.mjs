/**
 * Real-model Experience Runtime: three openings, ≥1 × 30 turns.
 *
 * Requires OpenAI-compatible chat credentials (not Ark image-only key):
 *   YUEQI_MODEL_BASE_URL / YUEQI_MODEL_API_KEY / YUEQI_MODEL
 * or DEEPSEEK_API_KEY (+ optional DEEPSEEK_BASE_URL / DEEPSEEK_MODEL)
 *
 * Usage: npm run evidence:llm-30
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/qa/open-experience/evidence/llm-30");

function loadDotEnv() {
  try {
    const raw = createRequire(import.meta.url)("fs").readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadDotEnv();

function resolveProvider() {
  if (process.env.YUEQI_MODEL_API_KEY && process.env.YUEQI_MODEL_BASE_URL && process.env.YUEQI_MODEL) {
    return {
      kind: "OpenAI Compatible",
      baseUrl: process.env.YUEQI_MODEL_BASE_URL.replace(/\/$/, ""),
      apiKey: process.env.YUEQI_MODEL_API_KEY,
      model: process.env.YUEQI_MODEL,
      source: "YUEQI_MODEL_*",
    };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      kind: "OpenAI Compatible",
      baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, ""),
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      source: "DEEPSEEK_*",
    };
  }
  return null;
}

async function callChat(provider, messages) {
  const url = `${provider.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.7,
      max_tokens: 800,
    }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-json ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(json?.error?.message || json?.message || `${res.status}`);
  }
  const content = json?.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("empty model content");
  return { content };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const provider = resolveProvider();
  if (!provider) {
    const report = {
      status: "external_pending",
      reason: "missing_chat_provider",
      hint: "Set YUEQI_MODEL_BASE_URL + YUEQI_MODEL_API_KEY + YUEQI_MODEL (or DEEPSEEK_API_KEY). Ark image keys are not sufficient.",
      generatedAt: new Date().toISOString(),
    };
    await writeFile(path.join(OUT, "RESULT.json"), JSON.stringify(report, null, 2), "utf8");
    console.error("evidence:llm-30 BLOCKED — no chat provider configured");
    console.error(report.hint);
    process.exit(2);
  }

  // Dynamic import after env load — experience modules are browser-oriented but Node-safe for store/director.
  const {
    registerPackage,
    enterExperience,
    runExperienceDirectorTurn,
    NIGHT_RAIN_STATION_PACKAGE,
    getExperienceSession,
  } = await import("../src/experience/index.js");

  registerPackage(NIGHT_RAIN_STATION_PACKAGE);
  const openings = (NIGHT_RAIN_STATION_PACKAGE.openings || []).map((o) => o.id);
  if (openings.length < 3) {
    console.error("expected ≥3 openings");
    process.exit(1);
  }

  const callModel = async ({ messages }) => callChat(provider, messages);
  const runs = [];

  for (let i = 0; i < openings.length; i += 1) {
    const openingId = openings[i];
    const turnsTarget = i === 0 ? 30 : 12;
    const entered = enterExperience({
      packageId: NIGHT_RAIN_STATION_PACKAGE.id,
      openingId,
      characterId: "char-xingli",
      package: NIGHT_RAIN_STATION_PACKAGE,
    });
    if (!entered.ok) {
      runs.push({ openingId, ok: false, reason: entered.reason });
      continue;
    }
    const sid = entered.value.id;
    const turnLogs = [];
    let ok = true;
    let failReason = "";
    for (let t = 1; t <= turnsTarget; t += 1) {
      const userInput = t === 1
        ? "今晚雨很大，我想站在你旁边。"
        : t % 5 === 0
          ? "如果我们错过这班车呢？"
          : t % 3 === 0
            ? "你还记得我们第一次在这里吗？"
            : `第${t}拍：我再听一听雨声。`;
      try {
        const result = await runExperienceDirectorTurn({
          experienceSessionId: sid,
          userInput,
          characterName: "星离",
          characterBrief: "夜雨车站主演",
          callModel,
        });
        if (!result.ok) {
          ok = false;
          failReason = result.reason || "turn_failed";
          turnLogs.push({ t, ok: false, reason: failReason });
          break;
        }
        turnLogs.push({
          t,
          ok: true,
          dialogue: String(result.output?.display?.dialogue || "").slice(0, 120),
          narration: String(result.output?.display?.narration || "").slice(0, 80),
        });
        // polite pacing
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        ok = false;
        failReason = String(err.message || err);
        turnLogs.push({ t, ok: false, reason: failReason });
        break;
      }
    }
    const session = getExperienceSession(sid);
    runs.push({
      openingId,
      ok,
      failReason,
      turnsTarget,
      turnsDone: turnLogs.filter((x) => x.ok).length,
      sessionStatus: session?.status || "",
      turnLogs,
    });
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${openingId} ${turnLogs.filter((x) => x.ok).length}/${turnsTarget}`
        + (failReason ? ` — ${failReason}` : ""),
    );
  }

  const thirty = runs.find((r) => r.turnsTarget >= 30 && r.ok && r.turnsDone >= 30);
  const allOpeningsOk = runs.length >= 3 && runs.every((r) => r.ok);
  const summary = {
    status: thirty && allOpeningsOk ? "GREEN" : "RED",
    providerSource: provider.source,
    model: provider.model,
    baseHost: (() => {
      try {
        return new URL(provider.baseUrl).host;
      } catch {
        return "(invalid)";
      }
    })(),
    generatedAt: new Date().toISOString(),
    openings: runs.map((r) => ({
      openingId: r.openingId,
      ok: r.ok,
      turnsDone: r.turnsDone,
      turnsTarget: r.turnsTarget,
      failReason: r.failReason || "",
    })),
    has30TurnRun: Boolean(thirty),
    runs,
  };
  await writeFile(path.join(OUT, "RESULT.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`\nevidence:llm-30 → ${summary.status} (30-turn=${summary.has30TurnRun})`);
  if (summary.status !== "GREEN") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
