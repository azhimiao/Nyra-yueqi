import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const androidDir = join(root, "android");
const isWindows = process.platform === "win32";
const gradlew = join(androidDir, isWindows ? "gradlew.bat" : "gradlew");

if (!existsSync(androidDir)) {
  console.error("Android project not found. Run `npx cap add android` first.");
  process.exit(1);
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: isWindows });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("npm", ["run", "build"]);
run("npx", ["cap", "sync", "android"]);
run(gradlew, ["assembleDebug"], androidDir);

console.log("Android debug APK ready under android/app/build/outputs/apk/debug/");
