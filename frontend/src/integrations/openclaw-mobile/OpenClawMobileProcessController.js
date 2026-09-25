/**
 * Noop / fail-closed process controller for mobile.
 */
import { UnsupportedRuntimeCapabilityError, killProcessTree, signalProcessTree, killTree } from "./shims/kill-tree.js";

export class OpenClawMobileProcessController {
  async killTree(pid, opts) {
    return killTree(pid, opts);
  }
  killProcessTree(pid, opts) {
    return killProcessTree(pid, opts);
  }
  signalProcessTree(pid, signal, opts) {
    return signalProcessTree(pid, signal, opts);
  }
}

export { UnsupportedRuntimeCapabilityError };
