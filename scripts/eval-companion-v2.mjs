#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { firstMessageFromV2Draft } from "../src/first-light/commit-v2.js";
import { createExplicitValue } from "../src/contracts/companion-v2-shared.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = JSON.parse(readFileSync(join(root, "evals/companion-v2/cases.json"), "utf8"));
const AT = "2026-08-18T05:00:00.000Z";

function slot(value) {
  return createExplicitValue(value, value === "" || value == null ? "skipped" : "explicit", AT);
}

let pass = 0;
for (const item of pack.cases) {
  const text = firstMessageFromV2Draft({
    character: {
      name: slot(item.name),
      genderIdentity: slot(item.genderIdentity || ""),
    },
    preference: {
      callUserAs: slot(item.callUserAs),
      relationshipType: slot(item.relationshipType),
    },
  });
  assert.ok(text.trim(), `${item.id} must generate a First Light self-intro`);
  assert.match(text, new RegExp(item.name === "未名" ? "Nyra" : item.name));
  for (const forbidden of item.mustNot || []) {
    assert.doesNotMatch(text, new RegExp(forbidden));
  }
  if (item.mustNotGuessGender) {
    assert.doesNotMatch(text, /我是男|我是女/);
  }
  pass += 1;
  console.log(`PASS eval ${item.id}`);
}
console.log(`eval-companion-v2: ${pass} PASS`);
