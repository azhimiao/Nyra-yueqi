#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForUrl(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`preview did not start: ${url}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function auditStep(page, expectedStep, size) {
  const metrics = await page.evaluate(() => {
    const gate = document.querySelector("[data-onboard-gate]");
    const step = document.querySelector("[data-onboard-step].is-active");
    const main = step?.querySelector(".first-run-main, [data-onboard-scroll]");
    const footer = step?.querySelector(".first-run-footer");
    const primarySelectors = [
      "[data-onboard-language-next]",
      "[data-onboard-auth-submit]",
      "[data-onboard-product-next]",
      "[data-onboard-enter]",
    ];
    const visiblePrimary = primarySelectors.filter((selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return !node.hidden && style.display !== "none" && rect.width > 0 && rect.height > 0;
    });
    const activePrimary = document.querySelector(visiblePrimary[0] || "html")?.getBoundingClientRect();
    const last = main?.lastElementChild?.getBoundingClientRect();
    return {
      step: gate?.dataset.onboardCurrentStep,
      progress: document.querySelector("[data-onboard-progress-label]")?.textContent || "",
      documentOverflowX: document.documentElement.scrollWidth > innerWidth + 1,
      primaryInViewport: Boolean(activePrimary && activePrimary.top >= 0 && activePrimary.bottom <= innerHeight + 1),
      footerInViewport: Boolean(footer && footer.getBoundingClientRect().bottom <= innerHeight + 1),
      mainScrolls: Boolean(main && main.scrollHeight > main.clientHeight + 1),
      lastReachable: !last || !main || last.bottom <= innerHeight + 1 || main.scrollHeight > main.clientHeight,
      visiblePrimary,
    };
  });
  assert(metrics.step === expectedStep, `${size.width}x${size.height}: expected ${expectedStep}, got ${metrics.step}`);
  assert(!metrics.documentOverflowX, `${size.width}x${size.height}/${expectedStep}: horizontal overflow`);
  assert(metrics.visiblePrimary.length === 1, `${size.width}x${size.height}/${expectedStep}: expected one primary action`);
  assert(metrics.primaryInViewport, `${size.width}x${size.height}/${expectedStep}: primary action is outside viewport`);
  assert(metrics.footerInViewport, `${size.width}x${size.height}/${expectedStep}: footer is outside viewport`);
  assert(metrics.lastReachable, `${size.width}x${size.height}/${expectedStep}: last content cannot scroll into view`);
}

const root = new URL("..", import.meta.url);
const rootPath = root.pathname.replace(/^\/(.:)/, "$1");
const viteEntry = join(rootPath, "node_modules", "vite", "bin", "vite.js");
assert(existsSync(viteEntry), "vite entry missing; run npm install");
const port = await freePort();
const vite = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let viteLog = "";
vite.stdout.on("data", (chunk) => { viteLog += chunk; });
vite.stderr.on("data", (chunk) => { viteLog += chunk; });

const browser = await chromium.launch({ headless: true });
const allSizes = [
  { width: 360, height: 640 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
];
const requestedWidth = Number(process.env.ONBOARDING_VIEWPORT_WIDTH || 0);
const sizes = requestedWidth ? allSizes.filter((size) => size.width === requestedWidth) : allSizes;

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForUrl(baseUrl);
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
    let selectedProduct = "developer";
    let registrationBody = null;
    await page.route("**/local/session", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, token: "test-local-token" }),
    }));
    await page.route("**/auth/register", (route) => {
      registrationBody = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "test-account-token",
          user: {
            username: "onboarding-test",
            productAccess: { mode: "developer", subscriptionStatus: "inactive", credits: 0 },
          },
        }),
      });
    });
    await page.route("**/account/product-access", async (route) => {
      if (route.request().method() === "PUT") {
        selectedProduct = JSON.parse(route.request().postData() || "{}").mode || "developer";
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access: { mode: selectedProduct, subscriptionStatus: "inactive", credits: 0 } }),
      });
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    const gate = page.locator("[data-onboard-gate]");
    await gate.waitFor({ state: "visible" });
    await auditStep(page, "language", size);

    await gate.locator('[data-set-locale="en"]').click();
    await auditStep(page, "language", size);
    await gate.locator("[data-onboard-language-next]").click();
    await auditStep(page, "account", size);

    await gate.locator('[data-onboard-auth-mode="login"]').click();
    const loginUi = await gate.evaluate((node) => ({
      emailVisible: !node.querySelector("[data-onboard-email-only]")?.hidden,
      codeHidden: node.querySelector("[data-onboard-email-register-only]")?.hidden,
      legalHidden: node.querySelector("[data-onboard-auth-legal-consent]")?.closest("[data-onboard-register-only]")?.hidden,
    }));
    assert(loginUi.emailVisible, `${size.width}x${size.height}: email login is not explicit`);
    assert(loginUi.codeHidden, `${size.width}x${size.height}: email login must not ask for a registration code`);
    assert(loginUi.legalHidden, `${size.width}x${size.height}: email login shows registration consent`);

    await gate.locator('[data-onboard-auth-type="phone"]').click();
    const loginPhoneUi = await gate.evaluate((node) => ({
      hint: node.querySelector("[data-onboard-auth-hint]")?.textContent?.trim(),
      hintHidden: node.querySelector("[data-onboard-auth-hint]")?.hidden,
    }));
    assert(
      !loginPhoneUi.hintHidden && loginPhoneUi.hint,
      `${size.width}x${size.height}: blocked login CTA explains nothing`,
    );
    await gate.locator("[data-onboard-phone]").fill("13800138000");
    await gate.locator("[data-onboard-password]").fill("secret12");
    const loginReady = await gate.evaluate((node) => ({
      consentChecked: node.querySelector("[data-onboard-auth-legal-consent]")?.checked,
      submitDisabled: node.querySelector("[data-onboard-auth-submit]")?.disabled,
      hintHidden: node.querySelector("[data-onboard-auth-hint]")?.hidden,
    }));
    assert(!loginReady.consentChecked, `${size.width}x${size.height}: login pre-checked registration consent`);
    assert(!loginReady.submitDisabled, `${size.width}x${size.height}: login is gated on registration consent`);
    assert(loginReady.hintHidden, `${size.width}x${size.height}: hint survives a complete login form`);
    await gate.locator("[data-onboard-phone]").fill("");
    await gate.locator('[data-onboard-auth-type="email"]').click();

    await gate.locator('[data-onboard-auth-mode="register"]').click();
    await auditStep(page, "account", size);
    const registrationUi = await gate.evaluate((node) => ({
      emailVisible: !node.querySelector("[data-onboard-email-only]")?.hidden,
      codeVisible: !node.querySelector("[data-onboard-email-register-only]")?.hidden,
      legalVisible: !node.querySelector("[data-onboard-auth-legal-consent]")?.closest("[data-onboard-register-only]")?.hidden,
      deviceHashCopyVisible: node.textContent.includes("不可逆哈希") || node.textContent.includes("one-way hash"),
    }));
    assert(registrationUi.emailVisible, `${size.width}x${size.height}: email registration is not explicit`);
    assert(registrationUi.codeVisible, `${size.width}x${size.height}: email registration code is hidden`);
    assert(registrationUi.legalVisible, `${size.width}x${size.height}: legal consent is hidden`);
    assert(!registrationUi.deviceHashCopyVisible, `${size.width}x${size.height}: device hash implementation copy leaked into UI`);

    await gate.locator('[data-onboard-auth-type="phone"]').click();
    await gate.locator("[data-onboard-phone]").fill("13800138000");
    await gate.locator("[data-onboard-password]").fill("secret12");
    const consentPending = await gate.evaluate((node) => ({
      submitDisabled: node.querySelector("[data-onboard-auth-submit]")?.disabled,
      hint: node.querySelector("[data-onboard-auth-hint]")?.textContent?.trim(),
    }));
    assert(consentPending.submitDisabled, `${size.width}x${size.height}: registration ignores missing consent`);
    assert(consentPending.hint, `${size.width}x${size.height}: missing consent is not explained`);
    await gate.locator("[data-onboard-auth-legal-consent]").check();
    const phoneUi = await gate.evaluate((node) => ({
      phoneVisible: !node.querySelector("[data-onboard-phone-only]")?.hidden,
      emailCodeHidden: node.querySelector("[data-onboard-email-register-only]")?.hidden,
      countryCode: node.querySelector("[data-onboard-country-code]")?.value,
      submitDisabled: node.querySelector("[data-onboard-auth-submit]")?.disabled,
    }));
    assert(phoneUi.phoneVisible, `${size.width}x${size.height}: phone registration fields are hidden`);
    assert(phoneUi.emailCodeHidden, `${size.width}x${size.height}: phone registration must not ask for an email code`);
    assert(phoneUi.countryCode === "+86", `${size.width}x${size.height}: phone registration country code default is not +86`);
    assert(!phoneUi.submitDisabled, `${size.width}x${size.height}: valid phone registration remains disabled`);

    const usePhoneRegistration = size.width === 360 && size.height === 640;
    if (!usePhoneRegistration) {
      await gate.locator('[data-onboard-auth-type="email"]').click();
      await gate.locator("[data-onboard-email]").fill("onboarding-test@example.com");
      await gate.locator("[data-onboard-code]").fill("123456");
    }
    const registrationResponse = page.waitForResponse((response) => (
      response.url().endsWith("/auth/register")
      && response.request().method() === "POST"
    ));
    await gate.locator("[data-onboard-auth-submit]").click();
    await registrationResponse;
    assert(
      registrationBody?.authType === (usePhoneRegistration ? "phone" : "email"),
      `${size.width}x${size.height}: registration auth type mismatch ${JSON.stringify(registrationBody)}`,
    );
    if (usePhoneRegistration) {
      assert(registrationBody?.countryCode === "+86", `${size.width}x${size.height}: phone country code missing`);
      assert(registrationBody?.phone === "13800138000", `${size.width}x${size.height}: phone number missing`);
      assert(!registrationBody?.email && !registrationBody?.code, `${size.width}x${size.height}: phone registration sent email OTP fields`);
    } else {
      assert(registrationBody?.email === "onboarding-test@example.com", `${size.width}x${size.height}: email missing from registration`);
      assert(registrationBody?.code === "123456", `${size.width}x${size.height}: email registration code missing`);
      assert(!registrationBody?.phone && !registrationBody?.countryCode, `${size.width}x${size.height}: email registration sent phone fields`);
    }
    assert(!registrationBody?.username, `${size.width}x${size.height}: email registration still requires a duplicate username`);
    assert(
      JSON.stringify(registrationBody?.legalConsent) === JSON.stringify({
        accepted: true,
        termsVersion: "0.2.0",
        privacyVersion: "0.2.0",
      }),
      `${size.width}x${size.height}: registration did not send current legal consent`,
    );
    await gate.locator('[data-onboard-step="ui"]:not([hidden])').waitFor({ state: "visible" });
    await auditStep(page, "ui", size);

    const managedCapabilities = await page.evaluate(async () => {
      const voice = await import("/src/settings/voice-preferences.js");
      const image = await import("/src/settings/imagegen-preferences.js");
      const model = await import("/src/model/client.js");
      const access = await import("/src/account/product-access.js");
      const config = model.collectProviderConfig();
      return {
        voice: voice.isVoiceConfigured(),
        stt: voice.isSttConfigured(),
        image: image.isImagegenConfigured(),
        modelShape: Boolean(config.baseUrl && config.apiKey && config.model),
        access: access.readProductAccess(),
        eco: localStorage.getItem("yueqi.ecosystem.v1"),
        onb: localStorage.getItem("yueqi.onboarding.v1"),
      };
    });
    assert(
      managedCapabilities.access.modelSource === "byok",
      `${size.width}x${size.height}: registration must preserve the server's BYOK default ${JSON.stringify(managedCapabilities)}`,
    );
    assert(
      !managedCapabilities.voice
        && !managedCapabilities.stt
        && !managedCapabilities.image
        && !managedCapabilities.modelShape,
      `${size.width}x${size.height}: BYOK must not pretend provider credentials are configured ${JSON.stringify(managedCapabilities)}`,
    );

    await gate.locator('[data-onboard-ui="app"]').click();
    await auditStep(page, "ui", size);
    const githubProject = await gate.evaluate((node) => {
      const card = node.querySelector("[data-onboard-app-project]");
      const link = card?.querySelector("a");
      return {
        visible: Boolean(card && !card.hidden),
        href: link?.href || "",
        copy: card?.textContent?.trim() || "",
      };
    });
    assert(githubProject.visible, `${size.width}x${size.height}: App introduction hides the GitHub project`);
    assert(
      githubProject.href === "https://github.com/azhimiao/Nyra-yueqi",
      `${size.width}x${size.height}: App introduction points to ${githubProject.href}`,
    );
    assert(githubProject.copy.includes("GitHub"), `${size.width}x${size.height}: GitHub project has no visible label`);
    const beforeEnter = await page.evaluate(() => ({
      step: document.querySelector("[data-onboard-gate]")?.dataset.onboardCurrentStep,
      eco: localStorage.getItem("yueqi.ecosystem.v1"),
      onb: localStorage.getItem("yueqi.onboarding.v1"),
      enterDisabled: document.querySelector("[data-onboard-enter]")?.disabled,
    }));
    await gate.locator("[data-onboard-enter]").click();
    try {
      await gate.waitFor({ state: "hidden", timeout: 15000 });
    } catch (error) {
      const afterEnter = await page.evaluate(() => ({
        step: document.querySelector("[data-onboard-gate]")?.dataset.onboardCurrentStep,
        eco: localStorage.getItem("yueqi.ecosystem.v1"),
        onb: localStorage.getItem("yueqi.onboarding.v1"),
        hidden: document.querySelector("[data-onboard-gate]")?.hidden,
      }));
      throw new Error(`${size.width}x${size.height}: gate stayed open ${JSON.stringify({ beforeEnter, afterEnter, pageErrors })}`, { cause: error });
    }
    console.log(`PASS  commercial onboarding ${size.width}x${size.height}`);
    await context.close();
  }
} catch (error) {
  if (viteLog.trim()) console.error(viteLog.trim());
  throw error;
} finally {
  await browser.close();
  vite.kill("SIGTERM");
}

console.log("\nCommercial onboarding browser verification PASSED");
