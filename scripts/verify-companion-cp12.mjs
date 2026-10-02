#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node =
  process.env.OPENCLAW_NODE ||
  (existsSync("F:\\clawtry\\node-v22.22.3-win-x64\\node.exe")
    ? "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe"
    : process.execPath);

if (process.platform === "win32") {
  spawnSync("chcp", ["65001"], { stdio: "ignore", shell: true });
}

const APP = process.env.OPENCLAW_APP_ROOT || "F:\\clawtry\\app";
const ocNm = join(APP, "node_modules", "openclaw", "node_modules");

function ensureJunction(link, target) {
  if (existsSync(link)) return;
  mkdirSync(dirname(link), { recursive: true });
  if (process.platform === "win32") {
    spawnSync("cmd", ["/c", "mklink", "/J", link, target], { stdio: "ignore" });
  } else {
    spawnSync("ln", ["-s", target, link], { stdio: "ignore" });
  }
}

ensureJunction(join(root, "node_modules/@openclaw/ai"), join(ocNm, "@openclaw/ai"));
ensureJunction(join(root, "node_modules/typebox"), join(ocNm, "typebox"));
ensureJunction(join(root, "node_modules/json5"), join(ocNm, "json5"));

const r = spawnSync(node, ["./tests/integration/companion-cp12.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" "),
  },
});
process.exit(r.status ?? 1);
