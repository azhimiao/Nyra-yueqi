import { modelServiceUrl, safeFetch } from "../lib/utils.js";
import { buildRegistrationLegalConsent } from "../../../shared/legal-consent.mjs";
import { buildLoginRequestBody } from "./form-credentials.js";
import { getRegistrationDevice } from "./device-registration.js";

const SERVICE_BASE_KEY = "yueqi.serviceBase";

export function getServiceBase() {
  const runtime = typeof window !== "undefined"
    ? String(window.localStorage?.getItem(SERVICE_BASE_KEY) || "").trim()
    : "";
  const build = String(import.meta.env?.VITE_YUEQI_SERVICE_BASE || "").trim();
  return (runtime || build || "http://127.0.0.1:8787").replace(/\/+$/, "");
}

export function setServiceBase(url) {
  const next = String(url || "").trim().replace(/\/+$/, "");
  if (!next) {
    window.localStorage.removeItem(SERVICE_BASE_KEY);
    return getServiceBase();
  }
  window.localStorage.setItem(SERVICE_BASE_KEY, next);
  return next;
}

async function authRequest(path, body) {
  const response = await fetch(modelServiceUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `${response.status} ${response.statusText}`);
    error.code = payload?.error || "";
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function accountRequest(path, { token, method = "GET", body } = {}) {
  const response = await fetch(modelServiceUrl(path), {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function sendRegisterCode(email) {
  return authRequest("/auth/register/send-code", {
    email,
    device: await getRegistrationDevice(),
  });
}

export async function registerAccount({
  authType = "email",
  username,
  email,
  countryCode,
  phone,
  code,
  password,
  invitationCode,
  legalConsent,
}) {
  return authRequest("/auth/register", {
    authType: authType === "phone" ? "phone" : "email",
    ...(username ? { username } : {}),
    ...(authType === "phone"
      ? { countryCode, phone }
      : { email, code }),
    password,
    invitationCode: String(invitationCode || "").trim(),
    legalConsent: buildRegistrationLegalConsent(legalConsent === true),
    device: await getRegistrationDevice(),
  });
}

export async function loginAccount(form) {
  return authRequest("/auth/login", buildLoginRequestBody(form));
}

export async function logoutAccountSession(token) {
  if (!token) return { ok: true };
  return accountRequest("/auth/logout", { token, method: "POST" });
}

export async function fetchAccountMe(token) {
  if (!token || String(token).startsWith("local-")) return null;
  return safeFetch(modelServiceUrl("/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchProductAccess(token) {
  return accountRequest("/account/product-access", { token });
}

export async function selectProductMode(token, mode, extra = {}) {
  return accountRequest("/account/product-access", {
    token,
    method: "PUT",
    body: {
      ...(mode ? { mode } : {}),
      ...extra,
    },
  });
}
