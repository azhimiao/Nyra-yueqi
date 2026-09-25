/**
 * SSRF URL validation for web retrieval gateway (plan §11.3).
 * Blocks private IPs, localhost, link-local, metadata, and non-http(s) schemes.
 * Tests may pass allowlistHostnames (e.g. ["127.0.0.1"]) explicitly.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.",
  "metadata.google.internal",
  "metadata",
]);

/**
 * @param {string} hostname
 */
export function isLoopbackHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  if (host === "0.0.0.0" || host === "::") return true;
  return isIpv4Loopback(host) || isIpv6Loopback(host);
}

/**
 * @param {string} host
 */
function isIpv4Loopback(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  return a === 127;
}

/**
 * @param {string} host
 */
function isIpv6Loopback(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "::1" || h === "0:0:0:0:0:0:0:1";
}

/**
 * @param {string} hostname
 */
export function isPrivateOrReservedHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.endsWith(".metadata.google.internal")) return true;
  if (host === "169.254.169.254" || host.startsWith("169.254.")) return true;

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const octets = m.slice(1).map(Number);
    if (octets.some((n) => n > 255)) return true;
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 unique-local / link-local
  const v6 = host.replace(/^\[|\]$/g, "");
  if (v6.includes(":")) {
    const lower = v6.toLowerCase();
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice("::ffff:".length);
      if (isPrivateOrReservedHostname(mapped)) return true;
    }
  }
  return false;
}

/**
 * Validate a URL for outbound fetch.
 *
 * @param {string} raw
 * @param {{ allowlistHostnames?: string[] }} [opts]
 * @returns {{ ok: true, url: URL } | { ok: false, reason: string }}
 */
export function validateFetchUrl(raw, opts = {}) {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, reason: "empty_url" };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol === "file:") {
    return { ok: false, reason: "blocked_scheme_file" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "blocked_scheme" };
  }

  const hostname = url.hostname.toLowerCase();
  const allow = new Set(
    (Array.isArray(opts.allowlistHostnames) ? opts.allowlistHostnames : [])
      .map((h) => String(h || "").toLowerCase().trim())
      .filter(Boolean),
  );

  if (allow.has(hostname) || allow.has(hostname.replace(/^\[|\]$/g, ""))) {
    return { ok: true, url };
  }

  if (isLoopbackHostname(hostname)) {
    return { ok: false, reason: "blocked_localhost" };
  }
  if (isPrivateOrReservedHostname(hostname)) {
    return { ok: false, reason: "blocked_private_or_reserved" };
  }

  return { ok: true, url };
}

/**
 * Resolve allowlist from env (comma-separated) for local tests.
 */
export function allowlistFromEnv(env = process.env) {
  const raw = String(env.YUEQI_RETRIEVAL_SSRF_ALLOWLIST || "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
