/**
 * E8 local room — optional stub (本波未做 local 联机；保留入口避免断链).
 * 默认路径为 deferred；此模块不发起任何网络连接。
 */

import { loadMultiplayerPrefs } from "./prefs.js";

/**
 * @returns {{ available: false, reason: string }}
 */
export function getLocalRoomStatus() {
  const prefs = loadMultiplayerPrefs();
  if (!prefs.enabled || prefs.mode !== "local") {
    return {
      available: false,
      reason: "本地暂缓：当前版本仅单机。打开联机实验并切到 local 后，才可创建房间（本波未实现联机同步）。",
    };
  }
  return {
    available: false,
    reason: "本地暂缓：联机为可选实验项，当前版本未接入信令。",
  };
}

/**
 * @returns {null}
 */
export function createLocalRoom() {
  return null;
}
