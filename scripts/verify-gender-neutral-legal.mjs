import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const srcRoot = join(root, "src");

const authoredOrSemanticFiles = new Set([
  "adventure/dm.js",
  "chat/im-sanitize.js",
  "characters/builtin-nyra-prompt.js",
  "characters/gender-identity.js", // Pronoun parsing is semantic input, not generic copy.
  "characters/content/nyra-initial-character-history.js",
  "characters/content/nyra-initial-world-book.js",
  "first-light/production-v2.js",
  "first-light/ui-v2.js",
  "first-light/ui.js",
  "life/fixtures/xingli-day-001.js",
  "memory/palace/kg.js",
  "memory/palace/search.js",
  "studio-assist/agent/intent-router.js",
  "turn-understanding/deterministic-fallback.js",
]);

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (/\.test\.m?js$/.test(entry.name)) return []; // Test-authored dialogue is not product copy.
    return entry.name.endsWith(".js") || entry.name.endsWith(".mjs") ? [path] : [];
  });
}

function isAuthoredOrSemantic(file) {
  const path = relative(srcRoot, file).replaceAll("\\", "/");
  return authoredOrSemanticFiles.has(path);
}

const neutralSources = [
  join(root, "index.html"),
  join(root, "overlay.html"),
  ...sourceFiles(srcRoot).filter((file) => !isAuthoredOrSemantic(file)),
];

const femaleChinese = neutralSources.flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return text.includes("她") ? [relative(root, file)] : [];
});
assert.deepEqual(
  femaleChinese,
  [],
  `generic product copy must use lowercase "ta", not 她: ${femaleChinese.join(", ")}`,
);

const englishCopy = [
  join(srcRoot, "i18n/locales/en.js"),
  join(srcRoot, "first-light/locales/en.js"),
  join(srcRoot, "chat/intro-note.js"),
  join(srcRoot, "first-light/presets.js"),
].flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return /\b(?:she|her|hers|herself)\b/i.test(text) ? [relative(root, file)] : [];
});
assert.deepEqual(
  englishCopy,
  [],
  `generic English product copy must use singular they/them: ${englishCopy.join(", ")}`,
);

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const authClient = readFileSync(join(srcRoot, "auth/client.js"), "utf8");
const onboarding = readFileSync(join(srcRoot, "onboarding/wizard.js"), "utf8");
const account = readFileSync(join(srcRoot, "account/account-controller.js"), "utf8");
const phoneScreens = readFileSync(join(srcRoot, "phone-shell/app-screens.js"), "utf8");
const phoneShell = readFileSync(join(srcRoot, "phone-shell/phone-shell.js"), "utf8");
const server = readFileSync(join(root, "server/index.mjs"), "utf8");

assert.equal(
  (indexHtml.match(/data-(?:onboard-)?auth-legal-consent/g) || []).length
    + (phoneScreens.match(/data-phone-auth-legal-consent/g) || []).length,
  3,
  "all three registration forms must show a legal-consent checkbox",
);
assert.equal(
  (indexHtml.match(/data-(?:onboard-)?auth-legal-consent/g) || []).length,
  2,
  "both App-shell registration forms must show a legal-consent checkbox",
);
assert.match(indexHtml, /https:\/\/azhimiao\.github\.io\/legal\/\?doc=terms/);
assert.match(indexHtml, /https:\/\/azhimiao\.github\.io\/legal\/\?doc=privacy/);
assert.match(authClient, /legalConsent/);
assert.match(onboarding, /data-onboard-auth-legal-consent/);
assert.match(account, /data-auth-legal-consent/);
assert.match(phoneShell, /data-phone-auth-legal-consent/);
assert.match(phoneShell, /sendRegisterCode/);
assert.match(server, /requireCurrentLegalConsent/);
assert.match(server, /legalConsents/);
assert.doesNotMatch(indexHtml, /不可逆哈希|one-way hash|防止批量注册|bulk sign-ups/);
assert.equal(
  (indexHtml.match(/data-(?:onboard-)?auth-type="(?:email|phone)"/g) || []).length,
  4,
  "onboarding and App account settings must each offer explicit email/phone auth",
);
assert.equal(
  (phoneScreens.match(/data-phone-auth-type="(?:email|phone)"/g) || []).length,
  2,
  "phone settings must offer explicit email/phone auth",
);
assert.match(authClient, /buildLoginRequestBody/);
assert.match(server, /authType === "email"/);
assert.match(server, /normalizePhone/);
assert.match(server, /Promise\.resolve\(true\)/);

const {
  CURRENT_LEGAL_VERSIONS,
  buildRegistrationLegalConsent,
  legalDocumentUrl,
  requireCurrentLegalConsent,
} = await import("../shared/legal-consent.mjs");
const {
  isAuthCredentialReady,
} = await import("../src/auth/form-credentials.js");

assert.deepEqual(CURRENT_LEGAL_VERSIONS, { terms: "0.2.0", privacy: "0.2.0" });
assert.equal(
  legalDocumentUrl("terms", "en"),
  "https://azhimiao.github.io/legal/?doc=terms&lang=en",
);
assert.equal(
  legalDocumentUrl("privacy", "zh-CN"),
  "https://azhimiao.github.io/legal/?doc=privacy&lang=zh-CN",
);
assert.throws(
  () => requireCurrentLegalConsent({ accepted: false }),
  (error) => error?.code === "legal_consent_required",
);
assert.throws(
  () => requireCurrentLegalConsent({
    accepted: true,
    termsVersion: "0.1.0",
    privacyVersion: "0.2.0",
  }),
  (error) => error?.code === "legal_consent_outdated",
);
assert.deepEqual(
  requireCurrentLegalConsent(buildRegistrationLegalConsent(true)),
  buildRegistrationLegalConsent(true),
);
assert.equal(isAuthCredentialReady({
  authType: "email",
  email: "person@example.com",
  password: "secret12",
}), true);
assert.equal(isAuthCredentialReady({
  authType: "phone",
  phone: "13800138000",
  password: "secret12",
}), true);
assert.equal(isAuthCredentialReady({
  authType: "phone",
  phone: "138",
  password: "secret12",
}), false);

console.log("verify-gender-neutral-legal: ok");
