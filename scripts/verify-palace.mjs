import { readAppBundle } from "./lib/app-sources.mjs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { shouldRecall, inferWingRoom } from "../src/memory/palace/recall.js";
import { bm25Scores, hybridRank, closetBoostForQuery } from "../src/memory/palace/hybrid.js";
import { writeSessionDiary, readSessionDiary } from "../src/memory/palace/diary.js";
import { splitDrawerText, shouldChunkText } from "../src/memory/palace/chunk.js";
import { expandWithNeighbors } from "../src/memory/palace/neighbor.js";
import { enhancedEmbedText } from "../src/memory/palace/embeddings.js";
import { inferKgSubjects } from "../src/memory/palace/kg.js";
import { setWakeUpContext, peekWakeUpBlock, consumeWakeUpBlock } from "../src/memory/palace/wake-up-store.js";

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

let passed = 0;
let failed = 0;

function check(label, ok) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
  }
}

async function main() {
  const appJs = readAppBundle(join(dirname(fileURLToPath(import.meta.url)), ".."));
  const assembleJs = await readFile(new URL("../src/prompt/assemble.js", import.meta.url), "utf8");
  const searchJs = await readFile(new URL("../src/memory/palace/search.js", import.meta.url), "utf8");
  const drawerJs = await readFile(new URL("../src/memory/palace/drawer.js", import.meta.url), "utf8");
  const booksJs = await readFile(new URL("../src/library/books-import.js", import.meta.url), "utf8");

  check("Recall: 还记得 → true", shouldRecall("你还记得上次下雨吗"));
  check("Recall: 修改变量 → false", shouldRecall("修改变量名") === false);
  check("Recall: 短句想你了 → false（连续上下文，非深检索）", shouldRecall("想你了") === false);
  check("Recall: 指代地点 → true", shouldRecall("还是上次那个地方吧") === true);
  check("Recall: 长闲聊不因字多强制", shouldRecall("今天天气不错我们随便聊聊近况怎么样啊哈哈") === false);
  check("Wing 推断: 日记", inferWingRoom("今天的日记写了什么").wing === "Relationship");

  const bm25 = bm25Scores("下雨 陪伴", ["夜里下雨", "修改变量", "雨夜陪伴"]);
  check("BM25 排序", bm25[0] >= bm25[1] || bm25[2] >= bm25[1]);

  const ranked = hybridRank(
    [
      { text: "雨夜陪伴", distance: 0.4 },
      { text: "无关内容", distance: 0.2 },
    ],
    "下雨 陪伴"
  );
  check("hybridRank 重排", ranked[0].text.includes("雨") || ranked[0].hybridScore >= ranked[1].hybridScore);

  check("closet boost", closetBoostForQuery({ wing: "Relationship", room: "Diary", tags: ["雨夜"] }, "雨夜") > 0);

  writeSessionDiary({ summary: "验收会话摘要" });
  check("session diary", readSessionDiary(1)[0]?.summary?.includes("验收"));

  check("drawer chunking", shouldChunkText("x".repeat(1000)) && splitDrawerText("a".repeat(1000)).length > 1);
  check("neighbor expand", expandWithNeighbors(
    [{ id: "a", drawerId: "d1", chunkIndex: 0, chunkTotal: 2, wing: "W", room: "R", finalScore: 1 }],
    [
      { id: "a", drawerId: "d1", chunkIndex: 0, chunkTotal: 2, wing: "W", room: "R", rawText: "a" },
      { id: "b", drawerId: "d1", chunkIndex: 1, chunkTotal: 2, wing: "W", room: "R", rawText: "b" },
    ]
  ).length >= 2);
  check("enhanced embedding", enhancedEmbedText("雨夜 陪伴").length === 64);
  check("KG subjects", inferKgSubjects("你还记得既白喜欢什么").includes("角色"));

  check("app 接入 searchPalace", appJs.includes("searchPalace"));
  check("assemble palaceSkipped", assembleJs.includes("palaceSkipped"));
  // App owns the one-shot read; assembly only receives the resulting value.
  // Execute the actual compilePrompt body with read-only boundary stubs so both
  // preview entry modes must preserve a pending wake-up for the next real turn.
  const compileSource = appJs.match(/async function compilePrompt\([\s\S]*?(?=\nasync function previewAuthoringPrompt\()/)?.[0];
  check("app owns wake-up consumption", Boolean(compileSource?.includes("consumeWakeUpBlock")) && !assembleJs.includes("consumeWakeUpBlock"));
  check("assemble receives wake-up with preview guard", /wakeUpBlock\s*=\s*""/.test(assembleJs)
    && /const resolvedWakeUpBlock\s*=\s*preview\s*\?\s*""\s*:\s*String\(wakeUpBlock\s*\|\|\s*""\)/.test(assembleJs)
    && /wakeUpBlock:\s*resolvedWakeUpBlock/.test(assembleJs));
  if (compileSource) {
    const compile = runInNewContext(`${compileSource}\ncompilePrompt;`, {
      getChatFocus: () => ({ kind: "dm", characterId: "palace-verify" }),
      getActiveCharacterId: () => "palace-verify",
      getCurrentSessionId: () => "palace-verify-session",
      getCharacterSync: (id) => ({ id }),
      setLastGroupSpeakerId() {},
      assemblePrompt: (input) => input,
      readDailyStatusForPreview: () => ({}),
      refreshDailyStatus: async () => ({}),
      searchPalace: async () => ({ results: [] }),
      searchMemories: async () => [],
      getAllRecords: async () => [],
      collectExternalContext: () => [],
      consumeWakeUpBlock,
    });
    const wakeUp = "verify pending wake-up";
    setWakeUpContext({ block: wakeUp });
    const preview = await compile("inspect", { preview: true });
    check("preview flag preserves pending wake-up", preview.preview === true && preview.wakeUpBlock === "" && peekWakeUpBlock() === wakeUp);
    const debug = await compile("inspect", { purpose: "debug_preview" });
    check("debug preview preserves pending wake-up", debug.preview === true && debug.wakeUpBlock === "" && peekWakeUpBlock() === wakeUp);
    const real = await compile("hello");
    const next = await compile("again");
    check("real turn consumes wake-up exactly once", real.wakeUpBlock === wakeUp && next.wakeUpBlock === "" && peekWakeUpBlock() === "");
  }
  check("searchDrawers 主路径", searchJs.includes("searchDrawers"));
  check("drawer fileDrawer chunk", drawerJs.includes("splitDrawerText"));
  check("books fileDrawer", booksJs.includes("fileDrawer"));
  check("native-search 模块", (await readFile(new URL("../src/memory/palace/native-search.js", import.meta.url), "utf8")).includes("embedPalaceText"));
  check("sqlite FTS 适配", (await readFile(new URL("../src/storage/sqlite-adapter.js", import.meta.url), "utf8")).includes("memory_fts"));
  check("App Preferences KV", (await readFile(new URL("../src/platform/kv-store.js", import.meta.url), "utf8")).includes("Preferences"));

  const kgJs = await readFile(new URL("../src/memory/palace/kg.js", import.meta.url), "utf8");
  const backupJs = await readFile(new URL("../src/memory/backup.js", import.meta.url), "utf8");
  const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  check("KG 模块", kgJs.includes("addKgFact") && kgJs.includes("extractKgFromText"));
  check("union pool", (await readFile(new URL("../src/memory/palace/pool-rank.js", import.meta.url), "utf8")).includes("expandWithNeighbors"));
  check("closet 模块", (await readFile(new URL("../src/memory/palace/closet.js", import.meta.url), "utf8")).includes("closetBoostMap"));
  check("wake-up store", (await readFile(new URL("../src/memory/palace/wake-up-store.js", import.meta.url), "utf8")).includes("setWakeUpContext"));
  check("assemble kgBlock", assembleJs.includes("kgBlock"));
  check("backup palaceKg", backupJs.includes("palaceKg") && backupJs.includes('clearStore("palace_kg")'));
  check("宫殿 browse UI", indexHtml.includes("data-palace-drawer-list") && appJs.includes("renderPalaceWings"));
  check("唤醒注入", appJs.includes("setWakeUpContext"));
  check("IndexedDB palace_kg", (await readFile(new URL("../src/storage/db.js", import.meta.url), "utf8")).includes("palace_kg"));
  check("palace enabled UI", indexHtml.includes("data-palace-enabled"));

  console.log(`\nPalace verification: ${passed}/${passed + failed}`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
