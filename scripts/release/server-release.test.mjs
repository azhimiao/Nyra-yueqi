import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertBillingSchemaReady,
  buildSignedServerRelease,
  collectReleaseFiles,
  publishAtomicRelease,
  rollbackRelease,
  verifyReleasePackage,
  verifySignedServerRelease,
} from "./server-release.mjs";
import { openPgliteBillingSql } from "../../server/billing/sql-client.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();

const root = await mkdtemp(join(tmpdir(), "nyra-server-release-"));
await mkdir(join(root, "server", "billing"), { recursive: true });
await writeFile(join(root, "server", "billing", "schema.sql"), "SELECT 1;\n", "utf8");
await writeFile(join(root, "server", "billing", "sql-client.mjs"), "export {}\n", "utf8");
await writeFile(join(root, "server", "billing", "sql-store.mjs"), "export {}\n", "utf8");
await writeFile(join(root, "server", "billing", "service.mjs"), "export {}\n", "utf8");
await writeFile(join(root, "server", "billing", "whop.mjs"), "export {}\n", "utf8");
await writeFile(join(root, "server", "index.mjs"), "export {}\n", "utf8");

const files = await collectReleaseFiles(root);
const first = buildSignedServerRelease({
  releaseId: "rel-1",
  files,
  privateKeyPem,
  publicKeyPem,
});
assert.equal(verifySignedServerRelease(first, publicKeyPem), true);
assert.equal(verifySignedServerRelease({
  ...first,
  payload: { ...first.payload, releaseId: "tampered" },
}, publicKeyPem), false);
await verifyReleasePackage(root, first, publicKeyPem);

const releasesRoot = join(root, "releases");
await publishAtomicRelease(releasesRoot, first);
const second = buildSignedServerRelease({
  releaseId: "rel-2",
  files,
  privateKeyPem,
  publicKeyPem,
  createdAt: "2026-08-17T05:00:00.000Z",
});
await publishAtomicRelease(releasesRoot, second);
const rolled = await rollbackRelease(releasesRoot, "rel-1");
assert.equal(rolled.releaseId, "rel-1");

const sql = await openPgliteBillingSql();
try {
  await assertBillingSchemaReady(sql.session);
} finally {
  await sql.close();
}

console.log("signed server release chain: ok");
