import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/model-production");
mkdirSync(outDir, { recursive: true });
const baseUrl = String(process.env.YUEQI_SMOKE_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const provider = {
  baseUrl: String(process.env.YUEQI_SMOKE_MODEL_BASE_URL || ""),
  apiKey: String(process.env.YUEQI_SMOKE_MODEL_API_KEY || ""),
  model: String(process.env.YUEQI_SMOKE_MODEL || ""),
};
const configured = Boolean(provider.baseUrl && provider.apiKey && provider.model);
const cases = [];

function record(id, status, detail = "") {
  cases.push({ id, status, detail: String(detail || "") });
  console.log(`${status.padEnd(42)} ${id}${detail ? ` - ${detail}` : ""}`);
}

async function request(path, { token = "", body, method = "POST" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(`${response.status} ${payload.message || payload.error || text.slice(0, 160)}`);
  return payload;
}

function readStreamResult(text) {
  let content = "";
  let usage = null;
  let billing = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const payload = JSON.parse(raw);
      content += String(payload?.choices?.[0]?.delta?.content || "");
      usage ||= payload?.usage || payload?.yueqi?.usage || null;
      billing ||= payload?.yueqi?.billing || null;
    } catch {
      // Ignore non-JSON provider events.
    }
  }
  return { content, usage, billing };
}

let fatal = false;
if (!configured) {
  record("chat_nonstream_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_MODEL_BASE_URL/API_KEY/MODEL");
  record("chat_stream_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_MODEL_BASE_URL/API_KEY/MODEL");
  record("tool_call_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_MODEL_BASE_URL/API_KEY/MODEL");
  record("image_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_IMAGE_API_KEY");
  record("tts_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_TTS_API_KEY");
  record("stt_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_STT_API_KEY and YUEQI_SMOKE_STT_AUDIO_FILE");
} else {
  try {
    const username = String(process.env.YUEQI_SMOKE_USERNAME || `smoke_${Date.now().toString(36)}`).toLowerCase();
    const password = String(process.env.YUEQI_SMOKE_PASSWORD || "smoke-model-2026");
    let auth;
    try { auth = await request("/auth/register", { body: { username, password } }); }
    catch { auth = await request("/auth/login", { body: { username, password } }); }
    const token = auth.token;
    await request("/account/product-access", { token, method: "PUT", body: { mode: "developer" } });
    const common = {
      billingSource: "byok",
      kind: "OpenAI Compatible",
      ...provider,
      temperature: 0,
      businessPurpose: "smoke.model_runtime",
      capability: "chat",
      modelExecutionId: randomUUID(),
    };
    const normal = await request("/model/chat", {
      token,
      body: { ...common, stream: false, messages: [{ role: "user", content: "Reply with exactly YUEQI_SMOKE_OK" }] },
    });
    const normalOk = Boolean(normal.content && normal.model && normal.usage && normal.execution?.modelExecutionId);
    record("chat_nonstream_real_provider", normalOk ? "PASS" : "FAIL", normal.model || "missing metadata");
    fatal ||= !normalOk;

    const streamResponse = await fetch(`${baseUrl}/model/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...common, stream: true, messages: [{ role: "user", content: "Reply with exactly YUEQI_STREAM_OK" }] }),
    });
    const streamText = await streamResponse.text();
    const streamResult = readStreamResult(streamText);
    const streamOk = streamResponse.ok
      && streamResult.content.includes("YUEQI_STREAM_OK")
      && Boolean(streamResult.usage)
      && Boolean(streamResult.billing);
    record("chat_stream_real_provider", streamOk ? "PASS" : "FAIL", `http=${streamResponse.status}`);
    fatal ||= !streamOk;

    const tool = await request("/model/chat", {
      token,
      body: {
        ...common,
        stream: false,
        messages: [{ role: "user", content: "Call the echo tool with value yueqi. Do not answer directly." }],
        tools: [{ type: "function", function: { name: "echo", description: "Echo a value", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } } }],
        toolChoice: "required",
      },
    });
    const toolOk = Array.isArray(tool.toolCalls) && tool.toolCalls.length > 0;
    record("tool_call_real_provider", toolOk ? "PASS" : "FAIL", `${tool.toolCalls?.length || 0} tool calls`);
    fatal ||= !toolOk;

    const imageKey = String(process.env.YUEQI_SMOKE_IMAGE_API_KEY || "");
    if (imageKey) {
      const image = await request("/image/generate", { token, body: {
        billingSource: "byok",
        apiKey: imageKey,
        baseUrl: process.env.YUEQI_SMOKE_IMAGE_BASE_URL || provider.baseUrl,
        model: process.env.YUEQI_SMOKE_IMAGE_MODEL || "gpt-image-1",
        prompt: "A single small blue circle on a white background",
        businessPurpose: "smoke.image",
      } });
      const ok = Boolean(image.b64 && image.modelExecutionId);
      record("image_real_provider", ok ? "PASS" : "FAIL");
      fatal ||= !ok;
    } else record("image_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_IMAGE_API_KEY");

    const ttsKey = String(process.env.YUEQI_SMOKE_TTS_API_KEY || "");
    if (ttsKey) {
      const response = await fetch(`${baseUrl}/voice/tts`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ billingSource: "byok", provider: process.env.YUEQI_SMOKE_TTS_PROVIDER || "OpenAI", apiKey: ttsKey, model: process.env.YUEQI_SMOKE_TTS_MODEL || "tts-1", text: "Yueqi voice smoke test" }) });
      const ok = response.ok && (await response.arrayBuffer()).byteLength > 100;
      record("tts_real_provider", ok ? "PASS" : "FAIL", `http=${response.status}`);
      fatal ||= !ok;
    } else record("tts_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_TTS_API_KEY");

    const audioPath = String(process.env.YUEQI_SMOKE_STT_AUDIO_FILE || "");
    const sttKey = String(process.env.YUEQI_SMOKE_STT_API_KEY || "");
    if (sttKey && audioPath && existsSync(audioPath)) {
      const audioBase64 = readFileSync(audioPath).toString("base64");
      const stt = await request("/voice/stt", { token, body: { billingSource: "byok", apiKey: sttKey, audioBase64, filename: audioPath.split(/[\\/]/).pop(), mimeType: "audio/wav" } });
      const ok = Boolean(stt.text && stt.modelExecutionId !== undefined);
      record("stt_real_provider", ok ? "PASS" : "FAIL");
      fatal ||= !ok;
    } else record("stt_real_provider", "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION", "set YUEQI_SMOKE_STT_API_KEY and YUEQI_SMOKE_STT_AUDIO_FILE");
  } catch (error) {
    fatal = true;
    record("smoke_runtime", "FAIL", error.message);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  status: fatal ? "FAIL" : configured ? "PASS_WITH_OPTIONAL_CAPABILITIES_PENDING" : "IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION",
  cases,
};
writeFileSync(join(outDir, "SMOKE_LATEST.json"), `${JSON.stringify(report, null, 2)}\n`);
if (fatal) process.exit(1);
