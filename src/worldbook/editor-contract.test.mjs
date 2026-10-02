import assert from "node:assert/strict";
import { normalizeWorldbookEntry, entryInScope, entryMatchesQuery } from "./match.js";
import { activateWorldInfo } from "./activation.js";
import { parseWorldbookImport, exportWorldbookJson, mergeWorldbookEntries } from "./transfer.js";
import { upsertWorldbookEntry, listWorldbookEntries, worldbookVisibleForCharacter } from "./store.js";

const storage = new Map();
globalThis.window = { localStorage: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
} };

const source = {
  id: "fixture-lore", title: "Rain", content: "The station shelters travelers.",
  keys: ["rain", "station"], secondaryKeys: ["night", "late"],
  primaryMatchMode: "any", secondaryMatchMode: "all", secondaryLogic: "and",
  caseSensitive: true, characterId: "char-a", linkedCharacterIds: ["char-a", "char-b"],
  sourceRef: { kind: "authored", evidence: ["source-1"] },
  extensions: { foreignVendor: { futureField: [1, 2, 3] } }, depth: 4,
};
const entry = normalizeWorldbookEntry(source);
assert.equal(entry.scope, "character", "linked legacy entries must infer character scope");
assert.equal(entryInScope(entry, { characterId: "char-other" }), false);
assert.equal(entryInScope(entry, { characterId: "char-b" }), true);
assert.equal(worldbookVisibleForCharacter(entry, "char-b"), true, "second linked character sees the same entry as activation");
assert.equal(entryInScope({ scope: "character" }, { characterId: "char-a" }), false, "missing character binding must not activate globally");
assert.equal(entryInScope({ scopeApps: ["pop"] }, {}), false);
assert.equal(entryMatchesQuery(entry, "rain at night"), false, "secondary AND requires both keys");
assert.equal(entryMatchesQuery(entry, "rain at night, late"), true);
assert.equal(entryMatchesQuery(entry, "Rain at night, late"), false, "entry case setting reaches runtime matching");
assert.equal(entryMatchesQuery({ ...entry, secondaryLogic: "or" }, "night and late"), true);
assert.equal(entryMatchesQuery({ ...entry, primaryMatchMode: "all", secondaryKeys: [] }, "rain"), false);
assert.equal(entryMatchesQuery({ ...entry, primaryMatchMode: "all", secondaryKeys: [] }, "rain station"), true);
assert.equal(entryMatchesQuery({ keys: ["rain"], secondaryKeys: ["night"], matchMode: "any" }, "night"), true, "legacy OR semantics survive");
assert.equal(entryMatchesQuery({ keys: ["rain"], secondaryKeys: ["night"], matchMode: "not_any" }, "night"), false, "legacy exclusions survive");
assert.equal(entryMatchesQuery({ regex: "^Rain$", caseSensitive: true }, "rain"), false);
assert.equal(entryMatchesQuery({ regex: "^Rain$", caseSensitive: false }, "rain"), true);
assert.equal(entryMatchesQuery({ keys: ["Rain"], caseSensitive: false, caseInsensitive: false }, "rain"), true,
  "explicit editor case setting takes precedence over retained legacy metadata");
assert.equal(entryMatchesQuery({ keys: ["Rain"], caseInsensitive: false }, "rain"), false,
  "legacy case setting still works before an explicit editor setting exists");
const clearedKeys = normalizeWorldbookEntry({ keys: [], triggers: ["old-key"] });
assert.deepEqual(clearedKeys.keys, [], "explicit empty keywords clear retained legacy triggers");
assert.equal(entryMatchesQuery(clearedKeys, "old-key"), false);

const activation = activateWorldInfo([
  { ...entry, constant: true, insertPosition: "post_history", priority: 70, tokenBudget: 20 },
  { id: "before", title: "Before", content: "日落。月升。星亮。风停。", constant: true, tokenBudget: 14, insertPosition: "before_history", priority: 80 },
  { id: "off", content: "Not visible", constant: true, enabled: false },
], "rain at night late", { scopeContext: { characterId: "char-b" }, tokenBudget: 36 });
assert.deepEqual(activation.activated.map((row) => row.id), ["before", "fixture-lore"], "priority and enabled flags are enforced");
assert.match(activation.beforeText, /日落/);
assert.doesNotMatch(activation.beforeText, /station/);
assert.match(activation.afterText, /station/);
assert.ok(activation.activated.find((row) => row.id === "before")._contentTruncated);
assert.ok(activation.trace.usedTokens <= 36);
assert.ok(activation.trace.records.find((row) => row.entryId === "before").tokens <= 14);
assert.equal(activateWorldInfo([entry], "rain night late", { scopeContext: { characterId: "char-other" } }).activated.length, 0);

const roundtrip = parseWorldbookImport(exportWorldbookJson([entry]))[0];
assert.deepEqual(roundtrip.extensions, source.extensions, "JSON roundtrip retains extension fields");
assert.deepEqual(roundtrip.sourceRef, source.sourceRef);
assert.equal(roundtrip.depth, 4);
assert.throws(() => parseWorldbookImport('[{"content":"ok","regex":"["}]'), (error) => error.code === "invalid_regex");
assert.throws(() => parseWorldbookImport('[{"id":"same","content":"a"},{"id":"same","content":"b"}]'), (error) => error.code === "duplicate_id");
assert.throws(() => parseWorldbookImport('[{"content":"ok","keys":"rain"}]'), (error) => error.code === "invalid_list");
assert.throws(() => parseWorldbookImport({ character_book: { entries: [{ content: "ok", keys: "rain" }] } }), (error) => error.code === "invalid_list");
assert.throws(() => parseWorldbookImport({ character_book: { entries: [{ content: "ok", enabled: "false" }] } }), (error) => error.code === "invalid_value");
const external = parseWorldbookImport({ character_book: { entries: [{ content: "harbor", keys: ["sea", "sail"], selective: true, secondary_keys: ["night"], extensions: { custom: true } }] } }, { characterId: "char-b" })[0];
assert.equal(entryMatchesQuery(external, "sea at night"), true, "selective imported books use any primary AND a secondary");
assert.equal(entryMatchesQuery(external, "sea"), false);
assert.deepEqual(external.extensions, { custom: true });
assert.deepEqual(parseWorldbookImport(exportWorldbookJson([external]), { characterId: "other-character" })[0], JSON.parse(JSON.stringify(external)),
  "native exports of external books retain ID, binding, matching and all foreign fields");
const externalA = parseWorldbookImport({ character_book: { entries: [{ id: 1, content: "A's harbor", constant: true }] } }, { characterId: "char-a" })[0];
const externalB = parseWorldbookImport({ character_book: { entries: [{ id: 1, content: "B's forest", constant: true }] } }, { characterId: "char-b" })[0];
assert.notEqual(externalA.id, externalB.id, "external IDs must be isolated per character");
assert.equal(externalA.sourceRef.originalId, 1, "external source identifier is retained");
const separatorA = parseWorldbookImport({ character_book: { entries: [{ id: "b-c", content: "one" }] } }, { characterId: "a" })[0];
const separatorB = parseWorldbookImport({ character_book: { entries: [{ id: "c", content: "two" }] } }, { characterId: "a-b" })[0];
assert.notEqual(separatorA.id, separatorB.id, "ID separator cannot collide with a character or source ID");

await upsertWorldbookEntry(entry);
await upsertWorldbookEntry({ id: "unrelated", title: "Unrelated", content: "Must survive", keys: ["keep"] });
await upsertWorldbookEntry({ id: entry.id, title: "Edited title" });
let stored = (await listWorldbookEntries()).find((row) => row.id === entry.id);
assert.equal(stored.content, entry.content, "partial saves merge existing content");
assert.deepEqual(stored.extensions, entry.extensions);
await mergeWorldbookEntries([{ ...roundtrip, content: "Updated content" }, { id: "new-import", title: "New", content: "New content", constant: true }]);
const after = await listWorldbookEntries();
assert.equal(after.length, 3, "merge does not clear unrelated entries");
assert.equal(after.find((row) => row.id === "unrelated").content, "Must survive");
assert.equal(after.find((row) => row.id === entry.id).content, "Updated content");
assert.deepEqual(after.find((row) => row.id === entry.id).extensions, entry.extensions);
assert.deepEqual(after.find((row) => row.id === "new-import").keys, [], "constant entries must not get invented keywords");
const beforeInvalid = exportWorldbookJson(after);
await assert.rejects(() => mergeWorldbookEntries([{ id: "valid", content: "Good" }, { id: "bad", content: "", constant: true }]));
await assert.rejects(() => mergeWorldbookEntries([{ id: "same", content: "first" }, { id: "same", content: "second" }]), (error) => error.code === "duplicate_id");
assert.equal(exportWorldbookJson(await listWorldbookEntries()), beforeInvalid, "all import validation precedes any write");
console.log("PASS worldbook editor persistence, lossless JSON, scope, activation, case, keyword groups, positions and budgets");
