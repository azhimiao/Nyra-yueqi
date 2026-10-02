/**
 * Share current location into chat (geolocation + reverse geocode).
 */

import { reverseGeocode } from "../integrations/geocode.js";
import { ensurePermission } from "../platform/permissions.js";
import { t } from "../i18n/index.js";
import { formatLocationText } from "./token-compose.js";

const GEO_TIMEOUT_MS = 6000;

function readCoords() {
  if (!("geolocation" in navigator)) {
    return Promise.reject(new Error(t("shared.location.unsupported")));
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return Promise.reject(new Error(t("shared.location.secureContextRequired")));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: GEO_TIMEOUT_MS,
      maximumAge: 120000,
    });
  });
}

function deniedLocationResult(detail) {
  const title = t("shared.location.current");
  const subtitle = detail;
  return {
    ok: false,
    title,
    subtitle,
    text: formatLocationText(title, subtitle),
    metadata: {
      kind: "location",
      mediaType: "location",
      location: { title, subtitle },
    },
    error: detail,
  };
}

/**
 * @returns {Promise<{
 *   title: string,
 *   subtitle: string,
 *   text: string,
 *   lat?: number,
 *   lon?: number,
 *   metadata: object,
 *   ok: boolean,
 *   error?: string,
 * }>}
 */
export async function captureShareLocation() {
  try {
    // Ask at the moment the user shares location — not from the permission center.
    const permission = await ensurePermission("location.current");
    if (!permission.ok) {
      return deniedLocationResult(
        permission.message || t("shared.location.permissionDenied"),
      );
    }
    const position = await readCoords();
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    // Never block send on reverse-geocode (often hangs behind firewalls).
    const geo = await reverseGeocode(lat, lon);
    const title = String(geo.label || t("shared.location.current")).trim()
      || t("shared.location.current");
    const subtitle = String(geo.raw || `${lat.toFixed(4)}, ${lon.toFixed(4)}`).trim();
    return {
      ok: true,
      title,
      subtitle,
      lat,
      lon,
      text: formatLocationText(title, subtitle),
      metadata: {
        kind: "location",
        mediaType: "location",
        location: { title, subtitle, lat, lon },
      },
    };
  } catch (error) {
    const code = error?.code;
    let detail = String(error?.message || t("shared.location.failed"));
    if (code === 1) detail = t("shared.location.permissionDenied");
    else if (code === 2) detail = t("shared.location.unavailable");
    else if (code === 3) detail = t("shared.location.timeout");
    return deniedLocationResult(detail);
  }
}

/** Parse `[位置] 标题 - 副标题` or metadata.location */
export function parseLocationMessage(text = "", metadata = {}) {
  const meta = metadata?.location && typeof metadata.location === "object"
    ? metadata.location
    : null;
  if (meta || metadata?.kind === "location" || metadata?.mediaType === "location") {
    const title = String(meta?.title || t("shared.location.current")).trim()
      || t("shared.location.current");
    const subtitle = String(meta?.subtitle || "").trim();
    return {
      ok: true,
      title,
      subtitle,
      lat: Number(meta?.lat),
      lon: Number(meta?.lon),
    };
  }
  const raw = String(text || "").trim();
  const match = raw.match(/^\[位置\]\s*(.+?)(?:\s+-\s+(.+))?$/);
  if (!match) return { ok: false };
  const subtitle = String(match[2] || "").trim();
  const coords = subtitle.match(/(-?\d+(?:\.\d+)?)[,，\s]+(-?\d+(?:\.\d+)?)/)
    || raw.match(/(-?\d+(?:\.\d+)?)[,，\s]+(-?\d+(?:\.\d+)?)/);
  return {
    ok: true,
    title: String(match[1] || t("shared.location.current")).trim()
      || t("shared.location.current"),
    subtitle,
    lat: coords ? Number(coords[1]) : NaN,
    lon: coords ? Number(coords[2]) : NaN,
  };
}

export function renderLocationCardHtml(location = {}) {
  const title = String(location.title || t("shared.location.current")).trim()
    || t("shared.location.current");
  const subtitle = String(location.subtitle || "").trim();
  const esc = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `
    <div class="message-location" role="group" aria-label="${esc(t("shared.location.cardAria", { title }))}">
      <span class="message-location__pin" aria-hidden="true"><i data-lucide="map-pin"></i></span>
      <div class="message-location__body">
        <strong>${esc(title)}</strong>
        ${subtitle ? `<span>${esc(subtitle)}</span>` : ""}
      </div>
    </div>`;
}
