#!/usr/bin/env node
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAccountStore } from "../server/account-store.mjs";
import { createBillingService } from "../server/billing/service.mjs";
import { openPostgresBillingSql } from "../server/billing/sql-client.mjs";
import { createSqlBillingStore } from "../server/billing/sql-store.mjs";

export function parseGenerateCodeArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!["--package", "--count", "--output", "--expires-at"].includes(flag)) {
      throw new TypeError(`Unknown argument: ${flag}`);
    }
    const value = String(argv[index + 1] || "").trim();
    if (!value || value.startsWith("--")) throw new TypeError(`${flag} requires a value`);
    values[flag.slice(2)] = value;
    index += 1;
  }
  if (!values.package) throw new TypeError("--package is required (light, daily, or deep)");
  if (!values.count) throw new TypeError("--count is required");
  if (!values.output) throw new TypeError("--output is required");
  return {
    packageId: values.package,
    count: Number(values.count),
    output: resolve(values.output),
    expiresAt: values["expires-at"] || null,
  };
}

export async function generateCodeInventory(options) {
  const databaseUrl = String(
    options.databaseUrl || process.env.YUEQI_BILLING_DATABASE_URL || "",
  ).trim();
  if (!databaseUrl || databaseUrl === "pglite") {
    throw new Error("A dedicated Postgres YUEQI_BILLING_DATABASE_URL is required");
  }
  const dataFile = String(
    options.dataFile || process.env.YUEQI_DATA_FILE || "",
  ).trim();
  if (!dataFile) throw new Error("YUEQI_DATA_FILE is required");

  await mkdir(dirname(options.output), { recursive: true, mode: 0o700 });
  const handle = await open(options.output, "wx", 0o600);
  let batchCommitted = false;
  let sql = null;
  try {
    sql = await openPostgresBillingSql(databaseUrl);
    const accountStore = createAccountStore(dataFile);
    const billingStore = createSqlBillingStore({ accountStore, sql });
    const billing = createBillingService(billingStore);
    const batch = await billing.createRedeemCodeBatch(options);
    batchCommitted = true;
    try {
      await handle.writeFile(`${batch.codes.join("\n")}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return { ...batch, codes: undefined, output: options.output };
  } catch (error) {
    try {
      await handle.close();
    } catch {
      // Preserve the original generation error.
    }
    if (!batchCommitted) await rm(options.output, { force: true });
    throw error;
  } finally {
    await sql?.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseGenerateCodeArgs(process.argv.slice(2));
    const result = await generateCodeInventory(options);
    console.log(JSON.stringify(result, null, 2));
    console.error("Plaintext inventory was written with mode 0600 and was not printed.");
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
