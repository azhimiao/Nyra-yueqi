/**
 * Vite resolve aliases for OpenClaw mobile vendor bundles (Route B shims).
 * Shared by vite.config.js and openclaw-mobile-slice build scripts.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SHIM = join(dirname(fileURLToPath(import.meta.url)), "shims");

/** @returns {{ find: string | RegExp, replacement: string }[]} */
export function openclawNodeShimAliases() {
  const pairs = [
    ["node:child_process", "node-child_process.js"],
    ["child_process", "node-child_process.js"],
    ["node:fs/promises", "node-fs-promises.js"],
    ["fs/promises", "node-fs-promises.js"],
    ["node:fs", "node-fs.js"],
    ["fs", "node-fs.js"],
    ["node:path", "node-path.js"],
    ["path", "node-path.js"],
    ["node:os", "node-os.js"],
    ["os", "node-os.js"],
    ["node:crypto", "node-crypto.js"],
    ["crypto", "node-crypto.js"],
    ["node:readline", "node-readline.js"],
    ["readline", "node-readline.js"],
    ["node:module", "node-module.js"],
    ["module", "node-module.js"],
    ["node:dns/promises", "node-unsupported.js"],
    ["dns/promises", "node-unsupported.js"],
    ["node:dns", "node-unsupported.js"],
    ["dns", "node-unsupported.js"],
    ["node:stream/promises", "node-unsupported.js"],
    ["stream/promises", "node-unsupported.js"],
    ["node:stream", "node-stream.js"],
    ["stream", "node-stream.js"],
    ["node:timers/promises", "node-unsupported.js"],
    ["timers/promises", "node-unsupported.js"],
    ["node:util/types", "node-util.js"],
    ["util/types", "node-util.js"],
    ["node:util", "node-util.js"],
    ["util", "node-util.js"],
    ["node:assert", "node-assert.js"],
    ["assert", "node-assert.js"],
    ["node:events", "node-events.js"],
    ["events", "node-events.js"],
    ["node:buffer", "node-buffer.js"],
    ["buffer", "node-buffer.js"],
    ["node:url", "node-url.js"],
    ["url", "node-url.js"],
    ["node:process", "node-process.js"],
    ["process", "node-process.js"],
    ["node:worker_threads", "node-unsupported.js"],
    ["worker_threads", "node-unsupported.js"],
    ["node:net", "node-unsupported.js"],
    ["net", "node-unsupported.js"],
    ["node:tls", "node-unsupported.js"],
    ["tls", "node-unsupported.js"],
    ["node:http", "node-unsupported.js"],
    ["http", "node-unsupported.js"],
    ["node:https", "node-unsupported.js"],
    ["https", "node-unsupported.js"],
    ["node:tty", "node-unsupported.js"],
    ["node:zlib", "node-unsupported.js"],
    ["zlib", "node-unsupported.js"],
    ["node:http2", "node-unsupported.js"],
    ["node:perf_hooks", "node-unsupported.js"],
    ["node:async_hooks", "node-unsupported.js"],
    ["node:diagnostics_channel", "node-unsupported.js"],
    ["node:sqlite", "node-unsupported.js"],
    ["node:timers", "node-timers.js"],
    ["timers", "node-timers.js"],
    ["node:querystring", "node-querystring.js"],
    ["querystring", "node-querystring.js"],
    ["ws", "node-unsupported.js"],
  ];
  return pairs.map(([find, file]) => ({
    find,
    replacement: join(SHIM, file),
  }));
}
