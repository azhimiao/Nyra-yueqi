/**
 * Step 12 · Checkpoint A — automated diary acceptance checks.
 * Run: node scripts/verify-diary-checkpoint.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = value;
    },
  },
};

const { buildDiaryContext } = await import("../src/diary/generate.js");
const { buildDiarySystemPrompt, getDiaryStyle } = await import("../src/diary/styles.js");
const { todayDiaryDay } = await import("../src/diary/fields.js");
const { buildExportPayload, restoreImportPayload } = await import("../src/memory/backup.js");
const { saveDiarySettings, getDiarySettings } = await import("../src/settings/preferences.js");

const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readSource(relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

// 1. 24h window excerpt
{
  const now = Date.now();
  const messages = [
    {
      role: "user",
      content: "二十五小时前的消息",
      createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
    },
    {
      role: "assistant",
      content: "一小时前的回复",
      createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
    },
  ];
  const context = await buildDiaryContext({
    sessionId: "checkpoint",
    getMessagesBySession: async () => messages,
    getAllRecords: async () => [],
    normalizeMemory: (record) => record,
    currentDailyStatus: null,
    collectCharacterProfile: () => ({ name: "测试角色" }),
  });
  check(
    "24h 窗口 excerpt 正确",
    context.messageCount === 1
      && context.excerpt.includes("一小时前的回复")
      && !context.excerpt.includes("二十五小时前"),
    `messageCount=${context.messageCount}`,
  );
}

// 2. 立即生成 pinned:false（静态）
{
  const appJs = readSource("src/app.js");
  check(
    "立即生成入库且默认不 pin",
    /async function generateDiaryNow/.test(appJs)
      && appJs.includes("pinned: existing ? undefined : false"),
  );
}

// 3. 收藏仅 toggle pin
{
  const appJs = readSource("src/app.js");
  const bookJs = readSource("src/ui/diary-book.js");
  check(
    "收藏 / 取消收藏仅 toggle pin",
    appJs.includes("async function toggleDiaryPin")
      && appJs.includes("createDiaryBook")
      && bookJs.includes("data-diary-page-pin")
      && bookJs.includes("onPin")
      && !/async function ingestTodayDiary/.test(appJs),
  );
  check(
    "日历展开不销毁翻页书",
    bookJs.includes("Do NOT destroy/remount PageFlip")
      && /function setCalendarExpanded\([\s\S]*?function collapseCalendar/.test(bookJs)
      && !/function setCalendarExpanded\([\s\S]*?pageFlip\.destroy[\s\S]*?function collapseCalendar/.test(bookJs),
  );
}

// 4. 同日覆盖确认
{
  const appJs = readSource("src/app.js");
  check(
    "同日立即生成：提示 + 覆盖/取消",
    appJs.includes("confirmOverwriteDiary")
      && /const existing = await getDiaryForDay\(diaryDay(?:, companionId)?\)/.test(appJs)
      && appJs.includes("if (!overwrite) return"),
  );
}

// 5. 定时调度
{
  const scheduleJs = readSource("src/diary/schedule.js");
  const appJs = readSource("src/app.js");
  check(
    "定时到点自动生成",
    scheduleJs.includes("rescheduleDiary")
      && scheduleJs.includes("runGenerate")
      && appJs.includes("runScheduledDiaryGenerate"),
  );
}

// 6. 角色名来自人物卡
{
  const prompt = buildDiarySystemPrompt(getDiaryStyle("literary"), {
    characterName: "小可",
    userName: "你",
  });
  check(
    "角色名来自人物卡",
    prompt.includes("你是小可")
      && !prompt.includes("沈既白"),
  );
  check("日记 prompt 含关系总结", prompt.includes("关系总结"));
}

// 7. 备份恢复 schedule
{
  const payload = await buildExportPayload({
    collectProfileState: () => ({}),
    collectLibraryState: () => ({}),
    getEcosystemState: () => ({}),
    getAllRecords: async () => [],
    normalizeMemory: (record) => record,
    collectWorldbookEntries: () => [],
    currentDailyStatus: null,
    collectSettings: () => ({
      diary: {
        style: "story",
        scheduleEnabled: true,
        scheduleTime: "21:30",
        scheduleOverwrite: false,
      },
      rag: { topK: 4, scope: "all" },
      sync: { strategy: "local_wins" },
    }),
  });
  check(
    "导出含 settings.diary",
    payload.settings?.diary?.scheduleTime === "21:30"
      && payload.settings.diary.scheduleEnabled === true,
  );

  let restored = false;
  await restoreImportPayload(payload, {
    writeLocalObject: () => {},
    localFallback: { profileKey: "p", libraryKey: "l", statusKey: "s" },
    clearStore: async () => {},
    storeRecord: async () => {},
    normalizeMemory: (record) => record,
    saveEcosystemState: () => {},
    getEcosystemState: () => ({}),
    applyProfileState: () => {},
    renderLibraryState: async () => {},
    renderWorldbookEntries: () => {},
    renderMemoryState: async () => {},
    loadChatHistory: async () => {},
    onDiarySettingsRestored: () => {
      restored = true;
    },
  });
  const settings = getDiarySettings();
  check(
    "导入恢复 schedule 并触发 reschedule 钩子",
    settings.scheduleTime === "21:30"
      && settings.scheduleEnabled === true
      && settings.scheduleOverwrite === false
      && restored,
  );
}

// diaryDay format sanity
check("diaryDay 格式 YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(todayDiaryDay()));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Checkpoint A failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Checkpoint A passed: ${checks.length}/${checks.length}`);
