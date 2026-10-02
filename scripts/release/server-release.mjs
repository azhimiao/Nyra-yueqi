import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "../../src/update/update-signature.mjs";

const REQUIRED_FILES = [
  "server/billing/schema.sql",
  "server/billing/sql-client.mjs",
  "server/billing/sql-store.mjs",
  "server/billing/service.mjs",
  "server/billing/whop.mjs",
  "server/index.mjs",
];

export function hashFileBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function collectReleaseFiles(root, files = REQUIRED_FILES) {
  const entries = [];
  for (const relative of files) {
    const buffer = await readFile(join(root, relative));
    entries.push({
      path: relative.replaceAll("\\", "/"),
      sha256: hashFileBuffer(buffer),
      bytes: buffer.length,
    });
  }
  return entries;
}

export function buildSignedServerRelease({
  releaseId,
  files,
  schemaVersion = 1,
  createdAt = new Date().toISOString(),
  privateKeyPem,
  publicKeyPem,
  billingSchemaRequired = true,
}) {
  const id = String(releaseId || "").trim();
  if (!id) throw new TypeError("releaseId is required");
  const payload = {
    schemaVersion,
    kind: "nyra-server",
    releaseId: id,
    createdAt,
    billingSchemaRequired: billingSchemaRequired === true,
    files: [...files].sort((a, b) => a.path.localeCompare(b.path)),
  };
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(publicKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
    throw new TypeError("Server release keys must be Ed25519.");
  }
  const body = Buffer.from(canonicalJson(payload));
  const signature = sign(null, body, privateKey).toString("base64");
  return {
    payload,
    signature: {
      algorithm: "Ed25519",
      publicKeyPem,
      value: signature,
    },
  };
}

export function verifySignedServerRelease(manifest, publicKeyPem) {
  if (!manifest?.payload || manifest?.signature?.algorithm !== "Ed25519") return false;
  const publicKey = createPublicKey(publicKeyPem || manifest.signature.publicKeyPem);
  return verify(
    null,
    Buffer.from(canonicalJson(manifest.payload)),
    publicKey,
    Buffer.from(String(manifest.signature.value || ""), "base64"),
  );
}

export async function verifyReleasePackage(root, manifest, publicKeyPem) {
  if (!verifySignedServerRelease(manifest, publicKeyPem)) {
    throw Object.assign(new Error("release signature mismatch"), { code: "release_signature_invalid" });
  }
  const actual = await collectReleaseFiles(root, manifest.payload.files.map((file) => file.path));
  for (const expected of manifest.payload.files) {
    const found = actual.find((file) => file.path === expected.path);
    if (!found || found.sha256 !== expected.sha256) {
      throw Object.assign(new Error(`hash mismatch for ${expected.path}`), { code: "release_hash_mismatch" });
    }
  }
  return { ok: true, releaseId: manifest.payload.releaseId };
}

export async function publishAtomicRelease(releasesRoot, manifest) {
  const releaseId = manifest.payload.releaseId;
  const target = join(releasesRoot, releaseId);
  const pending = `${target}.${process.pid}.tmp`;
  await mkdir(pending, { recursive: true, mode: 0o700 });
  await writeFile(join(pending, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(pending, target);
  const currentPending = join(releasesRoot, `current.${process.pid}.tmp`);
  await writeFile(currentPending, `${releaseId}\n`, "utf8");
  await rename(currentPending, join(releasesRoot, "current"));
  return { releaseId, path: target };
}

export async function rollbackRelease(releasesRoot, releaseId) {
  const target = join(releasesRoot, releaseId);
  const manifest = JSON.parse(await readFile(join(target, "release-manifest.json"), "utf8"));
  if (manifest.payload.releaseId !== releaseId) {
    throw new Error("rollback target manifest does not match releaseId");
  }
  const currentPending = join(releasesRoot, `current.${process.pid}.tmp`);
  await writeFile(currentPending, `${releaseId}\n`, "utf8");
  await rename(currentPending, join(releasesRoot, "current"));
  return { releaseId };
}

export async function assertBillingSchemaReady(session) {
  const rows = await session.query(`
    SELECT COUNT(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_ledger'
  `);
  if (!rows[0] || Number(rows[0].n) < 1) {
    throw Object.assign(new Error("billing schema is not applied"), { code: "billing_schema_missing" });
  }
}

