import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UPDATE_PUBLIC_KEY_PEM } from "../src/update/update-public-key.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R11");
mkdirSync(outDir, { recursive: true });

const phases = ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"];
const evidence = {};
for (const p of phases) {
  const dir = join(root, "docs/qa/companion-os", p);
  evidence[p] = existsSync(dir);
}

function hasNonEmptyFile(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) return false;
  return String(readFileSync(path, "utf8")).trim().length > 0;
}

const releaseSigningEvidence = {
  initScript: existsSync(join(root, "scripts/security-init-release.mjs")),
  releaseScript: existsSync(join(root, "scripts/release-android.mjs")),
  publishScript: existsSync(join(root, "scripts/release-publish.mjs")),
  publicKeyModule: Boolean(String(UPDATE_PUBLIC_KEY_PEM || "").trim()),
  publicKeyPem: hasNonEmptyFile("assets/security/update-public-key.pem"),
  androidCertPin: hasNonEmptyFile("assets/security/android-release-cert.sha256"),
  signedManifestArtifact: hasNonEmptyFile("dist/release/update-manifest.json"),
  releaseApkArtifact: existsSync(join(root, "dist/release/nyra-latest.apk")),
};

const releaseSigningReady = Object.values(releaseSigningEvidence).every(Boolean);

const statuses = {
  implementation_green: true,
  evidence_green: existsSync(join(root, "docs/qa/companion-os/R0/VERIFY_BROWSER.json")),
  device_green: false,
  // Keystore + signed update channel are ready locally; full security_green still
  // requires published production channel evidence and remaining server/client hardening.
  security_green: false,
  user_accepted: false,
};

const releaseCandidate = Object.values(statuses).every(Boolean);
const payload = {
  phase: "R11",
  generatedAt: new Date().toISOString(),
  statuses,
  evidence,
  releaseSigningEvidence,
  releaseSigningReady,
  releaseCandidate,
  verdict: releaseCandidate ? "RELEASE_CANDIDATE" : "NOT_RELEASE_CANDIDATE",
  pending: [
    !statuses.device_green ? "device_pending" : null,
    !releaseSigningReady
      ? "security_pending_keystore_and_signed_update_channel"
      : "security_pending_production_publish_and_remaining_hardening",
    !statuses.user_accepted ? "user_accepted_pending" : null,
  ].filter(Boolean),
};

writeFileSync(join(outDir, "RELEASE_VERDICT.json"), `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(
  join(outDir, "R11_REPORT.md"),
  `# R11 Release Verdict\n\n`
    + `- verdict: **${payload.verdict}**\n`
    + `- implementation_green: ${statuses.implementation_green}\n`
    + `- evidence_green: ${statuses.evidence_green}\n`
    + `- device_green: ${statuses.device_green} (IMPLEMENTED_PENDING_DEVICE_*)\n`
    + `- security_green: ${statuses.security_green}\n`
    + `- release_signing_ready: ${releaseSigningReady}\n`
    + `- user_accepted: ${statuses.user_accepted}\n\n`
    + `Do not call this a Release Candidate until all five greens are true.\n`,
);
console.log(JSON.stringify(payload, null, 2));
process.exit(0);
