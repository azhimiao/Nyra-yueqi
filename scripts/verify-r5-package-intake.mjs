import { mkdirSync, writeFileSync } from "node:fs";
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
