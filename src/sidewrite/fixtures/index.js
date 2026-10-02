/** Fixture payloads for offline / no-key demo (F2a). */

export const FIXTURE_C5 = {
  schemaVersion: 1,
  appKey: "c5",
  threads: [
    {
      id: "thread-mom",
      title: "妈妈",
      avatarHint: "妈",
      lastMessagePreview: "记得吃饭，别总点外卖。",
      lastMessageAt: "2026-03-12T18:42:00.000Z",
      unreadCount: 1,
      pinned: true,
    },
    {
      id: "thread-lab",
      title: "实验室群",
      avatarHint: "实",
      lastMessagePreview: "明天仪器预约改到下午三点。",
      lastMessageAt: "2026-03-11T09:15:00.000Z",
      unreadCount: 0,
      pinned: false,
    },
  ],
  messagesByThread: {
    "thread-mom": [
      {
        id: "m1",
        role: "other",
        senderName: "妈妈",
        content: "今天冷不冷？多穿一件。",
        sentAt: "2026-03-12T18:20:00.000Z",
        type: "text",
        meta: null,
      },
      {
        id: "m2",
        role: "self",
        senderName: null,
        content: "不冷，实验室暖气开着。",
        sentAt: "2026-03-12T18:28:00.000Z",
        type: "text",
        meta: null,
      },
      {
        id: "m3",
        role: "other",
        senderName: "妈妈",
        content: "记得吃饭，别总点外卖。",
        sentAt: "2026-03-12T18:42:00.000Z",
        type: "text",
        meta: null,
      },
    ],
    "thread-lab": [
      {
        id: "l1",
        role: "other",
        senderName: "阿澄",
        content: "星梨，样本编号核对一下？",
        sentAt: "2026-03-11T09:00:00.000Z",
        type: "text",
        meta: null,
      },
      {
        id: "l2",
        role: "self",
        senderName: null,
        content: "好，我下班前发你。",
        sentAt: "2026-03-11T09:08:00.000Z",
        type: "text",
        meta: null,
      },
      {
        id: "l3",
        role: "other",
        senderName: "阿澄",
        content: "明天仪器预约改到下午三点。",
        sentAt: "2026-03-11T09:15:00.000Z",
        type: "text",
        meta: null,
      },
    ],
  },
};

export const FIXTURE_C4 = {
  schemaVersion: 1,
  appKey: "c4",
  albums: [
    {
      id: "album-daily",
      title: "日常",
      coverHint: "☀️",
      count: 3,
      updatedAt: "2026-03-10T12:00:00.000Z",
    },
    {
      id: "album-trip",
      title: "旅行",
      coverHint: "🌊",
      count: 2,
      updatedAt: "2026-02-20T16:30:00.000Z",
    },
  ],
  itemsByAlbum: {
    "album-daily": [
      {
        id: "p1",
        caption: "窗边的一杯桂花茶",
        takenAt: "2026-03-09T08:12:00.000Z",
        placeholder: { tone: "mint", label: "茶" },
        locationHint: "宿舍阳台",
      },
      {
        id: "p2",
        caption: "实验记录本封面",
        takenAt: "2026-03-08T21:40:00.000Z",
        placeholder: { tone: "ink", label: "本" },
        locationHint: null,
      },
      {
        id: "p3",
        caption: "路过的猫",
        takenAt: "2026-03-07T19:05:00.000Z",
        placeholder: { tone: "coral", label: "猫" },
        locationHint: "校园小路",
      },
    ],
    "album-trip": [
      {
        id: "t1",
        caption: "海边风太大了",
        takenAt: "2026-02-18T15:20:00.000Z",
        placeholder: { tone: "blue", label: "海" },
        locationHint: "某海湾",
      },
      {
        id: "t2",
        caption: "夜市灯牌",
        takenAt: "2026-02-19T21:10:00.000Z",
        placeholder: { tone: "yellow", label: "灯" },
        locationHint: null,
      },
    ],
  },
};

export const FIXTURE_C8 = {
  schemaVersion: 1,
  appKey: "c8",
  notes: [
    {
      id: "note-pin",
      title: "本周待办",
      body: "1. 校对样本编号\n2. 回妈妈消息\n3. 买新的中性笔",
      updatedAt: "2026-03-12T10:00:00.000Z",
      pinned: true,
    },
    {
      id: "note-idea",
      title: "忽然想到",
      body: "如果把观察日志写成日记，会不会更轻松一点？",
      updatedAt: "2026-03-11T22:18:00.000Z",
      pinned: false,
    },
    {
      id: "note-pwd",
      title: "快递柜口令",
      body: "东门柜 · 取件码已短信（勿外传）",
      updatedAt: "2026-03-10T14:02:00.000Z",
      pinned: false,
    },
  ],
};

export const FIXTURE_C2 = {
  schemaVersion: 1,
  appKey: "c2",
  threads: [
    {
      id: "sms-bank",
      contactName: "栖行银行",
      contactHint: "955****8812",
      lastPreview: "您尾号 4821 账户支出 26.50 元",
      lastAt: "2026-03-12T12:08:00.000Z",
      unread: 1,
    },
    {
      id: "sms-mom",
      contactName: "妈妈",
      contactHint: "138****4721",
      lastPreview: "到家了吗？",
      lastAt: "2026-03-11T21:30:00.000Z",
      unread: 0,
    },
  ],
  messagesByThread: {
    "sms-bank": [
      {
        id: "sb1",
        direction: "in",
        body: "【栖行银行】您尾号 4821 账户支出 26.50 元，余额 ****。",
        sentAt: "2026-03-12T12:08:00.000Z",
      },
    ],
    "sms-mom": [
      {
        id: "sm1",
        direction: "in",
        body: "记得带伞。",
        sentAt: "2026-03-11T08:10:00.000Z",
      },
      {
        id: "sm2",
        direction: "out",
        body: "带了，放心。",
        sentAt: "2026-03-11T08:22:00.000Z",
      },
      {
        id: "sm3",
        direction: "in",
        body: "到家了吗？",
        sentAt: "2026-03-11T21:30:00.000Z",
      },
    ],
  },
};

export const FIXTURES_BY_APP = {
  c5: FIXTURE_C5,
  c4: FIXTURE_C4,
  c8: FIXTURE_C8,
  c2: FIXTURE_C2,
};
