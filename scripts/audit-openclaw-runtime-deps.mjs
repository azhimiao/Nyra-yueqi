/**
 * Audit OpenClaw install tree vs agent-core static closure.
 * Run with Node >= 22: node scripts/audit-openclaw-runtime-deps.mjs
 * Writes UTF-8 JSON to .tmp/openclaw-dep-audit.json
 */
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ROOT = process.env.OPENCLAW_APP_ROOT || "F:\\clawtry\\app";
const require = createRequire(join(APP_ROOT, "package.json"));
const ocRoot = join(APP_ROOT, "node_modules", "openclaw");
const pkg = JSON.parse(readFileSync(join(ocRoot, "package.json"), "utf8"));

function dirSize(p) {
  let total = 0;
  let files = 0;
  const walk = (d) => {
    let ents;
    try {
      ents = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const fp = join(d, e.name);
      try {
        if (e.isDirectory()) walk(fp);
        else {
          total += statSync(fp).size;
          files += 1;
        }
      } catch {
        /* skip */
      }
    }
  };
  walk(p);
  return { total, files };
}

const top = {};
for (const name of readdirSync(ocRoot)) {
  const p = join(ocRoot, name);
  try {
    const st = statSync(p);
    top[name] = st.isDirectory() ? dirSize(p) : { total: st.size, files: 1 };
  } catch {
    /* skip */
  }
}
const topLevelDirs = Object.entries(top)
  .sort((a, b) => b[1].total - a[1].total)
  .map(([k, v]) => ({ name: k, mb: +(v.total / 1e6).toFixed(2), files: v.files }));

const nm = join(ocRoot, "node_modules");
const depTop = [];
if (existsSync(nm)) {
  for (const name of readdirSync(nm)) {
    if (name.startsWith(".")) continue;
    if (name.startsWith("@")) {
      for (const sub of readdirSync(join(nm, name))) {
        const s = dirSize(join(nm, name, sub));
        depTop.push({ name: `${name}/${sub}`, mb: +(s.total / 1e6).toFixed(2) });
      }
    } else {
      const s = dirSize(join(nm, name));
      depTop.push({ name, mb: +(s.total / 1e6).toFixed(2) });
    }
  }
}
depTop.sort((a, b) => b.mb - a.mb);

const NODE_BUILTINS = new Set([
  "fs",
  "path",
  "url",
  "crypto",
  "os",
  "http",
  "https",
  "stream",
  "util",
  "events",
  "child_process",
  "buffer",
  "process",
  "module",
  "assert",
  "net",
  "tls",
  "zlib",
  "worker_threads",
  "readline",
  "tty",
  "dns",
  "perf_hooks",
  "async_hooks",
  "timers",
  "string_decoder",
  "querystring",
  "vm",
  "cluster",
  "dgram",
  "fs/promises",
  "http2",
  "inspector",
  "diagnostics_channel",
]);

const entry = require.resolve("openclaw/plugin-sdk/agent-core");
const visited = new Set();
const queue = [entry];
const staticImports = [];
const nodeBuiltins = new Set();
const dynamicHints = [];
const importRe =
  /(?:import|export)\s+(?:[^'"`]*from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveFrom(fromFile, spec) {
  const base = spec.startsWith("node:") ? spec.slice(5) : spec;
  const root = base.split("/")[0];
  if (spec.startsWith("node:") || NODE_BUILTINS.has(root)) {
    nodeBuiltins.add(spec.startsWith("node:") ? spec : `node:${root}`);
    return null;
  }
  try {
    return createRequire(fromFile).resolve(spec);
  } catch {
    return null;
  }
}

while (queue.length) {
  const file = queue.shift();
  if (visited.has(file) || !file.endsWith(".js")) continue;
  visited.add(file);
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  let m;
  const re = new RegExp(importRe.source, "g");
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    if (m[2]) dynamicHints.push({ from: relative(ocRoot, file), spec });
    const resolved = resolveFrom(file, spec);
    if (resolved && resolved.includes(`${join("openclaw", "")}`) && resolved.includes("openclaw")) {
      if (!visited.has(resolved)) {
        queue.push(resolved);
      }
      staticImports.push({
        from: relative(ocRoot, file),
        spec,
        to: relative(ocRoot, resolved),
      });
    } else if (resolved) {
      staticImports.push({ from: relative(ocRoot, file), spec, to: `EXTERNAL:${spec}`, external: true });
    } else if (!spec.startsWith(".") && !spec.startsWith("node:")) {
      staticImports.push({ from: relative(ocRoot, file), spec, unresolved: true });
    }
  }
}

const visitedSizes = [...visited]
  .map((f) => {
    try {
      return { f: relative(ocRoot, f), kb: +(statSync(f).size / 1024).toFixed(1) };
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const visitedTotal = visitedSizes.reduce((a, b) => a + b.kb, 0);

const irrelevantExportHints = Object.keys(pkg.exports || {})
  .filter((k) =>
    /cli|gateway|channel|browser|docker|voice|media|dashboard|telegram|discord|slack|whatsapp|pty|canvas|memory/i.test(
      k,
    ),
  )
  .slice(0, 80);

const out = {
  auditedAt: "2026-07-30",
  version: pkg.version,
  installTreeMb: +(dirSize(ocRoot).total / 1e6).toFixed(2),
  topLevelDirs,
  nestedDepsTop25: depTop.slice(0, 25),
  agentCoreStaticClosure: {
    entry: relative(ocRoot, entry),
    files: visited.size,
    totalKb: +visitedTotal.toFixed(1),
    filesList: visitedSizes.sort((a, b) => b.kb - a.kb).slice(0, 40),
    nodeBuiltins: [...nodeBuiltins].sort(),
    dynamicImportHints: dynamicHints.slice(0, 40),
    externalSpecs: [...new Set(staticImports.filter((i) => i.external).map((i) => i.spec))].sort(),
  },
  irrelevantExportHintsSample: irrelevantExportHints,
};

const outDir = join(REPO, ".tmp");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "openclaw-dep-audit.json");
writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(`Wrote UTF-8 audit: ${outPath}`);
console.log(
  JSON.stringify(
    {
      installTreeMb: out.installTreeMb,
      closureFiles: out.agentCoreStaticClosure.files,
      closureKb: out.agentCoreStaticClosure.totalKb,
      topDirs: out.topLevelDirs.slice(0, 8),
    },
    null,
    2,
  ),
);
