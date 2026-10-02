#!/usr/bin/env node
/**
 * Push or replace an in-app notice window.
 *
 *   YUEQI_ADMIN_TOKEN=... node scripts/notice-push.mjs --id maint --title-zh "今晚维护" --body-zh "凌晨两点停机" --forced
 *
 * Optional: --type announcement|update --url https://download.memprism.com/... --base http://127.0.0.1:8787
 */
const args = process.argv.slice(2);
function flag(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? String(args[index + 1] || "").trim() : fallback;
}
function has(name) {
  return args.includes(`--${name}`);
}

const base = (flag("base") || process.env.YUEQI_SERVICE_BASE || "http://127.0.0.1:8787").replace(/\/+$/, "");
const token = flag("token") || process.env.YUEQI_ADMIN_TOKEN || "";
if (!token) {
  console.error("缺少 YUEQI_ADMIN_TOKEN（或 --token）。");
  process.exit(1);
}

const notice = {
  id: flag("id"),
  type: flag("type", "announcement"),
  kind: has("optional") ? "optional" : "forced",
  enabled: !has("disable"),
  priority: Number(flag("priority", "100")) || 0,
  audience: flag("audience", "all"),
  title: { "zh-CN": flag("title-zh") || flag("title"), en: flag("title-en") || flag("title") },
  body: { "zh-CN": flag("body-zh") || flag("body"), en: flag("body-en") || flag("body") },
  ctaLabel: {
    "zh-CN": flag("cta-zh") || (flag("type") === "update" ? "立即更新" : "我知道了"),
    en: flag("cta-en") || (flag("type") === "update" ? "Update now" : "Got it"),
  },
  ctaUrl: flag("url"),
  startsAt: flag("starts"),
  endsAt: flag("ends"),
};

const response = await fetch(`${base}/admin/notices`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Yueqi-Admin-Token": token,
  },
  body: JSON.stringify({ notice }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(payload.error || response.status, payload.message || "");
  process.exit(1);
}
console.log(`ok  ${notice.id}  active=${payload.notices?.filter((item) => item.enabled !== false).length ?? "?"}`);
