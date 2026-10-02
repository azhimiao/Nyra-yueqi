import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "public/avatar-packs/catalog.json"), "utf8"),
);
const ids = catalog.avatars.map((a) => a.characterId);
assert.ok(ids.length >= 3);
assert.ok(!ids.includes("xingli"));
// switching means each has distinct manifest path
const urls = new Set(catalog.avatars.map((a) => a.manifestUrl));
assert.equal(urls.size, ids.length);
console.log(JSON.stringify({ ok: true, suite: "avatar-character-switch", ids }));
