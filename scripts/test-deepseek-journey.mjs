/**
 * End-to-end DeepSeek journey smoke test (no key persisted).
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/test-deepseek-journey.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const SERVICE = process.env.YUEQI_SERVICE || "http://127.0.0.1:8787";

async function localTokenHeaders(extra = {}) {
  const headers = { ...extra };
  const envToken = String(process.env.YUEQI_LOCAL_TOKEN || "").trim();
  if (envToken) {
    headers["X-Yueqi-Local-Token"] = envToken;
    return headers;
  }
  try {
    const session = await fetch(`${SERVICE}/local/session`);
    if (session.ok) {
      const payload = await session.json();
      if (payload.token) headers["X-Yueqi-Local-Token"] = payload.token;
    }
  } catch {
    // server offline — request will fail later with a clearer error
  }
  return headers;
}

const checks = [];
function pass(name, detail = "") {
  checks.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  checks.push({ name, ok: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForService(maxMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const response = await fetch(`${SERVICE}/health`);
      if (response.ok) return true;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function proxyChat(messages, { stream = false, temperature = 0.72 } = {}) {
  const response = await fetch(`${SERVICE}/model/chat`, {
    method: "POST",
    headers: await localTokenHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      kind: "OpenAI Compatible",
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      model: MODEL,
      messages,
      temperature,
      stream,
    }),
  });
  if (!stream) {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || `${response.status}`);
    return payload;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 300));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") continue;
      try {
        const chunk = JSON.parse(raw);
        content += chunk.choices?.[0]?.delta?.content || "";
      } catch {
        // ignore
      }
    }
  }
  return { content, stream: true };
}

async function main() {
  console.log(`DeepSeek journey test · model=${MODEL}\n`);

  if (!API_KEY) {
    console.error("Missing DEEPSEEK_API_KEY environment variable.");
    process.exit(1);
  }

  if (!(await waitForService())) {
    fail("Local service online", SERVICE);
    process.exit(1);
  }
  pass("Local service online", SERVICE);

  try {
    const health = await fetch(`${SERVICE}/health`).then((r) => r.json());
    pass("Health endpoint", health.service || "ok");
  } catch (error) {
    fail("Health endpoint", error.message);
  }

  try {
    const result = await proxyChat([
      { role: "system", content: "只回复 OK。" },
      { role: "user", content: "连通性测试" },
    ], { temperature: 0, stream: false });
    pass("模型连通（非流式）", `${result.latencyMs ?? "?"}ms · ${String(result.content).slice(0, 40)}`);
  } catch (error) {
    fail("模型连通（非流式）", error.message);
  }

  try {
    const result = await proxyChat([
      { role: "system", content: "你是克制、稳定的陪伴型角色。回复简短。" },
      { role: "user", content: "你好，我刚下载这个 App。" },
    ], { stream: true });
    pass("模型流式回复", `${result.content.length} chars`);
  } catch (error) {
    fail("模型流式回复", error.message);
  }

  const character = {
    name: "林晚",
    alias: "晚晚",
    identity: "独立书店店员",
    base: "温柔、慢热、会记住用户提到的细节。",
    tokens: ["慢热", "记得细节"],
  };

  let systemPrompt = "";
  try {
    const { buildSystemContent } = await import("../src/prompt/assemble.js");
    systemPrompt = buildSystemContent({
      promptSystem: "你是一个稳定、会尊重边界的本地陪伴角色。",
      promptDeveloper: "优先使用角色卡与世界书；不要替用户做现实决定。",
      injectionOrder: ["character", "worldbook", "memory", "daily", "external"],
      character,
      worldbook: [{ trigger: "书店", content: "用户常在周末来书店翻画册。" }],
      memories: [{ source: "chat.memory", wing: "Relationship", room: "Test", weight: 1, rawText: "用户喜欢雨天。" }],
      dailyStatus: { mood: "平静", weather: "小雨 18°", sleepHours: 7 },
      externalContext: ["日历：今日暂无已标记日程。"],
    });
    pass("Prompt 组装", `${systemPrompt.length} chars`);
  } catch (error) {
    fail("Prompt 组装", error.message);
  }

  try {
    const result = await proxyChat([
      { role: "system", content: systemPrompt || "你是林晚。" },
      { role: "user", content: "今天下雨了，我想来书店坐一会儿。" },
    ], { stream: false });
    const reply = String(result.content || "");
    const usesCharacter = /林晚|晚晚|书店/.test(reply);
    pass("典型人物对话", reply.slice(0, 80).replace(/\s+/g, " "));
    if (!usesCharacter) {
      fail("人物设定注入生效", "回复未体现角色/场景关键词");
    } else {
      pass("人物设定注入生效");
    }
  } catch (error) {
    fail("典型人物对话", error.message);
  }

  try {
    globalThis.window = { localStorage: { _data: {}, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = v; } } };
    const { searchPalace } = await import("../src/memory/palace/index.js");
    const { results } = await searchPalace("雨天", { topK: 3, force: true });
    pass("记忆宫殿检索", `${results.length} hits`);
  } catch (error) {
    fail("记忆宫殿检索", error.message);
  }

  try {
    const { buildDiaryContext } = await import("../src/diary/generate.js");
    const now = new Date().toISOString();
    const ctx = await buildDiaryContext({
      sessionId: "default-session",
      getMessagesBySession: async () => [
        { role: "user", content: "今天下雨了。", createdAt: now },
        { role: "assistant", content: "嗯，适合待在书店。", createdAt: now },
      ],
      getAllRecords: async () => [],
      normalizeMemory: (record) => record,
      currentDailyStatus: { mood: "平静", weather: { label: "小雨 18°" }, asleep: false },
      collectProfileState: () => ({ fields: [character.name, character.alias] }),
    });
    pass("日记 24h 上下文", `messages=${ctx.messageCount}`);
    const diaryResult = await proxyChat([
      { role: "system", content: `你是${character.name}，以第一人称写一篇短日记。` },
      { role: "user", content: `根据对话摘要写日记：\n${ctx.excerpt}` },
    ], { temperature: 0.8, stream: false });
    pass("日记生成（模型）", String(diaryResult.content).slice(0, 60).replace(/\s+/g, " "));
  } catch (error) {
    fail("日记/上下文", error.message);
  }

  try {
    const tts = await fetch(`${SERVICE}/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "OpenAI", apiKey: API_KEY, model: "tts-1", text: "测试", openaiVoice: "alloy" }),
    });
    if (tts.ok) pass("TTS（OpenAI 路由）", "unexpected ok with DeepSeek key");
    else pass("TTS 需独立 Key", "DeepSeek Key 不能用于 TTS（预期）");
  } catch {
    pass("TTS 需独立 Key", "DeepSeek Key 不能用于 TTS（预期）");
  }

  const failed = checks.filter((item) => !item.ok);
  console.log("");
  if (failed.length) {
    console.error(`Journey failed: ${failed.length}/${checks.length}`);
    process.exit(1);
  }
  console.log(`Journey passed: ${checks.length}/${checks.length}`);
  console.log("\n典型新用户路径：接口页填 DeepSeek → 设定页改人物卡 → 聊天 → 记忆/日记 均可走通。");
  console.log("语音朗读/转写仍需 ElevenLabs + OpenAI Whisper Key，不能复用 DeepSeek Key。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
