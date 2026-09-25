import { getSecret, removeSecret, setSecret } from "../platform/secure-store.js";
import { readNativeKvRaw, writeNativeKvRaw, isNativeKvReady } from "../platform/kv-store.js";

const SECRET_KEY = "viber.apiKey";
const PREFS_KEY = "yueqi.viber.prefs";
const LEGACY_LS = "yueqi.viber.prefs";

const DEFAULT_PREFS = Object.freeze({
  baseUrl: "",
  identity: "character",
  topicSlug: "local",
  enabled: false,
  forceOfflinePreview: true,
  personaVersion: "",
  useLocalProxy: true,
});

function parsePrefs(raw) {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    // 旧版默认 enabled:false 会锁死在本地 mock；仅 forceOfflinePreview 才离线
    const forceOfflinePreview = data.forceOfflinePreview === true;
    return {
      ...DEFAULT_PREFS,
      ...data,
      identity: data.identity === "all" || data.identity === "human" || data.identity === "agent"
        ? data.identity
        : "character",
      topicSlug: String(data.topicSlug || DEFAULT_PREFS.topicSlug).trim() || DEFAULT_PREFS.topicSlug,
      baseUrl: String(data.baseUrl || DEFAULT_PREFS.baseUrl).replace(/\/+$/, ""),
      personaVersion: String(data.personaVersion || ""),
      forceOfflinePreview,
      enabled: !forceOfflinePreview,
      useLocalProxy: data.useLocalProxy !== false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

async function readPrefsBlob() {
  if (isNativeKvReady()) {
    const raw = await readNativeKvRaw(PREFS_KEY);
    if (raw) return raw;
  }
  try {
    return window.localStorage.getItem(LEGACY_LS) || "";
  } catch {
    return "";
  }
}

async function writePrefsBlob(json) {
  if (isNativeKvReady()) {
    await writeNativeKvRaw(PREFS_KEY, json);
  }
  try {
    window.localStorage.setItem(LEGACY_LS, json);
  } catch {
    // ignore
  }
}

export async function loadViberCredentials() {
  const prefs = parsePrefs(await readPrefsBlob());
  const apiKey = (await getSecret(SECRET_KEY)) || "";
  return { ...prefs, apiKey };
}

export async function saveViberCredentials(input = {}) {
  const next = parsePrefs({
    ...(await loadViberCredentials()),
    ...input,
  });
  const apiKey = String(input.apiKey ?? next.apiKey ?? "").trim();
  delete next.apiKey;
  await writePrefsBlob(JSON.stringify(next));
  if (apiKey) await setSecret(SECRET_KEY, apiKey);
  else if (input.apiKey === "") await removeSecret(SECRET_KEY);
  return { ...next, apiKey };
}

export function isViberConfigured(creds) {
  if (creds?.forceOfflinePreview) return false;
  return Boolean(String(creds?.baseUrl || "").trim());
}

export function isViberWriteReady(creds) {
  return Boolean(
    isViberConfigured(creds)
    && String(creds?.apiKey || "").trim().startsWith("viber_sk_")
    && String(creds?.personaVersion || "").trim()
  );
}
