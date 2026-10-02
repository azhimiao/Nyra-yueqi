import { BUILTIN_CHARACTER_ID } from "../constants.js";
import { getAllRecords, normalizeMemory, storeRecord } from "../storage/db.js";
import { hashPalaceContent } from "../memory/projection/palace-index-contract.js";
import { normalizeWorldbookEntry } from "../worldbook/match.js";
import { NYRA_INITIAL_CHARACTER_HISTORY_MARKDOWN } from "./content/nyra-initial-character-history.js";
import { NYRA_INITIAL_WORLD_BOOK_MARKDOWN } from "./content/nyra-initial-world-book.js";

export const NYRA_INITIAL_CONTENT_VERSION = "nyra-initial-content-v1";
const CREATED_AT = "2026-08-19T00:00:00.000Z";

const WORLD_TRIGGERS = Object.freeze({
  "月栖": ["月栖", "这里是什么", "这个世界", "不同入口", "换设备"],
  "房间": ["房间", "回家", "回来", "这里", "住所"],
  "Pop": ["Pop", "弹窗", "浮窗", "小窗"],
  "小手机": ["小手机", "栖机", "手机", "私人空间"],
  "First Light": ["First Light", "初见", "最初设置", "关系起点"],
  "记忆宫殿": ["记忆宫殿", "记忆库", "回忆", "记得", "过去"],
  "日记": ["日记", "写日记", "日记本"],
  "朋友圈": ["朋友圈", "动态", "发动态"],
  "相册": ["相册", "照片", "图片", "视觉记忆"],
  "一起听": ["一起听", "听歌", "音乐", "歌曲"],
  "一起读": ["一起读", "阅读", "读书", "书"],
  "时间": ["时间", "日期", "今天", "明天", "以后"],
  "游戏与共同创作": ["游戏", "共同创作", "共创", "角色扮演"],
  "助手与任务系统": ["助手", "任务", "Agent", "智能体", "探索"],
  "栖币、积分与市场": ["栖币", "积分", "市场", "余额", "购买"],
  "声音、图像与桌面形态": ["声音", "图像", "桌宠", "形象", "身体"],
  "备份与迁移": ["备份", "迁移", "导出", "恢复", "复制"],
  "世界之外": ["现实世界", "屏幕之外", "天气", "街道", "位置"],
  "世界事实与角色理解": ["世界事实", "客观事实", "角色理解", "主观理解"],
  "月栖最重要的世界规则": ["世界规则", "发生过", "事实", "伪造", "重新开始"],
});

function numberedSections(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const matches = [...source.matchAll(/^##\s+(\d+)｜([^\n]+)\n/gm)];
  return matches.map((match, index) => ({
    number: match[1],
    title: match[2].trim(),
    content: source.slice(match.index + match[0].length, matches[index + 1]?.index ?? source.length).trim(),
  })).filter((item) => item.content);
}

export function buildBuiltinNyraWorldbookEntries() {
  return numberedSections(NYRA_INITIAL_WORLD_BOOK_MARKDOWN).map((section) => normalizeWorldbookEntry({
    id: `nyra-world-v1-${section.number}`,
    title: section.title,
    category: "月栖初始世界书",
    content: section.content,
    triggers: WORLD_TRIGGERS[section.title] || [section.title],
    keys: WORLD_TRIGGERS[section.title] || [section.title],
    enabled: true,
    scope: "character",
    characterId: BUILTIN_CHARACTER_ID,
    linkedCharacterIds: [BUILTIN_CHARACTER_ID],
    injectSlot: "world_context",
    insertPosition: "before_history",
    matchMode: "any",
    priority: 70,
    tokenBudget: 460,
    sourcePackageId: NYRA_INITIAL_CONTENT_VERSION,
    sourceVersion: "1",
    updatedAt: CREATED_AT,
  }));
}

export function buildBuiltinNyraHistoryMemories() {
  return numberedSections(NYRA_INITIAL_CHARACTER_HISTORY_MARKDOWN).map((section) => {
    const sourceId = `nyra-origin-v1-${section.number}`;
    const rawText = `${section.title}\n${section.content}`;
    return normalizeMemory({
      id: sourceId,
      title: section.title,
      rawText,
      source: "character.history",
      sourceType: "authored_origin_memory",
      sourceId,
      sourceRef: {
        sourceType: "authored_origin_memory",
        sourceId,
        characterId: BUILTIN_CHARACTER_ID,
        truthDomain: "character_canon",
        authoredBy: "character_author",
      },
      contentHash: hashPalaceContent(rawText),
      projectionKind: "stable_memory",
      projectionVersion: 1,
      authority: "character_author",
      indexedAt: CREATED_AT,
      createdAt: CREATED_AT,
      role: "Nyra",
      wing: "Character",
      room: "History",
      weight: 1.32,
      tags: ["character-history", "authored-origin", section.title],
      pinned: false,
      searchable: true,
      companionId: BUILTIN_CHARACTER_ID,
      characterId: BUILTIN_CHARACTER_ID,
    });
  });
}

/** Idempotently add the author's initial content to the built-in Nyra only. */
export async function ensureBuiltinNyraInitialContent() {
  const worldSeeds = buildBuiltinNyraWorldbookEntries();
  const historySeeds = buildBuiltinNyraHistoryMemories();
  const [worldRows, memoryRows] = await Promise.all([
    getAllRecords("worldbook"),
    getAllRecords("memories"),
  ]);
  const worldIds = new Set((worldRows || []).map((row) => row.id));
  const memoryIds = new Set((memoryRows || []).map((row) => row.id));
  const missingWorld = worldSeeds.filter((row) => !worldIds.has(row.id));
  const missingHistory = historySeeds.filter((row) => !memoryIds.has(row.id));
  await Promise.all([
    ...missingWorld.map((row) => storeRecord("worldbook", row)),
    ...missingHistory.map((row) => storeRecord("memories", row)),
  ]);
  return {
    characterId: BUILTIN_CHARACTER_ID,
    worldbook: { total: worldSeeds.length, added: missingWorld.length },
    history: { total: historySeeds.length, added: missingHistory.length },
  };
}
