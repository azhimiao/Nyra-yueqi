import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const tab = document.querySelector('.bottom-tabs button[data-tab="companion"], [data-tab="companion"]');
  tab?.click();
  return {
    mode: document.body.dataset.appMode,
    panel: document.body.dataset.activePanel,
    iconsReady: document.body.classList.contains("icons-ready"),
  };
});
console.log(JSON.stringify({ errors, info }, null, 2));
await browser.close();
