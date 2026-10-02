import { readFileSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLifeContextLine,
  CAPABILITY_TOTAL,
  formatCapabilityStatus,
  isModelConfigured,
  isSyncReady,
  resolveCapabilityLabel,
  scoreCapabilities,
} from "../src/status/capability.js";
import { deliverSegmentedText, splitBySentence } from "../src/chat/segmented-send.js";
import { formatSummaryPanel } from "../src/prompt/assemble.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = globalThis.window || {
  setTimeout,
  clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {} },
};

const score = scoreCapabilities({
  modelConfigured: true,
  voiceConfigured: true,
  syncReady: false,
  grants: { calendar: true, location: false, music: true, album: true, notification: false },
});
check("X3-1 计分总量 8", score.total === CAPABILITY_TOTAL && score.ready === 5, `ready=${score.ready}`);
check("X3-1 模型判定", isModelConfigured({ baseUrl: "https://x", apiKey: "k", model: "m" }) && !isModelConfigured({ baseUrl: "", apiKey: "k", model: "m" }));
check("X3-1 同步判定", isSyncReady({ cloudSave: true, token: "tok" }, {}) && !isSyncReady({ cloudSave: false, token: "local-1" }, {}));
check("X3-4 诚实标签 needs_key", resolveCapabilityLabel({ modelConfigured: false, serverOnline: false }).kind === "needs_key");
check("X3-4 诚实标签 offline", resolveCapabilityLabel({ modelConfigured: true, serverOnline: false }).kind === "service_offline");
check("X3-4 诚实标签 online", resolveCapabilityLabel({ modelConfigured: true, serverOnline: true }).kind === "online");
check(
  "X3-4 离线 BYOK 不报本地服务未连",
  resolveCapabilityLabel({ modelConfigured: true, serverOnline: false, localOfflineSession: true }).kind === "online",
);
check("X3-1 文案格式", formatCapabilityStatus(score, { text: "在线" }).includes("5/8"));

const life = buildLifeContextLine({
  nowPlaying: { title: "夜航" },
  eventsToday: [{ title: "a" }, { title: "b" }],
  albumCount: 3,
  grants: { music: true, calendar: true, album: true },
});
check("X3-2 生活上下文联动", life.includes("夜航") && life.includes("2") && life.includes("3"));

const parts = splitBySentence("第一句。第二句！第三句？");
check("X3-3 切句", parts.length >= 3);

const seen = [];
let gen = 1;
await deliverSegmentedText("甲。乙。丙。", {
  delayMs: 0,
  addMessage: async (text) => { seen.push(text); },
  isCurrentGeneration: () => gen === 1,
  onPart: (part, index, all) => {
    seen.push(`sum:${index + 1}/${all.length}:${part}`);
  },
});
check("X3-3 分段回调顺序", seen[0]?.startsWith("sum:1/") && seen.includes("甲。") && seen.includes("丙。"));

gen = 2;
const crossed = [];
await deliverSegmentedText("旧段一。旧段二。", {
  delayMs: 0,
  addMessage: async (text) => { crossed.push(text); },
  isCurrentGeneration: () => gen === 1,
  onPart: (part) => { crossed.push(part); },
});
check("X3-3 世代令牌防串台", crossed.length === 0);

const html = formatSummaryPanel(
  { mood: "平静", weather: { label: "雨" }, asleep: false },
  { memories: [], worldbook: [], historyTurns: 2, palaceSkipped: false },
  { segmentIndex: 1, segmentTotal: 3, segmentText: "第二段内容" },
);
check("X3-3 摘要含分段", html.includes("2/3") || html.includes("第 2/3"));

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const zh = readFileSync(join(root, "src/i18n/locales/zh-CN.js"), "utf8");

check("X3-1 UI 节点", indexHtml.includes("data-capability-status") && !/data-capability-status>\s*online\s*</.test(indexHtml));
check("X3-2 生活条节点", indexHtml.includes("data-life-context"));
check("X3-1 app 接线", appJs.includes("refreshCapabilityStatus") && appJs.includes("scoreCapabilities"));
check("X3-2 库变更刷新", appJs.includes("persistLibraryState") && appJs.includes("refreshLifeContextStrip"));
check("X3-3 聊天分段摘要", appJs.includes("beginSummaryGeneration") && appJs.includes("writeSummaryPanel"));
check("X3-4 i18n 降级文案", zh.includes("needsKey:") && zh.includes("serviceOffline:"));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`X3 failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`X3 passed: ${checks.length}/${checks.length}`);
