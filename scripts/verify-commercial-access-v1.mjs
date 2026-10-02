#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { issueSession } from "../server/auth/auth-core.mjs";
import {
  estimateImageCredits,
  estimateMessagePromptTokens,
  estimateTextCredits,
  loadHostedPricing,
} from "../server/billing/pricing.mjs";

const failures = [];
function check(name, pass, detail = "") {
  if (!pass) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("commercial test server did not become healthy");
}

async function jsonRequest(baseUrl, path, { method = "GET", token = "", localToken = "", adminToken = "", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(localToken ? { "X-Yueqi-Local-Token": localToken } : {}),
      ...(adminToken ? { "X-Yueqi-Admin-Token": adminToken } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { status: response.status, payload };
}

const tempRoot = await mkdtemp(join(tmpdir(), "yueqi-commercial-"));
const localToken = "test-local-token";
const adminToken = "test-admin-token";
const managedKey = "managed-test-key";
const authSecret = "test-auth-secret";
// Pin the integration fixture's billing environment so a developer shell cannot
// silently change the expected ledger. Production overrides are exercised by the
// pricing unit tests; this test checks the shipped default catalog deterministically.
const pricingEnv = {
  ...process.env,
  YUEQI_CREDIT_CNY: "0.01",
  YUEQI_BILLING_MARKUP: "2",
  YUEQI_HOSTED_MODEL_PRICES: "{}",
  YUEQI_AGENT_MAX_CREDITS: "120",
};
const pricing = loadHostedPricing(pricingEnv);
const standardTextModel = "doubao-seed-2-1-turbo-260628";
const internalTextModel = "doubao-seed-2-0-mini-260428";
const standardImageModel = "doubao-seedream-5-0-260128";
const fullTextCredits = estimateTextCredits(
  { prompt_tokens: 1200, completion_tokens: 500 },
  standardTextModel,
  pricing,
);
const internalTextCredits = estimateTextCredits(
  { prompt_tokens: 1200, completion_tokens: 500 },
  internalTextModel,
  pricing,
);
const partialTextCredits = estimateTextCredits(
  {
    prompt_tokens: estimateMessagePromptTokens([{ role: "user", content: "stream-abort" }]),
    completion_tokens: Math.max(1, Math.ceil("stream-ok".length / 2)),
  },
  standardTextModel,
  pricing,
);
const imageCredits = estimateImageCredits(standardImageModel, pricing);
let expectedBalance = 500;
const apiPort = await freePort();
const upstreamPort = await freePort();
const upstreamRequests = [];
const dataFile = join(tempRoot, "store.json");
const sessions = {};
const issued = issueSession({
  sessions,
  userId: "commercial-user",
  secret: authSecret,
  nonce: "commercial-session",
});
const token = issued.token;
await writeFile(dataFile, JSON.stringify({
  users: {
    "commercial-user": {
      id: "commercial-user",
      username: "commercial-test",
      email: "commercial@example.com",
      emailVerifiedAt: new Date().toISOString(),
      modelSource: "byok",
      hostedTier: "standard",
    },
  },
  sessions,
  billingWallets: {
    "commercial-user": {
      userId: "commercial-user",
      balance: 0,
      reserved: 0,
      currency: "CREDIT",
      updatedAt: new Date().toISOString(),
    },
  },
}, null, 2), "utf8");

const upstream = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try { body = JSON.parse(raw); } catch { body = {}; }
  upstreamRequests.push({
    authorization: req.headers.authorization || "",
    path: req.url,
    body,
  });
  if (body.messages?.some((message) => message.content === "agent-delay")) {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (req.url?.includes("/images/generations")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      model: body.model,
      data: [{ b64_json: Buffer.from("test-image").toString("base64") }],
    }));
    return;
  }
  if (body.stream) {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "stream-ok" } }] })}\n\n`);
    if (body.messages?.some((message) => message.content === "stream-abort")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    res.write(`data: ${JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 1200, completion_tokens: 500 },
    })}\n\n`);
    res.end("data: [DONE]\n\n");
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    model: body.model,
    choices: [{ message: { content: "gateway-ok" } }],
    usage: { prompt_tokens: 1200, completion_tokens: 500 },
  }));
});
await new Promise((resolve, reject) => upstream.listen(upstreamPort, "127.0.0.1", resolve).once("error", reject));

const child = spawn(process.execPath, ["server/index.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(apiPort),
    YUEQI_DATA_FILE: dataFile,
    YUEQI_LOCAL_TOKEN: localToken,
    YUEQI_AUTH_SECRET: authSecret,
    YUEQI_ADMIN_TOKEN: adminToken,
    YUEQI_PUBLIC_SERVER: "1",
    YUEQI_BILLING_DRIVER: "pglite",
    YUEQI_BILLING_ALLOW_PGLITE: "1",
    YUEQI_CREDIT_CNY: "0.01",
    YUEQI_BILLING_MARKUP: "2",
    YUEQI_HOSTED_MODEL_PRICES: "{}",
    YUEQI_AGENT_MAX_CREDITS: "120",
    YUEQI_UPSTREAM_ALLOWLIST: "127.0.0.1",
    ARK_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
    ARK_API_KEY: managedKey,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (chunk) => { serverLog += chunk; });
child.stderr.on("data", (chunk) => { serverLog += chunk; });

try {
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await waitForHealth(baseUrl);

  const health = await jsonRequest(baseUrl, "/health");
  check("server starts in public deployment mode", health.payload.mode === "public");
  check(
    "Hosted pricing environment and model catalog are stable",
    pricing.creditCny === 0.01
      && pricing.markup === 2
      && standardTextModel === "doubao-seed-2-1-turbo-260628"
      && standardImageModel === "doubao-seedream-5-0-260128",
  );
  // Independent arithmetic oracle: this deliberately does not call the pricing
  // implementation, so a shared formula bug cannot make both sides pass.
  const independentTextCredits = Math.max(1, Math.ceil((((1200 * 3) + (500 * 15)) / 1_000_000 * 2) / 0.01));
  const independentImageCredits = Math.max(1, Math.ceil((0.22 * 2) / 0.01));
  check(
    "pricing arithmetic matches the published default rates",
    fullTextCredits === independentTextCredits && imageCredits === independentImageCredits,
    `text=${independentTextCredits}, image=${independentImageCredits}`,
  );
  const localSession = await jsonRequest(baseUrl, "/local/session");
  check("public server does not expose local service token", localSession.status === 404);

  const anonymous = await jsonRequest(baseUrl, "/model/chat", {
    method: "POST",
    body: { messages: [{ role: "user", content: "hello" }] },
  });
  check("model gateway rejects anonymous use", anonymous.status === 401);

  const missingByok = await jsonRequest(baseUrl, "/model/chat", {
    method: "POST",
    token,
    body: { messages: [{ role: "user", content: "hello" }] },
  });
  check("free mode requires user API configuration", missingByok.status === 400 && missingByok.payload.error === "model_not_configured");

  const byok = await jsonRequest(baseUrl, "/model/chat", {
    method: "POST",
    token,
    body: {
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      apiKey: "user-byok-key",
      model: "user-model",
      messages: [{ role: "user", content: "hello" }],
    },
  });
  check("free mode routes with BYOK", byok.status === 200 && byok.payload.billing?.source === "byok");
  check("free mode sends user provider credentials", upstreamRequests.at(-1)?.authorization === "Bearer user-byok-key");

  const referenceImage = await jsonRequest(baseUrl, "/image/generate", {
    method: "POST",
    token,
    body: {
      billingSource: "byok",
      apiKey: "user-byok-key",
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      model: "seedream-test",
      prompt: "portrait selfie",
      referenceMediaIds: ["local-media-id"],
      referenceImageDataUrl: "data:image/png;base64,dGVzdC1yZWZlcmVuY2U=",
      requireIdentityReferences: true,
    },
  });
  check(
    "BYOK identity selfie forwards reference image",
    referenceImage.status === 200
      && referenceImage.payload.identityReferencesApplied === true
      && upstreamRequests.at(-1)?.path?.includes("/images/generations")
      && String(upstreamRequests.at(-1)?.body?.image || "").startsWith("data:image/png;base64,"),
  );

  const selected = await jsonRequest(baseUrl, "/account/product-access", {
    method: "PUT",
    token,
    body: { modelSource: "hosted" },
  });
  check("account can select Hosted mode", selected.status === 200 && selected.payload.access?.modelSource === "hosted");

  const inactive = await jsonRequest(baseUrl, "/model/chat", {
    method: "POST",
    token,
    body: { messages: [{ role: "user", content: "hello" }] },
  });
  check("zero balance cannot consume Hosted API", inactive.status === 402 && inactive.payload.error === "credits_exhausted");

  const codeBatch = await jsonRequest(baseUrl, "/admin/billing/redeem-code-batches", {
    method: "POST",
    adminToken,
    body: { packageId: "deep", count: 2 },
  });
  check(
    "administrator can generate one-time Catfk code inventory",
    codeBatch.status === 201
      && codeBatch.payload.batch?.credits === 8000
      && codeBatch.payload.batch?.itemId === "x9xoie"
      && codeBatch.payload.batch?.codes?.length === 2,
  );

  const activated = await jsonRequest(baseUrl, "/admin/billing/grants", {
    method: "POST",
    adminToken,
    body: {
      userId: "commercial-user",
      credits: 500,
      referenceId: "commercial-test-seed",
      description: "integration seed",
    },
  });
  check("server administrator can grant Credits", activated.status === 200 && activated.payload.summary?.balance === 500);

  const beforeManagedRequests = upstreamRequests.length;
  const managed = await jsonRequest(baseUrl, "/model/chat", {
    method: "POST",
    token,
    body: {
      baseUrl: "https://client-must-not-control.example/v1",
      apiKey: "client-must-not-control",
      model: "client-must-not-control",
      messages: [{ role: "user", content: "hello" }],
      modelExecutionId: "mx-commercial-managed",
      maxTokens: 1_000_000,
    },
  });
  check("Hosted routes with server-managed provider", managed.status === 200
    && managed.payload.model === standardTextModel
    && upstreamRequests.at(-1)?.body?.model === standardTextModel);
  check("Hosted ignores client credentials", upstreamRequests.at(-1)?.authorization === `Bearer ${managedKey}`);
  check("Hosted caps upstream max_tokens", upstreamRequests.at(-1)?.body?.max_tokens === 8_192);
  expectedBalance -= fullTextCredits;
  check(
    "Hosted charges token-derived Credits",
    managed.payload.billing?.chargedCredits === fullTextCredits
      && managed.payload.billing?.remainingCredits === expectedBalance,
    `expected=${fullTextCredits}`,
  );

  const beforeInternalRequests = upstreamRequests.length;
  const freeLabel = await jsonRequest(baseUrl, "/model/chat", {
    method: "POST",
    token,
    body: {
      capability: "internal",
      businessPurpose: "memory.extract",
      messages: [{ role: "user", content: "please summarize for free" }],
      modelExecutionId: "mx-commercial-internal",
    },
  });
  check(
    "client cannot bypass Hosted billing via internal capability",
    freeLabel.status === 200
      && upstreamRequests.at(-1)?.body?.model === internalTextModel
      && freeLabel.payload.billing?.chargedCredits === internalTextCredits
      && freeLabel.payload.billing?.remainingCredits === (expectedBalance - internalTextCredits)
      && upstreamRequests.length === beforeInternalRequests + 1,
  );
  expectedBalance -= internalTextCredits;

  const beforeDuplicateRequests = upstreamRequests.length;
  const duplicate = await jsonRequest(baseUrl, "/model/chat", {
    method: "POST",
    token,
    body: {
      messages: [{ role: "user", content: "hello again" }],
      modelExecutionId: "mx-commercial-managed",
    },
  });
  check("settled model execution cannot call upstream twice", duplicate.status === 409 && upstreamRequests.length === beforeDuplicateRequests);

  const oversizedTools = await jsonRequest(baseUrl, "/model/chat", {
    method: "POST",
    token,
    body: {
      messages: [{ role: "user", content: "hello" }],
      tools: [{
        type: "function",
        function: {
          name: "oversized",
          parameters: { description: "x".repeat(250_000) },
        },
      }],
      modelExecutionId: "mx-commercial-tools",
    },
  });
  check("Hosted rejects oversized tool schemas before upstream", oversizedTools.status === 413);

  const streamResponse = await fetch(`${baseUrl}/model/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "stream" }],
      modelExecutionId: "mx-commercial-stream",
      stream: true,
    }),
  });
  const streamText = await streamResponse.text();
  check("Hosted stream completes", streamResponse.status === 200 && streamText.includes("stream-ok"));
  check(
    "Hosted stream returns billing metadata",
    streamText.includes('"yueqi"') && streamText.includes(`"chargedCredits":${fullTextCredits}`),
  );
  expectedBalance -= fullTextCredits;

  const streamAbort = new AbortController();
  const partialStream = await fetch(`${baseUrl}/model/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "stream-abort" }],
      modelExecutionId: "mx-commercial-stream-abort",
      stream: true,
    }),
    signal: streamAbort.signal,
  });
  await partialStream.body.getReader().read();
  streamAbort.abort();
  await new Promise((resolve) => setTimeout(resolve, 180));
  const afterAbort = await jsonRequest(baseUrl, "/billing/summary", { token });
  check(
    "disconnecting a partial Hosted stream still settles provider usage",
    afterAbort.payload.balance === (expectedBalance - partialTextCredits) && afterAbort.payload.reserved === 0,
  );
  expectedBalance -= partialTextCredits;

  const agent = await jsonRequest(baseUrl, "/agent/runs", {
    method: "POST",
    token,
    body: { taskId: "task-commercial", attemptId: "attempt-1" },
  });
  check("Agent run reserves its maximum", agent.status === 200 && agent.payload.summary?.reserved === 120);
  const agentCalls = await Promise.all([
    jsonRequest(baseUrl, "/model/chat", {
      method: "POST",
      token,
      body: {
        messages: [{ role: "user", content: "agent-delay" }],
        modelExecutionId: "mx-commercial-agent-1",
        agentRunId: agent.payload.agentRunId,
      },
    }),
    jsonRequest(baseUrl, "/model/chat", {
      method: "POST",
      token,
      body: {
        messages: [{ role: "user", content: "agent-delay" }],
        modelExecutionId: "mx-commercial-agent-2",
        agentRunId: agent.payload.agentRunId,
      },
    }),
  ]);
  check(
    "Agent reservation admits one child upstream owner",
    agentCalls.filter((result) => result.status === 200).length === 1
      && agentCalls.filter((result) => result.status === 409).length === 1,
  );
  const finalized = await jsonRequest(baseUrl, `/agent/runs/${agent.payload.agentRunId}/finalize`, {
    method: "POST",
    token,
    body: {},
  });
  check(
    "Agent finalization settles recorded child usage",
    finalized.status === 200 && finalized.payload.actualCredits === fullTextCredits,
  );
  expectedBalance -= fullTextCredits;

  const generatedImage = await jsonRequest(baseUrl, "/image/generate", {
    method: "POST",
    token,
    body: {
      prompt: "moonlit garden",
      size: "2048x2048",
    },
  });
  check(
    "Hosted image reserves then settles its model price",
    generatedImage.status === 200
      && upstreamRequests.at(-1)?.body?.model === standardImageModel
      && generatedImage.payload.billing?.chargedCredits === imageCredits
      && generatedImage.payload.billing?.remainingCredits === (expectedBalance - imageCredits),
  );
  expectedBalance -= imageCredits;
  const requestsBeforeReferences = upstreamRequests.length;
  const unsupportedReferences = await jsonRequest(baseUrl, "/image/generate", {
    method: "POST",
    token,
    body: {
      prompt: "portrait",
      referenceMediaIds: ["local-media-id"],
      requireIdentityReferences: true,
    },
  });
  check(
    "unsupported local image references fail before charge and provider call",
    unsupportedReferences.status === 400 && upstreamRequests.length === requestsBeforeReferences,
  );

  const access = await jsonRequest(baseUrl, "/account/product-access", { token });
  check("credit balance is authoritative on server", access.payload.access?.credits === expectedBalance);
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => upstream.close(resolve));
  await rm(tempRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error("\nCommercial access verification FAILED:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  if (serverLog.trim()) console.error(`\nServer log:\n${serverLog.trim()}`);
  process.exit(1);
}
console.log("\nCommercial access verification PASSED");
