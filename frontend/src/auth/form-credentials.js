export function normalizeAuthType(value) {
  return value === "phone" ? "phone" : "email";
}

export function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function isPhoneNumber(value) {
  const digits = String(value || "").replace(/[\s().-]/g, "");
  return /^\d{5,14}$/.test(digits);
}

export function isAuthCredentialReady({
  authType,
  email,
  phone,
  password,
} = {}) {
  const identifierReady = normalizeAuthType(authType) === "phone"
    ? isPhoneNumber(phone)
    : isEmailAddress(email);
  return identifierReady && String(password || "").length >= 6;
}

export function buildLoginRequestBody({
  authType = "email",
  identifier,
  username,
  email,
  countryCode,
  phone,
  password,
} = {}) {
  if (normalizeAuthType(authType) === "phone") {
    return { authType: "phone", countryCode, phone, password };
  }
  const id = String(identifier || email || username || "").trim();
  return { authType: "email", identifier: id, email: id, password };
}
