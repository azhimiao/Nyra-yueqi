import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { emptyAccountStore, createAccountStore } from "../../server/account-store.mjs";
import { issueSession } from "../../server/auth/auth-core.mjs";
import { createBillingService } from "../../server/billing/service.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Isolated local account/ledger; reads existing server credentials only in memory. */
export async function startDialogueGateway({ port = 5222 } = {}) {
  let dotenv = "";
  try { dotenv = await readFile(join(root, ".env"), "utf8"); } catch { /* env-only setup */ }
  const values = {};
  for (const line of dotenv.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/.exec(line);
    if (match && /^(ARK_|YUEQI_MODEL_)/.test(match[1])) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "").trim();
  }
  const credential = process.env.ARK_API_KEY || values.ARK_API_KEY || process.env.YUEQI_MODEL_API_KEY || values.YUEQI_MODEL_API_KEY;
  if (!credential) return { available: false, reason: "No configured server text-model credential" };
  const dir = await mkdtemp(join(tmpdir(), "nyra-dialogue-eval-"));
  const dataFile = join(dir, "accounts.json");
  const userId = "isolated-dialogue-evaluation";
  const secret = randomUUID();
  const store = emptyAccountStore();
  store.users[userId] = { id: userId, username: userId, modelSource: "hosted", hostedTier: "standard", createdAt: new Date().toISOString() };
  const { token } = issueSession({ sessions: store.sessions, userId, secret, ttlMs: 2 * 60 * 60_000 });
  await writeFile(dataFile, JSON.stringify(store), { mode: 0o600 });
  const accounts = createAccountStore(dataFile);
  await createBillingService(accounts).grantCredits({ userId, credits: 100000, source: "isolated_test", referenceId: randomUUID(), type: "bonus" });
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...values, ARK_API_KEY: credential, PORT: String(port), HOST: "127.0.0.1", YUEQI_PUBLIC_SERVER: "0", YUEQI_BILLING_DATABASE_URL: "", YUEQI_BILLING_DRIVER: "", YUEQI_DATA_FILE: dataFile, YUEQI_ECONOMY_DATA_FILE: join(dir, "economy.json"), YUEQI_LOCAL_TOKEN_FILE: join(dir, "local-token"), YUEQI_UPDATE_MANIFEST_FILE: join(dir, "updates.json"), YUEQI_NOTICES_FILE: join(dir, "notices.json"), YUEQI_AUTH_SECRET: secret },
  });
  let processError = "";
  child.on("error", error => { processError = error.code || "spawn_failed"; });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(800) })).ok; } catch { /* starting */ }
    if (ready || processError || child.exitCode != null) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready) { child.kill(); throw new Error(`Isolated gateway failed to start (${processError || child.exitCode || "timeout"})`); }
  return {
    available: true, base, token, userId, dir,
    async setTier(tier) {
      const response = await fetch(`${base}/account/product-access`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "hosted", hostedTier: tier }) });
      if (!response.ok) throw new Error(`Tier selection failed: ${response.status}`);
    },
    async request(body) {
      return fetch(`${base}/model/chat`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ capability: "chat", businessPurpose: "chat.companion_reply", companionId: "isolated-eval", ...body }), signal: AbortSignal.timeout(120000) });
    },
    async stop() { child.kill(); },
  };
}
