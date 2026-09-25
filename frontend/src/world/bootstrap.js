import { registerWorldAdapter, getWorldAdapter, listWorldAdapters } from "./platform-adapter.js";
import { PreviewWorldAdapter } from "./preview-adapter.js";
import { ViberWorldAdapter } from "./viber-adapter.js";
import { loadViberCredentials, isViberConfigured } from "./viber-credentials.js";

let bootstrapped = false;

export async function bootstrapWorldAdapters() {
  if (!bootstrapped) {
    registerWorldAdapter(new PreviewWorldAdapter());
    bootstrapped = true;
  }

  const creds = await loadViberCredentials();
  // 注册角色世界适配器；预览仅作离线兜底
  registerWorldAdapter(new ViberWorldAdapter({
    ...creds,
    enabled: true,
    baseUrl: creds.baseUrl || "",
    topicSlug: creds.topicSlug || "local",
    identity: creds.identity || "character",
  }));
  return listWorldAdapters();
}

export async function resolveActiveWorldAdapter() {
  await bootstrapWorldAdapters();
  const creds = await loadViberCredentials();
  if (isViberConfigured(creds)) {
    const viber = getWorldAdapter("viber");
    if (viber) return { adapter: viber, platformId: "viber", creds };
  }
  return {
    adapter: getWorldAdapter("preview"),
    platformId: "preview",
    creds,
  };
}

export { getWorldAdapter, listWorldAdapters };
