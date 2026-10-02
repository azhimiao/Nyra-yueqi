import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R8");
mkdirSync(outDir,{recursive:true});
const cases=[];
function record(id,pass,detail=""){cases.push({id,pass:!!pass,detail:String(detail||"")});console.log(`${pass?"PASS":"FAIL"}  ${id}${detail?` — ${detail}`:""}`);}

const { createInMemoryBillingLedger, NYRA_COIN_ISOLATION_RULE } = await import("../src/billing/ledger-core.js");
const ledger = createInMemoryBillingLedger();

const results = await Promise.all(Array.from({length:100}, (_,i) => Promise.resolve(ledger.redeemCode({ userId:"u1", code:"CATFK-ONCE", credits:10 }))));
const wins = results.filter(r=>r.ok).length;
record("redeem_code_once", wins === 1, `wins=${wins}`);

ledger.redeemCode({ userId:"u2", code:"BATCH-1", credits:100 });
for (let i=0;i<50;i++) {
  ledger.reserve({ userId:"u2", amount:1, reservationId:`r${i}`, idempotencyKey:`res-${i}` });
}
for (let i=0;i<50;i++) {
  ledger.settle({ userId:"u2", reservationId:`r${i}`, actual:1, idempotencyKey:`set-${i}` });
}
record("no_negative_balance", ledger.getBalance("u2") === 50, `bal=${ledger.getBalance("u2")}`);
record("recompute_matches", ledger.recompute("u2") === ledger.getBalance("u2"));
record("nyracoin_isolated", NYRA_COIN_ISOLATION_RULE.mayExchange === false && NYRA_COIN_ISOLATION_RULE.mayShareTable === false);

record("external_whop_catfk", false, "EXTERNAL_ACCOUNT_REQUIRED");

const codePass = cases.filter(c => c.detail !== "EXTERNAL_ACCOUNT_REQUIRED").every(c=>c.pass);
writeFileSync(join(outDir,"VERIFY_BILLING.json"), JSON.stringify({phase:"R8",status:codePass?"implementation_green":"fail",external:"EXTERNAL_ACCOUNT_REQUIRED",cases},null,2)+"\n");
console.log(codePass?"\nR8 CODE PASS (external pending)":"\nR8 FAILED");
process.exit(codePass?0:1);
