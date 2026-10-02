import { UnsupportedRuntimeCapabilityError } from "./kill-tree.js";

export function platform() { return "browser"; }
export function homedir() {
  throw new UnsupportedRuntimeCapabilityError("os.homedir unavailable in Nyra mobile runtime");
}
export function tmpdir() { return "/tmp"; }
export function hostname() { return "nyra-mobile"; }
export function arch() { return "wasm32"; }
export function cpus() { return []; }
export function networkInterfaces() {
  throw new UnsupportedRuntimeCapabilityError("os.networkInterfaces unavailable");
}
export function EOL() { return "\n"; }
export const EOL_STR = "\n";
export default { platform, homedir, tmpdir, hostname, arch, cpus, networkInterfaces, EOL: EOL_STR };
