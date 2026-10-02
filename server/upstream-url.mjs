/**
 * Safe upstream Base URL for BYOK / managed model proxy.
 * Blocks SSRF into private networks and cloud metadata.
 * Loopback allowed only in local-dev (!publicServer) or YUEQI_UPSTREAM_ALLOWLIST.
 */

import { validateFetchUrl, isPrivateOrReservedHostname } from "./retrieval/ssrf.js";

/**
 * @param {string} raw
 * @param {{ publicServer?: boolean, allowlistHostnames?: string[] }} [opts]
 * @returns {string} normalized base URL without trailing slash
 */
export function assertSafeUpstreamUrl(raw, opts = {}) {
  const publicServer = opts.publicServer === true;
  const envAllow = String(process.env.YUEQI_UPSTREAM_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowlist = [
    ...(Array.isArray(opts.allowlistHostnames) ? opts.allowlistHostnames : []),
    ...envAllow,
  ];

  if (!publicServer) {
    allowlist.push("127.0.0.1", "localhost", "::1");
  }

  const result = validateFetchUrl(String(raw || "").trim(), {
    allowlistHostnames: allowlist,
  });
  if (!result.ok) {
    throw new Error(`拒绝不安全的上游 Base URL（${result.reason}）`);
  }

  const host = result.url.hostname.toLowerCase();
  // Defense in depth: never allow metadata even if mis-allowlisted.
  if (
    host === "169.254.169.254"
    || host === "metadata.google.internal"
    || host.endsWith(".metadata.google.internal")
  ) {
    throw new Error("拒绝访问云元数据地址。");
  }

  if (publicServer && isPrivateOrReservedHostname(host) && !allowlist.includes(host)) {
    throw new Error("公网网关拒绝私网上游地址。");
  }

  return result.url.toString().replace(/\/+$/, "");
}
