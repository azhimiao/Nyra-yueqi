import { isAutonomyCapabilityEnabled, assertAutonomyAllowed } from "../companion/autonomy-prefs.js";
import { appendActivity } from "../companion/activity-log.js";

let activeTimer = null;
let scheduleConfig = null;

function msUntilNextTime(timeValue = "23:00") {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const next = new Date();
  next.setHours(hours || 0, minutes || 0, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return Math.min(next.getTime() - Date.now(), 2147483647);
}

export function initDiarySchedule(config) {
  scheduleConfig = config;
  rescheduleDiary();
}

export function rescheduleDiary() {
  if (activeTimer) clearTimeout(activeTimer);
  activeTimer = null;
  if (!scheduleConfig) return;

  const settings = scheduleConfig.getSettings?.() || {};
  if (!settings.scheduleEnabled) return;
  if (!isAutonomyCapabilityEnabled("autoDiary")) return;
  if (!assertAutonomyAllowed("diary").ok) return;

  const delay = msUntilNextTime(settings.scheduleTime || "23:00");
  activeTimer = window.setTimeout(async () => {
    try {
      if (!isAutonomyCapabilityEnabled("autoDiary") || !assertAutonomyAllowed("diary").ok) return;
      const result = await scheduleConfig.runGenerate?.();
      if (result?.saved) {
        appendActivity({
          title: "定时生成了一篇日记",
          reason: "到达设定的日记时间",
          capability: "自动日记",
          resourcesRead: ["日记设置", "当日痕迹"],
          usedModel: true,
          costHint: "约 1 次模型调用",
          source: "diary_schedule",
        });
        scheduleConfig.onSaved?.(result);
      } else if (result?.error) {
        console.warn("[yueqi.diary] scheduled generate failed", result.error);
      }
    } catch (error) {
      console.error(error);
    } finally {
      rescheduleDiary();
    }
  }, delay);
}
