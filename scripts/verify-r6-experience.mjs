import { mkdirSync, writeFileSync } from "node:fs";
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
