import { readFileSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCoListenState,
  formatCoListenChatNotice,
  formatCoListenContextLine,
  formatClock,
  resolveCoListenAnnounce,
} from "../src/library/co-listen.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const playing = buildCoListenState({
  title: "夜航",
  playlist: "通勤",
  mediaId: "m1",
  positionSec: 65,
  durationSec: 200,
  paused: false,
  coListen: true,
});
const paused = { ...playing, paused: true, positionSec: 80 };
const line = formatCoListenContextLine(playing);

check("时钟格式", formatClock(65) === "1:05");
check("上下文含进度与状态", line.includes("播放中") && line.includes("1:05") && line.includes("3:20"));
check("关闭共听不注入", formatCoListenContextLine({ ...playing, coListen: false }) === "");
check("切歌通知", resolveCoListenAnnounce(null, playing)?.reason === "track");
check("暂停通知", resolveCoListenAnnounce(playing, paused)?.reason === "pause");
check("继续通知", resolveCoListenAnnounce(paused, playing)?.reason === "resume");
check("系统条文案", formatCoListenChatNotice(playing, "track").includes("夜航"));

const appJs = readAppBundle(root);
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const contextJs = readFileSync(join(root, "src/integrations/context.js"), "utf8");

check("app 接线 snapshot", appJs.includes("snapshotFromAudio") && appJs.includes("announceCoListenIfNeeded"));
check("进度 UI", indexHtml.includes("data-now-progress"));
check("context 用协议行", contextJs.includes("formatCoListenContextLine"));
check("系统消息样式", readFileSync(join(root, "styles.css"), "utf8").includes(".message.system"));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`X1-1 co-listen failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`X1-1 co-listen passed: ${checks.length}/${checks.length}`);
