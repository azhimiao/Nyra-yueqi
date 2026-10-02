import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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
  record("has_member_badge", /Nyra Member/.test(src) && /memberSince/.test(src));
  record("has_redeem", /redeem|兑换/.test(src));
  record("has_usage", /usage|消费|明细/.test(src));
  record("billing_never_renders_provider_key", !/data-billing-key|Provider key|供应商 Key/.test(src));
  record("has_credits_exhausted_dialog", /credits-exhausted/.test(src) && /data-credits-byok/.test(src));
  record("has_credits_recharge_steps", /data-billing-recharge/.test(src) && /data-billing-open-pay/.test(src) && /data-billing-pay-cny/.test(src));
  record("has_catfk_checkout", /data-catfk-checkout/.test(src) && /catfkCheckoutUrl/.test(src));
  record("has_cny_buy_redeem_steps", /billing-cny-step/.test(src) && /data-billing-cny-buy-label/.test(src));
}
const html = existsSync(join(root, "index.html")) ? readFileSync(join(root, "index.html"), "utf8") : "";
record("sidebar_credits_dock", /data-sidebar-credits/.test(html) && /data-sidebar-recharge/.test(html));
record("sidebar_hosted_tier", /data-sidebar-tier/.test(html) && /data-hosted-tier="standard"/.test(html) && /data-hosted-tier="high"/.test(html));
record("sidebar_model_source", /data-sidebar-source/.test(html) && /data-product-mode="hosted"/.test(html));
record("sidebar_mode_copy", /nav.modelSourceLabel/.test(html) && /nav.modeByok/.test(html) && /nav.modeHosted/.test(html));
record("api_nav_byok_only", /data-tab="api" data-byok-only/.test(html) && /data-drawer-nav="api" data-byok-only/.test(html));
record("account_page_has_no_duplicate_mode_picker", !/me-product-access/.test(html));

record("whop_checkout_live", false, "EXTERNAL_ACCOUNT_REQUIRED");

const codePass = cases.filter(c => c.detail !== "EXTERNAL_ACCOUNT_REQUIRED").every(c=>c.pass);
writeFileSync(join(outDir,"VERIFY_UI.json"), JSON.stringify({phase:"R10",status:codePass?"implementation_green":"fail",external:"EXTERNAL_ACCOUNT_REQUIRED",cases},null,2)+"\n");
console.log(codePass?"\nR10 CODE PASS (external pending)":"\nR10 FAILED");
process.exit(codePass?0:1);
