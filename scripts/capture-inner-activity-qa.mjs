/**
 * Screenshot QA for thinking fold (collapsed = label only).
 * Loads real CSS cascade; no live model needed.
 *
 * Usage: node scripts/capture-inner-activity-qa.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const OUT = path.resolve("artifacts/inner-activity-qa");
const ROOT = path.resolve(".");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTurnActivityHtml(innerState) {
  return `<details class="message-turn-activity is-complete" data-persisted-turn-activity data-inner-psychology>
    <summary class="message-turn-activity__summary">
      <span class="message-turn-activity__label">思考</span>
    </summary>
    <div class="message-turn-activity__copy">${escapeHtml(innerState)}</div>
  </details>`;
}

const inner = "有点好奇你现在是想放空，还是其实有什么没说出口的话？其实我还想再多说一点，看看布局会不会把整行撑出屏幕右边去。";
const fold = renderTurnActivityHtml(inner);

const FIXTURE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=390, initial-scale=1" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "styles.css")).href}" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "src/ui/product-shell.css")).href}" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "src/ui/nyra-app.css")).href}" />
  <link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "src/ui/chat-message-visual.css")).href}" />
  <style>
    html, body { margin: 0; background: #eef3f7; font-family: "Segoe UI", "PingFang SC", sans-serif; }
    .stage { padding: 16px 14px 28px; max-width: 390px; margin: 0 auto; }
    .label { margin: 0 0 8px; color: #60717f; font-size: 11px; letter-spacing: 0.06em; }
    .chat { display: grid; gap: 14px; }
    .message { position: relative; }
    .message-bubble p { margin: 0; font-size: 15px; line-height: 1.55; }
    .message-menu { position: absolute; bottom: 0; left: 0; font-size: 14px; color: #8a9aa8; }
  </style>
</head>
<body data-app-mode="app">
  <main class="stage">
    <p class="label">COLLAPSED (persisted)</p>
    <div class="chat">
      <article class="message ai has-turn-activity">
        ${fold}
        <div class="message-bubble"><p>是想就这么安安静静待一会儿，还是我找个话题陪你聊聊？</p></div>
        <div class="message-menu">⋯</div>
      </article>
    </div>

    <p class="label" style="margin-top:18px">OPEN</p>
    <div class="chat">
      <article class="message ai has-turn-activity">
        ${fold.replace("<details ", "<details open ")}
        <div class="message-bubble"><p>是打一半突然停了，还是想让我先找话题呀？</p></div>
        <div class="message-menu">⋯</div>
      </article>
    </div>

    <p class="label" style="margin-top:18px">WAITING / STREAM</p>
    <div class="chat">
      <article class="message ai has-turn-activity is-psychology-pending">
        <details class="message-turn-activity is-waiting" open data-inner-psychology>
          <summary class="message-turn-activity__summary">
            <span class="message-turn-activity__label">思考</span>
          </summary>
          <div class="message-turn-activity__copy">你只打了两个字母，是突然不知道说什么，还是在等待我回应？</div>
        </details>
        <div class="message-bubble"><p>hidden while pending</p></div>
        <div class="message-menu">⋯</div>
      </article>
    </div>
  </main>
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
  await page.waitForTimeout(300);

  const fullPath = path.join(OUT, "phone-390.png");
  await page.screenshot({ path: fullPath, fullPage: true });

  const metrics = await page.evaluate(() => {
    const chatPad = 14;
    const viewportW = window.innerWidth;
    const details = [...document.querySelectorAll(".message-turn-activity")];
    return details.map((d, i) => {
      const article = d.closest(".message");
      const summary = d.querySelector("summary");
      const peek = d.querySelector(".message-turn-activity__peek");
      const copy = d.querySelector(".message-turn-activity__copy");
      const aRect = article.getBoundingClientRect();
      const dRect = d.getBoundingClientRect();
      const pRect = peek?.getBoundingClientRect();
      const cRect = copy?.getBoundingClientRect();
      const after = getComputedStyle(summary, "::after").content;
      const tap = getComputedStyle(summary).webkitTapHighlightColor;
      const outline = getComputedStyle(summary).outlineStyle;
      return {
        i,
        open: d.open,
        articleW: Math.round(aRect.width),
        articleRight: Math.round(aRect.right),
        foldRight: Math.round(dRect.right),
        peekRight: pRect ? Math.round(pRect.right) : null,
        copyRight: cRect && getComputedStyle(copy).display !== "none" ? Math.round(cRect.right) : null,
        viewportW,
        overflowsViewport: aRect.right > viewportW - 1 || dRect.right > viewportW - 1,
        overflowsChat: aRect.right > viewportW - chatPad + 1,
        summaryAfter: after,
        tapHighlight: tap,
        outlineStyle: outline,
        copyMaxHeight: copy ? getComputedStyle(copy).maxHeight : null,
      };
    });
  });

  // Focus/tap interaction sample on first summary
  await page.locator(".message-turn-activity > summary").first().focus();
  const focusChrome = await page.evaluate(() => {
    const summary = document.querySelector(".message-turn-activity > summary");
    const cs = getComputedStyle(summary);
    return {
      outline: cs.outline,
      outlineColor: cs.outlineColor,
      boxShadow: cs.boxShadow,
      tap: cs.webkitTapHighlightColor,
    };
  });

  const issues = [];
  for (const m of metrics) {
    if (m.overflowsViewport) issues.push(`details[${m.i}] overflows viewport (right=${m.foldRight}/${m.viewportW})`);
    if (m.summaryAfter && m.summaryAfter !== "none" && m.summaryAfter !== '""') {
      issues.push(`details[${m.i}] has legacy summary::after chevron: ${m.summaryAfter}`);
    }
  }
  const blueish = /rgb\(\s*0\s*,\s*0\s*,\s*255|rgb\(\s*21\s*,\s*158\s*,\s*233|#00f|blue/i;
  if (blueish.test(String(focusChrome.outlineColor)) && focusChrome.outline !== "none" && !/^0px/.test(focusChrome.outline)) {
    issues.push(`focused summary has blue outline: ${focusChrome.outline}`);
  }
  if (focusChrome.boxShadow && focusChrome.boxShadow !== "none" && blueish.test(focusChrome.boxShadow)) {
    issues.push(`focused summary has blue box-shadow: ${focusChrome.boxShadow}`);
  }

  await writeFile(path.join(OUT, "REPORT.json"), JSON.stringify({ fullPath, metrics, focusChrome, issues }, null, 2));
  await browser.close();
  console.log(JSON.stringify({ out: OUT, issues, focusChrome, metrics }, null, 2));
  if (issues.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
