/** In-progress voice/video call. Chat auto-speak uses this, not the lab toggle. */

let live = { active: false, kind: "" };

export function setLiveCall(kind = "video") {
  live = { active: true, kind: kind === "voice" ? "voice" : "video" };
}

export function clearLiveCall() {
  live = { active: false, kind: "" };
}

export function isLiveCallActive() {
  return live.active === true;
}

export function liveCallKind() {
  return live.kind || "";
}
