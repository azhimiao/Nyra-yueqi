/**
 * Production executors for companion-owned operations invoked from chat.
 * The tool loop owns planning and receipts; this module only performs the
 * already-registered side effect with a frozen turn scope.
 */

import { requestCompanionDiary } from "../companion/diary-action.js";
import { fetchWeather } from "../status/weather.js";

function coordinateText(location) {
  const lat = Number(location?.lat ?? location?.latitude);
  const lon = Number(location?.lon ?? location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `${lat},${lon}`;
}

function isVagueLocation(value) {
  return /^(这里|此处|当地|当前位置|用户当前位置|我这里|我所在的位置|current location|here|local)$/i.test(
    String(value || "").trim(),
  );
}

export function createCompanionChatExecutors({
  companionId = "",
  characterProfile = {},
  sessionId = "",
  currentDailyStatus = null,
  sharedLocation = null,
  collectProviderConfig = () => ({}),
  getExistingFn,
  generateFn,
  saveFn,
} = {}) {
  const scopeCompanionId = String(companionId || "").trim();
  return {
    "web.weather.lookup": async (parameters = {}) => {
      const requested = parameters.location || parameters.city || parameters.query || "";
      const location = !requested || isVagueLocation(requested)
        ? coordinateText(sharedLocation)
        : (coordinateText(parameters) || String(requested).trim());
      const weather = await fetchWeather(location, "locate");
      if (weather?.available === false || weather?.condition === "unknown") {
        return {
          ok: false,
          reason: weather?.reason || "weather_unavailable",
          summary: weather?.reason === "location_required"
            ? "天气查询需要城市名或坐标；当前没有可用的位置证据，也不会自动读取设备定位。"
            : "没有获得可靠的天气结果；天气服务没有返回结果。",
          weather,
        };
      }
      return {
        ok: true,
        summary: weather?.label || weather?.condition || "天气结果已取得",
        weather,
      };
    },
    "companion.diary.create": async (parameters = {}) => {
      const result = await requestCompanionDiary({
        companionId: String(parameters.companionId || scopeCompanionId).trim(),
        characterProfile,
        sessionId,
        currentDailyStatus,
        diaryDay: String(parameters.diaryDay || "").trim() || undefined,
        overwrite: parameters.overwrite === true,
        collectProviderConfig,
        ...(typeof getExistingFn === "function" ? { getExistingFn } : {}),
        ...(typeof generateFn === "function" ? { generateFn } : {}),
        ...(typeof saveFn === "function" ? { saveFn } : {}),
      });

      if (!result?.ok) {
        return {
          ok: false,
          reason: result?.reason || "diary_not_created",
          message: result?.message || "日记没有写入档案。",
          summary: result?.message || "日记没有写入档案。",
          diaryDay: result?.diaryDay || "",
        };
      }

      // saveDiary already creates the Artifact and queues pop delivery.
      // Flush through the durable Conversation projection only — never inject
      // addMessage here, or the card appears twice (UI writer + projection).
      try {
        const { flushPopDeliveries } = await import("../artifacts/index.js");
        await flushPopDeliveries({
          companionId: result.companionId || scopeCompanionId,
        });
      } catch {
        // Delivery is best effort; the durable diary save and receipt remain
        // authoritative even when a shell is not mounted.
      }

      return {
        ok: true,
        summary: result.message || "日记已写入档案。",
        artifactId: result.artifactId || "",
        diaryId: result.diaryId || "",
        diaryDay: result.diaryDay || "",
        title: result.title || "",
        deepLink: result.deepLink || "",
      };
    },
  };
}
