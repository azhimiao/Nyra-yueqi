/**
 * Resolve OpenClaw from clawtry install (or OPENCLAW_APP_ROOT).
 * Does not copy the package into the Yueqi product tree.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_APP_ROOT = "F:\\clawtry\\app";

export function resolveOpenClawAppRoot() {
  const fromEnv = process.env.OPENCLAW_APP_ROOT?.trim();
  if (fromEnv && existsSync(join(fromEnv, "node_modules", "openclaw", "package.json"))) {
    return fromEnv;
  }
  if (existsSync(join(DEFAULT_APP_ROOT, "node_modules", "openclaw", "package.json"))) {
    return DEFAULT_APP_ROOT;
  }
  throw new Error(
    `OpenClaw not found. Set OPENCLAW_APP_ROOT (tried ${DEFAULT_APP_ROOT}). Node-only adapter.`,
  );
}

export function resolveOpenClawPackageRoot() {
  return join(resolveOpenClawAppRoot(), "node_modules", "openclaw");
}

export function createOpenClawRequire() {
  return createRequire(join(resolveOpenClawAppRoot(), "package.json"));
}

export async function importOpenClaw(specifier) {
  const require = createOpenClawRequire();
  const resolved = require.resolve(specifier);
  return import(pathToFileURL(resolved).href);
}

export function readOpenClawPackageMeta() {
  const require = createOpenClawRequire();
  const packageRoot = resolveOpenClawPackageRoot();
  const pkgPath = join(packageRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  return {
    name: pkg.name,
    version: pkg.version,
    packageJsonPath: pkgPath,
    packageRoot,
    exports: {
      "plugin-sdk/agent-core": pkg.exports?.["./plugin-sdk/agent-core"],
      "plugin-sdk/llm": pkg.exports?.["./plugin-sdk/llm"],
    },
    resolved: {
      "openclaw/plugin-sdk/agent-core": require.resolve("openclaw/plugin-sdk/agent-core"),
      "openclaw/plugin-sdk/llm": require.resolve("openclaw/plugin-sdk/llm"),
    },
  };
}

export async function importTypebox() {
  const require = createOpenClawRequire();
  const typeboxPath = require.resolve("typebox", {
    paths: [resolveOpenClawPackageRoot()],
  });
  return import(pathToFileURL(typeboxPath).href);
}
