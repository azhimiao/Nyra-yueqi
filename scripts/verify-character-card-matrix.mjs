#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCharacterImportReportV1,
  IMPORT_DISPOSITIONS,
  validateCharacterImportReportV1,
} from "../src/contracts/character-import-report-v1.js";
import {
  CARD_COMPAT_FORMATS,
  CARD_DISPOSITIONS,
  CARD_FORMATS,
  CARD_SOURCE_PATHS,
  CARD_STATUSES,
  CHARACTER_CARD_REQUIRED_FIELDS,
  CHARACTER_CARD_SUPPORT_MATRIX,
  MASTER_PLAN_CARD_FIELDS,
  SUPPORT_MATRIX,
  WEBP_UNSUPPORTED_REASON,
  assertNoFullParityClaim,
  dispositionFor,
  isSensitiveElevationTarget,
  listSupportedPaths,
  lookupCardPath,
} from "../src/portability/character-card-schema.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docPath = path.join(root, "docs/formats/GENERIC_CHARACTER_CARD_COMPATIBILITY.md");
const fixtureDir = path.join(root, "tests/fixtures/character-cards");

let passCount = 0;
function pass(name, fn) {
  fn();
  passCount += 1;
  console.log(`PASS ${name}`);
}

const JSON_FORMATS = ["tavern_v2_json", "tavern_v3_json"];
const JSON_ALIASES = ["json_v2", "json_v3"];

pass("every matrix disposition is a legal enum", () => {
  for (const format of CARD_COMPAT_FORMATS) {
    const row = SUPPORT_MATRIX[format];
    assert.ok(row, format);
    for (const sourcePath of CARD_SOURCE_PATHS) {
      const cell = row[sourcePath];
      assert.ok(cell, `${format}.${sourcePath}`);
      assert.equal(
        IMPORT_DISPOSITIONS.includes(cell.disposition),
        true,
        `${format}.${sourcePath}=${cell.disposition}`,
      );
    }
  }
});

pass("system_prompt on json formats is demoted_untrusted", () => {
  for (const format of JSON_FORMATS) {
    assert.equal(dispositionFor(format, "system_prompt"), "demoted_untrusted", format);
  }
});

pass("post_history_instructions on json formats is demoted_untrusted", () => {
  for (const format of JSON_FORMATS) {
    assert.equal(dispositionFor(format, "post_history_instructions"), "demoted_untrusted", format);
  }
});

pass("unknown path is unsupported, not preserved", () => {
  for (const format of [...CARD_COMPAT_FORMATS, "unknown", "not_a_format"]) {
    assert.equal(dispositionFor(format, "definitely.not.a.path"), "unsupported", format);
    assert.notEqual(dispositionFor(format, "definitely.not.a.path"), "preserved", format);
  }
});

pass("unknown format lists no supported paths", () => {
  assert.deepEqual(listSupportedPaths("unknown"), []);
  assert.deepEqual(listSupportedPaths(""), []);
});

pass("webp column is entirely unsupported", () => {
  for (const sourcePath of CARD_SOURCE_PATHS) {
    const cell = SUPPORT_MATRIX.webp[sourcePath];
    assert.equal(cell.disposition, "unsupported", sourcePath);
    assert.equal(cell.notes, WEBP_UNSUPPORTED_REASON);
  }
  assert.deepEqual(listSupportedPaths("webp"), []);
});

pass("json extensions are preserved raw; macros/regex are unsafe_ignored", () => {
  for (const format of JSON_FORMATS) {
    assert.equal(dispositionFor(format, "extensions"), "preserved");
    assert.equal(dispositionFor(format, "macros"), "unsafe_ignored");
    assert.equal(dispositionFor(format, "regex_scripts"), "unsafe_ignored");
    assert.equal(dispositionFor(format, "character_book"), "transformed");
  }
});

const doc = fs.readFileSync(docPath, "utf8");

pass("document does not claim complete tavern coverage", () => {
  assert.equal(doc.includes("完全兼容酒馆"), false);
  assertNoFullParityClaim(doc);
});

pass("assertNoFullParityClaim rejects English phrase", () => {
  assert.throws(() => assertNoFullParityClaim("This importer has full parity with that client."));
});

pass("assertNoFullParityClaim rejects Chinese phrase", () => {
  assert.throws(() => assertNoFullParityClaim("本导入器完全兼容酒馆角色卡。"));
});

function parsePathMatrix(markdown) {
  const marker = "<!-- character-card-path-matrix -->";
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, "missing path-matrix marker");
  const tableLines = [];
  for (const rawLine of markdown.slice(start).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (tableLines.length && !line.startsWith("|")) break;
    if (line.startsWith("|")) tableLines.push(line);
  }
  assert.ok(tableLines.length >= 3, "matrix table too small");
  const header = tableLines[0].split("|").map((cell) => cell.trim()).filter(Boolean);
  assert.deepEqual(header[0], "path");
  const formats = header.slice(1);
  assert.deepEqual(formats, [...CARD_COMPAT_FORMATS]);
  const rows = [];
  for (const line of tableLines.slice(2)) {
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (!cells[0] || cells[0] === "path") continue;
    rows.push({ path: cells[0], dispositions: cells.slice(1) });
  }
  return { formats, rows };
}

const matrixTable = parsePathMatrix(doc);
const docPaths = matrixTable.rows.map((row) => row.path);

pass("document table paths match schema paths", () => {
  assert.deepEqual([...docPaths].sort(), [...CARD_SOURCE_PATHS].sort());
});

pass("document table dispositions match schema", () => {
  for (const row of matrixTable.rows) {
    matrixTable.formats.forEach((format, index) => {
      assert.equal(
        row.dispositions[index],
        dispositionFor(format, row.path),
        `${row.path} / ${format}`,
      );
    });
  }
});

for (const field of CHARACTER_CARD_REQUIRED_FIELDS) {
  pass(`doc names data.${field}`, () => {
    assert.match(doc, new RegExp(`data\\.${field}`));
  });
}

pass("flat matrix is a non-empty array", () => {
  assert.equal(Array.isArray(CHARACTER_CARD_SUPPORT_MATRIX), true);
  assert.ok(
    CHARACTER_CARD_SUPPORT_MATRIX.length >= CHARACTER_CARD_REQUIRED_FIELDS.length * JSON_ALIASES.length,
  );
});

for (const field of CHARACTER_CARD_REQUIRED_FIELDS) {
  for (const format of JSON_ALIASES) {
    pass(`matrix covers ${format} data.${field}`, () => {
      const row = lookupCardPath(format, `data.${field}`);
      assert.ok(row, `missing ${format} data.${field}`);
      assert.equal(row.field, field);
      assert.equal(row.format, format);
      assert.ok(
        row.path === `data.${field}` || row.path === `data.${field}[]`,
        `${format} data.${field} path=${row.path}`,
      );
      assert.ok(row.disposition);
    });
  }
}

for (const format of JSON_ALIASES) {
  pass(`${format} system_prompt is demoted, not kernel`, () => {
    const row = lookupCardPath(format, "data.system_prompt");
    assert.equal(row.disposition, "demoted_untrusted");
    assert.equal(row.targetPath, "prompts.characterSystemSupplement");
    assert.equal(isSensitiveElevationTarget(row.targetPath), false);
    assert.notEqual(row.disposition, "preserved");
  });
  pass(`${format} post_history_instructions is demoted, not kernel`, () => {
    const row = lookupCardPath(format, "data.post_history_instructions");
    assert.equal(row.disposition, "demoted_untrusted");
    assert.equal(row.targetPath, "prompts.postHistoryInstructions");
    assert.equal(isSensitiveElevationTarget(row.targetPath), false);
  });
  pass(`${format} extensions preserved raw, not Prompt`, () => {
    const row = lookupCardPath(format, "data.extensions");
    assert.equal(row.disposition, "preserved");
    assert.equal(row.targetPath, "extensions");
    assert.match(row.note, /never injected into Prompt/i);
  });
  pass(`${format} regex scripts unsafe_ignored`, () => {
    const row = lookupCardPath(format, "data.extensions.regex_scripts");
    assert.equal(row.disposition, "unsafe_ignored");
  });
  pass(`${format} macros unsafe_ignored`, () => {
    const row = lookupCardPath(format, "macros");
    assert.equal(row.disposition, "unsafe_ignored");
  });
}

pass("webp listed fields are unsupported", () => {
  for (const field of CHARACTER_CARD_REQUIRED_FIELDS) {
    const row = lookupCardPath("webp", `data.${field}`);
    assert.ok(row, `missing webp data.${field}`);
    assert.equal(row.disposition, "unsupported");
    assert.equal(isSensitiveElevationTarget(row.targetPath), false);
  }
});

pass("png_chara chunks are transformed, not silently omitted", () => {
  for (const chunk of ["png.tEXt.chara", "png.iTXt.chara", "png.zTXt.chara", "png.tEXt.ccv3"]) {
    const row = lookupCardPath("png_chara", chunk);
    assert.ok(row, `missing ${chunk}`);
    assert.equal(row.disposition, "transformed");
  }
});

function readFixture(name) {
  const file = path.join(fixtureDir, name);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(typeof raw, "object");
  assert.equal(typeof raw.data, "object");
  assert.equal(typeof raw.data.name, "string");
  assert.ok(raw.data.name.length > 0);
  assert.ok(Array.isArray(raw.data.character_book?.entries));
  assert.equal(raw.data.character_book.entries.length >= 1, true);
  const book = raw.data.character_book.entries[0];
  for (const key of ["keys", "secondary_keys", "position", "depth", "priority", "enabled", "selective", "constant"]) {
    assert.equal(book[key] === undefined, false, `${name} character_book missing ${key}`);
  }
  return raw;
}

pass("v2-minimal.json has V2 shape and one character_book entry", () => {
  const card = readFixture("v2-minimal.json");
  assert.equal(card.spec, "chara_card_v2");
});

pass("v3-minimal.json has V3 shape and one character_book entry", () => {
  const card = readFixture("v3-minimal.json");
  assert.equal(card.spec, "chara_card_v3");
});

function interpretFixture(rel, format) {
  const card = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  assert.equal(typeof card.data, "object");
  const explained = [];
  for (const key of Object.keys(card.data)) {
    const row = lookupCardPath(format, `data.${key}`);
    assert.ok(row, `${rel} data.${key} is not in the matrix`);
    explained.push(row);
  }
  return { card, explained };
}

pass("v2-minimal fixture is explained by lookup", () => {
  const { card, explained } = interpretFixture("tests/fixtures/character-cards/v2-minimal.json", "json_v2");
  assert.equal(card.spec, "chara_card_v2");
  assert.ok(explained.some((row) => row.field === "first_mes" && row.targetPath === "greetings.primary"));
  assert.equal(lookupCardPath("tavern_v2_json", "first_mes").path, "data.first_mes");
});

pass("v3-minimal fixture is explained by lookup", () => {
  const { card, explained } = interpretFixture("tests/fixtures/character-cards/v3-minimal.json", "json_v3");
  assert.equal(card.spec, "chara_card_v3");
  assert.ok(explained.some((row) => row.field === "first_mes"));
  assert.equal(lookupCardPath("tavern_v3_json", "data.group_only_greetings").disposition, "unsupported");
});

pass("CharacterImportReportV1: first_mes maps to greetings.primary", () => {
  const mapped = lookupCardPath("json_v2", "data.first_mes");
  assert.ok(["preserved", "transformed"].includes(mapped.disposition));
  assert.equal(mapped.targetPath, "greetings.primary");
  const report = createCharacterImportReportV1({
    format: "tavern_v2_json",
    entries: [{
      path: mapped.path,
      disposition: mapped.disposition,
      targetPath: mapped.targetPath,
      sourceValueKind: "string",
      reasonCode: "mapped",
    }],
  });
  const result = validateCharacterImportReportV1(report);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(report.entries[0].targetPath, "greetings.primary");
  assert.equal(report.hasSevereLoss, false);
});

pass("CharacterImportReportV1: system_prompt cannot preserve into kernel", () => {
  const sys = lookupCardPath("json_v3", "data.system_prompt");
  const legal = createCharacterImportReportV1({
    format: "tavern_v3_json",
    entries: [{
      path: sys.path,
      disposition: sys.disposition,
      targetPath: sys.targetPath,
    }],
  });
  assert.equal(validateCharacterImportReportV1(legal).ok, true);
  const elevated = createCharacterImportReportV1({
    format: "tavern_v3_json",
    entries: [{
      path: "data.system_prompt",
      disposition: "preserved",
      targetPath: "platform.kernel",
    }],
  });
  const result = validateCharacterImportReportV1(elevated);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "untrusted_elevation"));
});

pass("collapsed matrix rows have path, formats, disposition, targetPath, notes, status", () => {
  assert.ok(Array.isArray(CHARACTER_CARD_SUPPORT_MATRIX) && CHARACTER_CARD_SUPPORT_MATRIX.length > 0);
  for (const entry of CHARACTER_CARD_SUPPORT_MATRIX) {
    assert.equal(typeof entry.path, "string");
    assert.ok(entry.path.length > 0, "empty path");
    assert.ok(Array.isArray(entry.formats) && entry.formats.length > 0, entry.path);
    for (const format of entry.formats) {
      assert.ok(CARD_FORMATS.includes(format), `${entry.path} format ${format}`);
    }
    assert.ok(CARD_DISPOSITIONS.includes(entry.disposition), `${entry.path} ${entry.disposition}`);
    assert.equal(typeof entry.targetPath, "string");
    assert.equal(typeof entry.notes, "string");
    assert.ok(entry.notes.length > 0, `${entry.path} notes`);
    assert.ok(CARD_STATUSES.includes(entry.status), `${entry.path} status`);
  }
});

pass("lookupCardPath(path) returns collapsed rows", () => {
  const name = lookupCardPath("data.name");
  assert.ok(name);
  assert.equal(name.path, "data.name");
  assert.ok(Array.isArray(name.formats));
  const alt = lookupCardPath("data.alternate_greetings");
  assert.ok(alt);
  assert.equal(alt.path, "data.alternate_greetings[]");
  assert.equal(lookupCardPath("data.no_such_field"), null);
});

pass("master plan §10.1 fields each have a collapsed matrix entry", () => {
  const missing = [];
  for (const field of MASTER_PLAN_CARD_FIELDS) {
    const hit = CHARACTER_CARD_SUPPORT_MATRIX.some((entry) => {
      const path = entry.path;
      if (path === `data.${field}` || path === `data.${field}[]`) return true;
      if (field === "character_book" && path.startsWith("data.character_book")) return true;
      return false;
    });
    if (!hit) missing.push(field);
  }
  assert.deepEqual(missing, []);
});

pass("first_mes is documented preserved, not claimed implemented persist", () => {
  const row = lookupCardPath("data.first_mes");
  assert.ok(row, "data.first_mes missing");
  assert.notEqual(row.disposition, "dropped");
  assert.equal(row.disposition, "preserved");
  assert.equal(row.targetPath, "greetings.primary");
  assert.equal(row.status, "planned");
  assert.match(row.notes, /Task 5\.3/);
  assert.doesNotMatch(row.notes, /already persist/i);
});

pass("status distinguishes documented vs implemented", () => {
  assert.equal(lookupCardPath("data.name").status, "implemented");
  assert.equal(lookupCardPath("data.first_mes").status, "planned");
  assert.equal(lookupCardPath("data.system_prompt").status, "planned");
  assert.equal(lookupCardPath("data.character_book").status, "planned");
});

pass("collapsed WebP container is unsupported", () => {
  const row = lookupCardPath("container.webp");
  assert.ok(row);
  assert.equal(row.disposition, "unsupported");
  assert.deepEqual([...row.formats], ["webp"]);
});

pass("collapsed macros policy is non-executing", () => {
  const row = lookupCardPath("text.macros");
  assert.ok(row);
  assert.match(row.notes, /never executed/i);
});

pass("collapsed matrix JSON has no forbidden coverage phrase", () => {
  const blob = JSON.stringify(CHARACTER_CARD_SUPPORT_MATRIX);
  assert.equal(/full parity/i.test(blob), false);
});

console.log(`OK ${passCount} checks`);
