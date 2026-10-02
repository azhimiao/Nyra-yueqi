/**
 * CP-16 — First-run onboarding persistence + user-facing error formatter.
 */

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  };
}

const storage = makeMemoryStorage();
globalThis.window = {
  localStorage: storage,
  dispatchEvent() {},
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.document = {
  documentElement: {
    lang: "zh-CN",
    dataset: {},
    classList: {
      _set: new Set(),
      add(name) {
        this._set.add(name);
      },
      remove(name) {
        this._set.delete(name);
      },
      contains(name) {
        return this._set.has(name);
      },
    },
  },
  head: {
    append() {},
    querySelector() {
      return null;
    },
  },
  createElement() {
    return {
      setAttribute() {},
      textContent: "",
    };
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  dispatchEvent() {},
};

const { LOCAL_KEYS } = await import("../../src/constants.js");
const {
  hasOnboardingDone,
  markOnboardingDone,
  resetOnboarding,
  readOnboarding,
  ACCOUNT_MODE_OFFLINE,
  ACCOUNT_MODE_ONLINE,
} = await import("../../src/onboarding/prefs.js");
const {
  redactSecrets,
  formatUserError,
  formatUserErrorFromReason,
  getExternalRequiredMessage,
} = await import("../../src/onboarding/errors.js");
const { hasLocaleChosen } = await import("../../src/i18n/index.js");

const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

console.log("=== CP-16 Cold start shows wizard ===");
{
  storage.clear();
  window.__yueqiEarlyLocale = "en";
  assert(!hasLocaleChosen(), "system/early locale is not an explicit user choice");
  assert(!hasOnboardingDone(), "empty prefs → wizard needed");
}

console.log("=== CP-16 Wizard completion persists ===");
{
  storage.setItem(
    LOCAL_KEYS.ecosystemKey,
    JSON.stringify({
      loggedIn: true,
      authMode: "online",
      token: "test-session-token",
      modelSource: "byok",
      billingBalance: 0,
    }),
  );
  storage.setItem("yueqi.app.mode", "app");
  storage.setItem("yueqi.app.mode.chosen", "1");
  markOnboardingDone({ uiModeChosen: true });
  const state = readOnboarding();
  assert(state.done === true, "done flag set");
  assert(state.accountMode === ACCOUNT_MODE_ONLINE, "account mode persisted");
  assert(state.productMode === undefined, "onboarding stores no commercial mode");
  assert(state.productModeChosen === undefined, "onboarding requires no commercial choice");
  assert(hasOnboardingDone(), "completed wizard skipped on relaunch");
}

console.log("=== CP-16 Reset re-opens wizard ===");
{
  resetOnboarding();
  const state = readOnboarding();
  assert(state.done === false, "reset clears done");
  assert(Boolean(state.resetAt), "resetAt recorded");
  assert(!hasOnboardingDone(), "reset prevents auto-migration skip");
  storage.setItem(
    LOCAL_KEYS.settingsKey,
    JSON.stringify({ locale: "zh-CN", localeChosen: true }),
  );
  assert(!hasOnboardingDone(), "locale chosen but resetAt blocks auto-done");
}

console.log("=== CP-16 Full reset signs out and forgets language ===");
{
  storage.clear();
  storage.setItem(
    LOCAL_KEYS.settingsKey,
    JSON.stringify({ locale: "zh-CN", localeChosen: true }),
  );
  storage.setItem(
    LOCAL_KEYS.ecosystemKey,
    JSON.stringify({ loggedIn: true, authMode: "online", token: "tok-1", username: "tester", modelSource: "byok", billingBalance: 42 }),
  );
  storage.setItem("yueqi.app.mode", "phone");
  storage.setItem("yueqi.app.mode.chosen", "1");
  markOnboardingDone();

  resetOnboarding({ signOut: true, forgetLocale: true });

  const ecosystem = JSON.parse(storage.getItem(LOCAL_KEYS.ecosystemKey));
  const settings = JSON.parse(storage.getItem(LOCAL_KEYS.settingsKey));
  assert(ecosystem.loggedIn === false && ecosystem.token === "", "full reset signs the device out");
  assert(ecosystem.authMode === "signed_out", "full reset leaves an explicit signed-out auth mode");
  assert(settings.localeChosen === undefined, "full reset forgets the language pick");
  assert(settings.locale === "zh-CN", "full reset keeps the active pack for display");
  assert(storage.getItem("yueqi.app.mode.chosen") === null, "full reset clears the shell choice");
  assert(!hasOnboardingDone(), "full reset reopens the wizard");
}

console.log("=== CP-16 Legacy locale alone does NOT skip wizard ===");
{
  storage.clear();
  storage.setItem(
    LOCAL_KEYS.settingsKey,
    JSON.stringify({ locale: "en", localeChosen: true }),
  );
  assert(!hasOnboardingDone(), "locale alone must not skip UI-mode step");
}

console.log("=== CP-16 Legacy locale + usage without UI choice does NOT skip on phone ===");
{
  storage.clear();
  storage.setItem(
    LOCAL_KEYS.settingsKey,
    JSON.stringify({ locale: "en", localeChosen: true }),
  );
  storage.setItem("yueqi.app.mode", "app");
  // Simulate compact shell (phone-class)
  document.documentElement.classList.add("is-compact-shell");
  assert(!hasOnboardingDone(), "stale app mode without chosen flag must not skip wizard");
  document.documentElement.classList.remove("is-compact-shell");
}

console.log("=== CP-16 Legacy locale + explicit UI choice still requires account ===");
{
  storage.clear();
  document.documentElement.classList.remove("is-compact-shell");
  storage.setItem(
    LOCAL_KEYS.settingsKey,
    JSON.stringify({ locale: "en", localeChosen: true }),
  );
  storage.setItem("yueqi.app.mode", "app");
  storage.setItem("yueqi.app.mode.chosen", "1");
  assert(!hasOnboardingDone(), "legacy local state cannot bypass the mandatory account step");
  assert(readOnboarding().migratedFromLocale !== true, "legacy onboarding is not auto-completed");
}

console.log("=== CP-16 Offline mode needs no fake cloud token ===");
{
  storage.clear();
  storage.setItem(
    LOCAL_KEYS.ecosystemKey,
    JSON.stringify({ loggedIn: false, authMode: "offline", token: "", modelSource: "byok" }),
  );
  storage.setItem("yueqi.app.mode", "app");
  storage.setItem("yueqi.app.mode.chosen", "1");
  markOnboardingDone({ accountMode: ACCOUNT_MODE_OFFLINE, uiModeChosen: true });
  assert(hasOnboardingDone(), "explicit offline auth mode completes account onboarding");
  const ecosystem = JSON.parse(storage.getItem(LOCAL_KEYS.ecosystemKey));
  assert(ecosystem.token === "", "offline mode does not mint a cloud token");
}

console.log("=== CP-16 Error formatter redacts secrets ===");
{
  const raw = "Request failed sk-live-secret-key-abcdef12\n    at Module.call (/src/x.js:12:3)";
  const safe = redactSecrets(raw);
  assert(!safe.includes("sk-live"), "API key redacted");
  assert(!safe.includes("Module.call"), "stack line stripped");
}

console.log("=== CP-16 Error formatter maps reasons ===");
{
  assert(
    formatUserErrorFromReason("grants_required", "zh-CN").includes("授权"),
    "grants_required → Chinese copy",
  );
  assert(
    formatUserErrorFromReason("cancelled", "zh-CN").includes("取消"),
    "cancelled → Chinese copy",
  );
  assert(
    formatUserErrorFromReason("EXTERNAL_BACKEND_REQUIRED", "zh-CN").includes("外部"),
    "external required → Chinese copy",
  );
  assert(
    formatUserErrorFromReason("grants_required", "en").toLowerCase().includes("grant"),
    "grants_required → English copy",
  );
  assert(
    formatUserErrorFromReason("invalid_code", "en").toLowerCase().includes("code"),
    "invalid_code → English copy",
  );
  assert(
    formatUserErrorFromReason("login_rate_limited", "zh-CN").includes("15"),
    "login_rate_limited → Chinese copy",
  );
  const err = new Error("network_fail");
  assert(
    formatUserError(err, { locale: "en" }).toLowerCase().includes("network"),
    "Error with reason code mapped",
  );
  const creds = new Error("手机号或密码错误。");
  creds.code = "invalid_credentials";
  const credsZh = formatUserError(creds, { locale: "zh-CN" });
  assert(credsZh.includes("密码"), "invalid_credentials keeps credential copy");
  assert(!credsZh.includes("登录失败"), "invalid_credentials is not generic 登录失败");
  assert(credsZh.includes("注册"), "invalid_credentials hints register");
  const net = new TypeError("Failed to fetch");
  assert(
    formatUserError(net, { locale: "zh-CN" }).includes("网络"),
    "Failed to fetch → network copy",
  );
}

console.log("=== CP-16 External required body i18n ===");
{
  const zh = getExternalRequiredMessage("zh-CN");
  assert(zh.includes("外部") && !zh.includes("sk-"), "zh external body safe");
  const en = getExternalRequiredMessage("en");
  assert(en.toLowerCase().includes("external"), "en external body");
}

console.log("=== CP-16 Backup import failure copy ===");
{
  const msg = formatUserError({ message: "invalid schema yueqi-companion-export" }, {
    locale: "zh-CN",
    fallbackKey: "errors.backupImportFail",
  });
  assert(msg.includes("备份") || msg.includes("schema"), "backup failure human-readable");
}

console.log("=== CP-16 Language choice is explicit and separate from continue ===");
{
  storage.clear();
  const { hasLocaleChosen, setLocale, clearLocaleChoice } = await import("../../src/i18n/index.js");
  assert(!hasLocaleChosen(), "fresh install has no localeChosen");
  setLocale("zh-CN", { chosen: false });
  assert(!hasLocaleChosen(), "display locale is not an onboarding choice");
  setLocale("zh-CN", { chosen: true });
  assert(hasLocaleChosen(), "explicit language pick sets localeChosen");
  clearLocaleChoice();
  assert(!hasLocaleChosen(), "clearing language choice restores the gate");
}

console.log("=== CP-16 Auth field contract ===");
{
  const {
    ONBOARD_STEPS,
    onboardProgressLabel,
    isOnboardAuthReady,
    onboardAuthFieldErrors,
  } = await import("../../src/onboarding/wizard.js");
  assert(ONBOARD_STEPS.join(">") === "language>account>ui", "onboarding excludes commercial mode selection");
  assert(onboardProgressLabel("language") === "1/3", "language progress reads wizard steps");
  assert(onboardProgressLabel("ui") === "3/3", "ui progress reads wizard steps");
  assert(!isOnboardAuthReady({ authType: "email", email: "", password: "secret12" }), "empty email is not ready");
  assert(!isOnboardAuthReady({ authType: "email", email: "a@b.co", password: "12345" }), "short password is not ready");
  assert(isOnboardAuthReady({ authType: "email", email: "a@b.co", password: "secret12" }), "email + 6-char password is ready");
  assert(isOnboardAuthReady({ authType: "phone", phone: "13800138000", password: "secret12" }), "phone + 6-char password is ready");
  const empty = onboardAuthFieldErrors({ authType: "email", email: "", password: "" });
  assert(empty.identifier === "onboard.authInvalidEmail", "email error is field-adjacent");
  assert(empty.password === "onboard.authInvalidPassword", "password error is field-adjacent");
  const short = onboardAuthFieldErrors({ authType: "email", email: "a@b.co", password: "123" });
  assert(!short.identifier && short.password === "onboard.authInvalidPassword", "short password stays on the password field");
  const badPhone = onboardAuthFieldErrors({ authType: "phone", phone: "123", password: "secret12" });
  assert(badPhone.identifier === "onboard.authInvalidPhone", "invalid phone stays on the identifier field");
}

if (failures.length) {
  console.error("\nCP-16 onboarding integration FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("\nCP-16 onboarding integration PASSED");
