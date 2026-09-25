/**
 * 栖市可选云目录（F7 H1）— 默认关；失败降级空列表
 */

import { loadGatePrefs } from "../gate/gate-prefs.js";
import { validateManifest } from "../phone-ext/manifest-schema.js";

/**
 * @returns {Promise<{ ok: boolean, items: object[], message?: string }>}
 */
export async function fetchCloudCatalog() {
  const prefs = loadGatePrefs();
  if (!prefs.cloudCatalogEnabled) {
    return { ok: true, items: [], message: "发现目录已关闭" };
  }
  const endpoint = String(prefs.cloudCatalogEndpoint || "").trim();
  if (!endpoint) {
    return { ok: true, items: [], message: "未配置目录地址" };
  }
  try {
    const res = await fetch(endpoint, { method: "GET" });
    if (!res.ok) {
      return { ok: false, items: [], message: "目录暂时不可用" };
    }
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    const items = [];
    for (const row of rows) {
      const validated = validateManifest(row?.manifest || row);
      if (!validated.ok) continue;
      items.push({
        manifest: validated.manifest,
        coverUrl: row.coverUrl || "",
        summary: row.summary || validated.manifest.description || "",
      });
    }
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], message: "目录暂时不可用" };
  }
}
