import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativePlatform } from "./runtime.js";
import { getBrandName, t } from "../i18n/index.js";
import { buildLanguageContext } from "../i18n/language-context.js";
import { toPackLocale } from "../i18n/language-prefs.js";

const NOTIFICATION_ID_SEQ_KEY = "yueqi.notification.id.seq.v1";
const NOTIFICATION_ID_MAP_KEY = "yueqi.notification.id.map.v1";
const COMPANION_MESSAGE_CHANNEL = "yueqi_companion_messages";
const AGENT_TASK_CHANNEL = "yueqi_agent_tasks";
let channelsReady;

async function ensureNotificationChannels() {
  if (!isNativePlatform()) return;
  if (!channelsReady) {
    channelsReady = Promise.all([
      LocalNotifications.createChannel({
        id: COMPANION_MESSAGE_CHANNEL,
        name: "陪伴消息",
        description: "角色主动消息与日程提醒",
        importance: 3,
        visibility: 1,
      }),
      LocalNotifications.createChannel({
        id: AGENT_TASK_CHANNEL,
        name: "助手任务",
        description: "受控 Agent 任务进度与审批",
        importance: 3,
        visibility: 1,
      }),
    ]).catch((error) => {
      channelsReady = null;
      throw error;
    });
  }
  await channelsReady;
}

function readNotificationIdSeq() {
  try {
    const n = parseInt(localStorage.getItem(NOTIFICATION_ID_SEQ_KEY) || "1000", 10);
    return Number.isFinite(n) && n >= 1000 ? n : 1000;
  } catch {
    return 1000;
  }
}

function persistNotificationIdSeq(next) {
  try {
    localStorage.setItem(NOTIFICATION_ID_SEQ_KEY, String(next));
  } catch {
    /* ignore */
  }
}

function readNotificationIdMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFICATION_ID_MAP_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeNotificationIdMap(map) {
  try {
    localStorage.setItem(NOTIFICATION_ID_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Stable per-delivery notification id (DEL-10); monotonic seq persisted across boots.
 * @param {string} [deliveryId]
 */
export function allocateNotificationId(deliveryId = "") {
  const key = String(deliveryId || "").trim();
  if (key) {
    const map = readNotificationIdMap();
    if (map[key]) return map[key];
    const id = readNotificationIdSeq();
    map[key] = id;
    writeNotificationIdMap(map);
    persistNotificationIdSeq(id + 1);
    return id;
  }
  const id = readNotificationIdSeq();
  persistNotificationIdSeq(id + 1);
  return id;
}

export function __resetNotificationIdsForTests() {
  try {
    localStorage.removeItem(NOTIFICATION_ID_SEQ_KEY);
    localStorage.removeItem(NOTIFICATION_ID_MAP_KEY);
  } catch {
    /* ignore */
  }
}

function notificationShellTitle(overrideTitle) {
  if (overrideTitle) return String(overrideTitle);
  const lang = buildLanguageContext();
  const brand = getBrandName(toPackLocale(lang.appLocale));
  return lang.appLocale === "en-US"
    ? `New message from ${brand}`
    : `${brand}有一条新消息`;
}

export async function requestNotificationAccess() {
  const lang = buildLanguageContext();
  const brand = getBrandName(toPackLocale(lang.appLocale));
  const title = `${brand} Companion`;
  const body = lang.appLocale === "en-US"
    ? "Notifications are on. Proactive messages send only after you allow them."
    : "通知已开启，主动消息会在用户授权后发送。";

  if (isNativePlatform()) {
    await ensureNotificationChannels();
    const result = await LocalNotifications.requestPermissions();
    if (result.display !== "granted") {
      throw new Error(t("errors.notificationDenied"));
    }
    await LocalNotifications.schedule({
      notifications: [{
        id: allocateNotificationId(),
        title,
        body,
        channelId: COMPANION_MESSAGE_CHANNEL,
        schedule: { at: new Date(Date.now() + 500) },
      }],
    });
    return true;
  }

  if (!("Notification" in window)) {
    throw new Error(t("errors.notificationUnsupported"));
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(t("errors.notificationDenied"));
  new Notification(title, { body });
  return true;
}

/**
 * @param {string} body
 * @param {string} [title]
 * @param {{ deepLink?: string, artifactId?: string, deliveryId?: string }} [extra]
 */
export async function showCompanionNotification(body, title, extra = {}) {
  const resolvedTitle = notificationShellTitle(title);
  const deepLink = String(extra.deepLink || "").trim();
  const payload = {
    deepLink,
    artifactId: String(extra.artifactId || "").trim(),
    deliveryId: String(extra.deliveryId || "").trim(),
  };
  const notificationId = allocateNotificationId(payload.deliveryId);
  if (isNativePlatform()) {
    await ensureNotificationChannels();
    await LocalNotifications.schedule({
      notifications: [{
        id: notificationId,
        title: resolvedTitle,
        body,
        channelId: extra.channel === "agent-task" ? AGENT_TASK_CHANNEL : COMPANION_MESSAGE_CHANNEL,
        schedule: { at: new Date(Date.now() + 300) },
        extra: payload,
      }],
    });
    return { ok: true, channel: "native", notificationId, ...payload };
  }
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(resolvedTitle, {
      body,
      data: payload,
      tag: payload.deliveryId || payload.artifactId || undefined,
    });
    n.onclick = () => {
      try {
        if (payload.deliveryId) {
          import("../artifacts/index.js")
            .then(({ markOpened }) => markOpened(payload.deliveryId))
            .catch(() => {});
        }
        if (deepLink) {
          window.dispatchEvent(new CustomEvent("yueqi:deep-link", { detail: payload }));
        }
        window.focus?.();
        n.close?.();
      } catch {
        /* ignore */
      }
    };
    return { ok: true, channel: "web", notificationId, ...payload };
  }
  return { ok: false, reason: "permission_denied", ...payload };
}

/**
 * Functional notification channel for Artifact Delivery (no frequency policy).
 * @param {{
 *   body: string,
 *   title?: string,
 *   deepLink?: string,
 *   artifactId?: string,
 *   deliveryId?: string,
 * }} input
 */
export async function deliverSystemNotification(input = {}) {
  return showCompanionNotification(input.body, input.title, {
    deepLink: input.deepLink,
    artifactId: input.artifactId,
    deliveryId: input.deliveryId,
  });
}
