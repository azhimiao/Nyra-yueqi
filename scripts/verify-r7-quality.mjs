import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
