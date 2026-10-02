const SNOOZE_KEY = "yueqi.update.optional.snoozedVersion.v1";

export function readSnoozedOptionalVersion() {
  try {
    return String(globalThis.localStorage?.getItem(SNOOZE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function snoozeOptionalUpdate(version) {
  const value = String(version || "").trim();
  if (!value) return;
  try {
    globalThis.localStorage?.setItem(SNOOZE_KEY, value);
  } catch {
    // Ignore storage failures; the dialog can still be closed for this session.
  }
}

export function shouldPromptUpdate(policy, { force = false } = {}) {
  if (!policy || policy.kind === "none" || policy.kind === "invalid") return false;
  if (policy.kind === "forced") return true;
  if (force) return true;
  return readSnoozedOptionalVersion() !== policy.latestVersion;
}
