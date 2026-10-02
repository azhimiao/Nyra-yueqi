import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT_DIR = path.resolve("docs/demo/diary-styles");

async function openCompanionMemory(page) {
  await page.evaluate(() => {
    document.body.dataset.activePanel = "companion";
    document.querySelectorAll("[data-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.tab === "companion");
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === "companion");
    });
    document.querySelector("[data-companion-tab='memory']")?.click();
  });
}

async function captureViewport(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await openCompanionMemory(page);
  await page.waitForSelector("[data-diary-style-preference]");
  await page.locator(".diary-book").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const book = page.locator(".diary-book");
  await book.screenshot({ path: path.join(OUT_DIR, `${name}-section.png`) });

  const styleSelect = page.locator("[data-diary-style-preference]");
  await styleSelect.screenshot({ path: path.join(OUT_DIR, `${name}-style-picker.png`) });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await captureViewport(page, "desktop", { width: 1280, height: 900 });
  await captureViewport(page, "mobile", { width: 390, height: 844 });

  await writeFile(path.join(OUT_DIR, "README.md"), `# 日记本 Demo 截图

生成时间：${new Date().toISOString()}

## 桌面端

| 文件 | 说明 |
|------|------|
| \`desktop-section.png\` | 记忆页「日记本」完整区块 |
| \`desktop-style-picker.png\` | 下一次日记风格下拉 |

## 移动端

| 文件 | 说明 |
|------|------|
| \`mobile-section.png\` | 移动端完整区块 |
| \`mobile-style-picker.png\` | 下一次日记风格下拉 |

重新生成：

\`\`\`bash
npm run dev
node scripts/capture-diary-demo.mjs
\`\`\`
`);

  await browser.close();
  console.log(`Screenshots saved to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
