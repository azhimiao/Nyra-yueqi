/**
 * Host API + 权限门控（F7 H2）
 */

import { APP_VERSION } from "../constants.js";
import {
  PermissionDeniedError,
  checkPermission,
  permissionDeniedMessage,
  permissionLabelZh,
} from "./manifest-schema.js";
import {
  getInstalledExtension,
  grantExtensionPermission,
} from "./registry.js";
import { listEvents, addEvent } from "../phone-shell/phone-data.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import { formatDateKey } from "../lib/time.js";
import { isRealCharacterAvatar } from "../characters/avatar.js";

const STORAGE_NS = "yueqi.phone.ext.storage.v1";
const MAX_STORAGE_VALUE = 64 * 1024;

/**
 * @param {string} extId
 * @param {string} key
 */
function storageKey(extId, key) {
  return `ext:${extId}:${String(key || "").slice(0, 128)}`;
}

function readStorageBag() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_NS) || "{}") || {};
  } catch {
    return {};
  }
}

function writeStorageBag(bag) {
  window.localStorage.setItem(STORAGE_NS, JSON.stringify(bag));
}

/**
 * @param {{
 *   extId: string,
 *   requestPermissionUi?: (permissionId: string, meta: object) => Promise<boolean>,
 *   sendMessage?: (text: string) => Promise<unknown>,
 *   sendTokenCard?: (payload: object) => Promise<unknown>,
 *   getRecentMessages?: (opts?: object) => Promise<object[]>,
 *   getActiveProfileSummary?: () => object|null,
 *   isDnd?: () => boolean,
 *   showToast?: (text: string) => void,
 * }} deps
 */
export function createHostApi(deps) {
  const extId = String(deps.extId || "").trim();

  function currentGranted() {
    return getInstalledExtension(extId)?.grantedPermissions || [];
  }

  async function ensure(permissionId) {
    if (checkPermission(currentGranted(), permissionId)) return;
    const allowed = deps.requestPermissionUi
      ? await deps.requestPermissionUi(permissionId, {
        extId,
        labelZh: permissionLabelZh(permissionId),
        extension: getInstalledExtension(extId),
      })
      : false;
    if (allowed) {
      grantExtensionPermission(extId, permissionId);
      return;
    }
    throw new PermissionDeniedError(permissionId, permissionDeniedMessage(permissionId));
  }

  function eventsNearToday(days = 2) {
    const all = listEvents();
    const today = new Date();
    const keys = new Set();
    for (let i = 0; i < Math.max(1, days); i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      keys.add(formatDateKey(d));
    }
    return all
      .filter((ev) => keys.has(String(ev.date || "")))
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date))
        || String(a.time || "").localeCompare(String(b.time || "")));
  }

  const host = {
    version: APP_VERSION,
    extId,
    async requestPermission(permissionId) {
      await ensure(permissionId);
    },
    calendar: {
      async listEvents(opts = {}) {
        await ensure("calendar.read");
        return eventsNearToday(Number(opts.days) || 2).map((ev) => ({
          id: ev.id,
          title: ev.title,
          date: ev.date,
          time: ev.time,
          prompt: ev.prompt || "",
        }));
      },
      async addEvent(payload = {}) {
        await ensure("calendar.write");
        return addEvent(payload);
      },
    },
    chat: {
      async getRecentMessages(opts = {}) {
        await ensure("chat.read");
        const limit = Math.min(50, Math.max(1, Number(opts.limit) || 20));
        const rows = await Promise.resolve(deps.getRecentMessages?.({ limit }) || []);
        return (rows || []).slice(0, limit).map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: String(msg.content || "").slice(0, 200),
          createdAt: msg.createdAt,
        }));
      },
      async sendMessage({ text } = {}) {
        await ensure("chat.send");
        const body = String(text || "").trim();
        if (!body) throw new Error("消息不能为空");
        return deps.sendMessage?.(body);
      },
      async sendTokenCard(payload = {}) {
        await ensure("chat.send_token");
        const kind = String(payload.kind || "reminder");
        const title = String(payload.title || "").trim().slice(0, 40);
        if (!title) throw new Error("信物标题不能为空");
        return deps.sendTokenCard?.({
          kind,
          title,
          subtitle: String(payload.subtitle || "").slice(0, 80),
          amount: payload.amount,
          sessionId: payload.sessionId,
          sourceExtId: extId,
        });
      },
    },
    storage: {
      async get(key) {
        await ensure("storage.read");
        const bag = readStorageBag();
        return bag[storageKey(extId, key)] ?? null;
      },
      async set(key, value) {
        await ensure("storage.write");
        const serialized = JSON.stringify(value);
        if (serialized.length > MAX_STORAGE_VALUE) {
          throw new Error("存储值过大（单 key ≤ 64KB）");
        }
        const bag = readStorageBag();
        bag[storageKey(extId, key)] = value;
        writeStorageBag(bag);
        return true;
      },
      async remove(key) {
        await ensure("storage.write");
        const bag = readStorageBag();
        delete bag[storageKey(extId, key)];
        writeStorageBag(bag);
        return true;
      },
    },
    notification: {
      async show({ title, body } = {}) {
        await ensure("notification.show");
        if (deps.isDnd?.()) {
          deps.showToast?.(`${title || "通知"}（免打扰中）`);
          return { ok: false, reason: "dnd" };
        }
        deps.showToast?.(String(body || title || "通知"));
        return { ok: true };
      },
    },
    timeline: {
      async append(event = {}) {
        await ensure("timeline.write");
        return appendCohabitEvent({
          appId: `phone-ext:${extId}`,
          kind: event.kind || "ext",
          summary: String(event.summary || "").slice(0, 240),
          characterId: event.characterId,
          meta: { ...(event.meta || {}), extId },
        });
      },
    },
    profile: {
      async getActiveSummary() {
        await ensure("profile.read");
        const summary = deps.getActiveProfileSummary?.() || null;
        if (!summary) return null;
        return {
          id: summary.id || "",
          name: summary.name || summary.displayName || "",
          avatarUrl: isRealCharacterAvatar(summary.avatarUrl) ? summary.avatarUrl : "",
        };
      },
    },
  };

  return host;
}

/**
 * Inject host into iframe window.
 * @param {Window} win
 * @param {object} host
 */
export function injectHostIntoWindow(win, host) {
  if (!win) return;
  try {
    win.nyra = { host };
  } catch {
    /* cross-origin — ignore */
  }
}
