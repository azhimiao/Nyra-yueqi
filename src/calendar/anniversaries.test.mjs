import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { togetherDaysFromAnniversary, togetherDaysFromMemoryEvidence } from "./anniversaries.js";

if (!process.env.NYRA_DATE_TEST_CHILD) {
  for (const timezone of ["Asia/Shanghai", "America/New_York"]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, TZ: timezone, NYRA_DATE_TEST_CHILD: "1" }, encoding: "utf8",
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    assert.equal(result.status, 0, `${timezone} date regression failed`);
  }
} else {
  let passed = 0;
  const test = (name, run) => { run(); passed += 1; console.log(`PASS ${process.env.TZ}: ${name}`); };
  const current = new Date(2026, 8, 27, 15, 30).getTime();
  const row = (patch = {}) => ({ characterId: "A", source: "chat.memory", createdAt: new Date(2026, 8, 27, 15, 29).toISOString(), ...patch });
  const count = (rows) => togetherDaysFromMemoryEvidence(rows, "A", current);

  test("the first message remains day 1 throughout the same local day", () => assert.equal(count([row()]), 1));
  test("crossing local midnight counts a new day without waiting 24 hours", () => {
    const now = new Date(2026, 8, 28, 0, 1).getTime();
    assert.equal(togetherDaysFromMemoryEvidence([row({ createdAt: new Date(2026, 8, 27, 23, 59).toISOString() })], "A", now), 2);
  });
  test("DST spring and autumn changes each advance one calendar day", () => {
    for (const [month, firstDay, hours] of [[2, 7, 23], [9, 31, 25]]) {
      const start = new Date(2026, month, firstDay, 12);
      const now = new Date(2026, month, firstDay + 1, 12);
      if (process.env.TZ === "America/New_York") assert.equal((now - start) / 3600000, hours);
      assert.equal(togetherDaysFromMemoryEvidence([row({ createdAt: start.toISOString() })], "A", now), 2);
    }
  });
  test("date-only anniversaries are interpreted as local dates", () => {
    assert.equal(togetherDaysFromAnniversary("2026-09-27", current), 1);
    assert.equal(togetherDaysFromAnniversary("2026-09-26", new Date(2026, 8, 27, 0, 1)), 2);
  });
  test("missing, malformed and future anniversaries give no badge", () => {
    for (const date of [null, "", "invalid", "2026-02-30", "2026-09-28"]) assert.equal(togetherDaysFromAnniversary(date, current), null);
  });
  test("another character, unscoped and conflicting ownership are excluded", () => {
    const cases = [row({ characterId: "B" }), row({ characterId: "" }), row({ companionId: "A", characterId: "B" }), row({ companionId: "B" }), row({ sourceRef: { characterId: "B" } })];
    for (const item of cases) assert.equal(count([item]), null);
    assert.equal(count([row({ companionId: "A", sourceRef: { companionId: "A", characterId: "A" } })]), 1);
  });
  test("origin markers cannot be masked by top-level lived provenance", () => {
    for (const patch of [{ source: "character.history" }, { sourceType: "authored_origin_memory" }, { authoredBy: "character_author" }, { truthDomain: "character_canon" }, { authority: "character_author" }]) {
      assert.equal(count([row(patch)]), null);
      assert.equal(count([row({ sourceType: "chat", authoredBy: "user", truthDomain: "reality", sourceRef: patch })]), null);
    }
    assert.equal(count([row({ tags: ["authored-origin"] })]), null);
  });
  test("undated and future memory rows do not create a relationship date", () => {
    for (const patch of [{ createdAt: null }, { createdAt: "" }, { createdAt: "broken" }, { createdAt: "", updatedAt: new Date(current).toISOString() }, { createdAt: new Date(current + 1).toISOString() }]) assert.equal(count([row(patch)]), null);
  });
  test("fiction, deleted records and library resources are not lived evidence", () => {
    for (const patch of [{ realityNamespace: "fiction" }, { sourceRef: { realityNamespace: "fiction" } }, { tombstone: { at: current } }, { invalidatedAt: "2026-09-27" }, { source: "reading.chunk" }]) assert.equal(count([row(patch)]), null);
  });
  test("the earliest eligible current-character record wins", () => {
    assert.equal(count([row({ characterId: "B", createdAt: "2020-01-01" }), row({ source: "character.history", createdAt: "2010-01-01" }), row({ source: "diary.memory", createdAt: "2026-09-25" }), row()]), 3);
    assert.equal(count([]), null);
  });
  console.log(`${passed}/${passed} date tests passed in ${process.env.TZ}`);
}
