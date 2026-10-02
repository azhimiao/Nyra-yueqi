/**
 * Probe whether openclaw/plugin-sdk/agent-core can enter a Vite browser bundle.
 * Uses createRequire to honor package exports; does not polyfill Node APIs.
 *
 * Writes UTF-8 JSON to .tmp/openclaw-web-bundle-probe.json
 */
import { build } from "vite";
import { mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO, ".tmp", "openclaw-web-probe");
const ENTRY = join(OUT, "entry.js");
mkdirSync(OUT, { recursive: true });

const APP_ROOT = process.env.OPENCLAW_APP_ROOT || "F:\\clawtry\\app";
const require = createRequire(join(APP_ROOT, "package.json"));

writeFileSync(
  ENTRY,
  [
    `import { runAgentLoop } from "openclaw/plugin-sdk/agent-core";`,
    `export { runAgentLoop };`,
    "",
  ].join("\n"),
  "utf8",
);

const result = {
  auditedAt: "2026-07-30",
  encoding: "utf-8",
  resolved: null,
  ok: false,
  errors: [],
  failedModules: [],
  bundleBytes: null,
  conclusion: "WEB_BUNDLE_INCOMPATIBLE",
};

try {
  result.resolved = require.resolve("openclaw/plugin-sdk/agent-core");
} catch (err) {
  result.errors.push({ message: String(err) });
  writeFileSync(join(REPO, ".tmp", "openclaw-web-bundle-probe.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

try {
  rmSync(join(OUT, "dist"), { recursive: true, force: true });
  await build({
    configFile: false,
    root: OUT,
    logLevel: "error",
    plugins: [
      {
        name: "openclaw-exports-resolve",
        resolveId(id) {
          if (id === "openclaw" || id.startsWith("openclaw/")) {
            try {
              return require.resolve(id);
            } catch {
              return null;
            }
          }
          // Also resolve bare deps from clawtry openclaw nested node_modules
          if (!id.startsWith(".") && !id.startsWith("\0") && !id.startsWith("node:")) {
            try {
              return require.resolve(id);
            } catch {
              return null;
            }
          }
          return null;
        },
      },
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      write: true,
      target: "esnext",
      lib: {
        entry: ENTRY,
        formats: ["es"],
        fileName: () => "openclaw-probe.js",
      },
      commonjsOptions: { include: [/node_modules/, /openclaw/] },
      rollupOptions: {
        // Force inlining — surface Node/native incompatibilities.
      },
    },
  });
  const bundlePath = join(OUT, "dist", "openclaw-probe.js");
  try {
    result.bundleBytes = statSync(bundlePath).size;
  } catch {
    result.bundleBytes = null;
  }
  result.ok = true;
  result.conclusion = "UNEXPECTED_BUNDLE_SUCCESS_REVIEW_REQUIRED";
} catch (err) {
  const message = String(err?.message || err);
  result.ok = false;
  result.errors.push({
    message,
    stack: String(err?.stack || "")
      .split("\n")
      .slice(0, 40),
  });
  const found = new Set();
  for (const m of message.matchAll(/["'](node:[a-z0-9/_-]+)["']/gi)) found.add(m[1]);
  for (const m of message.matchAll(/["']([a-zA-Z0-9@/_.-]*node-pty[^"']*)["']/g)) found.add(m[1]);
  for (const m of message.matchAll(/\b(fs\/promises|child_process|worker_threads|fs|path|net|tls|crypto|os|module|process|buffer)\b/g)) {
    found.add(m[1]);
  }
  for (const m of message.matchAll(/(?:Could not (?:load|resolve)|Failed to resolve(?: import)?)[^"'\n]*["']([^"']+)["']/g)) {
    found.add(m[1]);
  }
  result.failedModules = [...found];
  result.conclusion = "WEB_BUNDLE_INCOMPATIBLE";
}

writeFileSync(
  join(REPO, ".tmp", "openclaw-web-bundle-probe.json"),
  JSON.stringify(result, null, 2),
  "utf8",
);
console.log(
  JSON.stringify(
    {
      ok: result.ok,
      conclusion: result.conclusion,
      bundleBytes: result.bundleBytes,
      failedModules: result.failedModules.slice(0, 30),
      errorHead: (result.errors[0]?.message || "").slice(0, 500),
    },
    null,
    2,
  ),
);
process.exit(0);
