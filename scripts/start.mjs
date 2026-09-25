import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(name, args) {
  const child = spawn(npmCmd, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      process.exit(code);
    }
  });
  return child;
}

console.log("Starting Yueqi (frontend + local gateway)…");
const server = spawn(process.execPath, ["backend/index.mjs"], {
  cwd: projectRoot,
  stdio: "inherit",
});
const dev = run("dev", ["run", "dev"]);

function shutdown() {
  server.kill();
  dev.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
