import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOSTED_TIER_MODELS } from "../server/billing/hosted-catalog.mjs";
import { estimateImageCredits } from "../server/billing/pricing.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "qa", "model-production");
mkdirSync(outDir, { recursive: true });

const baseUrl = String(process.env.YUEQI_SMOKE_BASE_URL || "http://127.0.0.1:8791").replace(/\/$/, "");
const adminToken = String(process.env.YUEQI_SMOKE_ADMIN_TOKEN || "");
const username = String(process.env.YUEQI_SMOKE_USERNAME || "").toLowerCase();
const password = String(process.env.YUEQI_SMOKE_PASSWORD || "ark-accept-2026");
const cases = [];
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const redeemCode = `NYRA-ARK-${randomUUID().slice(0, 8).toUpperCase()}`;

function record(id, ok, detail = {}) {
  cases.push({ id, status: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}`);
  if (!ok) process.exitCode = 1;
}

async function call(path, { method = "POST", token = "", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { response, payload, text };
}

function execution(purpose, capability = "character") {
  return {
    businessPurpose: purpose,
    capability,
    modelExecutionId: randomUUID(),
    turnExecutionId: randomUUID(),
    companionId: "acceptance-companion",
  };
}

function streamPayload(text) {
  let content = "";
  let model = "";
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const event = JSON.parse(raw);
      content += String(event?.choices?.[0]?.delta?.content || "");
      model ||= String(event?.model || "");
    } catch {
      // Ignore provider keepalive events.
    }
  }
  return { content, model };
}

if (!adminToken) throw new Error("YUEQI_SMOKE_ADMIN_TOKEN is required");
if (!username) throw new Error("YUEQI_SMOKE_USERNAME is required");

const health = await call("/health", { method: "GET" });
record("health", health.response.ok && health.payload.ok === true, { status: health.response.status });

const noAuth = await call("/model/chat", { body: { messages: [{ role: "user", content: "test" }] } });
record("login_required", noAuth.response.status === 401 && noAuth.payload.error === "login_required", { status: noAuth.response.status });

const login = await call("/auth/login", { body: { username, password } });
const token = String(login.payload?.token || "");
record("account_login", login.response.ok && Boolean(token), { status: login.response.status });

const developerMode = await call("/account/product-access", {
  method: "PUT",
  token,
  body: { mode: "byok" },
});
record(
  "developer_mode_selected",
  developerMode.response.ok && developerMode.payload?.access?.mode === "byok",
  { status: developerMode.response.status, access: developerMode.payload?.access || null },
);

const developerMissingKey = await call("/model/chat", {
  token,
  body: { ...execution("assistant.conversation"), messages: [{ role: "user", content: "test" }] },
});
record(
  "developer_requires_byok",
  developerMissingKey.response.status === 400 && developerMissingKey.payload.error === "model_not_configured",
  { status: developerMissingKey.response.status, error: developerMissingKey.payload.error || "" },
);

const codeCreation = await call("/admin/billing/redeem-codes", {
  headers: { "x-yueqi-admin-token": adminToken },
  body: { code: redeemCode, credits: 200, channel: "managed_ark_acceptance" },
});
record(
  "redeem_code_created",
  codeCreation.response.status === 201 && codeCreation.payload?.ok === true,
  { status: codeCreation.response.status, credits: codeCreation.payload?.redeemCode?.credits || 0 },
);

const redemption = await call("/billing/redeem", {
  token,
  body: { code: redeemCode },
});
const fundedCredits = Number(redemption.payload?.summary?.balance || 0);
record(
  "credits_redeemed",
  redemption.response.ok && Number(redemption.payload?.credited) === 200 && fundedCredits >= 200,
  { status: redemption.response.status, credited: redemption.payload?.credited || 0, balance: fundedCredits },
);

const hostedMode = await call("/account/product-access", {
  method: "PUT",
  token,
  body: { mode: "hosted" },
});
record(
  "hosted_mode_selected",
  hostedMode.response.ok
    && hostedMode.payload?.access?.mode === "hosted"
    && hostedMode.payload?.access?.hostedAvailable === true,
  { status: hostedMode.response.status, access: hostedMode.payload?.access || null },
);

const companion = await call("/model/chat", {
  token,
  body: {
    ...execution("chat.companion_reply"),
    temperature: 0.45,
    maxTokens: 120,
    messages: [
      { role: "system", content: "你是用户长期相处的数字伴侣。自然、具体、克制，不要自称助手，不要列清单。" },
      { role: "user", content: "今天没做什么，但还是觉得很累。只回复一两句话。" },
    ],
  },
});
const companionText = String(companion.payload?.content || "");
record(
  "companion_character_route",
  companion.response.ok
    && String(companion.payload?.model || "") === HOSTED_TIER_MODELS.standard.character
    && companionText.length >= 6
    && companionText.length <= 220
    && !/(作为.{0,6}(ai|助手)|以下是|建议如下)/i.test(companionText),
  {
    status: companion.response.status,
    model: companion.payload?.model || "",
    contentLength: companionText.length,
    billing: companion.payload?.billing || null,
  },
);

const task = await call("/model/chat", {
  token,
  body: {
    ...execution("assistant.conversation", "assistant"),
    temperature: 0,
    maxTokens: 100,
    messages: [{ role: "user", content: "只返回 JSON：{\"intent\":\"review_settings\",\"needsConfirmation\":false}" }],
  },
});
record(
  "assistant_task_route",
  task.response.ok
    && !/doubao-seed-character/i.test(String(task.payload?.model || ""))
    && /review_settings/.test(String(task.payload?.content || "")),
  { status: task.response.status, model: task.payload?.model || "", billing: task.payload?.billing || null },
);

const tool = await call("/model/chat", {
  token,
  body: {
    ...execution("assistant.tool_call", "tool"),
    temperature: 0,
    messages: [{ role: "user", content: `今天是 ${new Date().toISOString().slice(0, 10)}。请调用工具创建明天下午三点给妈妈打电话的提醒，startTime 必须使用 ${tomorrow}T15:00:00+08:00，不要直接回答。` }],
    tools: [{
      type: "function",
      function: {
        name: "create_calendar_event",
        description: "创建日历提醒",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            startTime: { type: "string" },
          },
          required: ["title", "startTime"],
        },
      },
    }],
    toolChoice: "required",
  },
});
let toolArgs = null;
const firstToolCall = tool.payload?.message?.tool_calls?.[0] || null;
try { toolArgs = JSON.parse(firstToolCall?.function?.arguments || "null"); } catch {}
record(
  "companion_tool_call",
  tool.response.ok
    && firstToolCall?.function?.name === "create_calendar_event"
    && /妈妈|电话/.test(String(toolArgs?.title || ""))
    && String(toolArgs?.startTime || "").startsWith(tomorrow),
  { status: tool.response.status, tool: firstToolCall?.function?.name || "", args: toolArgs },
);

const stream = await call("/model/chat", {
  token,
  body: {
    ...execution("chat.companion_reply"),
    stream: true,
    temperature: 0,
    maxTokens: 50,
    messages: [{ role: "user", content: "只回复：我在这里。" }],
  },
});
const parsedStream = streamPayload(stream.text);
const streamBilling = {
  source: stream.response.headers.get("x-yueqi-billing-source") || "",
  chargedCredits: Number(stream.response.headers.get("x-yueqi-credits-charged") || 0),
  remainingCredits: Number(stream.response.headers.get("x-yueqi-credits-remaining") || 0),
};
record(
  "companion_stream",
    stream.response.ok
    && parsedStream.content.includes("我在这里")
    && streamBilling.source === "hosted"
    && streamBilling.chargedCredits > 0,
  { status: stream.response.status, model: parsedStream.model, billing: streamBilling },
);

const visionPng = readFileSync(
  join(root, "public", "assets", "characters", "yueqi-female", "portrait.png"),
).toString("base64");
const vision = await call("/model/chat", {
  token,
  body: {
    ...execution("vision.media_perception", "vision"),
    temperature: 0,
    maxTokens: 80,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "请用一句中文描述图中人物的发色、服装和画风。" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${visionPng}` } },
      ],
    }],
  },
});
record(
  "vision_route",
  vision.response.ok
    && String(vision.payload?.model || "") === HOSTED_TIER_MODELS.standard.vision
    && /(金|浅|白).*(发|头发)|女孩|少女|二次元|动漫|白色/.test(String(vision.payload?.content || "")),
  { status: vision.response.status, model: vision.payload?.model || "", billing: vision.payload?.billing || null },
);

const image = await call("/image/generate", {
  token,
  body: {
    ...execution("creative.image_market_product", "image"),
    prompt: "Minimal premium editorial illustration, a single translucent blue butterfly above a white flower, cool white background, navy details, no text",
    size: "2048x2048",
  },
});
record(
  "image_generation",
  image.response.ok
    && /^image\/(png|jpeg|webp)$/.test(String(image.payload?.mimeType || ""))
    && String(image.payload?.b64 || "").length > 100_000
    && String(image.payload?.model || "") === HOSTED_TIER_MODELS.standard.image
    && Number(image.payload?.billing?.chargedCredits) === estimateImageCredits(HOSTED_TIER_MODELS.standard.image),
  {
    status: image.response.status,
    model: image.payload?.model || "",
    mimeType: image.payload?.mimeType || "",
    bytesApprox: Math.floor(String(image.payload?.b64 || "").length * 0.75),
    billing: image.payload?.billing || null,
  },
);

const finalAccess = await call("/account/product-access", { method: "GET", token });
record(
  "credit_ledger",
  finalAccess.response.ok
    && finalAccess.payload?.access?.mode === "hosted"
    && Number(finalAccess.payload?.access?.credits) >= 0
    && Number(finalAccess.payload?.access?.credits) < fundedCredits,
  { status: finalAccess.response.status, access: finalAccess.payload?.access || null },
);

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  username,
  status: cases.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
  cases,
};
writeFileSync(join(outDir, "MANAGED_ARK_LATEST.json"), `${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "PASS") process.exitCode = 1;
