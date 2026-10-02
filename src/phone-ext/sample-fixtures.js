/**
 * 样例扩展 fixture（verify + 侧载演示）
 */

import { zipSync, strToU8 } from "fflate";
import { EXT_MANIFEST_KIND, EXT_SCHEMA_VERSION } from "./manifest-schema.js";

export const SAMPLE_EXT_ID = "sample-calendar-token";

export const SAMPLE_MANIFEST = Object.freeze({
  schemaVersion: EXT_SCHEMA_VERSION,
  kind: EXT_MANIFEST_KIND,
  id: SAMPLE_EXT_ID,
  name: "日程信物助手",
  version: "1.0.0",
  author: "月栖",
  description: "读取今日日程，并向 Pop 发送提醒信物卡。",
  contentRating: "general",
  entry: "index.html",
  icon: "icon.svg",
  permissions: ["calendar.read", "chat.send_token"],
});

export const SAMPLE_MATURE_MANIFEST = Object.freeze({
  ...SAMPLE_MANIFEST,
  id: "sample-mature-fixture",
  name: "成年确认样例",
  contentRating: "mature",
  permissions: ["storage.read"],
});

const SAMPLE_INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>日程信物助手</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", "PingFang SC", sans-serif; }
    body { margin: 0; padding: 16px; background: #f4f7f5; color: #1f2a24; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .lead { color: #5a6b62; font-size: 13px; margin-bottom: 16px; }
    .list { display: grid; gap: 8px; margin-bottom: 20px; }
    .row { background: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 1px 0 rgba(0,0,0,.04); }
    .row strong { display: block; font-size: 14px; }
    .row span { font-size: 12px; color: #6b7c74; }
    .cta { width: 100%; border: 0; border-radius: 12px; padding: 14px; background: #6B9080; color: #fff; font-weight: 600; font-size: 15px; }
    .cta:active { opacity: .88; }
    .cta:disabled { opacity: .5; }
    .empty, .err { background: #fff; border-radius: 12px; padding: 16px; text-align: center; }
    .err { color: #8a3b3b; }
    .ghost { margin-top: 10px; border: 0; background: #e7efeb; color: #2d4a3e; border-radius: 10px; padding: 10px 14px; font-size: 13px; }
    .toast { margin-top: 12px; font-size: 13px; color: #6B9080; text-align: center; }
  </style>
</head>
<body>
  <h1>日程信物助手</h1>
  <p class="lead">今日 / 明日日程，一键发送提醒信物到 Pop。</p>
  <div class="list" id="events"></div>
  <button type="button" class="cta" id="send">发送今日提醒信物</button>
  <p class="toast" id="toast" hidden></p>
  <script src="./app.js"></script>
</body>
</html>`;

const SAMPLE_APP_JS = `async function request(perm) {
  const host = window.nyra && window.nyra.host;
  if (!host) throw new Error("host missing");
  await host.requestPermission(perm);
}

function showToast(text) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
}

function renderDenied(label) {
  const host = document.getElementById("events");
  if (!host) return;
  host.innerHTML = '<div class="err"><p>需要「' + label + '」权限才能显示日程</p><button type="button" class="ghost" id="go-grant">去授权</button></div>';
  document.getElementById("go-grant")?.addEventListener("click", () => {
    loadEvents().catch(() => {});
  });
}

async function loadEvents() {
  const hostEl = document.getElementById("events");
  const sendBtn = document.getElementById("send");
  try {
    await request("calendar.read");
  } catch (err) {
    if (sendBtn) sendBtn.disabled = true;
    renderDenied("读取日历");
    return;
  }
  const host = window.nyra.host;
  const events = await host.calendar.listEvents({ days: 2 });
  if (!events.length) {
    hostEl.innerHTML = '<div class="empty">今天和明天还没有日程</div>';
  } else {
    hostEl.innerHTML = events.map((ev) => (
      '<article class="row"><strong>' + escapeHtml(ev.title || "日程") + '</strong><span>' +
      escapeHtml((ev.date || "") + " " + (ev.time || "")) + '</span></article>'
    )).join("");
  }
  if (sendBtn) sendBtn.disabled = false;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.getElementById("send")?.addEventListener("click", async () => {
  try {
    await request("chat.send_token");
  } catch {
    showToast("需要「发送信物消息」权限");
    return;
  }
  const host = window.nyra.host;
  const events = await host.calendar.listEvents({ days: 1 });
  const first = events[0];
  const title = first ? ("提醒：" + (first.title || "日程")) : "今日提醒";
  const subtitle = first
    ? ((first.date || "") + " " + (first.time || "")).trim()
    : "来自日程信物助手";
  await host.chat.sendTokenCard({
    kind: "reminder",
    title: title.slice(0, 40),
    subtitle: subtitle.slice(0, 80),
  });
  showToast("已发送信物到 Pop");
});

loadEvents().catch((err) => {
  console.error(err);
  renderDenied("读取日历");
});
`;

const SAMPLE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="16" fill="#F5DFB0"/>
  <path d="M18 24h28v26H18V24z" stroke="#8A6A2A" stroke-width="3" fill="#FFF8E8"/>
  <path d="M18 30h28" stroke="#8A6A2A" stroke-width="3"/>
  <path d="M26 18v8M38 18v8" stroke="#8A6A2A" stroke-width="3" stroke-linecap="round"/>
  <path d="M28 40l3 3 7-8" stroke="#6B9080" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * @returns {Uint8Array}
 */
export function buildSampleExtZipBytes() {
  const files = {
    "manifest.json": strToU8(JSON.stringify(SAMPLE_MANIFEST, null, 2)),
    "index.html": strToU8(SAMPLE_INDEX_HTML),
    "app.js": strToU8(SAMPLE_APP_JS),
    "icon.svg": strToU8(SAMPLE_ICON_SVG),
  };
  return zipSync(files, { level: 6 });
}

/**
 * Mature fixture for H4 tests.
 * @returns {Uint8Array}
 */
export function buildMatureExtZipBytes() {
  const files = {
    "manifest.json": strToU8(JSON.stringify(SAMPLE_MATURE_MANIFEST, null, 2)),
    "index.html": strToU8("<!DOCTYPE html><html><body><p>mature fixture</p></body></html>"),
  };
  return zipSync(files, { level: 6 });
}

export function sampleExtFileMap() {
  return {
    "manifest.json": JSON.stringify(SAMPLE_MANIFEST, null, 2),
    "index.html": SAMPLE_INDEX_HTML,
    "app.js": SAMPLE_APP_JS,
    "icon.svg": SAMPLE_ICON_SVG,
  };
}
