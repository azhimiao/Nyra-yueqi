import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(name, script) {
  const child = spawn(npmCmd, ["run", script], {
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

console.log("Starting 月栖 Companion (frontend + local service)…");
const server = run("server", "server");
const dev = run("dev", "dev");

function shutdown() {
  server.kill();
  dev.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
