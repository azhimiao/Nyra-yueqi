import { UnsupportedRuntimeCapabilityError } from "./kill-tree.js";

export function spawn() {
  throw new UnsupportedRuntimeCapabilityError(
    "child_process.spawn is unavailable in Nyra mobile runtime.",
  );
}
export function spawnSync() {
  throw new UnsupportedRuntimeCapabilityError(
    "child_process.spawnSync is unavailable in Nyra mobile runtime.",
  );
}
export function exec() {
  throw new UnsupportedRuntimeCapabilityError(
    "child_process.exec is unavailable in Nyra mobile runtime.",
  );
}
export function execSync() {
  throw new UnsupportedRuntimeCapabilityError(
    "child_process.execSync is unavailable in Nyra mobile runtime.",
  );
}
export function execFile() {
  throw new UnsupportedRuntimeCapabilityError(
    "child_process.execFile is unavailable in Nyra mobile runtime.",
  );
}
export function fork() {
  throw new UnsupportedRuntimeCapabilityError(
    "child_process.fork is unavailable in Nyra mobile runtime.",
  );
}
export default { spawn, spawnSync, exec, execSync, execFile, fork };
