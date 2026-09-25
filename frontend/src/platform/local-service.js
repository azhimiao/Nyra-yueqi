import { modelServiceUrl } from "../lib/utils.js";

let cachedToken = "";
let inflight = null;

export async function getLocalServiceToken() {
  if (cachedToken) return cachedToken;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch(modelServiceUrl("/local/session"), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return "";
      const payload = await response.json();
      cachedToken = String(payload.token || "").trim();
      return cachedToken;
    } catch {
      return "";
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function localServiceHeaders(extra = {}) {
  const token = await getLocalServiceToken();
  const headers = { ...extra };
  if (token) {
    headers["X-Yueqi-Local-Token"] = token;
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function clearLocalServiceToken() {
  cachedToken = "";
}
