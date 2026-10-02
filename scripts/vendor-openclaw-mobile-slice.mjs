/**
 * Vendor minimal OpenClaw dist chunks for mobile slice (Route B+D hybrid).
 * Copies hashed dist files into vendor/openclaw-agent-mobile and patches kill-tree import.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(REPO, "vendor", "openclaw-agent-mobile");
const APP_ROOT = process.env.OPENCLAW_APP_ROOT || "F:\\clawtry\\app";
const require = createRequire(join(APP_ROOT, "package.json"));
const ocRequire = createRequire(join(APP_ROOT, "node_modules/openclaw/package.json"));

rmSync(VENDOR, { recursive: true, force: true });
mkdirSync(VENDOR, { recursive: true });
mkdirSync(join(VENDOR, "dist"), { recursive: true });

const agentCorePath = require.resolve("openclaw/plugin-sdk/agent-core");
const llmPath = require.resolve("openclaw/plugin-sdk/llm");
const agentCoreSrc = readFileSync(agentCorePath, "utf8");
const llmSrc = readFileSync(llmPath, "utf8");
const proxyRel = agentCoreSrc.match(/from\s+[\"'](\.\.\/proxy-[^\"']+)[\"']/)?.[1];
const validationRel = llmSrc.match(
  /createAssistantMessageEventStream[\s\S]*?from\s+[\"'](\.\.\/validation-[^\"']+)[\"']/,
)?.[1];
const distDir = dirname(join(dirname(agentCorePath), proxyRel));
const proxyName = basename(join(dirname(agentCorePath), proxyRel));
const validationName = basename(join(dirname(llmPath), validationRel));

const runAlias = agentCoreSrc.match(/(\w+)\s+as\s+runAgentLoop/)?.[1] || "at";
const convertAlias = agentCoreSrc.match(/(\w+)\s+as\s+convertToLlm/)?.[1] || "H";
const streamAlias = llmSrc.match(/(\w+)\s+as\s+createAssistantMessageEventStream/)?.[1] || "i";

/** BFS copy relative ./ imports from seed files; rewrite kill-tree to local stub. */
const queue = [proxyName, validationName];
const seen = new Set();
const copied = [];
const externalSpecs = new Set();

while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  const srcPath = join(distDir, name);
  if (!existsSync(srcPath)) {
    externalSpecs.add(name);
    continue;
  }
  let code = readFileSync(srcPath, "utf8");
  // Rewrite kill-tree imports to mobile stub
  code = code.replace(
    /from\s+[\"'](\.\/kill-tree-[^\"']+)[\"']/g,
    'from "./kill-tree-mobile-stub.js"',
  );
  writeFileSync(join(VENDOR, "dist", name), code, "utf8");
  copied.push(name);

  const relImports = [...code.matchAll(/[\"'](\.\/[^\"']+\.js)[\"']/g)].map((m) => m[1]);
  for (const rel of [...new Set(relImports)]) {
    const base = basename(rel);
    if (base.startsWith("kill-tree")) continue;
    if (!seen.has(base)) queue.push(base);
  }

  // Track package imports
  for (const m of code.matchAll(/from\s+[\"'](@openclaw\/[^\"']+|typebox[^\"']*)[\"']/g)) {
    externalSpecs.add(m[1]);
  }
}

// Write kill-tree stub into vendor dist (same API as upstream re-exports)
copyFileSync(
  join(REPO, "src/integrations/openclaw-mobile/shims/kill-tree.js"),
  join(VENDOR, "dist", "kill-tree-mobile-stub.js"),
);

// Copy LICENSE from openclaw
const licenseSrc = join(APP_ROOT, "node_modules/openclaw/LICENSE");
if (existsSync(licenseSrc)) copyFileSync(licenseSrc, join(VENDOR, "LICENSE"));

writeFileSync(
  join(VENDOR, "UPSTREAM_VERSION"),
  "openclaw@2026.7.1-2\n",
  "utf8",
);

writeFileSync(
  join(VENDOR, "PATCHES.md"),
  `# Patches against openclaw@2026.7.1-2

## Summary

- Copied dist chunks reachable from public \`plugin-sdk/agent-core\` proxy export and \`plugin-sdk/llm\` validation export.
- Rewrote \`./kill-tree-*.js\` imports to \`./kill-tree-mobile-stub.js\`.
- Stub throws \`UNSUPPORTED_RUNTIME_CAPABILITY\` (does not silently succeed).
- No Agent Loop control-flow changes.

## Files

| Vendored | Upstream origin |
|----------|-----------------|
| dist/${proxyName} | dist/${proxyName} (from openclaw/plugin-sdk/agent-core) |
| dist/${validationName} | dist/${validationName} (from openclaw/plugin-sdk/llm) |
| dist/* (BFS) | corresponding openclaw/dist/* |
| dist/kill-tree-mobile-stub.js | NEW shim (replaces kill-tree-*.js) |

## Diff policy

Only environment dependency edges changed (kill-tree → mobile stub). Algorithms in copied chunks are byte-identical except import path rewrite for kill-tree.
`,
  "utf8",
);

writeFileSync(
  join(VENDOR, "index.js"),
  `/**
 * Vendored mobile entry — upstream OpenClaw agent loop symbols.
 * Upstream: openclaw@2026.7.1-2
 */
export { ${runAlias} as runAgentLoop, ${convertAlias} as convertToLlm } from "./dist/${proxyName}";
export { ${streamAlias} as createAssistantMessageEventStream } from "./dist/${validationName}";
`,
  "utf8",
);

const manifest = {
  auditedAt: "2026-07-30",
  upstream: "openclaw@2026.7.1-2",
  route: "B_ALIAS_PLUS_D_VENDOR_NARROW",
  copiedCount: copied.length,
  copied,
  externalSpecs: [...externalSpecs],
  mangled: { runAlias, convertAlias, streamAlias },
  proxyName,
  validationName,
};
writeFileSync(join(VENDOR, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf8");

// Update generated bindings to use vendor
writeFileSync(
  join(REPO, "src/integrations/openclaw-mobile/generated-chunk-bindings.js"),
  `/**
 * AUTO-GENERATED — points at vendor/openclaw-agent-mobile
 * Upstream: openclaw@2026.7.1-2
 */
export {
  runAgentLoop,
  convertToLlm,
  createAssistantMessageEventStream,
} from "../../../vendor/openclaw-agent-mobile/index.js";
export const OPENCLAW_MOBILE_CHUNK_META = ${JSON.stringify(
    {
      ...manifest,
      vendorRoot: "vendor/openclaw-agent-mobile",
    },
    null,
    2,
  )};
`,
  "utf8",
);

console.log(JSON.stringify({ copied: copied.length, proxyName, validationName, externalSpecs: [...externalSpecs] }, null, 2));
