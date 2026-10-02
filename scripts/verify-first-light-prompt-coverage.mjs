#!/usr/bin/env node
import assert from "node:assert/strict";
import { FL_V2_FIELD_PATHS } from "../src/first-light/state-v2.js";
import { identityCoverageKeys } from "../src/prompt/character-identity-v2.js";
import { relationshipCoverageKeys } from "../src/prompt/relationship-contract-v2.js";
import { createExplicitValue } from "../src/contracts/companion-v2-shared.js";
import { buildCharacterIdentityV2 } from "../src/prompt/character-identity-v2.js";
import { buildRelationshipContractV2 } from "../src/prompt/relationship-contract-v2.js";

const AT = "2026-08-18T04:00:00.000Z";
const compiled = [
  buildCharacterIdentityV2({
    name: "MarkerName",
    selfIdentity: { genderIdentity: "MarkerGender", pronouns: ["MarkerPronoun"] },
    persona: {
      personality: "MarkerPersonality",
      values: ["MarkerValue"],
      autonomy: "MarkerAutonomy",
      ownBoundaries: ["MarkerBound"],
    },
  }),
  buildRelationshipContractV2({
    userIdentity: {
      callUserAs: createExplicitValue("MarkerCall", "explicit", AT),
      pronouns: createExplicitValue(["MarkerUserPronoun"], "explicit", AT),
    },
    relationship: {
      type: createExplicitValue("MarkerRel", "explicit", AT),
      purposes: createExplicitValue(["MarkerPurpose"], "explicit", AT),
      sharedHistory: createExplicitValue("MarkerHistory", "explicit", AT),
    },
    interaction: {
      supportStyle: createExplicitValue("MarkerSupport", "explicit", AT),
      initiativeStyle: createExplicitValue("MarkerInit", "explicit", AT),
      conflictRepairStyle: createExplicitValue("MarkerConflict", "explicit", AT),
      intimacyStyle: createExplicitValue("MarkerIntimacy", "explicit", AT),
      flirtLevel: createExplicitValue("light", "explicit", AT),
      nudgePolicy: createExplicitValue("gentle", "explicit", AT),
    },
    boundaries: {
      allowJealousExpression: createExplicitValue(false, "explicit", AT),
      userHardBoundaries: createExplicitValue(["MarkerHard"], "explicit", AT),
      quietHours: createExplicitValue({ start: "22:00", end: "07:00" }, "explicit", AT),
    },
  }),
].join("\n");

const expected = [
  "MarkerName",
  "MarkerGender",
  "MarkerPronoun",
  "MarkerPersonality",
  "MarkerValue",
  "MarkerAutonomy",
  "MarkerBound",
  "MarkerCall",
  "MarkerRel",
  "MarkerPurpose",
  "MarkerSupport",
  "MarkerInit",
  "MarkerConflict",
  "MarkerIntimacy",
  "MarkerHard",
  "22:00",
  "MarkerHistory",
];
for (const token of expected) {
  assert.match(compiled, new RegExp(token));
  console.log(`PASS coverage token ${token}`);
}

assert.ok(identityCoverageKeys().length);
assert.ok(relationshipCoverageKeys().length);
assert.ok(FL_V2_FIELD_PATHS.length >= identityCoverageKeys().length);
console.log("PASS field lists exist");
console.log("verify-first-light-prompt-coverage PASS");
