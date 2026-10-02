import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "memory");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

function parseExports(source) {
  const names = new Set();
  let hasDefault = false;
  const stars = [];
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+class\s+([A-Za-z0-9_]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/g)) names.add(match[1]);
  if (/export\s+default\b/.test(source)) hasDefault = true;
  for (const match of source.matchAll(/export\s*\{([^}]+)\}(?:\s*from\s*["']([^"']+)["'])?/g)) {
    const spec = match[1];
    for (const part of spec.split(",")) {
      const piece = part.trim();
      if (!piece || piece.startsWith("type ")) continue;
      const alias = piece.split(/\s+as\s+/i);
      const exported = (alias[1] || alias[0]).trim();
      if (/^[A-Za-z0-9_]+$/.test(exported)) names.add(exported);
    }
  }
  for (const match of source.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) stars.push(match[1]);
  return { names, hasDefault, stars };
}

const files = walk(root);
const parsed = new Map();
for (const file of files) parsed.set(file, parseExports(readFileSync(file, "utf8")));

function resolveStar(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, path.join(base, "index.js")];
  return candidates.find((item) => parsed.has(item)) || null;
}

function collect(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const info = parsed.get(file);
  const names = new Set(info.names);
  for (const spec of info.stars) {
    const target = resolveStar(file, spec);
    if (!target) continue;
    for (const name of collect(target, seen)) names.add(name);
  }
  return names;
}

const helper = `function removedMemory() {
  const bag = [];
  const proxy = new Proxy(bag, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "length") return 0;
      if (typeof prop === "symbol") return undefined;
      const method = Array.prototype[prop];
      if (typeof method === "function") return method.bind(bag);
      return proxy;
    },
  });
  return proxy;
}
`;

for (const file of files) {
  const names = [...collect(file)].sort();
  const hasDefault = parsed.get(file).hasDefault;
  const body = [
    "/* Open-source tree: the memory pipeline implementation has been removed. */",
    helper,
    ...names.map((name) => (
      /^[A-Z0-9_]+$/.test(name)
        ? `export const ${name} = Object.freeze({});`
        : `export function ${name}(..._args) { return removedMemory(); }`
    )),
    hasDefault ? "export default removedMemory;" : "",
    "",
  ].join("\n");
  writeFileSync(file, body);
}

console.log(`stubbed ${files.length} memory modules`);
