/**
 * Extract top-level imports and node: refs from openclaw proxy chunk.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire("F:/clawtry/app/package.json");
const proxy = require.resolve("openclaw/plugin-sdk/agent-core");
// read agent-core then follow to proxy
const ac = readFileSync(proxy, "utf8");
const proxyMatch = ac.match(/from \"(\.\.\/proxy-[^\"]+)\"/);
const proxyPath = join(dirname(proxy), proxyMatch[1]);
const p = readFileSync(proxyPath, "utf8");
const imports = [...p.matchAll(/from\s+[\"']([^\"']+)[\"']/g)].map((m) => m[1]);
const nodeRefs = [...new Set([...p.matchAll(/node:[a-z0-9/_-]+/g)].map((m) => m[0]))];
const killImports = imports.filter((i) => /kill-tree|child_process|node:/.test(i));

mkdirSync(join(REPO, ".tmp"), { recursive: true });
const out = {
  agentCore: proxy,
  proxyPath,
  proxyImportCount: imports.length,
  uniqueImports: [...new Set(imports)].sort(),
  nodeRefsInProxySource: nodeRefs,
  killRelatedImports: killImports,
};
writeFileSync(join(REPO, ".tmp", "openclaw-proxy-imports.json"), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify({ proxyImportCount: imports.length, nodeRefs, killRelatedImports: killImports }, null, 2));
