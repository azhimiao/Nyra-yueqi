import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

import {
  buildBillingPanelHtml,
  buildReferralShareText,
} from "../src/billing/ui/billing-panel.js";

const expected = [
  "来月栖找我：",
  "https://memprism.com/download",
  "邀请码：PAPER7K",
  "注册时填写，双方都能获得 300 Credits。",
].join("\n");
assert.equal(buildReferralShareText("paper7k"), expected);

const [html, client, panel, panelCss, server] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/auth/client.js", import.meta.url), "utf8"),
  readFile(new URL("../src/billing/ui/billing-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/billing/ui/billing-panel.css", import.meta.url), "utf8"),
  readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
]);
assert.match(html, /data-onboard-invitation-code/);
assert.match(html, /data-auth-invitation-code/);
assert.match(client, /invitationCode/);
assert.match(panel, /data-billing-copy-referral/);
assert.match(panel, /fetchReferralInvitation/);
assert.match(server, /resolveReferralInvitation/);
assert.match(server, /grantReferralInsideTransaction/);
assert.match(server, /referralRateLimiter/);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 16px; background: #f6f7f8; }
      ${panelCss}
    </style>
    ${buildBillingPanelHtml({ locale: "zh-CN" })}
  `);
  await page.locator("[data-billing-referral-code]").evaluate((node) => {
    node.textContent = "PAPER7K";
  });
  const referral = page.locator(".billing-referral");
  const copyButton = page.locator("[data-billing-copy-referral]");
  assert.equal(await referral.isVisible(), true);
  assert.equal(await copyButton.textContent(), "复制邀请信息");
  assert.ok((await referral.boundingBox()).width <= 358);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
} finally {
  await browser.close();
}

await import("../server/billing/referral.test.mjs");

console.log("verify-billing-referral: ok");
