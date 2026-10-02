from pathlib import Path

root = Path(r"f:/beautiful")

# R5 package intake
files = {}

files["src/skill-platform/package-intake.js"] = r'''/**
 * Unified Package Intake (R5) — zip / folder / yueqi-skill safety + install envelope.
 */
import { unzipSync, strFromU8 } from "fflate";
import { createPackageManifestV1, validatePackageManifestV1, mintId } from "../contracts/index.js";

export const INTAKE_LIMITS = Object.freeze({
  maxFiles: 200,
  maxUncompressedBytes: 8 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024,
});

const FORBIDDEN_EXT = /\.(exe|dll|bat|cmd|sh|ps1|msi|com|scr)$/i;

/**
 * @param {Uint8Array} bytes
 */
export function inspectZipBytes(bytes) {
  const errors = [];
  if (!(bytes instanceof Uint8Array) && !(bytes?.buffer)) {
    return { ok: false, errors: ["not_bytes"] };
  }
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let unzipped;
  try {
    unzipped = unzipSync(raw);
  } catch (e) {
    return { ok: false, errors: [`unzip_failed:${e?.message || e}`] };
  }
  const names = Object.keys(unzipped || {});
  if (names.length > INTAKE_LIMITS.maxFiles) errors.push("too_many_files");
  let total = 0;
  const files = {};
  for (const name of names) {
    const n = String(name || "").replace(/\\/g, "/");
    if (!n || n.endsWith("/")) continue;
    if (n.startsWith("/") || n.includes("..") || /^[A-Za-z]:/.test(n)) {
      errors.push("path_traversal");
      continue;
    }
    if (FORBIDDEN_EXT.test(n)) {
      errors.push("executable_rejected");
      continue;
    }
    const data = unzipped[name];
    const size = data?.byteLength || 0;
    total += size;
    if (size > INTAKE_LIMITS.maxEntryBytes) errors.push("entry_too_large");
    if (total > INTAKE_LIMITS.maxUncompressedBytes) errors.push("zip_bomb_or_too_large");
    try {
      files[n] = strFromU8(data);
    } catch {
      files[n] = "";
    }
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)], files };
  const skillMd = Object.keys(files).find((k) => /(^|\/)SKILL\.md$/i.test(k));
  return { ok: true, files, skillMd: skillMd || "", fileCount: Object.keys(files).length };
}

/**
 * Build natural-language capability preview for users (no JSON/path exposure required).
 */
export function buildCapabilityPreview(manifest, files = {}) {
  const name = String(manifest?.name || "未命名能力包");
  const caps = Array.isArray(manifest?.requestedCapabilities) ? manifest.requestedCapabilities : [];
  const willRead = caps.filter((c) => /read|memory|context/i.test(String(c)));
  const mayWrite = caps.filter((c) => /write|task|tool|file/i.test(String(c)));
  return {
    title: name,
    summary: `「${name}」可以帮你完成一套专业工作流。`,
    willRead: willRead.length ? willRead.map(String) : ["仅你确认后的对话内容"],
    mayModify: mayWrite.length ? mayWrite.map(String) : ["不会在未授权时改动你的数据"],
    hasSkillMd: Boolean(Object.keys(files).some((k) => /(^|\/)SKILL\.md$/i.test(k))),
  };
}

export function buildInstallManifestFromFiles(files, opts = {}) {
  const skillMd = Object.keys(files || {}).find((k) => /(^|\/)SKILL\.md$/i.test(k)) || "";
  const manifest = createPackageManifestV1({
    packageId: opts.packageId || mintId("packageId"),
    packageType: opts.packageType || "skill",
    name: opts.name || "Imported Skill",
    version: opts.version || "1.0.0",
    contentHash: opts.contentHash || `sha256:${Object.keys(files || {}).length}`,
    requestedCapabilities: opts.requestedCapabilities || [],
    entry: skillMd || "SKILL.md",
    sourceLabel: opts.sourceLabel || "zip_intake",
  });
  const v = validatePackageManifestV1(manifest);
  return { ok: v.ok, manifest, errors: v.errors, preview: buildCapabilityPreview(manifest, files) };
}
'''

files["src/experience/package-v1.js"] = r'''/**
 * ExperiencePackage V1 (R6) — shared envelope for scenario/adventure/scroll/cocreate.
 */
export const EXPERIENCE_KINDS = Object.freeze([
  "scenario",
  "adventure",
  "scroll",
  "cocreate",
  "yeos",
  "play_skill",
]);

export const EXPERIENCE_PACKAGE_SCHEMA_VERSION = 1;

export function createExperiencePackageV1(input = {}) {
  return {
    schemaVersion: EXPERIENCE_PACKAGE_SCHEMA_VERSION,
    experienceId: String(input.experienceId || ""),
    kind: EXPERIENCE_KINDS.includes(input.kind) ? input.kind : "scenario",
    title: String(input.title || "").trim(),
    companionId: String(input.companionId || ""),
    openings: Array.isArray(input.openings) ? input.openings : [],
    worldBook: input.worldBook && typeof input.worldBook === "object" ? input.worldBook : {},
    rules: Array.isArray(input.rules) ? input.rules : [],
    replyFormat: String(input.replyFormat || "im"),
    visualAssets: input.visualAssets && typeof input.visualAssets === "object" ? input.visualAssets : {},
    endingConditions: Array.isArray(input.endingConditions) ? input.endingConditions : [],
    realityNamespace: "shared_fiction",
  };
}

export function validateExperiencePackageV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== EXPERIENCE_PACKAGE_SCHEMA_VERSION) errors.push("schemaVersion");
  if (!String(raw.experienceId || "").trim()) errors.push("experienceId");
  if (!EXPERIENCE_KINDS.includes(raw.kind)) errors.push("kind");
  if (!String(raw.title || "").trim()) errors.push("title");
  if (raw.realityNamespace !== "shared_fiction") errors.push("must_be_shared_fiction");
  return { ok: errors.length === 0, errors };
}

export function createExperienceSessionV1(input = {}) {
  return {
    schemaVersion: 1,
    sessionId: String(input.sessionId || ""),
    experienceId: String(input.experienceId || ""),
    companionId: String(input.companionId || ""),
    state: String(input.state || "active"),
    turn: Number(input.turn) || 0,
    ending: input.ending || null,
    realityNamespace: "shared_fiction",
  };
}
'''

files["src/billing/ledger-core.js"] = r'''/**
 * Server Billing Core contracts (R8/B1) — NyraCoin stays local; BillingCredit is server-authoritative.
 * This module is the in-repo contract + in-memory reference ledger for tests.
 * Production must use transactional DB; never reuse src/wallet/ledger.js.
 */
export const BILLING_CREDIT_SCHEMA_VERSION = 1;

export function createCreditAccount(input = {}) {
  return {
    schemaVersion: BILLING_CREDIT_SCHEMA_VERSION,
    userId: String(input.userId || ""),
    balance: Math.max(0, Number(input.balance) || 0),
    currency: "billing_credit",
    updatedAt: new Date().toISOString(),
  };
}

export function createLedgerEntry(input = {}) {
  return {
    schemaVersion: BILLING_CREDIT_SCHEMA_VERSION,
    entryId: String(input.entryId || `ble_${Date.now().toString(36)}`),
    userId: String(input.userId || ""),
    kind: String(input.kind || "adjust"), // purchase | redeem | reserve | settle | release | adjust
    amount: Number(input.amount) || 0,
    idempotencyKey: String(input.idempotencyKey || ""),
    reservationId: String(input.reservationId || ""),
    meta: input.meta && typeof input.meta === "object" ? input.meta : {},
    createdAt: new Date().toISOString(),
  };
}

/** In-memory reference implementation for concurrent redeem tests. */
export function createInMemoryBillingLedger() {
  /** @type {Map<string, { balance: number, entries: object[], reservations: Map<string, number>, usedCodes: Set<string> }>} */
  const accounts = new Map();

  function acct(userId) {
    if (!accounts.has(userId)) {
      accounts.set(userId, { balance: 0, entries: [], reservations: new Map(), usedCodes: new Set() });
    }
    return accounts.get(userId);
  }

  return {
    redeemCode({ userId, code, credits }) {
      const a = acct(userId);
      const key = String(code || "").trim();
      if (!key) return { ok: false, reason: "missing_code" };
      if (a.usedCodes.has(key)) return { ok: false, reason: "code_already_used" };
      a.usedCodes.add(key);
      const amount = Math.max(0, Number(credits) || 0);
      a.balance += amount;
      const entry = createLedgerEntry({ userId, kind: "redeem", amount, idempotencyKey: `redeem:${key}` });
      a.entries.push(entry);
      return { ok: true, balance: a.balance, entry };
    },
    reserve({ userId, amount, reservationId, idempotencyKey }) {
      const a = acct(userId);
      const need = Math.max(0, Number(amount) || 0);
      if (a.entries.some((e) => e.idempotencyKey === idempotencyKey)) {
        return { ok: true, deduped: true, balance: a.balance };
      }
      if (a.balance < need) return { ok: false, reason: "insufficient" };
      a.balance -= need;
      a.reservations.set(reservationId, need);
      a.entries.push(createLedgerEntry({
        userId, kind: "reserve", amount: -need, reservationId, idempotencyKey,
      }));
      return { ok: true, balance: a.balance };
    },
    settle({ userId, reservationId, actual, idempotencyKey }) {
      const a = acct(userId);
      if (a.entries.some((e) => e.idempotencyKey === idempotencyKey)) {
        return { ok: true, deduped: true, balance: a.balance };
      }
      const reserved = a.reservations.get(reservationId) || 0;
      const used = Math.max(0, Math.min(reserved, Number(actual) || 0));
      const refund = reserved - used;
      if (refund > 0) a.balance += refund;
      a.reservations.delete(reservationId);
      a.entries.push(createLedgerEntry({
        userId, kind: "settle", amount: -used, reservationId, idempotencyKey,
      }));
      return { ok: true, balance: a.balance };
    },
    recompute(userId) {
      const a = acct(userId);
      return a.entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    },
    getBalance(userId) {
      return acct(userId).balance;
    },
  };
}

export const NYRA_COIN_ISOLATION_RULE = Object.freeze({
  localWalletModule: "src/wallet/ledger.js",
  billingModule: "src/billing/ledger-core.js",
  mayExchange: false,
  mayShareTable: false,
});
'''

files["src/model-gateway/contract-runtime.js"] = r'''/**
 * Model Gateway runtime helpers (R9) — managed/BYOK share one request contract.
 */
import {
  createModelRequestContractV1,
  validateModelRequestContractV1,
  mintId,
} from "../contracts/index.js";

export function buildGatewayRequest(input = {}) {
  const billingSource = input.billingSource === "managed" ? "managed" : (input.billingSource === "local_dev" ? "local_dev" : "byok");
  const req = createModelRequestContractV1({
    ...input,
    requestId: input.requestId || mintId("requestId"),
    idempotencyKey: input.idempotencyKey || mintId("requestId", "idem"),
    billingSource,
    chargedCredits: billingSource === "byok" ? 0 : Number(input.chargedCredits) || 0,
  });
  const v = validateModelRequestContractV1(req);
  return { ok: v.ok, value: req, errors: v.errors };
}

/** Switching billing source must not rewrite companion primary keys. */
export function assertIdentityStable(before, after) {
  const keys = ["userId", "companionId", "agentId", "skillId", "experienceId"];
  for (const k of keys) {
    if (String(before?.[k] || "") !== String(after?.[k] || "")) {
      return { ok: false, reason: `identity_changed:${k}` };
    }
  }
  return { ok: true };
}
'''

for rel, content in files.items():
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("wrote", rel)
print("batch ok")
