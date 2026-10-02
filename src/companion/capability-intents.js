/**
 * Chat capability intents that must not be roleplay-only.
 * Maps user asks → open app / permission gate / real side effect.
 */

/** @typedef {{
 *   id: string,
 *   openApp?: string,
 *   permissionId?: string,
 *   event?: string,
 *   kind: "open"|"permission"|"execute"|"confirm",
 * }} CapabilityIntent */

const RULES = Object.freeze([
  {
    id: "moments.publish",
    kind: "execute",
    openApp: "moments",
    test: (t) => /(?:发|写).{0,8}(?:朋友圈|动态)|发条朋友圈|发个动态|(?:post|share).{0,12}moment/i.test(t)
      && !/日记/.test(t),
  },
  {
    id: "read.open",
    kind: "open",
    openApp: "read",
    test: (t) => !isReadingQuoteComment(t)
      && /一起看|一起读|(?:打开|读).{0,6}(?:书|短篇)|读给我听|翻到/.test(t)
      && !/日记/.test(t),
  },
  {
    id: "calendar.remind",
    kind: "confirm",
    openApp: "calendar",
    test: (t) => /提醒我|设个?(?:闹钟|提醒)|加个?(?:日程|日历|提醒)|记一下.*(?:点|明天|后天|周)/.test(t)
      || /create\s+(a\s+)?reminder|remind\s+me/i.test(t),
  },
  {
    id: "location.share",
    kind: "permission",
    permissionId: "location.current",
    test: (t) => /(?:分享|发).{0,4}位置|我在哪|定位一下|你知道我在哪|share\s+(my\s+)?location|where\s+am\s+i/i.test(t),
  },
  {
    id: "device.screen",
    kind: "permission",
    permissionId: "screen.capture",
    test: (t) => /看(?:一下)?(?:我的)?屏幕|截屏|看屏|screen\s*watch|look\s+at\s+(my\s+)?screen/i.test(t),
  },
  {
    id: "device.camera",
    kind: "permission",
    permissionId: "camera",
    test: (t) => (/(?:打开|用|开).{0,4}相机|拍张照|拍个照/.test(t) || /open\s+(the\s+)?camera|take\s+a\s+photo/i.test(t))
      && !/自拍/.test(t),
  },
  {
    id: "device.mic",
    kind: "permission",
    permissionId: "microphone",
    test: (t) => /(?:打开|用|开).{0,4}麦克风|开麦|听我说|voice\s*input|use\s+(the\s+)?mic/i.test(t),
  },
  {
    id: "device.notification",
    kind: "permission",
    permissionId: "notification",
    test: (t) => /(?:打开|开启|允许).{0,6}通知|推送权限|notification\s*permission/i.test(t),
  },
  {
    id: "imagegen.open",
    kind: "open",
    openApp: "assist",
    event: "yueqi:open-imagegen",
    test: (t) => /画一张|生成图片|生图|画个|帮我画|generate\s+(an?\s+)?image|draw\s+(me\s+)?a/i.test(t),
  },
  {
    id: "web.search",
    kind: "execute",
    openApp: "assist",
    test: (t) => /(?:搜|查)一下|(?:帮我)?搜索|查资料|look\s+up|search\s+(for\s+)?/i.test(t)
      && !/天气/.test(t),
  },
  {
    id: "gift.open",
    kind: "open",
    openApp: "pop",
    event: "yueqi:open-gift-compose",
    test: (t) => /送你|送礼物|送个礼|礼物|gift\s+you/i.test(t) && !/日记/.test(t),
  },
  {
    id: "economy.transfer",
    kind: "open",
    openApp: "pop",
    event: "yueqi:open-transfer",
    test: (t) => /转账|转点栖币|给你点栖币|transfer\s+coin/i.test(t),
  },
  {
    id: "scenario.open",
    kind: "open",
    openApp: "theater",
    test: (t) => /情景剧|开始演|开一场戏/.test(t),
  },
  {
    id: "scroll.open",
    kind: "open",
    openApp: "scroll",
    test: (t) => /漫卷|galgame|文字冒险/.test(t),
  },
  {
    id: "adventure.open",
    kind: "open",
    openApp: "adventure",
    test: (t) => /去冒险|开始冒险|开地图/.test(t),
  },
  {
    id: "cocreate.open",
    kind: "open",
    openApp: "cocreate",
    test: (t) => /一起写|共创|合写/.test(t) && !/日记/.test(t),
  },
  {
    id: "backup.open",
    kind: "open",
    openApp: "settings",
    event: "yueqi:open-backup",
    test: (t) => /备份一下|导出备份|备份数据|backup\s+(my\s+)?data/i.test(t),
  },
]);

/** Highlight / co-read talk: already in the book, asking for a comment — not "open Read". */
export function isReadingQuoteComment(text) {
  const raw = String(text || "");
  return /[「『“"][^」』”"]{1,480}[」』”"]/.test(raw)
    && /你怎么看|怎么看\s*[？?]?|What do you think|Shall we talk/i.test(raw);
}

/**
 * @param {string} text
 * @returns {CapabilityIntent|null}
 */
export function detectCapabilityIntent(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  // Leave selfie / diary / listen to their dedicated detectors (higher priority in orchestrator).
  for (const rule of RULES) {
    try {
      if (rule.test(raw)) {
        return {
          id: rule.id,
          kind: rule.kind,
          openApp: rule.openApp || "",
          permissionId: rule.permissionId || "",
          event: rule.event || "",
        };
      }
    } catch {
      /* bad lookbehind on older engines — skip */
    }
  }
  return null;
}

export function listCapabilityIntentIds() {
  return RULES.map((row) => row.id);
}
