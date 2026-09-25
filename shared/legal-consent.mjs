export const LEGAL_CENTER_URL = "https://azhimiao.github.io/legal/";

export const CURRENT_LEGAL_VERSIONS = Object.freeze({
  terms: "0.1.0",
  privacy: "0.1.0",
});

export function legalDocumentUrl(document, locale = "zh-CN") {
  const doc = document === "privacy" ? "privacy" : "terms";
  const lang = String(locale).toLowerCase().startsWith("en") ? "en" : "zh-CN";
  return `${LEGAL_CENTER_URL}?doc=${doc}&lang=${lang}`;
}

export function buildRegistrationLegalConsent(accepted) {
  return {
    accepted: accepted === true,
    termsVersion: CURRENT_LEGAL_VERSIONS.terms,
    privacyVersion: CURRENT_LEGAL_VERSIONS.privacy,
  };
}

function legalConsentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function requireCurrentLegalConsent(input) {
  if (input?.accepted !== true) {
    throw legalConsentError(
      "legal_consent_required",
      "注册前请阅读并同意用户协议和隐私政策。",
    );
  }
  if (
    input?.termsVersion !== CURRENT_LEGAL_VERSIONS.terms
    || input?.privacyVersion !== CURRENT_LEGAL_VERSIONS.privacy
  ) {
    throw legalConsentError("legal_consent_stale", "请重新阅读并同意最新的用户协议和隐私政策。");
  }
  return {
    accepted: true,
    termsVersion: CURRENT_LEGAL_VERSIONS.terms,
    privacyVersion: CURRENT_LEGAL_VERSIONS.privacy,
    acceptedAt: new Date().toISOString(),
  };
}
