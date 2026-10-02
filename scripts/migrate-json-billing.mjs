#!/usr/bin/env node
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createAccountStore } from "../server/account-store.mjs";
import { ensureBillingStore } from "../server/billing/service.mjs";
import {
  lockBillingTransaction,
  openBillingSql,
} from "../server/billing/sql-client.mjs";
import {
  getImportedLedger,
  importJsonBilling,
} from "../server/billing/sql-store.mjs";

const SOURCE = "json-store";

function billingSlice(store) {
  const prepared = ensureBillingStore(store);
  return {
    users: Object.fromEntries(Object.entries(prepared.users || {}).map(([id, user]) => [id, {
      memberSince: user?.memberSince || null,
      lifetimePaidCredits: Number(user?.lifetimePaidCredits) || 0,
    }])),
    billingWallets: prepared.billingWallets,
    billingLedger: prepared.billingLedger,
    billingReservations: prepared.billingReservations,
    redeemCodes: prepared.redeemCodes,
    referralCodes: prepared.referralCodes,
    referralCodesByUser: prepared.referralCodesByUser,
    referralRedemptions: prepared.referralRedemptions,
    purchaseOrders: prepared.purchaseOrders,
    usageEvents: prepared.usageEvents,
    agentRuns: prepared.agentRuns,
  };
}

export function checksumBillingSlice(store) {
  return createHash("sha256")
    .update(JSON.stringify(billingSlice(store)))
    .digest("hex");
}

export function reconcileJsonBilling(store) {
  const prepared = ensureBillingStore(store);
  const failures = [];
  for (const wallet of Object.values(prepared.billingWallets || {})) {
    const reserved = Object.values(prepared.billingReservations || {})
      .filter((row) => row?.userId === wallet.userId && row.status === "active")
      .reduce((total, row) => total + Math.max(0, Math.floor(Number(row.credits) || 0)), 0);
    if (Math.max(0, Math.floor(Number(wallet.reserved) || 0)) !== reserved) {
      failures.push(`${wallet.userId}: reserved ${wallet.reserved} != active reservations ${reserved}`);
    }
    const last = [...(prepared.billingLedger || [])]
      .filter((entry) => entry.userId === wallet.userId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .at(-1);
    if (!last) continue;
    const visible = Math.max(
      0,
      Math.floor(Number(wallet.balance) || 0) - Math.floor(Number(wallet.debt) || 0),
    );
    if (Math.floor(Number(last.balanceAfter) || 0) !== visible) {
      failures.push(`${wallet.userId}: ledger balanceAfter ${last.balanceAfter} != visible ${visible}`);
    }
  }
  return failures;
}

export function jsonBillingTotals(store) {
  const prepared = ensureBillingStore(store);
  return {
    wallets: Object.keys(prepared.billingWallets || {}).length,
    ledger: (prepared.billingLedger || []).length,
    reservations: Object.keys(prepared.billingReservations || {}).length,
    purchases: Object.keys(prepared.purchaseOrders || {}).length,
    usageEvents: Object.keys(prepared.usageEvents || {}).length,
    redeemCodes: Object.keys(prepared.redeemCodes || {}).length,
  };
}

export async function migrateJsonBilling(options = {}) {
  const dataFile = options.dataFile || process.env.YUEQI_DATA_FILE;
  if (!dataFile) {
    throw Object.assign(new Error("YUEQI_DATA_FILE is required"), { code: "json_store_missing" });
  }
  const apply = options.apply === true;
  const accountStore = options.accountStore || createAccountStore(dataFile);
  const store = ensureBillingStore(await accountStore.readStore());
  const checksum = checksumBillingSlice(store);
  const totals = jsonBillingTotals(store);
  const mismatches = reconcileJsonBilling(store);
  if (mismatches.length) {
    throw Object.assign(
      new Error(`JSON billing failed wallet/ledger reconciliation: ${mismatches.join("; ")}`),
      { code: "json_billing_inconsistent", mismatches },
    );
  }
  const sql = options.sql || await openBillingSql(options);
  if (!sql) {
    throw Object.assign(new Error("YUEQI_BILLING_DATABASE_URL is required"), {
      code: "billing_database_missing",
    });
  }

  const existing = await getImportedLedger(sql.session, SOURCE);
  if (existing && existing.checksum !== checksum) {
    throw Object.assign(
      new Error("JSON billing checksum differs from a previous import; refusing overwrite"),
      { code: "json_billing_checksum_mismatch", existing: existing.checksum, checksum },
    );
  }
  if (existing && existing.checksum === checksum) {
    return {
      dryRun: !apply,
      skipped: true,
      checksum,
      totals,
      importedAt: existing.imported_at,
    };
  }
  if (!apply) {
    return { dryRun: true, skipped: false, checksum, totals };
  }

  await sql.session.transaction(async (tx) => {
    await lockBillingTransaction(tx);
    const raced = await getImportedLedger(tx, SOURCE);
    if (raced) {
      if (raced.checksum !== checksum) {
        throw Object.assign(
          new Error("JSON billing checksum differs from a previous import; refusing overwrite"),
          { code: "json_billing_checksum_mismatch" },
        );
      }
      return;
    }
    await importJsonBilling(tx, store, { source: SOURCE, checksum });
  });

  return { dryRun: false, skipped: false, checksum, totals, applied: true };
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirect) {
  const apply = process.argv.includes("--apply");
  const result = await migrateJsonBilling({ apply });
  console.log(JSON.stringify(result, null, 2));
  if (!apply) console.error("Dry-run only. Re-run with --apply to import. JSON file is not deleted.");
}
