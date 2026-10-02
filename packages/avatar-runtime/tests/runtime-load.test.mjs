/**
 * Node-side smoke: catalog + manifests exist and are switchable without hardcoded xingli.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalogPath = path.join(root, "public/avatar-packs/catalog.json");

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
assert.ok(Array.isArray(catalog.avatars));
assert.ok(catalog.avatars.length >= 3, "need >=3 fixture avatars");
for (const a of catalog.avatars) {
  assert.notEqual(a.characterId, "xingli");
  const rel = a.manifestUrl.replace(/^\/avatar-packs\//, "");
  const manifest = JSON.parse(await fs.readFile(path.join(root, "public/avatar-packs", rel), "utf8"));
  assert.equal(manifest.characterId, a.characterId);
  if (a.fixture) {
    assert.equal(manifest.publishable, false, `${a.characterId} fixture must not be publishable`);
    assert.ok(a.manifestUrl.includes("/_fixture/"), `${a.characterId} fixture must live under _fixture/`);
  } else {
    assert.ok(!a.manifestUrl.includes("/_fixture/"), `${a.characterId} real pack must not be under _fixture/`);
  }
  assert.ok(manifest.actions.idle.frames.length >= 1);
}
console.log(JSON.stringify({ ok: true, suite: "avatar-runtime-load", count: catalog.avatars.length }));
