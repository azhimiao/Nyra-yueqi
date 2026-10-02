/**
 * Runtime tests for .nychar export/import, generic card, privacy, checksum.
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

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const {
  buildNycharPackage,
  parseNycharPackage,
  prepareCharacterImport,
  installCharacterImport,
  exportCharacterAsGenericCard,
  assertNycharPrivacy,
  detectCharacterPackage,
} = await import("../../src/portability/nychar/index.js");
const { safeUnzip, safeZip, strToU8, strFromU8 } = await import("../../src/portability/zip-safe.js");
const { sha256Hex } = await import("../../src/portability/hash.js");

const tinyPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
  0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

const sampleCharacter = {
  id: "mira.stargazer",
  name: "Mira",
  alias: "Mira",
  avatarUrl: "",
  profile: {
    fields: ["Mira", "Mira", "Amateur astronomer", "", "Warm rooftop companion who loves quiet skies."],
    tokens: ["astronomy", "calm"],
    ranges: ["50", "50", "50", "50"],
    promptSystem: "You are Mira.",
    promptDeveloper: "",
    anniversaryDate: "",
    status: {},
  },
  loreEntryIds: [],
  source: "user",
};

console.log("--- round-trip .nychar ---");
{
  const built = await buildNycharPackage(sampleCharacter, {
    greetings: ["The sky is clear tonight."],
    worldbook: {
      schema: "nyra.character.worldbook",
      version: 1,
      entries: [{
        id: "rooftop",
        name: "Rooftop",
        content: "A quiet observatory above the library.",
        keywords: ["observatory"],
        enabled: true,
        priority: 1,
      }],
    },
    relationship: {
      relationshipType: "companion",
      communicationStyle: "Supportive",
      boundaries: ["Do not pressure disclosure."],
    },
    assets: {
      "assets/avatar.png": tinyPng,
    },
    packageId: "00000000-0000-4000-8000-000000000099",
    createdAt: "2026-01-15T12:00:00.000Z",
  });

  assert(built.bytes?.length > 0, "built_bytes");
  assert(built.manifest?.schema === "nyra.character-package.manifest", "manifest_schema");
  assert(built.manifest.formatVersion === 1, "format_version");
  assert(detectCharacterPackage(built.bytes, { fileName: "mira.nychar" }) === "nychar", "detect_nychar");

  const staged = await parseNycharPackage(built.bytes);
  assert(staged.preview.name === "Mira", "preview_name");
  assert(staged.character.name === "Mira", "character_name");
  assert(String(staged.character.profile.fields[4] || "").includes("rooftop") ||
    String(staged.character.profile.fields[4] || "").includes("Warm"), "persona_mapped");
  assert(staged.components.worldbook.entries.length === 1, "worldbook_kept");
  assert(staged.components.relationship.mode === "initial-portable-config", "relationship_initial");
  assert(staged.assets["assets/avatar.png"]?.length === tinyPng.length, "avatar_asset");
  assert(staged.character.avatarUrl.startsWith("data:image/png"), "avatar_data_url");

  const installed = [];
  const saved = await installCharacterImport(staged, {
    upsertCharacter: async (partial) => {
      installed.push(partial);
      return partial;
    },
  });
  assert(installed.length === 1, "install_called");
  assert(saved.source === "import", "install_source");
  assert(saved.id && saved.id !== "mira.stargazer", "install_new_id");

  // Re-export from staged components should stay valid
  const again = await buildNycharPackage(staged.character, {
    worldbook: staged.components.worldbook,
    relationship: staged.components.relationship,
    appearance: staged.components.appearance,
    actions: staged.components.actions,
    voice: staged.components.voice,
    skills: staged.components.skills,
    greetings: staged.components.character.greetings,
    assets: staged.assets,
  });
  const staged2 = await parseNycharPackage(again.bytes);
  assert(staged2.preview.name === "Mira", "roundtrip_name");
  assert(staged2.components.worldbook.entries[0].id === "rooftop", "roundtrip_worldbook");
}

console.log("--- generic import ---");
{
  const generic = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Nova",
      description: "A curious night-sky guide.",
      personality: "Gentle",
      scenario: "Under starlight",
      first_mes: "Ready to look up?",
      tags: ["stars"],
    },
  };
  const staged = await prepareCharacterImport(JSON.stringify(generic), {
    fileName: "nova.json",
  });
  assert(staged.kind === "generic", "generic_kind");
  assert(staged.character.name === "Nova", "generic_name");
  assert(staged.lossy, "generic_lossy_present");

  const exported = exportCharacterAsGenericCard(sampleCharacter, {
    version: "v2",
    greetings: ["Hi"],
    worldbook: {
      schema: "nyra.character.worldbook",
      version: 1,
      entries: [{ id: "x", content: "lore" }],
    },
  });
  assert(exported.card.spec === "chara_card_v2", "generic_export_spec");
  assert(exported.warnings.length > 0, "generic_export_warnings");
  assert(exported.lossy.dropped.some((d) => String(d).includes("worldbook")), "generic_export_worldbook_loss");
}

console.log("--- privacy exclusion ---");
{
  let blocked = false;
  try {
    assertNycharPrivacy({
      schema: "nyra.character",
      version: 1,
      id: "x",
      name: "x",
      persona: { description: "ok" },
      memories: [{ text: "private" }],
    });
  } catch (err) {
    blocked = err.code === "nychar_forbidden_user_data";
  }
  assert(blocked, "privacy_memories_blocked");

  // Export must not carry private keys even if caller passes them on relationship options
  const scrubbed = await buildNycharPackage(sampleCharacter, {
    relationship: {
      relationshipType: "companion",
      intimacyScore: 99,
      conversations: [{ id: "c1" }],
      communicationStyle: "Supportive",
    },
  });
  const scrubbedStaged = await parseNycharPackage(scrubbed.bytes);
  assert(!("intimacyScore" in scrubbedStaged.components.relationship), "export_strips_intimacy");
  assert(!("conversations" in scrubbedStaged.components.relationship), "export_strips_conversations");

  // Malicious package with forbidden user data in character.json must be rejected on import
  const clean = await buildNycharPackage(sampleCharacter);
  const entries = safeUnzip(clean.bytes, {
    maxEntries: 256,
    maxTotalUncompressed: 128 * 1024 * 1024,
    maxEntrySize: 64 * 1024 * 1024,
    maxPathLength: 240,
    maxCompressionRatio: 100,
  });
  const charJson = JSON.parse(strFromU8(entries["character.json"]));
  charJson.memories = [{ text: "should-not-import" }];
  const dirtyBytes = strToU8(JSON.stringify(charJson));
  entries["character.json"] = dirtyBytes;
  const meta = JSON.parse(strFromU8(entries["manifest.json"]));
  meta.components.character.size = dirtyBytes.length;
  meta.components.character.sha256 = await sha256Hex(dirtyBytes);
  entries["manifest.json"] = strToU8(JSON.stringify(meta, null, 2));
  let importBlocked = false;
  try {
    await parseNycharPackage(safeZip(entries));
  } catch (err) {
    importBlocked = err.code === "nychar_forbidden_user_data";
  }
  assert(importBlocked, "import_rejects_private_fields");
}

console.log("--- corrupted checksum ---");
{
  const built = await buildNycharPackage(sampleCharacter, {
    assets: { "assets/avatar.png": tinyPng },
  });
  const entries = safeUnzip(built.bytes, {
    maxEntries: 256,
    maxTotalUncompressed: 128 * 1024 * 1024,
    maxEntrySize: 64 * 1024 * 1024,
    maxPathLength: 240,
    maxCompressionRatio: 100,
  });
  const charJson = JSON.parse(strFromU8(entries["character.json"]));
  charJson.persona.description = `${charJson.persona.description} tampered`;
  entries["character.json"] = strToU8(JSON.stringify(charJson));
  // Keep manifest hash stale → checksum mismatch
  const tamperedZip = safeZip(entries);
  let failed = false;
  try {
    await parseNycharPackage(tamperedZip);
  } catch (err) {
    failed = err.code === "nychar_checksum_mismatch";
  }
  assert(failed, "checksum_mismatch_detected");
}

if (failures.length) {
  console.error("FAIL", failures);
  process.exit(1);
}
console.log("PASS nychar-runtime");
