/**
 * v1.0 RC verification (Steps 33–50).
 * Run: node scripts/verify-v1.mjs
 */

import { readFileSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
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

const { togetherDaysFromAnniversary, isAnniversaryToday } = await import("../src/calendar/anniversaries.js");
const { composeUserText, buildUserMessagePayload } = await import("../src/chat/attachments.js");
const { parseId3Title } = await import("../src/library/audio.js");
const { importTextBook } = await import("../src/library/books.js");
const { enqueuePerceptionJob } = await import("../src/ai/perception.js");
const { summarizePhotoOnImport } = await import("../src/library/photos.js");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const appJs = readAppBundle(root);
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const backupJs = readFileSync(join(root, "src/memory/backup.js"), "utf8");

check("Step 33: 纪念日 UI", indexHtml.includes("data-anniversary-date"));
check("Step 33: 在一起天数读纪念日", appJs.includes("togetherDaysFromAnniversary"));
check("Step 33: 周年调度", appJs.includes("getAnniversaryDate"));
check("Step 33: 纪念日逻辑", isAnniversaryToday("2020-07-10", new Date("2026-07-10T12:00:00")));
check("Step 33: 天数计算", (togetherDaysFromAnniversary("2026-07-09") || 0) >= 1);

check("Step 36/37: 书籍导入", appJs.includes("importBookFile"));
check("Step 36: txt 导入", (await importTextBook({ name: "a.txt", text: async () => "hello book" })).excerpt === "hello book");

const summarizedPhoto = await summarizePhotoOnImport(
  { id: "photo-1", title: "窗边的光" },
  { name: "window.png" },
  {
    collectProviderConfig: () => ({}),
    updatePhoto: async (photo) => photo,
  },
);
check(
  "Step 39/40: 相册 summary",
  typeof summarizePhotoOnImport === "function" && summarizedPhoto?.summary === "window.png",
);
check("Step 35: 感知队列", typeof enqueuePerceptionJob === "function");

check("Step 42: ID3 解析模块", appJs.includes("enrichAudioMetadata"));

check("Step 44/45: 附件多模态", appJs.includes("buildAttachmentContext"));
const payload = buildUserMessagePayload("你好", { type: "image", name: "a.png", dataUrl: "data:image/png;base64,abc" });
check("Step 44: 图片消息结构", Array.isArray(payload.content));

check("Step 47: 备份含 avatar", backupJs.includes("avatar:") && backupJs.includes("mediaManifest"));
check("Step 48: 冲突策略 UI", indexHtml.includes("data-sync-strategy"));

check(
  "Step 49: 双模式入口",
  indexHtml.includes('data-app-mode="phone"') && indexHtml.includes("data-small-phone-root")
);

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`v1 verification failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`v1 verification passed: ${checks.length}/${checks.length}`);
