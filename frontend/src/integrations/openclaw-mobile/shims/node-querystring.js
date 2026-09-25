export function stringify(obj) {
  return new URLSearchParams(obj).toString();
}
export function parse(str) {
  const out = {};
  for (const [k, v] of new URLSearchParams(str)) out[k] = v;
  return out;
}
export function escape(str) { return encodeURIComponent(str); }
export function unescape(str) { return decodeURIComponent(str); }
export default { stringify, parse, escape, unescape };
