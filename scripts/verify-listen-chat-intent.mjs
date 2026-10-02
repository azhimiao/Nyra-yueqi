/**
 * Chat「放音乐」direct_action — intent → catalog pick → listen play event.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectListenPlayIntent,
  pickCompanionListenTrack,
  requestCompanionListen,
  LISTEN_PLAY_EVENT,
} from "../src/companion/listen-action.js";
import { routeUserInput } from "../src/agent-orchestrator/index.js";

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
const dispatched = [];
globalThis.document = {
  dispatchEvent(event) {
    dispatched.push({ type: event.type, detail: event.detail });
    return true;
  },
  documentElement: { lang: "zh-CN" },
};

check("detect_listen_zh_play", detectListenPlayIntent("播放个音乐吧"));
check("detect_listen_zh_song", detectListenPlayIntent("放首歌听听"));
check("detect_listen_en", detectListenPlayIntent("play some music"));
check("detect_listen_negative_chat", !detectListenPlayIntent("今天天气怎么样"));
check("detect_listen_negative_diary", !detectListenPlayIntent("写一篇日记"));

const route = routeUserInput({ text: "播放个音乐吧" });
check("route_direct_action_listen", route.route === "direct_action" && route.action === "listen");

const soft = pickCompanionListenTrack([
  { id: "nyra.music.bach.bwv1007.prelude", title: "Bach" },
  { id: "nyra.music.satie.gymnopedie1", title: "Satie" },
], "想睡了放点轻音乐");
check("pick_soft_prefers_satie", soft?.id === "nyra.music.satie.gymnopedie1");

dispatched.length = 0;
const result = await requestCompanionListen({
  userText: "播放个音乐吧",
  ensureTracksFn: () => {},
  listTracksFn: () => ([
    {
      id: "nyra.music.satie.gymnopedie1",
      title: "Erik Satie — Gymnopédie No.1",
      playlist: "月栖精选",
      sourceUrl: "https://example.com/a.mp3",
    },
  ]),
});
check("listen_action_ok", result.ok === true && result.trackId === "nyra.music.satie.gymnopedie1");
check(
  "listen_action_dispatches_play",
  dispatched.length === 1
    && dispatched[0].type === LISTEN_PLAY_EVENT
    && dispatched[0].detail?.trackId === "nyra.music.satie.gymnopedie1",
  JSON.stringify(dispatched[0] || {}),
);
check("listen_speech_names_track", /Gymnopédie|正在放/.test(result.speech || ""));

const chatJs = read("src/panels/chat.js");
const phoneListenJs = read("src/phone-shell/phone-listen.js");
const actionsJs = read("src/companion/actions.js");
check(
  "chat_listen_dispatch",
  chatJs.includes("isListenRoute")
    && chatJs.includes("requestCompanionListen")
    && chatJs.includes('"companion.listen"'),
);
check("phone_listen_external_play", phoneListenJs.includes("yueqi:listen-play-request") && phoneListenJs.includes("playTrackById"));
check("direct_actions_include_listen", actionsJs.includes('"listen"'));

const failed = cases.filter((row) => !row.pass);
console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
if (failed.length) process.exit(1);
