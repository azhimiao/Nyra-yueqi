/**
 * Vite production build of vendored OpenClaw mobile slice + Node shims (Route B+D).
 */
import { build } from "vite";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO, ".tmp", "openclaw-mobile-build");
const SHIM = join(REPO, "src/integrations/openclaw-mobile/shims");
const ENTRY = join(REPO, "src/integrations/openclaw-mobile/openclaw-mobile-entry-bundle.js");
const APP_ROOT = process.env.OPENCLAW_APP_ROOT || "F:\\clawtry\\app";
const ocRequire = createRequire(join(APP_ROOT, "node_modules/openclaw/package.json"));
const appRequire = createRequire(join(APP_ROOT, "package.json"));


mkdirSync(OUT, { recursive: true });

const alias = [
  { find: "node:child_process", replacement: join(SHIM, "node-child_process.js") },
  { find: "child_process", replacement: join(SHIM, "node-child_process.js") },
  { find: "node:fs/promises", replacement: join(SHIM, "node-fs-promises.js") },
  { find: "fs/promises", replacement: join(SHIM, "node-fs-promises.js") },
  { find: "node:fs", replacement: join(SHIM, "node-fs.js") },
  { find: "fs", replacement: join(SHIM, "node-fs.js") },
  { find: "node:path", replacement: join(SHIM, "node-path.js") },
  { find: "path", replacement: join(SHIM, "node-path.js") },
  { find: "node:os", replacement: join(SHIM, "node-os.js") },
  { find: "os", replacement: join(SHIM, "node-os.js") },
  { find: "node:crypto", replacement: join(SHIM, "node-crypto.js") },
  { find: "crypto", replacement: join(SHIM, "node-crypto.js") },
  { find: "node:readline", replacement: join(SHIM, "node-readline.js") },
  { find: "readline", replacement: join(SHIM, "node-readline.js") },
  { find: "node:module", replacement: join(SHIM, "node-module.js") },
  { find: "module", replacement: join(SHIM, "node-module.js") },
  { find: "node:dns/promises", replacement: join(SHIM, "node-unsupported.js") },
  { find: "dns/promises", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:dns", replacement: join(SHIM, "node-unsupported.js") },
  { find: "dns", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:stream/promises", replacement: join(SHIM, "node-unsupported.js") },
  { find: "stream/promises", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:stream", replacement: join(SHIM, "node-stream.js") },
  { find: "stream", replacement: join(SHIM, "node-stream.js") },
  { find: "node:timers/promises", replacement: join(SHIM, "node-unsupported.js") },
  { find: "timers/promises", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:util/types", replacement: join(SHIM, "node-util.js") },
  { find: "util/types", replacement: join(SHIM, "node-util.js") },
  { find: "node:util", replacement: join(SHIM, "node-util.js") },
  { find: "util", replacement: join(SHIM, "node-util.js") },
  { find: "node:assert", replacement: join(SHIM, "node-assert.js") },
  { find: "assert", replacement: join(SHIM, "node-assert.js") },
  { find: "node:events", replacement: join(SHIM, "node-events.js") },
  { find: "events", replacement: join(SHIM, "node-events.js") },
  { find: "node:buffer", replacement: join(SHIM, "node-buffer.js") },
  { find: "buffer", replacement: join(SHIM, "node-buffer.js") },
  { find: "node:url", replacement: join(SHIM, "node-url.js") },
  { find: "url", replacement: join(SHIM, "node-url.js") },
  { find: "node:process", replacement: join(SHIM, "node-process.js") },
  { find: "process", replacement: join(SHIM, "node-process.js") },
  { find: "node:worker_threads", replacement: join(SHIM, "node-unsupported.js") },
  { find: "worker_threads", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:net", replacement: join(SHIM, "node-unsupported.js") },
  { find: "net", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:tls", replacement: join(SHIM, "node-unsupported.js") },
  { find: "tls", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:http", replacement: join(SHIM, "node-unsupported.js") },
  { find: "http", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:https", replacement: join(SHIM, "node-unsupported.js") },
  { find: "https", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:tty", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:zlib", replacement: join(SHIM, "node-unsupported.js") },
  { find: "zlib", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:http2", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:perf_hooks", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:async_hooks", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:diagnostics_channel", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:sqlite", replacement: join(SHIM, "node-unsupported.js") },
  { find: "node:timers", replacement: join(SHIM, "node-timers.js") },
  { find: "timers", replacement: join(SHIM, "node-timers.js") },
  { find: "node:querystring", replacement: join(SHIM, "node-querystring.js") },
  { find: "querystring", replacement: join(SHIM, "node-querystring.js") },
  { find: "ws", replacement: join(SHIM, "node-unsupported.js") },
];

const result = {
  auditedAt: "2026-07-30",
  encoding: "utf-8",
  route: "B_ALIAS_PLUS_D_VENDOR_NARROW",
  ok: false,
  errors: [],
  bundleBytes: null,
  gzipBytes: null,
  forbiddenHits: [],
};

try {
  rmSync(join(OUT, "dist"), { recursive: true, force: true });
  await build({
    configFile: false,
    root: REPO,
    logLevel: "error",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      global: "globalThis",
    },
    plugins: [
      {
        name: "inject-mobile-globals",
        transform(code, id) {
          if (id.includes("openclaw-mobile-entry-bundle")) {
            return {
              code:
                `if (typeof globalThis.process === "undefined") {` +
                `globalThis.process = { env: {}, browser: true, platform: "browser", arch: "wasm32",` +
                `versions: { node: "0.0.0-nyra-mobile" }, cwd: () => "/",` +
                `nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)), pid: 1 };}` +
                `if (typeof globalThis.global === "undefined") globalThis.global = globalThis;\n` +
                code,
              map: null,
            };
          }
        },
      },
      {
        name: "resolve-openclaw-nested",
        enforce: "pre",
        resolveId(id) {
          if (/kill-tree/i.test(id)) return join(SHIM, "kill-tree.js");
          if (id.startsWith("\0") || id.startsWith(".") || id.startsWith("/") || /^[A-Za-z]:/.test(id)) {
            return null;
          }
          if (id.startsWith("node:")) return null;
          try {
            return ocRequire.resolve(id);
          } catch {
            try {
              return appRequire.resolve(id);
            } catch {
              return null;
            }
          }
        },
      },
    ],
    resolve: {
      alias,
      conditions: ["browser", "import", "module", "default"],
    },
    build: {
      outDir: join(OUT, "dist"),
      emptyOutDir: true,
      target: "es2022",
      minify: true,
      lib: {
        entry: ENTRY,
        formats: ["es"],
        fileName: () => "openclaw-mobile-slice.js",
      },
      commonjsOptions: { include: [/node_modules/, /openclaw/, /typebox/] },
      rollupOptions: { external: [] },
    },
  });

  const bundlePath = join(OUT, "dist", "openclaw-mobile-slice.js");
  const code = readFileSync(bundlePath, "utf8");
  result.bundleBytes = statSync(bundlePath).size;
  result.gzipBytes = gzipSync(Buffer.from(code)).length;
  const forbidden = ["node:child_process", "taskkill", "node-pty"];
  result.forbiddenHits = forbidden.filter((f) => code.includes(f));
  result.containsUnsupportedMarker = code.includes("UNSUPPORTED_RUNTIME_CAPABILITY");
  result.ok =
    !code.includes("node:child_process") &&
    !code.includes("taskkill") &&
    result.containsUnsupportedMarker;
  result.conclusion = result.ok ? "BUILD_OK" : "BUILD_HAS_FORBIDDEN";
  result.maxChunkBytes = result.bundleBytes;
} catch (err) {
  result.ok = false;
  result.errors.push(String(err?.message || err));
  result.conclusion = "BUILD_FAILED";
  result.failedHint = String(err?.message || err).slice(0, 1200);
}

writeFileSync(join(REPO, ".tmp", "openclaw-mobile-build-probe.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
process.exit(result.conclusion === "BUILD_FAILED" ? 1 : 0);
