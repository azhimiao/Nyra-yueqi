/**
 * M2 — desktop pet binds to active character petId.
 * Run: node scripts/verify-characters-m2.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
    removeItem(key) {
      delete this._data[key];
    },
  },
};

globalThis.document = {
  dispatchEvent() {
    return true;
  },
};

const { BUILTIN_CHARACTER_ID } = await import("../src/constants.js");
const {
  createCharacter,
  ensureCharactersMigrated,
  getActiveCharacterId,
  getCharacter,
  getCharacterSync,
  resetCharacterCacheForTests,
  setActiveCharacterId,
  upsertCharacter,
} = await import("../src/characters/store.js");
const { readSelectedPetId, writeSelectedPetId, SELECTED_PET_KEY } = await import("../src/avatar/pet-catalog.js");
const { openMemoryDb } = await import("../src/storage/db.js");

const floatJs = readFileSync(join(root, "src/ui/companion-float.js"), "utf8");
const phoneJs = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
const petCatalog = readFileSync(join(root, "src/avatar/pet-catalog.js"), "utf8");
check("pet-catalog has character bridge", petCatalog.includes("bindCharacterPetBridge"));
check("float listens companion-changed", floatJs.includes("yueqi:companion-changed"));
check("phone listens companion-changed", phoneJs.includes("COMPANION_CHANGED_EVENT"));
check("phone pet bind label", readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8").includes("data-phone-pet-bind"));

resetCharacterCacheForTests();
await openMemoryDb();
await ensureCharactersMigrated();

const idA = BUILTIN_CHARACTER_ID;
await upsertCharacter({ id: idA, petId: "xingli" });
const charB = await createCharacter({ name: "气泡陪伴", copyFromId: idA });
await upsertCharacter({ id: charB.id, petId: "bubble", name: "气泡陪伴" });

setActiveCharacterId(idA);
check("active is A", getActiveCharacterId() === idA);
check("read pet for A is xingli", readSelectedPetId() === "xingli");

setActiveCharacterId(charB.id);
check("active is B", getActiveCharacterId() === charB.id);
check("read pet for B is bubble", readSelectedPetId() === "bubble", readSelectedPetId());

writeSelectedPetId("xingli");
check("write updates B petId", (await getCharacter(charB.id))?.petId === "xingli");
check("A petId unchanged after write on B", (await getCharacter(idA))?.petId === "xingli");
check("legacy key mirrored", window.localStorage.getItem(SELECTED_PET_KEY) === "xingli");

setActiveCharacterId(idA);
check("switch back to A still xingli", readSelectedPetId() === "xingli");
writeSelectedPetId("bubble");
check(
  "write on A only affects A",
  getCharacterSync(idA)?.petId === "bubble" && getCharacterSync(charB.id)?.petId === "xingli",
  `A=${getCharacterSync(idA)?.petId} B=${getCharacterSync(charB.id)?.petId}`
);

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
