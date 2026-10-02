/**
 * Localized labels for daily status / weather / life mood (UI layer).
 * Internal status values may stay Chinese or English ids; display always goes through t().
 */

import { t, getLocale } from "../i18n/index.js";
import { toPackLocale } from "../i18n/language-prefs.js";

const MOOD_KEYS = Object.freeze({
  浅眠: "status.mood.lightSleep",
  惦记: "status.mood.missing",
  安静: "status.mood.quiet",
  清醒: "status.mood.alert",
  平静: "status.mood.calm",
  light_sleep: "status.mood.lightSleep",
  missing: "status.mood.missing",
  quiet: "status.mood.quiet",
  alert: "status.mood.alert",
  calm: "status.mood.calm",
});

const TONE_KEYS = Object.freeze({
  牵挂: "status.tone.caring",
  温和: "status.tone.gentle",
  克制: "status.tone.restrained",
  平静: "status.tone.calm",
  caring: "status.tone.caring",
  gentle: "status.tone.gentle",
  restrained: "status.tone.restrained",
  calm: "status.tone.calm",
});

const WEATHER_CONDITION_KEYS = Object.freeze({
  clear: "weather.condition.clear",
  cloudy: "weather.condition.cloudy",
  overcast: "weather.condition.overcast",
  fog: "weather.condition.fog",
  rain: "weather.condition.rain",
  drizzle: "weather.condition.drizzle",
  snow: "weather.condition.snow",
  storm: "weather.condition.storm",
  unknown: "weather.condition.unknown",
});

const LIFE_MOOD_KEYS = Object.freeze({
  calm: "companion.mood.calm",
  warm: "companion.mood.warm",
  playful: "companion.mood.playful",
  pensive: "companion.mood.pensive",
  tired: "companion.mood.tired",
});

export function labelMood(mood, locale = getLocale()) {
  const key = MOOD_KEYS[String(mood || "").trim()] || MOOD_KEYS.平静;
  return t(key, locale);
}

export function labelTone(tone, locale = getLocale()) {
  const key = TONE_KEYS[String(tone || "").trim()] || TONE_KEYS.平静;
  return t(key, locale);
}

export function labelLifeMood(mood, locale = getLocale()) {
  const key = LIFE_MOOD_KEYS[String(mood || "").trim()] || LIFE_MOOD_KEYS.calm;
  return t(key, locale);
}

export function labelWeatherCondition(condition, locale = getLocale()) {
  const key = WEATHER_CONDITION_KEYS[String(condition || "").trim()] || WEATHER_CONDITION_KEYS.unknown;
  return t(key, locale);
}

/**
 * @param {object|null} weather
 * @param {string} [locale]
 */
export function formatWeatherDisplay(weather, locale = getLocale()) {
  if (!weather) return "";
  if (weather.available === false) return "";
  const source = String(weather.source || "");
  const mode = String(weather.mode || "");
  if (source === "unavailable" || source.startsWith("fallback")) return "";
  if (source === "off" || mode === "不读取天气" || mode === "off") {
    return t("weather.off", locale);
  }
  if (source === "manual" || mode === "手动天气" || mode === "manual") {
    const manual = String(weather.label || "").trim();
    return manual || labelWeatherCondition("cloudy", locale);
  }
  const name = labelWeatherCondition(weather.condition || "cloudy", locale);
  const temp = weather.temp;
  if (temp != null && temp !== "" && temp !== "-") return `${name} ${temp}°`;
  // Legacy Chinese label fallback when condition missing
  if (weather.label && toPackLocale(locale) === "zh-CN") return String(weather.label);
  return name;
}

export function formatSleepDisplay(status, locale = getLocale()) {
  const hours = status?.sleepHours ?? "?";
  if (status?.asleep) return t("status.sleep.asleepHours", locale, { hours });
  return t("status.sleep.awakeHours", locale, { hours });
}

export function formatAwakeState(asleep, locale = getLocale()) {
  return asleep ? t("status.sleep.sleeping", locale) : t("status.sleep.awake", locale);
}
