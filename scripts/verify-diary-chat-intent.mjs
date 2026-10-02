/**
 * Chat「写日记」direct_action spine — intent → generate/save → pop delivery.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectDiaryIntent, requestCompanionDiary } from "../src/companion/diary-action.js";
import { routeUserInput } from "../src/agent-orchestrator/index.js";
import {
  __resetArtifactsForTests,
  __resetDeliveryForTests,
  flushPopDeliveries,
  getArtifact,
  listDeliveryOutbox,
} from "../src/artifacts/index.js";

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
globalThis.window = globalThis;
globalThis.document = {
  dispatchEvent() { return true; },
  documentElement: { lang: "zh-CN" },
};

__resetArtifactsForTests();
__resetDeliveryForTests();

check("detect_diary_zh", detectDiaryIntent("帮我写篇日记"));
check("detect_diary_en", detectDiaryIntent("write a diary please"));
check("detect_diary_negative_chat", !detectDiaryIntent("今天天气怎么样"));
check("detect_diary_negative_view", !detectDiaryIntent("打开日记看看"));
check("detect_diary_negative_status", !detectDiaryIntent("日记写好了吗"));

const route = routeUserInput({ text: "写今天的日记" });
check("route_direct_action_diary", route.route === "direct_action" && route.action === "diary");

const noProvider = await requestCompanionDiary({
  companionId: "xingli",
  characterProfile: { name: "星璃" },
  collectProviderConfig: () => ({ baseUrl: "", apiKey: "", model: "" }),
  generateFn: async () => ({
    ok: false,
    reason: "PROVIDER_REQUIRED",
    message: "当前不可生成日记：请先配置可用的模型接口。",
  }),
});
check("honest_provider_required", !noProvider.ok && noProvider.reason === "PROVIDER_REQUIRED");

const unconfirmed = await requestCompanionDiary({
  companionId: "xingli",
  characterProfile: { name: "星璃" },
  diaryDay: "2026-08-09",
  getExistingFn: async () => null,
  generateFn: async () => ({
    ok: true,
    title: "未确认",
    body: "返回对象不等于持久化成功。",
    styleId: "literary",
  }),
  saveFn: async (payload) => ({ ...payload, id: "diary-unconfirmed" }),
});
check(
  "save_requires_readback",
  unconfirmed.ok === false && unconfirmed.reason === "SAVE_UNCONFIRMED",
  JSON.stringify(unconfirmed),
);

const savedRow = {
  id: "diary-test-001",
  title: "雨后",
  body: "今天和你聊了很多。",
  diaryDay: "2026-08-10",
  styleId: "literary",
  companionId: "xingli",
};
let persistedRow = null;

const success = await requestCompanionDiary({
  companionId: "xingli",
  characterProfile: { name: "星璃" },
  diaryDay: "2026-08-10",
  collectProviderConfig: () => ({ baseUrl: "http://x", apiKey: "k", model: "m" }),
  getExistingFn: async () => persistedRow,
  generateFn: async () => ({
    ok: true,
    title: savedRow.title,
    body: savedRow.body,
    styleId: "literary",
  }),
  saveFn: async (payload) => {
    // Mimic production deliverDiaryArtifact side-effects for flush proof.
    const { upsertArtifact, enqueueDelivery, artifactDeepLink } = await import("../src/artifacts/index.js");
    const recordId = savedRow.id;
    const art = upsertArtifact({
      artifactId: `diary:${recordId}`,
      companionId: "xingli",
      type: "diary",
      status: "ready",
      title: payload.title,
      previewText: String(payload.body || "").slice(0, 120),
      resourceUrl: `diary://${recordId}`,
      deepLink: artifactDeepLink(`diary:${recordId}`) || `yueqi://artifact/diary:${recordId}`,
      readyAt: new Date().toISOString(),
      meta: { diaryId: recordId, diaryDay: payload.diaryDay, styleId: payload.styleId },
    });
    if (art.ok) {
      for (const channel of ["phone_today", "phone_badge", "pop", "system_notification"]) {
        enqueueDelivery({ artifactId: art.artifact.artifactId, channel, companionId: "xingli" });
      }
    }
    persistedRow = { ...savedRow, ...payload, id: recordId };
    return persistedRow;
  },
});

check("fake_diary_ok", success.ok && success.diaryId === savedRow.id, JSON.stringify(success));
check("fake_diary_artifact", success.artifactId === `diary:${savedRow.id}`);

const artifact = getArtifact(success.artifactId);
check("artifact_type_diary", artifact?.type === "diary" && artifact.companionId === "xingli");

const outbox = listDeliveryOutbox({ companionId: "xingli", status: "pending" });
check("outbox_has_pop", outbox.some((row) => row.channel === "pop"), String(outbox.length));

const popMsgs = [];
await flushPopDeliveries({
  companionId: "xingli",
  addMessage: async (text, role, opts) => { popMsgs.push({ text, role, opts }); },
});
check(
  "pop_flushed_diary",
  popMsgs.length === 1 && popMsgs[0]?.opts?.metadata?.activityType === "diary",
  JSON.stringify(popMsgs[0] || {}),
);

const orchJs = read("src/agent-orchestrator/index.js");
const chatJs = read("src/panels/chat.js");
const recordsJs = read("src/diary/records.js");
const appJs = read("src/app.js");
const phoneDiaryJs = read("src/phone-shell/phone-memory-diary.js");
const diaryBookJs = read("src/ui/diary-book.js");
const stylesCss = read("styles.css");
check("orchestrator_diary_route", orchJs.includes("detectDiaryIntent") && orchJs.includes('action: "diary"'));
check(
  "chat_diary_dispatch",
  chatJs.includes("isDiaryRoute")
    && chatJs.includes("runCompanionToolLoop")
    && chatJs.includes('"direct_action_receipt"'),
);
check(
  "chat_diary_flush_no_injected_writer",
  /await flushPopDeliveries\(\{\s*companionId:[^}]+}\);/.test(chatJs)
    && !/flushPopDeliveries\(\{[^}]*addMessage/.test(chatJs),
  "production diary flush must not inject addMessage (duplicates the durable card)",
);
check("diary_save_delivers_pop", recordsJs.includes('channel: "pop"') && recordsJs.includes("deliverDiaryArtifact"));
check(
  "app_diary_route_uses_real_panel",
  appJs.includes("async function openAppDiaryRecord")
    && appJs.includes('setPanel("companion")')
    && !appJs.includes('setPanel("diary")'),
);
check(
  "app_diary_ui_reads_repository",
  appJs.includes("const diaryRecords = await listDiaries(activeCharacterId)")
    && appJs.includes("if (activeCharacterId !== getActiveCharacterId()) return;"),
);
check(
  "phone_diary_open_race_guard",
  phoneDiaryJs.includes("let openRevision = 0")
    && phoneDiaryJs.includes("revision !== openRevision"),
);
check(
  "mobile_diary_static_page",
  diaryBookJs.includes("inMiniShell || compactViewport")
    && stylesCss.includes(".memory-diary-reader.is-open .diary-book-index"),
);
check(
  "chat_diary_writing_feedback",
  chatJs.includes('activityType: "diary_writing"')
    && chatJs.includes('writingIndicator?.classList.add("is-diary-writing")')
    && chatJs.includes("writingIndicator?.remove()"),
);

const failed = cases.filter((row) => !row.pass);
console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
if (failed.length) process.exit(1);
