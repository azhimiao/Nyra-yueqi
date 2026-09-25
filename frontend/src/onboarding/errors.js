import { t, getLocale } from "../i18n/index.js";

/** Patterns stripped from user-visible copy (API keys, tokens, stack traces). */
const SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{8,}\b/gi,
  /\bBearer\s+[a-zA-Z0-9._-]{10,}\b/gi,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}\]]+/gi,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
];

const STACK_LINE = /^\s*at\s+.+\(.+\)\s*$/m;

/** Machine reason / code → i18n key */
const REASON_I18N = Object.freeze({
  no_api_key: "errors.noApiKey",
  model_unavailable: "errors.modelUnavailable",
  model_client_unavailable: "errors.modelUnavailable",
  network_fail: "errors.networkFail",
  network_error: "errors.networkFail",
  external_required: "errors.externalRequired",
  EXTERNAL_BACKEND_REQUIRED: "errors.externalRequired",
  agent_cancelled: "errors.agentCancelled",
  cancelled: "errors.agentCancelled",
  canceled: "errors.agentCancelled",
  grants_required: "errors.grantsRequired",
  invalid_backup: "errors.backupImportFail",
  backup_import_fail: "errors.backupImportFail",
  import_fail: "errors.backupImportFail",
  invalid_password: "onboard.authInvalidPassword",
  invalid_username: "onboard.authNeedFields",
  invalid_email: "onboard.authInvalidEmail",
  invalid_phone: "onboard.authInvalidPhone",
  invalid_code: "onboard.authInvalidCode",
  missing_credentials: "onboard.authNeedFields",
  invalid_credentials: "onboard.authWrongCredentials",
  email_exists: "onboard.authEmailExists",
  phone_exists: "onboard.authPhoneExists",
  legal_consent_required: "onboard.authNeedLegalConsent",
  legal_consent_outdated: "onboard.authLegalOutdated",
  device_id_required: "onboard.authDeviceRequired",
  device_account_limit: "onboard.authDeviceLimit",
  otp_rate_limited: "onboard.authOtpRateLimited",
  login_rate_limited: "onboard.authLoginRateLimited",
});

/** Legacy Chinese API copy → i18n keys (server may still emit zh). */
const LEGACY_ZH_MESSAGE_I18N = Object.freeze({
  "密码至少 6 位。": "onboard.authInvalidPassword",
  "密码至少 6 位": "onboard.authInvalidPassword",
  "请填写用户名和密码": "onboard.authNeedUsernamePassword",
  "请填写账号，密码至少 6 位": "onboard.authNeedFields",
  "请填写用户名，密码至少 6 位": "onboard.authNeedFields",
  "登录失败": "onboard.authFailed",
  "手机号或密码错误。": "onboard.authWrongPhone",
  "手机号或密码错误": "onboard.authWrongPhone",
  "邮箱或密码错误。": "onboard.authWrongEmail",
  "邮箱或密码错误": "onboard.authWrongEmail",
});

function isNetworkFailure(input) {
  if (input == null) return false;
  const name = typeof input === "object" ? String(input.name || "") : "";
  const text = typeof input === "string"
    ? input
    : String(input.message || input.code || "");
  return name === "NetworkError"
    || /failed to fetch|networkerror|load failed|network request failed/i.test(text);
}

function formatInvalidCredentials(input, locale) {
  const msg = String(input?.message || input || "").trim();
  if (msg.includes("手机号") || /phone number/i.test(msg)) {
    return t("onboard.authWrongPhone", locale);
  }
  if (msg.includes("邮箱") || /e-?mail/i.test(msg)) {
    return t("onboard.authWrongEmail", locale);
  }
  return t("onboard.authWrongCredentials", locale);
}

/**
 * Remove secrets and stack-trace lines from free-form text.
 * @param {string} text
 * @returns {string}
 */
export function redactSecrets(text) {
  let out = String(text || "");
  const redactedLabel = getLocale() === "en" ? "[redacted]" : "[已隐藏]";
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, redactedLabel);
  }
  out = out
    .split("\n")
    .filter((line) => !STACK_LINE.test(line) && !/^\s*Error:\s/.test(line.trim()))
    .join("\n")
    .trim();
  if (out.length > 240) out = `${out.slice(0, 237)}…`;
  return out;
}

/** Safe copy for toasts / inline hints — strips secrets, truncates. */
export function safeUserFacingText(input, maxLen = 240) {
  const redacted = redactSecrets(String(input ?? ""));
  if (!redacted) return "";
  if (redacted.length > maxLen) return `${redacted.slice(0, maxLen - 1)}…`;
  return redacted;
}

/**
 * Resolve a machine reason to localized copy.
 * @param {string} reason
 * @param {string} [locale]
 */
export function formatUserErrorFromReason(reason, locale = getLocale()) {
  const key = REASON_I18N[String(reason || "").trim()];
  if (key) return t(key, locale);
  const redacted = redactSecrets(reason);
  return redacted || t("errors.generic", locale);
}

/**
 * Shape any thrown value into safe, localized user copy.
 * @param {unknown} input
 * @param {{ locale?: string, fallbackKey?: string, reason?: string }} [opts]
 */
export function formatUserError(input, opts = {}) {
  const locale = opts.locale || getLocale();
  const fallbackKey = opts.fallbackKey || "errors.generic";

  if (opts.reason) {
    if (opts.reason === "invalid_credentials") return formatInvalidCredentials(input, locale);
    return formatUserErrorFromReason(opts.reason, locale);
  }

  if (input == null || input === "") {
    return t(fallbackKey, locale);
  }

  if (isNetworkFailure(input)) {
    return t("errors.networkFail", locale);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "invalid_credentials") return formatInvalidCredentials(trimmed, locale);
    if (REASON_I18N[trimmed]) return formatUserErrorFromReason(trimmed, locale);
    if (LEGACY_ZH_MESSAGE_I18N[trimmed]) return t(LEGACY_ZH_MESSAGE_I18N[trimmed], locale);
    const redacted = redactSecrets(trimmed);
    if (!redacted) return t(fallbackKey, locale);
    if (/^errors\./.test(trimmed) || /^onboard\./.test(trimmed) || /^alerts\./.test(trimmed)) {
      return t(trimmed, locale);
    }
    // English UI must not surface leftover Chinese API/UI strings.
    if (locale === "en" && /[\u4e00-\u9fff]/.test(redacted)) {
      return t(fallbackKey, locale);
    }
    return redacted;
  }

  const obj = /** @type {{ code?: string, reason?: string, message?: string, error?: string }} */ (input);
  const code = String(obj.code || obj.reason || obj.error || "").trim();
  if (code === "invalid_credentials") {
    return formatInvalidCredentials(obj, locale);
  }
  if (code && REASON_I18N[code]) {
    return formatUserErrorFromReason(code, locale);
  }

  const msg = redactSecrets(String(obj.message || ""));
  if (msg && LEGACY_ZH_MESSAGE_I18N[msg]) return t(LEGACY_ZH_MESSAGE_I18N[msg], locale);
  if (msg && REASON_I18N[msg]) return formatUserErrorFromReason(msg, locale);
  if (msg && locale === "en" && /[\u4e00-\u9fff]/.test(msg)) {
    return t(fallbackKey, locale);
  }
  if (msg) return msg;
  return t(fallbackKey, locale);
}

/** User-facing External Required (BYOK / mobile runtime) body copy. */
export function getExternalRequiredMessage(locale = getLocale()) {
  return t("errors.externalRequiredBody", locale);
}
