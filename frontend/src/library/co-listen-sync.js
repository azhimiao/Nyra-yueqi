/**
 * 本机多标签共听同步（BroadcastChannel，无外网）。
 */

const CHANNEL = "yueqi-co-listen-v1";

export function createCoListenTabId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function publishCoListenState(tabId, state, channelName = CHANNEL) {
  if (typeof BroadcastChannel === "undefined" || !state) return;
  try {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({
      type: "co-listen-state",
      tabId,
      state: { ...state, updatedAt: Date.now() },
    });
    channel.close();
  } catch {
    // ignore
  }
}

export function subscribeCoListenState(tabId, onRemote, channelName = CHANNEL) {
  if (typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  let channel;
  try {
    channel = new BroadcastChannel(channelName);
  } catch {
    return () => {};
  }
  const handler = (event) => {
    const payload = event.data;
    if (!payload || payload.type !== "co-listen-state") return;
    if (payload.tabId === tabId) return;
    if (!payload.state) return;
    onRemote?.(payload.state, payload.tabId);
  };
  channel.addEventListener("message", handler);
  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}
