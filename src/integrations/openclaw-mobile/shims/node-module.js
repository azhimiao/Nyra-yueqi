/** Mobile module shim — createRequire returns a fail-closed resolver used only for package metadata reads. */
import { UnsupportedRuntimeCapabilityError } from "./kill-tree.js";

export function createRequire(_url) {
  const req = (id) => {
    if (id.endsWith("package.json") || id === "openclaw/package.json") {
      return {
        name: "openclaw",
        version: "2026.7.1-2",
        description: "nyra-mobile-stub-package-json",
      };
    }
    throw new UnsupportedRuntimeCapabilityError(
      `module.createRequire.resolve('${id}') is unavailable in Nyra mobile runtime.`,
    );
  };
  req.resolve = (id) => {
    throw new UnsupportedRuntimeCapabilityError(
      `module.createRequire.resolve('${id}') is unavailable in Nyra mobile runtime.`,
    );
  };
  return req;
}

export function register() {
  throw new UnsupportedRuntimeCapabilityError("module.register unavailable in Nyra mobile runtime");
}

export default { createRequire, register };
