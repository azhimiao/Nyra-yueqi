/** Minimal POSIX path — pure JS, not a Node polyfill of OS APIs. */
function normalizeArray(parts, allowAboveRoot) {
  const res = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") {
      if (res.length && res[res.length - 1] !== "..") res.pop();
      else if (allowAboveRoot) res.push("..");
    } else res.push(p);
  }
  return res;
}

export function normalize(path) {
  const isAbs = path.startsWith("/");
  const trailing = path.endsWith("/") && path.length > 1;
  const parts = normalizeArray(path.split("/"), !isAbs);
  let out = parts.join("/") || (isAbs ? "/" : ".");
  if (trailing && out !== "/") out += "/";
  if (isAbs && !out.startsWith("/")) out = `/${out}`;
  return out;
}

export function join(...args) {
  return normalize(args.filter((a) => a != null && a !== "").join("/"));
}

export function resolve(...args) {
  let resolved = "";
  for (let i = args.length - 1; i >= 0 && !resolved.startsWith("/"); i -= 1) {
    const part = args[i];
    if (!part) continue;
    resolved = resolved ? `${part}/${resolved}` : part;
  }
  return normalize(resolved.startsWith("/") ? resolved : `/${resolved}`);
}

export function dirname(path) {
  const norm = normalize(path);
  if (norm === "/") return "/";
  const idx = norm.lastIndexOf("/");
  if (idx <= 0) return "/";
  return norm.slice(0, idx) || "/";
}

export function basename(path, ext) {
  const norm = normalize(path);
  const base = norm.slice(norm.lastIndexOf("/") + 1);
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length);
  return base;
}

export function extname(path) {
  const base = basename(path);
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx) : "";
}

export function relative(from, to) {
  const fromParts = normalize(from).split("/").filter(Boolean);
  const toParts = normalize(to).split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/") || ".";
}

export function isAbsolute(path) {
  return typeof path === "string" && path.startsWith("/");
}

export const sep = "/";
export const delimiter = ":";
export const posix = { normalize, join, resolve, dirname, basename, extname, relative, isAbsolute, sep, delimiter };
export default { ...posix, posix };
