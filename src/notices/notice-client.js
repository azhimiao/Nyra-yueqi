import { modelServiceUrl, safeFetch } from "../lib/utils.js";
import { readProductAccess } from "../account/product-access.js";
import { pickNoticeToShow } from "./notice-policy.mjs";
import { isNoticeShellBlocked } from "./notice-shell.mjs";
import { ackNotice, readAckedNotices, readSnoozedNotices, snoozeNotice } from "./notice-store.mjs";
import { showNoticeDialog } from "./notice-dialog.js";

const POLL_MS = 3 * 60 * 1000;
let pollTimer = 0;
let inFlight = false;
let showing = false;

function productAudience() {
  try {
    return readProductAccess().modelSource || "all";
  } catch {
    return "all";
  }
}

async function fetchActiveNotices() {
  const payload = await safeFetch(modelServiceUrl("/notices/active"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  return Array.isArray(payload?.notices) ? payload.notices : [];
}

export async function refreshNotices({ previewNotice = null } = {}) {
  if (inFlight || showing) return null;
  if (!previewNotice && isNoticeShellBlocked()) return null;
  inFlight = true;
  try {
    const notices = previewNotice ? [previewNotice] : await fetchActiveNotices();
    const next = pickNoticeToShow(notices, {
      acked: previewNotice ? {} : readAckedNotices(),
      snoozed: previewNotice ? {} : readSnoozedNotices(),
      audience: productAudience(),
    });
    if (!next) return null;
    showing = true;
    const result = await showNoticeDialog(next);
    if (result.action === "later") snoozeNotice(next.id);
    if (result.action === "primary" && next.dismiss !== "none") ackNotice(next.id);
    return result;
  } catch {
    return null;
  } finally {
    inFlight = false;
    showing = false;
  }
}

export function startNoticeClient() {
  const tick = () => {
    refreshNotices().catch(() => {});
  };
  tick();
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(tick, POLL_MS);
  document.addEventListener("yueqi:splash-done", tick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
  window.yueqiNotices = {
    refresh: tick,
    preview(notice) {
      return refreshNotices({
        previewNotice: {
          id: `preview-${Date.now()}`,
          type: "announcement",
          kind: "forced",
          dismiss: "ack",
          enabled: true,
          audience: "all",
          title: { "zh-CN": "预览通告", en: "Preview notice" },
          body: { "zh-CN": "这是一条会停在 App 里的通告。", en: "This notice stays inside the app." },
          ...notice,
        },
      });
    },
  };
  return window.yueqiNotices;
}
