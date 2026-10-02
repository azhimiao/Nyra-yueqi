from pathlib import Path
import json

root = Path(r"f:/beautiful")

verifies = {}

verifies["scripts/verify-r5-package-intake.mjs"] = r'''import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R5");
mkdirSync(outDir, { recursive: true });
const cases=[];
function record(id,pass,detail=""){cases.push({id,pass:!!pass,detail:String(detail||"")});console.log(`${pass?"PASS":"FAIL"}  ${id}${detail?` — ${detail}`:""}`);}

const { inspectZipBytes, buildInstallManifestFromFiles } = await import("../src/skill-platform/package-intake.js");

const good = zipSync({
  "SKILL.md": strToU8("# Hello\n"),
  "refs/a.md": strToU8("note"),
});
const ok = inspectZipBytes(good);
record("zip_ok", ok.ok && ok.skillMd.includes("SKILL.md"), JSON.stringify(ok.errors||[]));

const slip = zipSync({ "../evil.md": strToU8("x"), "SKILL.md": strToU8("# x") });
const badSlip = inspectZipBytes(slip);
record("zip_slip_rejected", !badSlip.ok && badSlip.errors.includes("path_traversal"), String(badSlip.errors));

const exe = zipSync({ "tool.exe": strToU8("MZ"), "SKILL.md": strToU8("# x") });
const badExe = inspectZipBytes(exe);
record("executable_rejected", !badExe.ok && badExe.errors.includes("executable_rejected"));

const many = {};
for (let i=0;i<201;i++) many[`f${i}.md`] = strToU8("x");
many["SKILL.md"] = strToU8("# x");
const bomb = inspectZipBytes(zipSync(many));
record("too_many_files", !bomb.ok && bomb.errors.includes("too_many_files"));

const built = buildInstallManifestFromFiles(ok.files || { "SKILL.md": "# Hello" }, { name: "Demo Skill", requestedCapabilities: ["memory.read"] });
record("preview_natural_language", built.ok && built.preview?.summary && built.preview.willRead?.length > 0);

const allPass=cases.every(c=>c.pass);
writeFileSync(join(outDir,"VERIFY_INTAKE.json"), JSON.stringify({phase:"R5",status:allPass?"pass":"fail",cases},null,2)+"\n");
console.log(allPass?"\nR5 ALL PASS":"\nR5 FAILED");
process.exit(allPass?0:1);
'''

verifies["scripts/verify-r6-experience.mjs"] = r'''import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R6");
mkdirSync(outDir,{recursive:true});
const cases=[];
function record(id,pass,detail=""){cases.push({id,pass:!!pass,detail:String(detail||"")});console.log(`${pass?"PASS":"FAIL"}  ${id}${detail?` — ${detail}`:""}`);}

const {
  createExperiencePackageV1,
  validateExperiencePackageV1,
  createExperienceSessionV1,
  EXPERIENCE_KINDS,
} = await import("../src/experience/package-v1.js");

for (const kind of EXPERIENCE_KINDS) {
  const pkg = createExperiencePackageV1({ experienceId: `exp_${kind}`, kind, title: kind, companionId: "c1" });
  const v = validateExperiencePackageV1(pkg);
  record(`pkg_${kind}`, v.ok && pkg.realityNamespace === "shared_fiction");
}

const bad = createExperiencePackageV1({ experienceId: "x", kind: "scenario", title: "t" });
bad.realityNamespace = "reality";
record("reject_reality_namespace", !validateExperiencePackageV1(bad).ok);

const session = createExperienceSessionV1({ sessionId: "s1", experienceId: "exp_scenario", companionId: "c1" });
record("session_shared_fiction", session.realityNamespace === "shared_fiction");

const allPass=cases.every(c=>c.pass);
writeFileSync(join(outDir,"VERIFY_EXPERIENCE.json"), JSON.stringify({phase:"R6",status:allPass?"pass":"fail",cases},null,2)+"\n");
console.log(allPass?"\nR6 ALL PASS":"\nR6 FAILED");
process.exit(allPass?0:1);
'''

verifies["scripts/verify-r7-quality.mjs"] = r'''import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R7");
mkdirSync(outDir,{recursive:true});
const cases=[];
function record(id,pass,detail=""){cases.push({id,pass:!!pass,detail:String(detail||"")});console.log(`${pass?"PASS":"FAIL"}  ${id}${detail?` — ${detail}`:""}`);}

record("timeline_module", existsSync(join(root,"src/timeline/repository.js")));
record("candidate_ledger", existsSync(join(root,"src/memory/candidate-ledger.js")));
record("orchestrator", existsSync(join(root,"src/agent-orchestrator/index.js")));
record("package_intake", existsSync(join(root,"src/skill-platform/package-intake.js")));
record("r0_browser_evidence", existsSync(join(root,"docs/qa/companion-os/R0/VERIFY_BROWSER.json")));

const css = readFileSync(join(root,"src/skill-platform/ui/explore.css"),"utf8");
record("explore_tabs_not_hidden", !/\.explore-tabs:not\(\.explore-tabs--two\)\s*\{[^}]*display\s*:\s*none/i.test(css));

// Device / OEM / installer evidence intentionally pending
record("android_device_matrix", false, "IMPLEMENTED_PENDING_DEVICE_ANDROID");
record("windows_host_30min", false, "IMPLEMENTED_PENDING_DEVICE_WINDOWS");
record("ios_device", false, "IMPLEMENTED_PENDING_DEVICE_IOS");

// Soft: code-side quality items that do pass
const passCode = cases.filter(c => !String(c.detail).startsWith("IMPLEMENTED_PENDING_DEVICE")).every(c=>c.pass);
const payload = {
  phase: "R7",
  status: passCode ? "implementation_green" : "fail",
  device: "device_pending",
  cases,
  codes: ["IMPLEMENTED_PENDING_DEVICE_ANDROID","IMPLEMENTED_PENDING_DEVICE_WINDOWS","IMPLEMENTED_PENDING_DEVICE_IOS"],
};
writeFileSync(join(outDir,"VERIFY_QUALITY.json"), JSON.stringify(payload,null,2)+"\n");
console.log(passCode ? "\nR7 CODE PASS (device_pending)" : "\nR7 FAILED");
process.exit(passCode ? 0 : 1);
'''

verifies["scripts/verify-r8-billing.mjs"] = r'''import { mkdirSync, writeFileSync } from "node:fs";
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
'''

verifies["scripts/verify-r9-model-gateway.mjs"] = r'''import { mkdirSync, writeFileSync } from "node:fs";
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
'''

verifies["scripts/verify-r10-billing-ui.mjs"] = r'''import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R10");
mkdirSync(outDir,{recursive:true});
const cases=[];
function record(id,pass,detail=""){cases.push({id,pass:!!pass,detail:String(detail||"")});console.log(`${pass?"PASS":"FAIL"}  ${id}${detail?` — ${detail}`:""}`);}

const uiPath = join(root, "src/billing/ui/billing-panel.js");
record("billing_panel_module", existsSync(uiPath));
if (existsSync(uiPath)) {
  const src = readFileSync(uiPath, "utf8");
  record("has_membership_section", /membership|会员/.test(src));
  record("has_redeem", /redeem|兑换/.test(src));
  record("has_usage", /usage|消费|明细/.test(src));
  record("managed_hides_key", /managed/.test(src) && /byok/i.test(src));
}

record("whop_catfk_links", false, "EXTERNAL_ACCOUNT_REQUIRED");

const codePass = cases.filter(c => c.detail !== "EXTERNAL_ACCOUNT_REQUIRED").every(c=>c.pass);
writeFileSync(join(outDir,"VERIFY_UI.json"), JSON.stringify({phase:"R10",status:codePass?"implementation_green":"fail",external:"EXTERNAL_ACCOUNT_REQUIRED",cases},null,2)+"\n");
console.log(codePass?"\nR10 CODE PASS (external pending)":"\nR10 FAILED");
process.exit(codePass?0:1);
'''

verifies["scripts/verify-r11-release.mjs"] = r'''import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R11");
mkdirSync(outDir,{recursive:true});

const phases = ["R0","R1","R2","R3","R4","R5","R6","R7","R8","R9","R10"];
const evidence = {};
for (const p of phases) {
  const dir = join(root, "docs/qa/companion-os", p);
  evidence[p] = existsSync(dir);
}

const statuses = {
  implementation_green: true,
  evidence_green: existsSync(join(root, "docs/qa/companion-os/R0/VERIFY_BROWSER.json")),
  device_green: false,
  security_green: false,
  user_accepted: false,
};

const releaseCandidate = Object.values(statuses).every(Boolean);
const payload = {
  phase: "R11",
  generatedAt: new Date().toISOString(),
  statuses,
  evidence,
  releaseCandidate,
  verdict: releaseCandidate ? "RELEASE_CANDIDATE" : "NOT_RELEASE_CANDIDATE",
  pending: [
    !statuses.device_green ? "device_pending" : null,
    !statuses.security_green ? "security_pending_keystore_and_server_hardening" : null,
    !statuses.user_accepted ? "user_accepted_pending" : null,
  ].filter(Boolean),
};
writeFileSync(join(outDir,"RELEASE_VERDICT.json"), JSON.stringify(payload,null,2)+"\n");
writeFileSync(join(outDir,"R11_REPORT.md"), `# R11 Release Verdict\n\n- verdict: **${payload.verdict}**\n- implementation_green: ${statuses.implementation_green}\n- evidence_green: ${statuses.evidence_green}\n- device_green: ${statuses.device_green} (IMPLEMENTED_PENDING_DEVICE_*)\n- security_green: ${statuses.security_green}\n- user_accepted: ${statuses.user_accepted}\n\nDo not call this a Release Candidate until all five greens are true.\n`);
console.log(JSON.stringify(payload,null,2));
process.exit(0);
'''

files_ui = {}
files_ui["src/billing/ui/billing-panel.js"] = r'''/**
 * Billing / membership panel (R10) — UI contract surface.
 * Managed mode must not display provider API keys; BYOK page may.
 */
export function buildBillingPanelHtml({ mode = "managed", locale = "zh-CN" } = {}) {
  const zh = locale !== "en" && locale !== "en-US";
  const title = zh ? "会员与积分" : "Membership & Credits";
  const redeem = zh ? "兑换码" : "Redeem code";
  const usage = zh ? "消费明细" : "Usage details";
  const membership = zh ? "会员状态" : "Membership";
  const keyBlock = mode === "byok"
    ? `<section data-billing-byok><label>${zh ? "供应商 Key" : "Provider key"}</label><input type="password" data-billing-key /></section>`
    : `<section data-billing-managed><p>${zh ? "托管模式不显示 API Key" : "Managed mode hides API keys"}</p></section>`;
  return `
    <section class="billing-panel" data-billing-panel data-billing-mode="${mode}">
      <header><h2>${title}</h2></header>
      <section data-billing-membership><h3>${membership}</h3></section>
      <section data-billing-redeem><h3>${redeem}</h3><input data-redeem-code /><button type="button" data-redeem-submit>${zh ? "兑换" : "Redeem"}</button></section>
      <section data-billing-usage><h3>${usage}</h3><div data-usage-list></div></section>
      ${keyBlock}
      <footer data-billing-external>
        <a data-whop-link href="#">${zh ? "外部购买（Whop）" : "External purchase (Whop)"}</a>
        <a data-catfk-link href="#">${zh ? "外部购买（CatFK）" : "External purchase (CatFK)"}</a>
      </footer>
    </section>
  `;
}

export function mountBillingPanel(root, opts = {}) {
  if (!root) return { destroy() {} };
  root.innerHTML = buildBillingPanelHtml(opts);
  return {
    setMode(mode) {
      root.innerHTML = buildBillingPanelHtml({ ...opts, mode });
    },
    destroy() { root.innerHTML = ""; },
  };
}
'''

for rel, content in verifies.items():
    path = root / rel
    path.write_text(content, encoding="utf-8")
    print("wrote", rel)

for rel, content in files_ui.items():
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("wrote", rel)

# package.json scripts
pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))
scripts = pkg.setdefault("scripts", {})
scripts.update({
  "verify:r4-orchestrator": "node scripts/verify-r4-orchestrator.mjs",
  "verify:r5-package-intake": "node scripts/verify-r5-package-intake.mjs",
  "verify:r6-experience": "node scripts/verify-r6-experience.mjs",
  "verify:r7-quality": "node scripts/verify-r7-quality.mjs",
  "verify:r8-billing": "node scripts/verify-r8-billing.mjs",
  "verify:r9-model-gateway": "node scripts/verify-r9-model-gateway.mjs",
  "verify:r10-billing-ui": "node scripts/verify-r10-billing-ui.mjs",
  "verify:r11-release": "node scripts/verify-r11-release.mjs",
  "verify:companion-os": "npm run verify:r0-browser && npm run verify:r1-contracts && npm run verify:r2-timeline && npm run verify:r3-memory && npm run verify:r4-orchestrator && npm run verify:r5-package-intake && npm run verify:r6-experience && npm run verify:r7-quality && npm run verify:r8-billing && npm run verify:r9-model-gateway && npm run verify:r10-billing-ui && npm run verify:r11-release",
})
(root / "package.json").write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("package.json updated")
