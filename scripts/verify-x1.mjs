import { readFileSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCoListenState,
  formatCoListenTellMessage,
  progressRatio,
  positionFromRatio,
} from "../src/library/co-listen.js";
import {
  appendCallTurn,
  buildCallSessionMemory,
  createCallSession,
  summarizeCallSession,
} from "../src/call/call-session.js";
import { clearLiveCall, isLiveCallActive, setLiveCall } from "../src/call/live-state.js";
import { createCoListenTabId } from "../src/library/co-listen-sync.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const state = buildCoListenState({
  title: "夜航",
  playlist: "通勤",
  positionSec: 90,
  durationSec: 300,
  paused: false,
  coListen: true,
});

check("X1-2 告诉 TA 文案", formatCoListenTellMessage(state).includes("一起听") && formatCoListenTellMessage(state).includes("夜航"));
check("X1-2 进度映射", progressRatio(state) === 300 && Math.abs(positionFromRatio(300, 300) - 90) < 0.01);

const session = createCallSession({ characterName: "月栖" });
appendCallTurn(session, { role: "user", content: "（画面）" });
appendCallTurn(session, { role: "assistant", content: "我看见你了。" });
const memory = buildCallSessionMemory(session);
check("X1-4 通话纪要", summarizeCallSession(session).includes("月栖"));
check("X1-4 记忆 source", memory?.source === "call.session" && memory.rawText.includes("我看见你了"));
clearLiveCall();
setLiveCall("voice");
check("X1-3 通话中标记", isLiveCallActive() === true);
clearLiveCall();
check("X1-3 挂断清除标记", isLiveCallActive() === false);

check("X1-5 tab id", Boolean(createCoListenTabId()));

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const wire = readFileSync(join(root, "src/ui/companion-presence-wire.js"), "utf8");
const video = readFileSync(join(root, "src/call/video-call.js"), "utf8");

check("X1-2 seek UI", indexHtml.includes("data-now-seek") && indexHtml.includes("data-co-listen-tell"));
check("X1-2 app 接线", appJs.includes("formatCoListenTellMessage") && appJs.includes("nowSeek") && appJs.includes("coListenTell"));
check("X1-3 流式截帧", video.includes("stream: Boolean(stream)") && wire.includes("onDelta"));
check("X1-3 通话自动出声", wire.includes("speakSegmentedText") && wire.includes("setLiveCall") && wire.includes("{ force: true }"));
check("X1-4 挂断入库", wire.includes("buildCallSessionMemory") && wire.includes("fileDrawerAndRender"));
check("X1-5 多标签", appJs.includes("subscribeCoListenState") && appJs.includes("publishCoListenState"));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`X1 failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`X1 passed: ${checks.length}/${checks.length}`);
