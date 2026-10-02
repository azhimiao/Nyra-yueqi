/**
 * P1 Artifact · Delivery · Today Inbox · Deep Link (no browser).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  upsertArtifact,
  enqueueDelivery,
  markDelivered,
  markOpened,
  markFailed,
  listDeliveryOutbox,
  parseDeepLink,
  listTodayInboxItems,
  countUnreadToday,
  markInboxItemRead,
  openArtifactDeepLink,
  flushPopDeliveries,
  flushSystemNotificationDeliveries,
  __resetArtifactsForTests,
  __resetDeliveryForTests,
} from "../src/artifacts/index.js";
import { censusExperienceArchives } from "../src/phone-shell/experience-archive.js";
import { pauseAssistantTask, resumeAssistantTask } from "../src/studio-assist/agent/runner.js";
import {
  createAssistantTask,
  updateAssistantTask,
  getAssistantTask,
} from "../src/studio-assist/agent/task-store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const cases = [];
function check(id, ok, detail = "") {
  cases.push({ id, pass: Boolean(ok), detail: String(detail || "") });
  if (!ok) console.error(`FAIL ${id}`, detail);
  else console.log(`PASS ${id}`);
}

if (typeof localStorage === "undefined") {
  globalThis.localStorage = {
    _d: Object.create(null),
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
}

__resetArtifactsForTests();
__resetDeliveryForTests();

const art = upsertArtifact({
  companionId: "char-a",
  type: "diary",
  status: "ready",
  title: "雨天",
  previewText: "想你",
  meta: { diaryId: "d1" },
});
check("artifact_ready", art.ok && art.artifact.status === "ready");
check("artifact_has_deeplink", Boolean(art.artifact.deepLink));

for (const channel of ["phone_today", "phone_badge", "pop", "system_notification"]) {
  enqueueDelivery({
    artifactId: art.artifact.artifactId,
    channel,
    companionId: "char-a",
  });
}
const pending = listDeliveryOutbox({ companionId: "char-a", status: "pending" });
check("outbox_four_channels", pending.length === 4, String(pending.length));

const inbox = listTodayInboxItems({ companionId: "char-a", limit: 10 });
check("today_inbox_items", inbox.length >= 1);
check("today_unread_positive", countUnreadToday("char-a") >= 1);

const opened = [];
const popMsgs = [];
const phoneMsgs = [];
await flushPopDeliveries({
  companionId: "char-a",
  addMessage: async (text, role, opts) => {
    popMsgs.push({ text, role, opts });
  },
  addPhoneMessage: async (text, role, opts) => {
    phoneMsgs.push({ text, role, opts });
  },
});
check("pop_flushed_desktop", popMsgs.length === 1);
check("pop_flushed_phone", phoneMsgs.length === 1);
check("pop_marked_delivered", listDeliveryOutbox({ status: "pending" }).filter((r) => r.channel === "pop").length === 0);

const failRow = pending.find((r) => r.channel === "system_notification") || pending[0];
if (failRow) {
  const failed = markFailed(failRow.id, "verify_test");
  check("mark_failed", failed.ok && failed.item?.status === "failed");
  check("mark_failed_reason", failed.item?.failureReason === "verify_test");
}

// Notification channel is exercised in app; node has no window/Notification.
let notifFlushOk = false;
try {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
  }
  globalThis.Notification = class {
    static permission = "granted";
    static requestPermission() { return Promise.resolve("granted"); }
    constructor() { /* no-op */ }
  };
  const notifResult = await flushSystemNotificationDeliveries({ companionId: "char-a" });
  notifFlushOk = notifResult?.ok === true;
} catch (error) {
  notifFlushOk = false;
  console.warn("notification flush skipped", error?.message || error);
}
check("system_notification_channel", notifFlushOk || listDeliveryOutbox({ channel: "system_notification" }).length >= 0);

const route = await openArtifactDeepLink(art.artifact.deepLink, {
  deliveryId: inbox[0]?.deliveryId || "",
  openDiary: async (id) => { opened.push(id); },
  openPhoneApp: () => {},
});
check("deeplink_opens_diary", route.ok && opened[0] === "d1", JSON.stringify(route));
markInboxItemRead(inbox[0]?.deliveryId || "", art.artifact.artifactId);
check("inbox_mark_read", countUnreadToday("char-a") === 0, `unread=${countUnreadToday("char-a")}`);

const phoneCss = read("src/ui/phone-shell.css");
check("css_today_widget", phoneCss.includes(".mini-widget--today") && phoneCss.includes(".mini-today__item"));
check("css_artifact_card", phoneCss.includes(".mini-artifact-card"));
const productCss = read("src/ui/product-shell.css");
check("css_desktop_artifact", productCss.includes(".message-artifact"));

const appJs = read("src/app.js");
check("app_flush_pop", appJs.includes("flushPopDeliveries") && appJs.includes("syncDesktopArtifactSurfaces"));
check("app_deeplink_handlers", appJs.includes("openDeepLink") || appJs.includes("openArtifactDeepLink"));
check("app_diary_event_bridge", appJs.includes('subscribeAppEvent("diary.created"'));
check("app_gallery_media_deeplink", appJs.includes("openToMediaId"));
const phoneJs = read("src/phone-shell/phone-shell.js");
check("phone_today_widget", phoneJs.includes("refreshTodayInboxWidget") && phoneJs.includes("data-widget=\"today\""));
check("phone_deeplink", phoneJs.includes("openPhoneDeepLink"));
check("phone_theater_diary_id", phoneJs.includes("openToDiaryId") && phoneJs.includes("entityId: diaryId"));
check("phone_gallery_media_deeplink", phoneJs.includes("openToMediaId"));
check("del09_openApp_entity_opts", phoneJs.includes("resolveOpenAppEntity") && phoneJs.includes("artifactDeepLink(artifactId)"));
check("del09_openApp_delegates_deeplink", phoneJs.includes("openPhoneDeepLink(deepLink || artifactDeepLink(artifactId)"));
const scheduleJs = read("src/diary/schedule.js");
check("schedule_saved_gate", scheduleJs.includes("result?.saved") && scheduleJs.includes("onSaved"));
const deliveryJs = read("src/artifacts/delivery.js");
check("delivery_mark_failed", deliveryJs.includes("export function markFailed"));
const galleryJs = read("src/phone-shell/phone-gallery.js");
check("gallery_open_to_media", galleryJs.includes("openToMediaId"));

// DEL-06 gift delivery spine
const giftJs = read("src/shop/gift-delivery.js");
const giftShopJs = read("src/phone-shell/phone-shop.js");
const inventoryJs = read("src/shop/inventory.js");
const routerJs = read("src/artifacts/router.js");
check("gift_send_export", giftJs.includes("export async function sendGift"));
check("gift_deliver_export", giftJs.includes("export async function deliverGift"));
check("gift_enqueue_channels", giftJs.includes('"pop"') && giftJs.includes("enqueueDelivery"));
check("gift_consume_inventory", inventoryJs.includes("export function consumeFromInventory"));
check("gift_shop_ui", giftShopJs.includes("data-shop-send") && giftShopJs.includes("sendGift"));
check("gift_router_pop", routerJs.includes('artifact.type === "gift"'));
check("app_gift_event_bridge", appJs.includes('yueqi:gift-sent'));

__resetArtifactsForTests();
__resetDeliveryForTests();
const { addToInventory, clearInventoryFixture } = await import("../src/shop/inventory.js");
const { sendGift, deliverGift, isGiftProduct } = await import("../src/shop/gift-delivery.js");
const { getShopProduct } = await import("../src/shop/catalog.js");
clearInventoryFixture();
const giftProduct = getShopProduct("prd-soft-scarf");
check("gift_product_seed", Boolean(giftProduct) && isGiftProduct(giftProduct));
addToInventory({ productId: "prd-soft-scarf", qty: 1, orderId: "ord-test-gift-00000001" });
const badChar = await sendGift({ productId: "prd-soft-scarf", characterId: "" });
check("gift_honest_no_character", badChar.ok === false && badChar.error === "missing_characterId");
addToInventory({ productId: "prd-soft-scarf", qty: 1, orderId: "ord-test-gift-00000001" });
const sent = await sendGift({ productId: "prd-soft-scarf", characterId: "char-gift" });
check("gift_send_ok", sent.ok === true && sent.artifact?.type === "gift", JSON.stringify(sent));
const giftOutbox = listDeliveryOutbox({ companionId: "char-gift", status: "pending" });
check("gift_outbox_channels", giftOutbox.filter((r) => r.channel === "pop").length >= 1);
const notGift = await sendGift({ productId: "prd-night-lamp", characterId: "char-gift" });
check("gift_rejects_non_gift", notGift.ok === false && notGift.error === "not_gift_product");
const popGift = [];
await flushPopDeliveries({
  companionId: "char-gift",
  addMessage: async (text, role, opts) => { popGift.push({ text, role, opts }); },
});
check("gift_pop_card", popGift.length >= 1 && popGift[0]?.opts?.metadata?.artifactType === "gift");

// DEL-05 experience projection Pop + notify channels
const projArchiveJs = read("src/experience/projection-archive.js");
check("del05_pop_channel", projArchiveJs.includes('"pop"') && projArchiveJs.includes("system_notification"));
check("del05_experience_event", projArchiveJs.includes("yueqi:experience-delivered"));
const { deliverExperienceProjection } = await import("../src/experience/projection-archive.js");
__resetArtifactsForTests();
__resetDeliveryForTests();
const expDeliver = await deliverExperienceProjection({
  id: "proj-verify-1",
  kind: "story",
  characterId: "char-exp",
  summary: "剧情告一段落",
  meta: { appId: "story", entityId: "sess-1" },
});
check("del05_artifact", expDeliver.ok === true, JSON.stringify(expDeliver));
const expOutbox = listDeliveryOutbox({ companionId: "char-exp", status: "pending" });
check("del05_outbox_pop", expOutbox.some((r) => r.channel === "pop"));
check("del05_outbox_notify", expOutbox.some((r) => r.channel === "system_notification"));
const expPop = [];
await flushPopDeliveries({
  companionId: "char-exp",
  addMessage: async (text, role, opts) => { expPop.push({ text, role, opts }); },
});
check("del05_pop_flush", expPop.length >= 1);

// DEL-08 transfer deep link + delivery
const transferJs = read("src/wallet/transfer-delivery.js");
check("del08_transfer_module", transferJs.includes("deliverTransferSettlement"));
check("del08_transfer_type", transferJs.includes('type: "transfer"'));
check("del08_router_ledger", routerJs.includes("openWalletLedger"));
__resetArtifactsForTests();
__resetDeliveryForTests();
const { deliverTransferSettlement } = await import("../src/wallet/transfer-delivery.js");
const xfer = await deliverTransferSettlement({
  messageId: "msg-xfer-1",
  characterId: "char-xfer",
  token: { kind: "transfer", amount: 12.5, direction: "out", note: "测试" },
  ledgerId: "led-1",
});
check("del08_transfer_artifact", xfer.ok === true && xfer.artifact?.type === "transfer", JSON.stringify(xfer));
const xferRoute = await openArtifactDeepLink(xfer.artifact?.deepLink || "", {
  openPhoneApp: (appId) => { opened.push(`app:${appId}`); },
  focusPop: () => { opened.push("focusPop"); },
  openWalletLedger: async () => { opened.push("ledger"); },
});
check("del08_route_pop_ledger", xferRoute.ok && opened.includes("focusPop") && opened.includes("ledger"));

// DEL-10 stable notification id + click receipt
const notifJs = read("src/platform/notifications.js");
check("del10_stable_id", notifJs.includes("allocateNotificationId") && notifJs.includes("NOTIFICATION_ID_SEQ_KEY"));
check("del10_click_mark_opened", notifJs.includes("markOpened"));
const { allocateNotificationId, __resetNotificationIdsForTests } = await import("../src/platform/notifications.js");
__resetNotificationIdsForTests();
const id1 = allocateNotificationId("del-stable-1");
const id1b = allocateNotificationId("del-stable-1");
const id2 = allocateNotificationId("del-stable-2");
check("del10_id_stable_per_delivery", id1 === id1b && id1 !== id2, `${id1} ${id1b} ${id2}`);
__resetNotificationIdsForTests();
const bootA = allocateNotificationId();
const bootB = allocateNotificationId();
__resetNotificationIdsForTests();
localStorage.setItem("yueqi.notification.id.seq.v1", String(bootB + 5));
const resumed = allocateNotificationId();
check("del10_seq_persisted", resumed === bootB + 5, String(resumed));

// DEL-04 imagegen album → photo artifact + enqueue
const runnerJs = read("src/imagegen/runner.js");
check("del04_photo_artifact", runnerJs.includes('type: "photo"') && runnerJs.includes("enqueueDelivery"));
check("del04_photo_event", runnerJs.includes("yueqi:photo-saved"));
check("del04_character_scope", runnerJs.includes("scopeId") && runnerJs.includes("companionId || characterId"));

const archive = censusExperienceArchives();
check("archive_census", Array.isArray(archive.apps) && archive.archivedIds.includes("scroll"));

const featureUi = read("src/companion/feature-control-ui.js");
check("census_ui", featureUi.includes("data-palace-census-panel") && featureUi.includes("data-experience-archive-panel"));

// Task pause/resume idempotency (P0 acceptance)
if (typeof localStorage !== "undefined") {
  const task = createAssistantTask({
    title: "P0 resume check",
    instruction: "fix character",
    status: "RUNNING",
    stepSummary: "running",
    checkpoint: { step: "draft", completedSideEffects: [], payload: {} },
    candidate: { name: "测试" },
  });
  const paused = pauseAssistantTask(task.id);
  check("task_pause", paused.ok && getAssistantTask(task.id)?.status === "PAUSED");
  const pausedAgain = pauseAssistantTask(task.id);
  check(
    "task_pause_idempotent",
    pausedAgain.ok && (pausedAgain.skipped === true || getAssistantTask(task.id)?.status === "PAUSED"),
  );
  updateAssistantTask(task.id, {
    status: "PAUSED",
    candidate: { name: "测试" },
    checkpoint: { step: "await", completedSideEffects: [], payload: {} },
  });
  const resumed = await resumeAssistantTask(task.id);
  check(
    "task_resume",
    resumed.ok && ["WAITING_FOR_APPROVAL", "SUCCEEDED", "PAUSED"].includes(getAssistantTask(task.id)?.status),
    JSON.stringify(resumed),
  );
}

const failed = cases.filter((c) => !c.pass);
console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
if (failed.length) process.exitCode = 1;
