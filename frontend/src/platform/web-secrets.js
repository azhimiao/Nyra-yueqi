/**
 * Browser-only secret stash. Uses sessionStorage so keys do not persist across
 * browser sessions the way localStorage does. Native uses NativeSecureStore
 * (Keystore / Keychain) via secure-store, with Preferences as fallback.
 */

const PREFIX = "yueqi.web-secret.";

export function setWebSecret(key, value) {
  try {
    if (!value) {
      window.sessionStorage.removeItem(`${PREFIX}${key}`);
      return;
    }
    window.sessionStorage.setItem(`${PREFIX}${key}`, value);
  } catch {
    // private mode / quota — ignore
  }
}

export function getWebSecret(key) {
  try {
    return window.sessionStorage.getItem(`${PREFIX}${key}`) || "";
  } catch {
    return "";
  }
}

export function removeWebSecret(key) {
  try {
    window.sessionStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // ignore
  }
}
