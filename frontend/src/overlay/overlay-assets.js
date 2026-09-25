const OVERLAY_ASSET_HOST = "appassets.androidplatform.net";

/**
 * Sprite catalogs use origin-absolute `/assets/...` paths. That is correct in
 * the Capacitor app WebView (`https://localhost/assets/...`) and Vite, but the
 * Android overlay WebView is mounted at
 * `https://appassets.androidplatform.net/public/overlay.html`. A leading-slash
 * URL there leaves `/public/` and is blocked by the overlay allow-list.
 */
export function resolveOverlayAssetUrl(path, baseUri = "") {
  const raw = String(path || "").trim();
  if (!raw) return raw;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const base = String(baseUri || (typeof document !== "undefined" ? document.baseURI : "") || "");
  if (raw.startsWith("/") && base.toLowerCase().includes(OVERLAY_ASSET_HOST)) {
    return `https://${OVERLAY_ASSET_HOST}/public${raw}`;
  }
  return raw;
}
