const cache = new Map();

const GEOCODE_TIMEOUT_MS = 2500;

/**
 * Reverse-geocode with a hard timeout. Nominatim is often slow or blocked;
 * callers must not hang the share-location send path on this.
 */
export async function reverseGeocode(latitude, longitude) {
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  const fallback = {
    label: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    raw: "",
  };

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort?.(), GEOCODE_TIMEOUT_MS);

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "json");
    url.searchParams.set("accept-language", "zh");

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    });
    if (!response.ok) throw new Error(`geocode ${response.status}`);
    const payload = await response.json();
    const address = payload.address || {};
    const label =
      address.city ||
      address.town ||
      address.village ||
      address.county ||
      address.state ||
      payload.display_name?.split(",")[0] ||
      fallback.label;
    const result = { label, raw: payload.display_name || label };
    cache.set(key, result);
    return result;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export function parseCoordinates(location = "") {
  const match = String(location).match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}
