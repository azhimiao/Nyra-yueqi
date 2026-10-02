import { UnsupportedRuntimeCapabilityError } from "./kill-tree.js";

export function createInterface() {
  throw new UnsupportedRuntimeCapabilityError("readline unavailable in Nyra mobile runtime");
}
export default { createInterface };
