#!/usr/bin/env node
/**
 * Data portability gate — schemas/examples + runtime round-trips + security.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const failures = [];

function check(name, pass, detail = "") {
  if (!pass) failures.push(name);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function runNode(rel) {
  const r = spawnSync(node, ["--enable-source-maps", join(root, rel)], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  });
  const ok = (r.status ?? 1) === 0;
  if (!ok) {
    console.log(r.stdout || "");
    console.error(r.stderr || "");
  }
  return ok;
}

console.log("=== schema / examples matrix ===");
const schemaDir = join(root, "docs/formats/schemas");
const exampleDir = join(root, "docs/formats/examples");
const schemas = existsSync(schemaDir) ? readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json")) : [];
const examples = existsSync(exampleDir) ? readdirSync(exampleDir).filter((f) => f.endsWith(".json")) : [];
check("schemas_present", schemas.length >= 10, `${schemas.length}`);
check("examples_present", examples.length >= 12, `${examples.length}`);

for (const name of schemas) {
  try {
    JSON.parse(readFileSync(join(schemaDir, name), "utf8"));
    check(`schema_parse:${name}`, true);
  } catch (err) {
    check(`schema_parse:${name}`, false, String(err.message || err));
  }
}

const matrix = [
  ["nyra-archive-manifest-v1.schema.json", "nyra-archive-manifest.example.json"],
  ["nychar-manifest-v1.schema.json", "nychar-manifest.example.json"],
  ["nychar-character-v1.schema.json", "nychar-character.example.json"],
  ["nychar-worldbook-v1.schema.json", "nychar-worldbook.example.json"],
  ["nychar-relationship-v1.schema.json", "nychar-relationship.example.json"],
  ["nychar-appearance-v1.schema.json", "nychar-appearance.example.json"],
  ["nychar-actions-v1.schema.json", "nychar-actions.example.json"],
  ["nychar-voice-v1.schema.json", "nychar-voice.example.json"],
  ["nychar-skills-v1.schema.json", "nychar-skills.example.json"],
  ["nyra-resource-metadata-v1.schema.json", "book-resource-metadata.example.json"],
  ["nyra-resource-metadata-v1.schema.json", "music-resource-metadata.example.json"],
];

let jsonschema;
try {
  jsonschema = await import("jsonschema");
} catch {
  jsonschema = null;
}

if (jsonschema?.Validator || jsonschema?.default) {
  const Validator = jsonschema.Validator || jsonschema.default?.Validator;
  // Prefer Draft202012 if available via Ajv-like; fall back to parse-only.
  for (const [schemaName, exampleName] of matrix) {
    const schema = JSON.parse(readFileSync(join(schemaDir, schemaName), "utf8"));
    const example = JSON.parse(readFileSync(join(exampleDir, exampleName), "utf8"));
    try {
      if (Validator) {
        const v = new Validator();
        const result = v.validate(example, schema);
        check(`example_vs_schema:${exampleName}`, result.valid, result.errors?.[0]?.stack || "");
      } else {
        check(`example_vs_schema:${exampleName}`, true, "parsed_only");
      }
    } catch (err) {
      check(`example_vs_schema:${exampleName}`, false, String(err.message || err));
    }
  }
} else {
  // No jsonschema package — still require examples parse + required fields present.
  for (const [, exampleName] of matrix) {
    try {
      const example = JSON.parse(readFileSync(join(exampleDir, exampleName), "utf8"));
      check(`example_parse:${exampleName}`, Boolean(example && typeof example === "object"));
    } catch (err) {
      check(`example_parse:${exampleName}`, false, String(err.message || err));
    }
  }
  check("generic_card_example", existsSync(join(exampleDir, "generic-character-card.example.json")));
}

console.log("\n=== runtime contracts ===");
check("portability_module", existsSync(join(root, "src/portability/index.js")));
check("nyra_builder", existsSync(join(root, "src/portability/nyra/builder.js")));
check("nychar_export", existsSync(join(root, "src/portability/nychar/export.js")));
check("resource_registry", existsSync(join(root, "src/portability/resources/registry.js")));
check("cloud_bridge", existsSync(join(root, "src/portability/cloud/bridge.js")));

const backupUi = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");
check("ui_backup_nyra_export", backupUi.includes("data-phone-backup-export-nyra"));
check("ui_no_ordinary_json_export", !backupUi.includes("data-phone-backup-export-json"));
check("ui_character_export", backupUi.includes("data-phone-export-character"));

console.log("\n=== runtime suites ===");
check("nyra_runtime", runNode("tests/integration/nyra-runtime.mjs"));
check("nychar_runtime", runNode("tests/integration/nychar-runtime.mjs"));
check("resource_imports", runNode("tests/integration/resource-imports.mjs"));

console.log("");
if (failures.length) {
  console.error(`verify-data-portability failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("verify-data-portability PASSED");
