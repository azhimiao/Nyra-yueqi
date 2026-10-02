export function ok(v, msg) {
  if (!v) throw new Error(msg || "assert failed");
}
export function equal(a, b, msg) {
  if (a !== b) throw new Error(msg || `assert.equal failed: ${a} !== ${b}`);
}
export function strictEqual(a, b, msg) {
  equal(a, b, msg);
}
export function deepEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg || "assert.deepEqual failed");
}
export default Object.assign(
  function assert(v, msg) { ok(v, msg); },
  { ok, equal, strictEqual, deepEqual },
);
