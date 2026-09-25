import { createHash } from "node:crypto";

function normalizedKey(ip, identifier) {
  const identityHash = createHash("sha256")
    .update(String(identifier || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
  return `${String(ip || "unknown")}:${identityHash}`;
}

export function createLoginRateLimiter(options = {}) {
  const maxFailures = Math.max(1, Number(options.maxFailures) || 10);
  const windowMs = Math.max(1_000, Number(options.windowMs) || 15 * 60_000);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const failures = new Map();

  function active(key) {
    const cutoff = now() - windowMs;
    const recent = (failures.get(key) || []).filter((timestamp) => timestamp > cutoff);
    if (recent.length) failures.set(key, recent);
    else failures.delete(key);
    return recent;
  }

  function isBlocked(ip, identifier) {
    return active(normalizedKey(ip, identifier)).length >= maxFailures;
  }

  function recordFailure(ip, identifier) {
    const key = normalizedKey(ip, identifier);
    const recent = active(key);
    recent.push(now());
    failures.set(key, recent);
    return recent.length;
  }

  function clear(ip, identifier) {
    failures.delete(normalizedKey(ip, identifier));
  }

  return { isBlocked, recordFailure, clear };
}
