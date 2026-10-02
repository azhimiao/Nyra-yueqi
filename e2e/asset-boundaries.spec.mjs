import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import {
  BASE_URL,
  enterScenarioStage,
  homeFromAnywhere,
  installPhoneFixture,
  openPhoneApp,
  openPhoneHome,
} from "./helpers/phone.mjs";

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

async function imageSources(page, scope) {
  return page.locator(`${scope} img`).evaluateAll((images) => images
    .filter((image) => {
      const style = getComputedStyle(image);
      return style.display !== "none" && style.visibility !== "hidden";
    })
    .map((image) => image.getAttribute("src") || "")
    .filter(Boolean));
}

function leakedPetUrls(urls) {
  return urls.filter((url) => /\/assets\/(characters|pet-poses)\//i.test(url));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error.message || error)));
await installPhoneFixture(page);

try {
  await openPhoneHome(page);
  const homeImages = await imageSources(page, "[data-small-phone-root]");
  check("phone home has no pet package images", leakedPetUrls(homeImages).length === 0, leakedPetUrls(homeImages).join(", "));

  await openPhoneApp(page, "sidewrite");
  await page.waitForSelector('[data-phone-screen="sidewrite"].is-active [data-sidewrite-root]', { timeout: 10000 });
  const sidewriteImages = await imageSources(page, '[data-phone-screen="sidewrite"].is-active');
  check("TA phone has no pet package images", leakedPetUrls(sidewriteImages).length === 0, leakedPetUrls(sidewriteImages).join(", "));
  check(
    "TA phone uses avatar namespace when an image is shown",
    sidewriteImages.length === 0 || sidewriteImages.every((url) => /\/assets\/avatars\//.test(url) || /^(data:|blob:|https:\/\/)/.test(url)),
    sidewriteImages.join(", "),
  );
  await mkdir("docs/qa/asset-boundaries", { recursive: true });
  await page.screenshot({ path: "docs/qa/asset-boundaries/ta-phone-390x844.png", fullPage: true });

  await homeFromAnywhere(page);
  await enterScenarioStage(page, { openingIndex: 0 });
  const scenarioImages = await imageSources(page, '[data-phone-screen="scenario"].is-active');
  check("scenario has no pet package images", leakedPetUrls(scenarioImages).length === 0, leakedPetUrls(scenarioImages).join(", "));
  check(
    "scenario uses scenario/avatar namespaces only",
    scenarioImages.every((url) => /\/assets\/(scenario|avatars|scenes)\//.test(url) || /^(data:|blob:|https:\/\/)/.test(url)),
    scenarioImages.join(", "),
  );
  await page.screenshot({ path: "docs/qa/asset-boundaries/scenario-390x844.png", fullPage: true });

  await homeFromAnywhere(page);
  await openPhoneApp(page, "scroll");
  await page.waitForSelector('[data-scroll-library]', { state: "visible", timeout: 10000 });
  const scrollImages = await imageSources(page, '[data-phone-screen="scroll"].is-active');
  check("VN library has no pet package images", leakedPetUrls(scrollImages).length === 0, leakedPetUrls(scrollImages).join(", "));
  check(
    "VN library uses VN/avatar namespaces only",
    scrollImages.every((url) => /\/assets\/(vn|avatars)\//.test(url) || /^(data:|blob:|https:\/\/)/.test(url)),
    scrollImages.join(", "),
  );

  const allPhoneImages = await imageSources(page, "[data-small-phone-root]");
  check("rendered phone tree contains no pet asset URL", leakedPetUrls(allPhoneImages).length === 0, leakedPetUrls(allPhoneImages).join(", "));

  check("no image-boundary runtime errors", errors.length === 0, errors.join(" | "));

  await page.screenshot({ path: "docs/qa/asset-boundaries/vn-library-390x844.png", fullPage: true });
} finally {
  await browser.close();
}

console.log(`\ne2e:asset-boundaries ${passed}/${passed + failed} ${failed ? "RED" : "GREEN"} @ ${BASE_URL}`);
if (failed) process.exit(1);
