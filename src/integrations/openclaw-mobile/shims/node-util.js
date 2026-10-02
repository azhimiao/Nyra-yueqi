export function inherits(ctor, superCtor) {
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}
export function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      fn(...args, (err, ...rest) => (err ? reject(err) : resolve(rest.length <= 1 ? rest[0] : rest)));
    });
}
export function deprecate(fn) { return fn; }
export function inspect(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}
export const types = {
  isUint8Array: (v) => v instanceof Uint8Array,
  isArrayBuffer: (v) => v instanceof ArrayBuffer,
  isDate: (v) => v instanceof Date,
};
export default { inherits, promisify, deprecate, inspect, types };
