#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { openBillingSql } from "../server/billing/sql-client.mjs";

function asInt(value) {
  return Math.trunc(Number(value) || 0);
}

export async function auditBillingLedger(options = {}) {
  const sql = options.sql || await openBillingSql(options);
  if (!sql) {
    return {
      status: "FAIL",
      message: "YUEQI_BILLING_DATABASE_URL is required for billing:audit",
    };
  }
  const session = sql.session;
  const wallets = await session.query("SELECT user_id, balance, reserved, debt FROM billing_wallets");
  const reservations = await session.query(
    "SELECT user_id, credits FROM billing_reservations WHERE status = 'active'",
  );
  const reservedByUser = {};
  for (const row of reservations) {
    reservedByUser[row.user_id] = (reservedByUser[row.user_id] || 0) + asInt(row.credits);
  }
  const failures = [];
  for (const wallet of wallets) {
    if (asInt(wallet.balance) < 0 || asInt(wallet.reserved) < 0 || asInt(wallet.debt) < 0) {
      failures.push(`${wallet.user_id}: negative wallet field`);
    }
    if (asInt(wallet.reserved) !== (reservedByUser[wallet.user_id] || 0)) {
      failures.push(`${wallet.user_id}: reserved ${wallet.reserved} != active reservations ${reservedByUser[wallet.user_id] || 0}`);
    }
  }
  const dupes = await session.query(`
    SELECT user_id, source, reference_id, COUNT(*) AS n
    FROM billing_ledger
    WHERE reference_id <> ''
    GROUP BY user_id, source, reference_id
    HAVING COUNT(*) > 1
  `);
  for (const row of dupes) {
    failures.push(`${row.user_id}:${row.source}:${row.reference_id} duplicated ${row.n} times`);
  }
  const totals = {
    wallets: wallets.length,
    ledger: Number((await session.query("SELECT COUNT(*)::int AS n FROM billing_ledger"))[0]?.n || 0),
    purchases: Number((await session.query("SELECT COUNT(*)::int AS n FROM billing_purchases"))[0]?.n || 0),
  };
  if (options.close !== false) await sql.close?.();
  return {
    status: failures.length ? "FAIL" : "PASS",
    failures,
    totals,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await auditBillingLedger();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "FAIL") process.exit(1);
}
