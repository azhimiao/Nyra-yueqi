/**
 * Runtime tests for .nyra seal/open, legacy migrate, secret exclusion, checksum.
 */
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.crypto.subtle) globalThis.crypto = webcrypto;
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = (arr) => webcrypto.getRandomValues(arr);
}
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => webcrypto.randomUUID();
}

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

const storage = makeMemoryStorage();
globalThis.window = {
  localStorage: storage,
  dispatchEvent() {},
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.document = {
  documentElement: { lang: "zh-CN", dataset: {} },
  querySelectorAll() { return []; },
  dispatchEvent() {},
};
globalThis.Blob = class Blob {
  constructor(parts = [], opts = {}) {
    this.parts = parts;
    this.type = opts.type || "";
    this.size = parts.reduce((n, p) => n + (p?.length || 0), 0);
  }
  async arrayBuffer() {
    const bytes = this.parts[0] instanceof Uint8Array ? this.parts[0] : new Uint8Array();
    return bytes.buffer;
  }
};

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const { sealNyraArchive, openNyraArchive, looksLikeNyraEnvelope } = await import("../../src/portability/crypto.js");
const { sha256Hex } = await import("../../src/portability/hash.js");
const { buildNyraArchive } = await import("../../src/portability/nyra/builder.js");
const { parseNyraArchive } = await import("../../src/portability/nyra/parser.js");
const { detectLegacyBackup, migrateLegacyBackup } = await import("../../src/portability/nyra/legacy.js");
const { mergeUserWorld } = await import("../../src/portability/nyra/merge.js");
const { prepareNyraImport, buildImportPlan } = await import("../../src/portability/nyra/importer.js");
const { assertNoSecretsInExport } = await import("../../src/memory/privacy.js");
const { zipSync, strToU8 } = await import("fflate");

const idb = {
  memories: [{ id: "mem-1", text: "喜欢红茶", updatedAt: "2026-01-02T00:00:00.000Z" }],
  messages: [{ id: "msg-1", role: "user", content: "你好", updatedAt: "2026-01-02T00:00:00.000Z" }],
  conversations: [],
  palace_kg: [],
  worldbook: [],
  characters: [{ id: "char-demo", name: "Demo", updatedAt: "2026-01-02T00:00:00.000Z" }],
  media: [{
    id: "m1",
    kind: "file",
    name: "photo.png",
    type: "image/png",
    size: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
  }],
};

const mediaBytes = {
  m1: new Uint8Array([1, 2, 3, 4]),
};

const deps = {
  collectProfileState: () => ({ name: "测试", provider: { apiKey: "sk-live-should-not-export" } }),
  collectLibraryState: () => ({ books: [{ id: "b1", title: "书" }], tracks: [{ id: "t1", title: "歌" }] }),
  getEcosystemState: () => ({ loggedIn: true, token: "secret-ecosystem-token-xyz" }),
  getAllRecords: async (store) => (idb[store] ? [...idb[store]] : []),
  normalizeMemory: (r) => r,
  collectWorldbookEntries: () => [],
  currentDailyStatus: null,
  collectSettings: () => ({
    diary: { style: "literary" },
    voice: { ttsApiKey: "sk-voice-key-never-export", sttApiKey: "sk-stt-never" },
  }),
  getAvatarState: () => null,
  listCharactersForBackup: async () => idb.characters,
  readMediaBytes: async (record) => mediaBytes[record.id] || null,
};

console.log("--- envelope ---");
{
  const plain = new TextEncoder().encode("hello-nyra");
  const sealed = await sealNyraArchive(plain, { passphrase: "test" });
  assert(looksLikeNyraEnvelope(sealed), "magic_ok");
  const opened = await openNyraArchive(sealed, { passphrase: "test" });
  assert(new TextDecoder().decode(opened) === "hello-nyra", "roundtrip_passphrase");
  let authFailed = false;
  try {
    await openNyraArchive(sealed, { passphrase: "wrong" });
  } catch (err) {
    authFailed = err.code === "archive_auth_failed";
  }
  assert(authFailed, "wrong_passphrase_rejected");
}

console.log("--- build/parse .nyra ---");
const built = await buildNyraArchive(deps, { passphrase: "", includeMedia: true });
assert(built.bytes?.length > 0, "built_bytes");
assert(built.manifest?.schema === "nyra.archive.manifest", "manifest_schema");
assert(built.characterCount === 1, "character_count");
assert(built.mediaCount >= 1, "media_dedup_count");

const parsed = await parseNyraArchive(built.bytes, { passphrase: "" });
assert(parsed.kind === "nyra", "parsed_kind");
assert(parsed.userData?.profile?.name === "测试", "profile_restored");
assert(!parsed.userData?.profile?.provider, "provider_stripped");
assert(parsed.userData?.ecosystem?.token === "" || parsed.userData?.ecosystem?.token == null, "token_stripped");
assert(parsed.characters["char-demo"]?.name === "Demo", "character_entity");
assert(parsed.resources.length >= 1, "resources_present");
assertNoSecretsInExport(parsed.userData);

console.log("--- checksum mismatch ---");
{
  const tampered = new Uint8Array(built.bytes);
  tampered[tampered.length - 5] ^= 0xff;
  let failed = false;
  try {
    await parseNyraArchive(tampered, { passphrase: "" });
  } catch (err) {
    failed = err.code === "archive_auth_failed" || err.code === "archive_checksum_mismatch" || err.code === "archive_schema_invalid";
  }
  assert(failed, "tamper_detected");
}

console.log("--- legacy migrate ---");
{
  const legacy = {
    schema: "yueqi-companion-export",
    version: 2,
    appVersion: "1.0.0",
    profile: { name: "旧档", provider: { apiKey: "sk-legacy" } },
    ecosystem: { token: "tok" },
    memories: [{ id: "m", text: "x" }],
    characters: [{ id: "c1", name: "角色" }],
    settings: { voice: { ttsApiKey: "sk-v" } },
    library: { books: [], tracks: [] },
    exportedAt: "2026-01-01T00:00:00.000Z",
  };
  assert(detectLegacyBackup(legacy).kind === "legacy-json", "detect_legacy_json");
  const migrated = migrateLegacyBackup(legacy);
  assert(migrated.kind === "legacy", "migrated_kind");
  assert(migrated.preview.warnings.includes("legacy_format_migrated"), "legacy_warning");
  assert(!migrated.userData.profile?.provider, "legacy_provider_gone");

  const zip = zipSync({
    "backup.json": strToU8(JSON.stringify(legacy)),
    "media/m1": new Uint8Array([9, 9]),
  });
  legacy.mediaManifest = [{ id: "m1", name: "a.png", type: "image/png", kind: "file" }];
  const zip2 = zipSync({
    "backup.json": strToU8(JSON.stringify(legacy)),
    "media/m1": new Uint8Array([9, 9]),
  });
  assert(detectLegacyBackup(zip2).kind === "legacy-zip", "detect_legacy_zip");
  const migratedZip = migrateLegacyBackup(zip2);
  assert(migratedZip.legacyMedia.length === 1, "legacy_zip_media");
}

console.log("--- merge rules ---");
{
  const current = {
    characters: [{ id: "a", name: "旧", updatedAt: "2026-01-01T00:00:00.000Z" }],
    memories: [{ id: "m1", text: "old", updatedAt: "2026-01-01T00:00:00.000Z" }],
  };
  const incoming = {
    characters: [{ id: "a", name: "新", updatedAt: "2026-02-01T00:00:00.000Z" }, { id: "b", name: "B", updatedAt: "2026-02-01T00:00:00.000Z" }],
    memories: [{ id: "m1", text: "new", updatedAt: "2026-02-01T00:00:00.000Z" }],
  };
  const merged = mergeUserWorld(current, incoming, { mode: "merge" });
  assert(merged.result.characters.find((c) => c.id === "a").name === "新", "merge_newer_character");
  assert(merged.result.characters.some((c) => c.id === "b"), "merge_add_character");
  assert(merged.result.memories[0].text === "new", "merge_newer_memory");
}

console.log("--- prepare import plan ---");
{
  const prepared = await prepareNyraImport(built.bytes, { passphrase: "" });
  const plan = buildImportPlan(prepared, "replace");
  assert(plan.mode === "replace", "plan_replace");
  assert(plan.preview.characterCount >= 1, "plan_preview");
}

console.log("");
if (failures.length) {
  console.error("FAIL", failures.join(" | "));
  process.exit(1);
}
console.log("PASS nyra-runtime");
