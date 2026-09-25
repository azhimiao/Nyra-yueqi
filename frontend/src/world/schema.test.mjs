import assert from "node:assert/strict";
import { formatWorldCount, formatWorldRelativeTime } from "./schema.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("relative time uses weibo-style buckets", () => {
  const now = Date.parse("2026-09-24T18:00:00+08:00");
  assert.equal(formatWorldRelativeTime("2026-09-24T17:59:30+08:00", now), "刚刚");
  assert.equal(formatWorldRelativeTime("2026-09-24T17:12:00+08:00", now), "48分钟");
  assert.equal(formatWorldRelativeTime("2026-09-24T15:00:00+08:00", now), "3小时");
  assert.equal(formatWorldRelativeTime("2026-09-22T18:00:00+08:00", now), "2天");
  assert.equal(formatWorldRelativeTime("2026-07-10T15:42:00+08:00", now), "7月10日");
});

test("counts compact like a public feed", () => {
  assert.equal(formatWorldCount(12), "12");
  assert.equal(formatWorldCount(2841), "2.8k");
  assert.equal(formatWorldCount(12800), "1.3万");
});

console.log(`${passed} passed`);
