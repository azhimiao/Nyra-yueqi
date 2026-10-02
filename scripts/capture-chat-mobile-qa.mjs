/**
 * Mobile chat screenshot QA — message cards + psychology fold.
 * Usage: node scripts/capture-chat-mobile-qa.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const OUT = path.resolve("artifacts/chat-mobile-qa");
const ROOT = path.resolve(".");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function psychHtml(inner, { open = false } = {}) {
  return `<details class="message-turn-activity is-complete" ${open ? "open" : ""} data-persisted-turn-activity data-inner-psychology>
    <summary class="message-turn-activity__summary">
      <span class="message-turn-activity__label">思考</span>
    </summary>
    <div class="message-turn-activity__copy">${escapeHtml(inner)}</div>
  </details>`;
}

const FIXTURE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=390, initial-scale=1, viewport-fit=cover" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "styles.css")).href}" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "src/ui/product-shell.css")).href}" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "src/ui/nyra-app.css")).href}" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "src/ui/chat-message-visual.css")).href}" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "src/ui/interaction-motion.css")).href}" />
  <style>
    html, body { margin: 0; height: 100%; background: #e8eef3; font-family: "Segoe UI", "PingFang SC", sans-serif; }
    .phone {
      box-sizing: border-box;
      width: 390px; height: 844px; margin: 0 auto;
      display: grid; grid-template-rows: 52px 1fr 58px;
      background: #f3f7fa;
      border: 1px solid #c9d5de;
    }
    .top {
      display: flex; align-items: center; justify-content: center;
      border-bottom: 1px solid #d8e0e6; background: #fff;
      font-weight: 650; font-size: 15px; color: #10283b;
    }
    .chat {
      overflow: auto; padding: 12px 14px 18px;
      display: grid; gap: 10px; align-content: start;
    }
    .message { position: relative; }
    .message-bubble p, .message > p { margin: 0; }
    .message-menu { position: absolute; bottom: 0; left: 0; color: #8a9aa8; font-size: 14px; line-height: 1; }
    .message:not(.has-turn-activity) > .message-menu { top: calc(100% + 2px); bottom: auto; }
    .message.user .message-menu { left: auto; right: 0; }
    .dock {
      display: grid; grid-template-columns: 1fr 1fr 1fr; place-items: center;
      border-top: 1px solid #d8e0e6; background: #fff; color: #60717f; font-size: 11px;
    }
    .stamp { margin: 0; color: #8a9aa8; font-size: 10px; text-align: center; letter-spacing: 0.04em; }
  </style>
</head>
<body data-app-mode="app">
  <div class="phone">
    <header class="top">玛缇娜 · 平静</header>
    <main class="chat" id="chat">
      <p class="stamp">NORMAL AI CARD</p>
      <article class="message ai">
        <p data-message-body>普通回复：卡片应该还在，白底圆角清晰。</p>
        <div class="message-menu">⋯</div>
      </article>

      <p class="stamp">USER CARD</p>
      <article class="message user has-message-menu">
        <p data-message-body>嗯</p>
        <div class="message-menu">⋯</div>
      </article>

      <p class="stamp">THINKING (no psychology yet — card must stay)</p>
      <article class="message ai has-message-bubble">
        <details class="message-turn-activity is-waiting" hidden data-turn-activity data-inner-psychology>
          <summary class="message-turn-activity__summary">
            <span class="message-turn-activity__label">思考</span>
          </summary>
          <div class="message-turn-activity__copy"></div>
        </details>
        <div class="message-bubble"><p data-message-body>…</p></div>
        <div class="message-menu">⋯</div>
      </article>

      <p class="stamp">PSYCH COLLAPSED + BUBBLE</p>
      <article class="message ai has-turn-activity has-message-bubble">
        ${psychHtml("有点好奇你现在是想放空，还是其实有什么没说出口的话？")}
        <div class="message-bubble"><p data-message-body>是想就这么安安静静待一会儿，还是我找个话题陪你聊聊？</p></div>
        <div class="message-menu">⋯</div>
      </article>

      <p class="stamp">PSYCH OPEN</p>
      <article class="message ai has-turn-activity has-message-bubble">
        ${psychHtml("你只打了两个字母，是突然不知道说什么，还是在等待我回应？", { open: true })}
        <div class="message-bubble"><p data-message-body>是打一半突然停了，还是想让我先找话题呀？</p></div>
        <div class="message-menu">⋯</div>
      </article>

      <p class="stamp">BAD OLD BUG (pending forever — should NOT look like this in product)</p>
      <article class="message ai has-turn-activity is-psychology-pending has-message-bubble">
        ${psychHtml("流式思考还没结束时会暂藏气泡，但不应整轮都没有卡片。", { open: true })}
        <div class="message-bubble"><p>hidden while pending</p></div>
        <div class="message-menu">⋯</div>
      </article>
    </main>
    <nav class="dock"><span>聊天</span><span>空间</span><span>陪伴</span></nav>
  </div>
</body>
</html>`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const htmlPath = path.join(OUT, "fixture.html");
  await writeFile(htmlPath, FIXTURE, "utf8");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);

  const shot = path.join(OUT, "phone-390-chat.png");
  await page.screenshot({ path: shot, fullPage: false });

  const metrics = await page.evaluate(() => {
    const vw = window.innerWidth;
    const rows = [...document.querySelectorAll("article.message")].map((el, i) => {
      const cs = getComputedStyle(el);
      const bubble = el.querySelector(":scope > .message-bubble, :scope > p, :scope > .message-row");
      const menu = el.querySelector(":scope > .message-menu");
      const bcs = bubble ? getComputedStyle(bubble) : null;
      const rect = el.getBoundingClientRect();
      const brect = bubble?.getBoundingClientRect();
      const mrect = menu?.getBoundingClientRect();
      const painted = el.classList.contains("has-turn-activity") && brect ? brect : rect;
      const menuOutsidePainted = Boolean(mrect && mrect.top >= painted.bottom - 1);
      const bg = el.classList.contains("has-turn-activity") && bubble
        ? bcs.backgroundColor
        : cs.backgroundColor;
      const visibleBubble = bubble && bcs.display !== "none" && (brect?.height || 0) > 4;
      const opaque = (c) => {
        const m = String(c || "").match(/rgba?\(([^)]+)\)/);
        if (!m) return c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)";
        const parts = m[1].split(",").map((x) => Number(String(x).trim()));
        if (parts.length === 4 && parts[3] === 0) return false;
        return true;
      };
      return {
        i,
        classes: el.className,
        articleBg: cs.backgroundColor,
        articleBorder: cs.borderTopWidth,
        bubbleDisplay: bcs?.display || null,
        bubbleBg: bcs?.backgroundColor || null,
        cardLooksPresent: opaque(bg) || (visibleBubble && opaque(bcs?.backgroundColor)),
        visibleBubble,
        overflows: rect.right > vw + 1,
        width: Math.round(rect.width),
        menuOutsidePainted,
      };
    });
    return rows;
  });

  const issues = [];
  // 0 normal AI — must have card
  if (!metrics[0]?.cardLooksPresent) issues.push("normal AI card missing");
  // 1 user — must have card; ⋯ hangs below the painted box, not inside it
  if (!metrics[1]?.cardLooksPresent) issues.push("user card missing");
  if (!metrics[1]?.menuOutsidePainted) issues.push("user ⋯ trapped inside bubble");
  if (!metrics[0]?.menuOutsidePainted) issues.push("plain AI ⋯ trapped inside bubble");
  // 2 thinking without psych — must keep card / visible bubble
  if (!metrics[2]?.visibleBubble) issues.push("thinking bubble hidden (card gone)");
  if (!metrics[2]?.cardLooksPresent) issues.push("thinking card missing");
  // 3 psych collapsed — bubble card required
  if (!metrics[3]?.visibleBubble || !metrics[3]?.cardLooksPresent) issues.push("psych+bubble card missing");
  // 4 psych open — bubble card required
  if (!metrics[4]?.visibleBubble || !metrics[4]?.cardLooksPresent) issues.push("psych-open bubble card missing");
  // overflow checks
  for (const m of metrics) {
    if (m.overflows) issues.push(`msg[${m.i}] overflows viewport`);
  }

  await writeFile(path.join(OUT, "REPORT.json"), JSON.stringify({ shot, issues, metrics }, null, 2));
  await browser.close();
  console.log(JSON.stringify({ out: OUT, shot, issues, metrics }, null, 2));
  if (issues.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
