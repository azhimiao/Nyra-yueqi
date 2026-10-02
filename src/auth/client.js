/** Open-source tree: cloud register, login, and account sync are removed. */

export function getServiceBase() {
  return "";
}

export function setServiceBase() {
  return "";
}

export async function sendRegisterCode() {
  throw new Error("This open-source build has no cloud account.");
}

export async function registerAccount() {
  throw new Error("This open-source build has no cloud account.");
}

export async function loginAccount() {
  throw new Error("This open-source build has no cloud account.");
}

export async function logoutAccountSession() {
  return { ok: true };
}

export async function fetchAccountMe() {
  return { ok: false, error: "offline" };
}

export async function fetchProductAccess() {
  return { ok: true, modelSource: "byok", authMode: "offline", loggedIn: false };
}

export async function selectProductMode() {
  return { ok: true, modelSource: "byok", authMode: "offline" };
}
