/** Mobile ProcessController — never terminates OS processes. */
export class UnsupportedRuntimeCapabilityError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedRuntimeCapabilityError";
    this.code = "UNSUPPORTED_RUNTIME_CAPABILITY";
  }
}

/**
 * @param {number} _pid
 * @param {object} [_opts]
 */
export async function killTree(_pid, _opts) {
  throw new UnsupportedRuntimeCapabilityError(
    "Process-tree termination is unavailable in Nyra mobile runtime.",
  );
}

export function killProcessTree(pid, opts) {
  // Sync shape matching upstream; must not silently succeed.
  void pid;
  void opts;
  throw new UnsupportedRuntimeCapabilityError(
    "Process-tree termination is unavailable in Nyra mobile runtime.",
  );
}

export function signalProcessTree(pid, signal, opts) {
  void pid;
  void signal;
  void opts;
  throw new UnsupportedRuntimeCapabilityError(
    "Process-tree signaling is unavailable in Nyra mobile runtime.",
  );
}

// Match upstream export shape used by agent-core re-exports
export { signalProcessTree as n, killProcessTree as t };
