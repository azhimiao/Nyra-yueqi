import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FL_V2_FIELD_PATHS } from "../src/first-light/state-v2.js";
import { FIRST_LIGHT_FIELD_OWNERSHIP_V1 } from "../src/first-light/field-ownership-v1.js";
import { firstMessageFromV2Draft } from "../src/first-light/commit-v2.js";
import { deterministicPreview } from "../src/first-light/preview-v2.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const app = read("src/app.js");
const assemble = read("src/prompt/assemble.js");
const ui = read("src/first-light/ui.js");
const production = read("src/first-light/production-v2.js");
const commit = read("src/first-light/commit-v2.js");
const baseWorld = read("src/world/base-world.js");

assert.equal(Object.keys(FIRST_LIGHT_FIELD_OWNERSHIP_V1).filter((key) => FL_V2_FIELD_PATHS.includes(key)).length, FL_V2_FIELD_PATHS.length);
assert.match(ui, /startFirstLightV2IfNeeded/);
assert.match(production, /commitFirstLightV2/);
assert.match(production, /migrateFirstLightV1Preference/);
assert.match(assemble, /compileCharacterCore/);
assert.equal(assemble.includes("assembleIdentityForCharacter"), false);
assert.equal(assemble.includes("profile?.alias ?"), false);
assert.match(assemble, /buildNyraBaseWorld/);
assert.match(assemble, /buildYueqiHabitat/);
assert.match(app, /hasFirstLightDoneV2/);
assert.equal(app.includes('id: "seed-greeting"'), false);
assert.match(commit, /resolveCharacterOpeningLine/);
assert.match(baseWorld, /selectedPetId/);
assert.match(firstMessageFromV2Draft({ character: {}, preference: {} }), /Nyra|月栖/);
assert.equal(deterministicPreview({}).text, "");

console.log(`verify-wave1-finalization: ok (${FL_V2_FIELD_PATHS.length} V2 fields, single identity compiler, opening self-intro)`);

