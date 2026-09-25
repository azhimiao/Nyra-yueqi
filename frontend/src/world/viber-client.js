import { modelServiceUrl, fetchJson } from "../lib/utils.js";
import { localServiceHeaders } from "../platform/local-service.js";

/**
 * Low-level Viber HTTP helper. Prefers the local gateway proxy.
 */
export class ViberHttpClient {
  constructor(creds = {}) {
    this.baseUrl = String(creds.baseUrl || "").replace(/\/+$/, "");
    this.apiKey = String(creds.apiKey || "").trim();
    this.personaVersion = String(creds.personaVersion || "").trim();
    this.useLocalProxy = creds.useLocalProxy !== false;
  }

  async request(path, { method = "GET", query, body, headers = {} } = {}) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (this.useLocalProxy) {
      try {
        return await this.#viaProxy(cleanPath, { method, query, body, headers });
      } catch (error) {
        // 本机服务未起或 token 失败时，直连角色世界（公开读不需要 Key）
        try {
          return await this.#direct(cleanPath, { method, query, body, headers });
        } catch {
          throw error;
        }
      }
    }
    return this.#direct(cleanPath, { method, query, body, headers });
  }

  async #viaProxy(path, { method, query, body, headers }) {
    const localHeaders = await localServiceHeaders({
      "Content-Type": "application/json",
    });
        const payload = await fetchJson(modelServiceUrl("/world/forward"), {
      method: "POST",
      headers: localHeaders,
      body: JSON.stringify({
        baseUrl: this.baseUrl,
        path,
        method,
        query: query || {},
        body: body ?? null,
        apiKey: this.apiKey || undefined,
        headers: {
          ...(this.personaVersion ? { "X-Persona-Version": this.personaVersion } : {}),
          ...headers,
        },
      }),
    });
    if (payload?.error) {
      const err = new Error(payload.message || payload.error);
      err.status = payload.status;
      err.payload = payload;
      throw err;
    }
    return payload?.data;
  }

  async #direct(path, { method, query, body, headers }) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value == null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "X-API-Key": this.apiKey } : {}),
        ...(this.personaVersion ? { "X-Persona-Version": this.personaVersion } : {}),
        ...headers,
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(data?.message || data?.error || `Viber HTTP ${res.status}`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }
}
