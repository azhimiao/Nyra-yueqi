#!/usr/bin/env node
import { spawn } from "node:child_process";
import { billingCanaryCheck } from "./billing-canary-check.mjs";

const failures = [];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
    child.on("error", reject);
  });
}

try {
  await run("sql-concurrency", ["server/billing/sql-concurrency.test.mjs"]);
  await run("rate-limit", ["server/rate-limit.test.mjs"]);
  await run("server-release", ["scripts/release/server-release.test.mjs"]);
} catch (error) {
  failures.push(String(error.message || error));
}

const canary = await billingCanaryCheck();
console.log(`CANARY  ${canary.status}`);
if (canary.status === "FAIL") failures.push(canary.message);

if (failures.length) {
  console.error("verify:billing-production FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify:billing-production: suite PASS; live Whop canary is", canary.live);
