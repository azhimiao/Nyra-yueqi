import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R9");
mkdirSync(outDir,{recursive:true});
const cases=[];
function record(id,pass,detail=""){cases.push({id,pass:!!pass,detail:String(detail||"")});console.log(`${pass?"PASS":"FAIL"}  ${id}${detail?` — ${detail}`:""}`);}

const { buildGatewayRequest, assertIdentityStable } = await import("../src/model-gateway/contract-runtime.js");

const byok = buildGatewayRequest({
  billingSource: "byok",
  operation: "chat",
  userId: "u1",
  companionId: "c1",
  agentId: "a1",
  messages: [{ role: "user", content: "hi" }],
});
record("byok_zero_charge", byok.ok && byok.value.chargedCredits === 0);

const managed = buildGatewayRequest({
  billingSource: "managed",
  operation: "chat",
  userId: "u1",
  companionId: "c1",
  agentId: "a1",
  messages: [{ role: "user", content: "hi" }],
  chargedCredits: 3,
});
record("managed_keeps_identity", assertIdentityStable(byok.value, managed.value).ok);

const switched = buildGatewayRequest({
  billingSource: "byok",
  operation: "chat",
  userId: byok.value.userId,
  companionId: byok.value.companionId,
  agentId: byok.value.agentId,
  messages: [{ role: "user", content: "hi" }],
});
record("managed_to_byok_identity_stable", assertIdentityStable(managed.value, switched.value).ok);

record("live_provider_account", false, "EXTERNAL_ACCOUNT_REQUIRED");

const codePass = cases.filter(c => c.detail !== "EXTERNAL_ACCOUNT_REQUIRED").every(c=>c.pass);
writeFileSync(join(outDir,"VERIFY_GATEWAY.json"), JSON.stringify({phase:"R9",status:codePass?"implementation_green":"fail",external:"EXTERNAL_ACCOUNT_REQUIRED",cases},null,2)+"\n");
console.log(codePass?"\nR9 CODE PASS (external pending)":"\nR9 FAILED");
process.exit(codePass?0:1);
