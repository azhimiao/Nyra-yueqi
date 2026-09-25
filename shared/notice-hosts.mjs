export const DEFAULT_NOTICE_LINK_HOSTS = Object.freeze([
  "download.memprism.com",
  "memprism.com",
  "www.memprism.com",
  "github.com",
  "azhimiao.github.io",
]);

export function noticeLinkHostsFromEnv(raw = "") {
  const extra = String(raw || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_NOTICE_LINK_HOSTS, ...extra])];
}

export function isAllowedNoticeLink(raw, hosts = DEFAULT_NOTICE_LINK_HOSTS) {
  const value = String(raw || "").trim();
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  const host = url.hostname.toLowerCase();
  if (!hosts.includes(host)) return "";
  return url.href;
}
