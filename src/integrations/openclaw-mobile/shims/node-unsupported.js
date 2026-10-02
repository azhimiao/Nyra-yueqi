import { UnsupportedRuntimeCapabilityError } from "./kill-tree.js";

export default new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === "__esModule") return true;
      if (prop === "default") return this;
      return () => {
        throw new UnsupportedRuntimeCapabilityError(
          `Node builtin capability '${String(prop)}' is unavailable in Nyra mobile runtime.`,
        );
      };
    },
  },
);

export function stub() {
  throw new UnsupportedRuntimeCapabilityError(
    "Node builtin capability is unavailable in Nyra mobile runtime.",
  );
}
