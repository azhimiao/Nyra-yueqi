import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { formatWeatherDisplay } from "./labels.js";

/** WMO code → condition id (labels localized at display time). */
const WEATHER_CODES = {
  0: { condition: "clear" },
  1: { condition: "clear" },
  2: { condition: "cloudy" },
  3: { condition: "overcast" },
  45: { condition: "fog" },
  48: { condition: "fog" },
  51: { condition: "drizzle" },
  53: { condition: "rain" },
  55: { condition: "rain" },
  61: { condition: "rain" },
  63: { condition: "rain" },
  65: { condition: "rain" },
  71: { condition: "snow" },
  80: { condition: "rain" },
  95: { condition: "storm" },
};

function normalizeWeatherMode(mode = "") {
  const raw = String(mode || "").trim();
  if (raw === "不读取天气" || raw === "off") return "off";
  if (raw === "手动天气" || raw === "manual") return "manual";
  return "locate";
}

function withDisplayLabel(weather) {
  if (!weather) return weather;
  return { ...weather, label: formatWeatherDisplay(weather) };
}

function parseCoords(location = "") {
  const match = String(location).match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function isVagueLocation(location = "") {
  return /^(用户当前位置|当前位置|这里|此处|当地|我这里|current location|here|local)$/i.test(
    String(location || "").trim(),
  );
}

/** Placeholder location strings must never become "where we are" in the prompt. */
export function isPlaceholderStatusLocation(location = "") {
  const text = String(location || "").trim();
  return !text || isVagueLocation(text) || /^(未读取|未知|not (available|set)|unknown)$/i.test(text);
}

const FACTORY_MANUAL_WEATHER = /^(雨\s*20°|rain\s*20°)$/i;

export function isUnsetManualWeather(label = "") {
  const text = String(label || "").trim();
  return !text || FACTORY_MANUAL_WEATHER.test(text);
}

/** Only weather that was actually read or typed this session counts as lived. */
export function isLivedDailyWeather(weather) {
  if (!weather || typeof weather !== "object") return false;
  if (weather.available === false) return false;
  const source = String(weather.source || "").toLowerCase();
  if (!source || source === "unavailable" || source === "off" || source.startsWith("fallback")) {
    return false;
  }
  const label = String(weather.label || "").trim();
  if (!label || label === "-" || /不可用|unavailable/i.test(label)) return false;
  if (source === "manual" && isUnsetManualWeather(label)) return false;
  return true;
}

function unavailableWeather(mode, reason) {
  const weather = withDisplayLabel({
    condition: "unknown",
    temp: "-",
    humidity: "-",
    source: "unavailable",
    available: false,
    reason,
    mode,
  });
  return { ...weather, label: "天气不可用" };
}

function readCache() {
  return readLocalObject(LOCAL_KEYS.weatherCacheKey, {});
}

function writeCache(entry) {
  writeLocalObject(LOCAL_KEYS.weatherCacheKey, entry);
}

export async function fetchWeather(location, mode, manualLabel = "") {
  const normalized = normalizeWeatherMode(mode);
  if (normalized === "off") {
    return withDisplayLabel({
      condition: "unknown",
      temp: "-",
      humidity: "-",
      source: "off",
      available: false,
      mode,
    });
  }

  if (normalized === "manual") {
    const label = String(manualLabel || "").trim();
    if (isUnsetManualWeather(label)) {
      return unavailableWeather(mode, "manual_weather_required");
    }
    const condition = /雨|rain/i.test(label)
      ? "rain"
      : /晴|clear/i.test(label)
        ? "clear"
        : "cloudy";
    return {
      label,
      condition,
      temp: "-",
      humidity: "-",
      source: "manual",
      available: true,
      mode,
    };
  }

  let coords = parseCoords(location);
  if (!coords) {
    const cached = readCache();
    if (
      cached?.weather
      && cached.location === location
      && cached.weather.available !== false
      && !String(cached.weather.source || "").startsWith("fallback")
      && Date.now() - cached.at < 3600000
    ) {
      return withDisplayLabel({ ...cached.weather, source: cached.weather.source || "cache", mode });
    }
    // A vague deictic is not a city and must never be silently converted into
    // a device-location permission request.  Explicit city names can use the
    // same provider's geocoding endpoint below.
    if (!String(location || "").trim() || isVagueLocation(location)) {
      return unavailableWeather(mode, "location_required");
    }
    try {
      const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geoUrl.searchParams.set("name", String(location).trim());
      geoUrl.searchParams.set("count", "1");
      geoUrl.searchParams.set("language", "zh");
      geoUrl.searchParams.set("format", "json");
      const geoResponse = await fetch(geoUrl);
      if (geoResponse.ok) {
        const geo = await geoResponse.json();
        const first = Array.isArray(geo?.results) ? geo.results[0] : null;
        const latitude = Number(first?.latitude);
        const longitude = Number(first?.longitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          coords = { latitude, longitude };
        }
      }
    } catch {
      // Fall through to the truthful unavailable state below.
    }
    if (!coords) return unavailableWeather(mode, "location_required");
  }

  const cacheKey = `${coords.latitude},${coords.longitude}`;
  const cached = readCache();
  if (
    cached?.key === cacheKey &&
    cached?.weather &&
    Date.now() - cached.at < 3600000
  ) {
    if (cached.weather.available === false || String(cached.weather.source || "").startsWith("fallback")) {
      return unavailableWeather(mode, "cached_weather_untrusted");
    }
    return withDisplayLabel({ ...cached.weather, source: "cache", mode, available: true });
  }

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(coords.latitude));
    url.searchParams.set("longitude", String(coords.longitude));
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code");
    url.searchParams.set("timezone", "auto");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`weather ${response.status}`);
    const payload = await response.json();
    const current = payload.current || {};
    const codeInfo = WEATHER_CODES[current.weather_code] || { condition: "cloudy" };
    const temp = Math.round(current.temperature_2m ?? 22);
    const weather = withDisplayLabel({
      condition: codeInfo.condition,
      temp,
      humidity: current.relative_humidity_2m ?? "-",
      source: "open-meteo",
      mode,
    });
    writeCache({ key: cacheKey, location, weather, at: Date.now() });
    return weather;
  } catch {
    return unavailableWeather(mode, "weather_provider_unavailable");
  }
}

export function toMinutes(value) {
  const [hours = "0", minutes = "0"] = String(value || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function isWithinSleepWindow(nowMinutes, sleepAt, wakeAt) {
  const sleepMinutes = toMinutes(sleepAt);
  const wakeMinutes = toMinutes(wakeAt);
  if (sleepMinutes > wakeMinutes) {
    return nowMinutes >= sleepMinutes || nowMinutes < wakeMinutes;
  }
  return nowMinutes >= sleepMinutes && nowMinutes < wakeMinutes;
}

export function estimateSleptHours(nowMinutes, sleepAt, wakeAt) {
  const sleepMinutes = toMinutes(sleepAt);
  let elapsed = nowMinutes - sleepMinutes;
  if (elapsed < 0) elapsed += 1440;
  const planned = (toMinutes(wakeAt) - sleepMinutes + 1440) % 1440;
  return Math.max(0, Math.min(planned || 450, elapsed) / 60);
}

export async function inferYesterdayTone(getAllMemories) {
  const memories = (await getAllMemories()).map((record) => record);
  const yesterdayCutoff = Date.now() - 36 * 60 * 60 * 1000;
  const recent = memories.filter((record) => new Date(record.createdAt).getTime() >= yesterdayCutoff);
  if (!recent.length) return "";
  const text = recent.map((record) => record.rawText).join(" ");
  if (/难过|睡不着|忽略|怕|累|崩|哭/.test(text)) return "牵挂";
  if (/开心|喜欢|约|一起|安心|谢谢/.test(text)) return "温和";
  if (/边界|现实|忙|工作|学习/.test(text)) return "克制";
  return "";
}
