import { readFileSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
  },
};

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const {
  pushRecentPlay,
  getRecentPlays,
  formatRecentPlaysContextLine,
  inferTrackTags,
} = await import("../src/library/recent-plays.js");
const {
  saveCoReadAnchor,
  getCoReadAnchor,
  formatCoReadContextLine,
  formatContinueCoReadMessage,
} = await import("../src/library/co-read.js");
const {
  matchPhotoRecall,
  evalPhotoRecallPhrase,
  formatPhotoRecallContextLine,
} = await import("../src/library/photo-recall.js");
const { buildExternalContext } = await import("../src/integrations/context.js");
const { normalizeEvent } = await import("../src/calendar/engine.js");
const { LEGACY_TYPE_PROMPTS, buildTypedProactiveFallback } = await import("../src/calendar/event-types.js");
const { generateProactiveBody } = await import("../src/proactive/pipeline.js");

pushRecentPlay({ title: "夜航书页", playlist: "睡前", mood: "安静", genre: "氛围" });
pushRecentPlay({ title: "雨后低频", playlist: "睡前" });
pushRecentPlay({ title: "旧书店灯光", playlist: "日常" });
const recent = getRecentPlays(5);
const recentLine = formatRecentPlaysContextLine(recent, 5);
check("X4-1 最近播放条数", recent.length >= 3, `n=${recent.length}`);
check("X4-1 最近播放文案", recentLine.includes("最近播放") && recentLine.includes("夜航书页"));
check("X4-1 情绪曲风推断", inferTrackTags({ title: "雨夜", playlist: "睡前" }).mood === "安静");

const musicCtx = buildExternalContext({
  grants: { music: true },
  library: { tracks: [{ title: "夜航书页", mood: "安静", genre: "氛围" }] },
  nowPlaying: { title: "夜航书页", playlist: "睡前", coListen: true, paused: false, positionSec: 10, durationSec: 100 },
  recentPlays: recent,
});
check("X4-1 prompt 含最近 N 首", musicCtx.some((line) => line.includes("最近播放") && line.includes("雨后低频")));

const anchor = saveCoReadAnchor({
  title: "挪威的森林",
  chapter: "第 12 章",
  excerpt: "我在深夜的电车上想起了那片森林。",
});
check("X4-2 进度可存", getCoReadAnchor()?.excerpt?.includes("森林"));
check("X4-2 继续共读文案", formatContinueCoReadMessage(anchor).includes("继续共读") && formatContinueCoReadMessage(anchor).includes("森林"));
check("X4-2 上下文注入", formatCoReadContextLine(anchor).includes("一起看") && formatCoReadContextLine(anchor).includes("第 12 章"));
check(
  "X4-2 未读书架不注入一起看",
  formatCoReadContextLine({
    title: "那里怎么样",
    chapter: "梦境短篇",
    progress: "未读",
    excerpt: "一个从黑暗中的女人与孩童开始。",
  }) === "",
);

const photos = [
  { title: "雨夜窗边", summary: "雨夜里靠窗的暖光" },
  { title: "旧书店", summary: "旧书店里的木质书架" },
];
const hit = evalPhotoRecallPhrase("看看那张雨夜的", photos);
check("X4-3 固定评测句命中 summary", hit?.summary?.includes("雨夜") || hit?.photo?.title?.includes("雨夜"), hit?.summary || "");
check("X4-3 回忆上下文", formatPhotoRecallContextLine(hit).includes("相册回忆命中"));

const recallCtx = buildExternalContext({
  grants: { album: true },
  library: { photos },
  photoRecall: hit,
});
check("X4-3 外部上下文含命中", recallCtx.some((line) => line.includes("相册回忆命中") && line.includes("暖光")));

const listenEvent = normalizeEvent({ title: "同步听歌", mode: "仅提醒", type: "sync_listen", date: "2099-01-01", time: "22:40" });
const readEvent = normalizeEvent({ title: "继续共读", mode: "可主动消息", date: "2099-01-01", time: "23:10" });
check("X4-4 同步听歌迁移为自由提醒", listenEvent.type === "generic" && listenEvent.prompt === LEGACY_TYPE_PROMPTS.sync_listen);
check("X4-4 共读迁移为自由提醒", readEvent.type === "generic" && readEvent.prompt === LEGACY_TYPE_PROMPTS.co_read);
check("X4-4 同步听歌 fallback", buildTypedProactiveFallback(listenEvent, { asleep: false }).includes("听"));
check("X4-4 共读 fallback", buildTypedProactiveFallback(readEvent, { asleep: false }).includes("共读"));

const body = await generateProactiveBody(
  listenEvent,
  { mood: "平静", weather: { label: "雨" }, asleep: false },
  { collectProviderConfig: () => ({}), collectCharacterProfile: () => ({ name: "角色" }) },
);
check("X4-4 主动消息类型文案", /听|歌/.test(body), body);

const appJs = readAppBundle(root);
const phoneScreens = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");
const phoneReader = readFileSync(join(root, "src/phone-shell/phone-reader.js"), "utf8");
const bookReader = readFileSync(join(root, "src/library/book-reader.js"), "utf8");

check("X4-2 UI 共读划线入口", phoneScreens.includes("data-ebook-ask") && phoneScreens.includes("data-ebook-flow") && phoneScreens.includes("data-ebook-continue-chat"));
check("X4-2 wire 划线接到聊天", phoneReader.includes("saveCoReadAnchor") && phoneReader.includes("formatCoReadQuoteMessage") && phoneReader.includes("onSubmitCoRead"));
check("X4-2 app 划线自动发出", bookReader.includes("formatCoReadQuoteMessage") && bookReader.includes("requestSubmit") && !bookReader.includes("onAskCompanion"));
check("X4-1 app 推最近播放", appJs.includes("pushRecentPlay"));
check("X4-3 app 相册回忆", appJs.includes("matchPhotoRecall"));
check("X4-4 日历模板 UI", phoneScreens.includes('data-cal-template="sync_listen"') && phoneScreens.includes('data-cal-template="co_read"'));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`X4 failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`X4 passed: ${checks.length}/${checks.length}`);
