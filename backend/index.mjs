/**
 * Open-source BYOK companion gateway.
 * No hosted models, credits, notices, or vendor download channels.
 */
import cors from "cors";
import express from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findUserByIdentifier,
  issueSession,
  normalizeEmail,
  normalizeUsername,
  verifySession,
} from "./auth/auth-core.mjs";
import { createAccountStore } from "./account-store.mjs";
import { mountRetrievalRoutes } from "./retrieval/gateway.mjs";
import { mountEconomyRoutes } from "./economy/routes.mjs";
import { assertSafeUpstreamUrl } from "./upstream-url.mjs";
import { requireCurrentLegalConsent } from "../shared/legal-consent.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = String(process.env.YUEQI_DATA_FILE || "").trim()
  || join(__dirname, "data", "store.json");
const tokenFile = String(process.env.YUEQI_LOCAL_TOKEN_FILE || "").trim()
  || join(__dirname, "data", ".local-token");
const economyDataFile = String(process.env.YUEQI_ECONOMY_DATA_FILE || "").trim()
  || join(__dirname, "data", "economy.json");

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

const accountStore = createAccountStore(dataFile);
const port = Number(process.env.PORT || 8787);
const corsOrigins = String(process.env.YUEQI_CORS_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

let localToken = "";
let authSecret = "";

function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (corsOrigins.includes("*")) return true;
  if (corsOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === "capacitor:" || url.protocol === "ionic:") return true;
    if ((url.protocol === "http:" || url.protocol === "https:") && isLocalHostname(url.hostname)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function ensureLocalToken() {
  const fromEnv = String(process.env.YUEQI_LOCAL_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const existing = (await readFile(tokenFile, "utf8")).trim();
    if (existing) return existing;
  } catch {
    /* create below */
  }
  const token = randomBytes(32).toString("base64url");
  await mkdir(dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, token, "utf8");
  return token;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 32).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const actual = scryptSync(String(password), salt, 32).toString("hex");
  return safeEqual(actual, hash);
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function userFromAuth(req) {
  const token = bearerToken(req);
  if (!token || !authSecret) return "";
  const store = await accountStore.readStore();
  return verifySession({ sessions: store.sessions || {}, token, secret: authSecret }) || "";
}

function requireLocalToken(req, res, next) {
  const token = bearerToken(req) || String(req.headers["x-yueqi-local-token"] || "").trim();
  if (!localToken || !safeEqual(token, localToken)) {
    return res.status(401).json({ error: "unauthorized", message: "需要本机网关令牌。" });
  }
  return next();
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email || "",
    createdAt: user.createdAt || null,
    productAccess: {
      mode: "byok",
      modelSource: "byok",
      hostedTier: "standard",
      credits: 0,
      hostedAvailable: false,
      byokAllowed: true,
    },
  };
}

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
}));
app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: "byok", hosted: false });
});

app.get("/local/session", async (_req, res) => {
  if (!localToken) localToken = await ensureLocalToken();
  return res.json({ ok: true, local: true, token: localToken });
});

function goneAccount(_req, res) {
  return res.status(410).json({
    ok: false,
    error: "account_removed",
    message: "开源版不提供云账号登录。",
  });
}
app.post("/auth/register", goneAccount);
app.post("/auth/login", goneAccount);
app.get("/auth/me", goneAccount);
app.post("/auth/logout", (_req, res) => res.json({ ok: true }));
app.get("/account/product-access", goneAccount);

app.post("/sync/upload", async (req, res) => {
  const userId = await userFromAuth(req);
  if (!userId) return res.status(410).json({ error: "account_removed", message: "开源版不提供云同步。" });
  await accountStore.transact((store) => {
    store.sync[userId] = {
      payload: req.body?.payload ?? req.body ?? {},
      updatedAt: new Date().toISOString(),
    };
  });
  return res.json({ ok: true });
});

app.get("/sync/download", async (req, res) => {
  const userId = await userFromAuth(req);
  if (!userId) return res.status(410).json({ error: "account_removed", message: "开源版不提供云同步。" });
  const store = await accountStore.readStore();
  return res.json({ ok: true, ...(store.sync[userId] || { payload: null }) });
});

app.post("/model/chat", async (req, res) => {
  const body = req.body || {};
  const userId = await userFromAuth(req);
  const localOk = localToken && safeEqual(bearerToken(req) || "", localToken);
  if (!userId && !localOk) {
    return res.status(401).json({ error: "login_required", message: "请先登录，或使用本机离线模式直连模型。" });
  }
  let baseUrl = "";
  let apiKey = "";
  let model = "";
  try {
    const rawBaseUrl = String(body.baseUrl || "").trim();
    baseUrl = rawBaseUrl ? assertSafeUpstreamUrl(rawBaseUrl, { publicServer: false }) : "";
    apiKey = String(body.apiKey || "").trim();
    model = String(body.model || "").trim();
  } catch (error) {
    return res.status(400).json({ error: error.code || "invalid_base_url", message: error.message });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const stream = Boolean(body.stream);
  if (!baseUrl || !apiKey || !model) {
    return res.status(400).json({
      error: "model_not_configured",
      message: "需要配置 OpenAI 兼容的 Base URL、API Key 和模型名。",
    });
  }
  if (!messages.length) {
    return res.status(400).json({ error: "missing_messages", message: "messages 不能为空。" });
  }

  const startedAt = Date.now();
  const maxTokens = Number(body.maxTokens) > 0 ? Math.floor(Number(body.maxTokens)) : 0;
  const upstreamBody = {
    model,
    messages,
    temperature: Number(body.temperature ?? 0.72),
    ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
    ...(tools.length ? { tools } : {}),
    ...(body.toolChoice || body.tool_choice ? { tool_choice: body.toolChoice || body.tool_choice } : {}),
    stream,
  };
  const controller = new AbortController();
  const timeoutMs = Math.min(300_000, Math.max(30_000, Number(process.env.YUEQI_MODEL_TIMEOUT_MS) || 120_000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    });
    if (stream) {
      if (!upstream.ok) {
        const text = await upstream.text();
        return res.status(502).json({
          error: "model_upstream_error",
          status: upstream.status,
          message: text.slice(0, 500),
        });
      }
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.flushHeaders?.();
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      return res.end();
    }
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
    if (!upstream.ok) {
      return res.status(502).json({
        error: "model_upstream_error",
        status: upstream.status,
        message: payload?.error?.message || payload?.message || text.slice(0, 500),
      });
    }
    const message = payload?.choices?.[0]?.message || { role: "assistant", content: "" };
    const content = typeof message.content === "string" ? message.content : (message.content ?? "");
    const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
    if (!content && !hasToolCalls) {
      return res.status(502).json({ error: "empty_model_response", message: "模型返回为空。", raw: payload });
    }
    return res.json({
      ok: true,
      content: content || "",
      message,
      model: payload.model || model,
      latencyMs: Date.now() - startedAt,
      usage: payload.usage || null,
      billing: { source: "byok", chargedCredits: 0 },
    });
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return res.status(aborted ? 504 : 502).json({
      error: aborted ? "model_timeout" : "model_proxy_failed",
      message: aborted ? "上游模型超时。" : String(error?.message || error),
    });
  } finally {
    clearTimeout(timer);
  }
});

app.post("/image/generate", async (req, res) => {
  const body = req.body || {};
  const userId = await userFromAuth(req);
  if (!userId) return res.status(401).json({ error: "login_required" });
  let baseUrl = "";
  try {
    const raw = String(body.baseUrl || "").trim();
    baseUrl = raw ? assertSafeUpstreamUrl(raw, { publicServer: false }) : "";
  } catch (error) {
    return res.status(400).json({ error: "invalid_base_url", message: error.message });
  }
  const apiKey = String(body.apiKey || "").trim();
  const model = String(body.model || "").trim();
  const prompt = String(body.prompt || "").trim();
  if (!baseUrl || !apiKey || !model || !prompt) {
    return res.status(400).json({ error: "image_not_configured", message: "生图需要 Base URL、API Key、模型名和提示词。" });
  }
  try {
    const upstream = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size: body.size || "1024x1024",
        n: 1,
      }),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(502).json({ error: "image_upstream_error", message: payload?.error?.message || "生图上游失败。" });
    }
    return res.json({ ok: true, ...payload, billing: { source: "byok", chargedCredits: 0 } });
  } catch (error) {
    return res.status(502).json({ error: "image_proxy_failed", message: String(error?.message || error) });
  }
});

app.post("/world/forward", requireLocalToken, async (req, res) => {
  const body = req.body || {};
  const rawBase = String(body.baseUrl || "").trim();
  if (!rawBase) {
    return res.status(400).json({ error: "missing_base_url", message: "请先在接口页填写世界平台 Base URL。" });
  }
  let baseUrl = "";
  try {
    baseUrl = assertSafeUpstreamUrl(rawBase, { publicServer: false });
  } catch (error) {
    return res.status(400).json({ error: "invalid_base_url", message: error.message });
  }
  const path = String(body.path || "/").startsWith("/") ? String(body.path) : `/${body.path || ""}`;
  const method = String(body.method || "GET").toUpperCase();
  const url = new URL(`${baseUrl}${path}`);
  if (body.query && typeof body.query === "object") {
    for (const [key, value] of Object.entries(body.query)) {
      if (value == null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(body.apiKey ? { "X-API-Key": String(body.apiKey) } : {}),
        ...(body.headers && typeof body.headers === "object" ? body.headers : {}),
      },
      body: method === "GET" || body.body == null ? undefined : JSON.stringify(body.body),
    });
    const text = await upstream.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return res.status(upstream.ok ? 200 : 502).json({
      ok: upstream.ok,
      status: upstream.status,
      data,
    });
  } catch (error) {
    return res.status(502).json({ error: "world_proxy_failed", message: String(error?.message || error) });
  }
});

mountRetrievalRoutes(app, {
  requireAuth: async (req, res, next) => {
    const userId = await userFromAuth(req);
    if (userId) return next();
    return requireLocalToken(req, res, next);
  },
});

app.use(async (req, res, next) => {
  if (String(req.path || req.url || "").startsWith("/economy")) {
    if (!localToken) localToken = await ensureLocalToken();
    const token = bearerToken(req);
    if (localToken && token && safeEqual(token, localToken)) {
      req._economyUserId = "local";
    }
  }
  next();
});
mountEconomyRoutes(app, {
  dataFile: economyDataFile,
  authenticate: (req) => req._economyUserId || "",
});

localToken = await ensureLocalToken();
authSecret = String(process.env.YUEQI_AUTH_SECRET || "").trim() || `auth:${localToken}`;
await mkdir(dirname(dataFile), { recursive: true });

const server = app.listen(port, String(process.env.HOST || "127.0.0.1"), () => {
  console.log(`yueqi-open gateway http://127.0.0.1:${port} (BYOK only)`);
});

server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
