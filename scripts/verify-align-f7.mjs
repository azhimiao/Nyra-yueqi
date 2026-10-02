/**
 * F7 — 栖市 / 栖机扩展 / 门禁 / 举报 / 本地聊天助手
 * Run: node scripts/verify-align-f7.mjs
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
    removeItem(key) {
      delete this._data[key];
    },
  },
};

const {
  validateManifest,
  PERMISSION_IDS,
  PERMISSION_DEFS,
  checkPermission,
  permissionDeniedMessage,
  parseExtDesktopId,
  EXT_MANIFEST_KIND,
} = await import("../src/phone-ext/manifest-schema.js");
const {
  createMemoryRegistry,
  insertExtIntoIconOrder,
  removeExtFromIconOrder,
} = await import("../src/phone-ext/registry.js");
const { unpackExtPackage } = await import("../src/phone-ext/package-io.js");
const {
  SAMPLE_MANIFEST,
  buildSampleExtZipBytes,
  SAMPLE_EXT_ID,
} = await import("../src/phone-ext/sample-fixtures.js");
const { normalizeGatePrefs } = await import("../src/gate/gate-prefs.js");
const { listDataModuleIds } = await import("../src/memory/data-modules.js");
const { normalizeSceneAppId } = await import("../src/prompt/scene-tags.js");
const { isRenderableTokenCard, renderTokenCardHtml } = await import("../src/chat/token-message.js");

// 1. validateManifest
const okManifest = validateManifest(SAMPLE_MANIFEST);
check("validateManifest sample ok", okManifest.ok === true, okManifest.ok ? SAMPLE_MANIFEST.id : okManifest.code);

const noKind = validateManifest({ ...SAMPLE_MANIFEST, kind: "nope" });
check("validateManifest invalid_kind", noKind.ok === false && noKind.code === "invalid_kind", noKind.code);

const badId = validateManifest({ ...SAMPLE_MANIFEST, id: "BAD" });
check("validateManifest bad_id", badId.ok === false && badId.code === "bad_id", badId.code);

const badPerm = validateManifest({ ...SAMPLE_MANIFEST, permissions: ["calendar.read", "hack.all"] });
check("validateManifest bad_permissions", badPerm.ok === false && badPerm.code === "bad_permissions", badPerm.code);

// 2. permission table
check(
  "PERMISSION_IDS length≥10 + keys",
  PERMISSION_IDS.length >= 10
    && PERMISSION_IDS.includes("calendar.read")
    && PERMISSION_IDS.includes("chat.send_token"),
  String(PERMISSION_IDS.length),
);
check(
  "each permission has labelZh",
  PERMISSION_DEFS.every((d) => d.id && d.labelZh),
);

// 3–4. checkPermission + message
check("checkPermission allow", checkPermission(["calendar.read"], "calendar.read") === true);
check("checkPermission deny", checkPermission([], "calendar.read") === false);
check(
  "permissionDeniedMessage 读取日历",
  permissionDeniedMessage("calendar.read").includes("读取日历"),
  permissionDeniedMessage("calendar.read"),
);

// 5. parseExtDesktopId
check(
  "parseExtDesktopId ext:foo",
  JSON.stringify(parseExtDesktopId("ext:foo")) === JSON.stringify({ extId: "foo" }),
);
check("parseExtDesktopId null", parseExtDesktopId("qishi") === null);

// 6. gate prefs defaults
const gate = normalizeGatePrefs({});
check(
  "normalizeGatePrefs defaults",
  gate.localMode === true
    && gate.cloudGateEnabled === false
    && gate.localChatAssistantEnabled === false,
  JSON.stringify(gate),
);

// 7. sample zip unpack
const zipBytes = buildSampleExtZipBytes();
const unpacked = await unpackExtPackage(zipBytes);
check("sample zip unpack ok", unpacked.ok === true, unpacked.ok ? unpacked.manifest?.id : unpacked.code);
check(
  "sample zip entry exists",
  unpacked.ok && Boolean(unpacked.files?.[unpacked.manifest.entry || "index.html"]),
);

// Write public sample package for sideload demos
const publicDir = join(root, "public", "extensions", "sample-calendar-token");
const zipOut = join(root, "public", "extensions", "sample-calendar-token.yueqi-ext.zip");
try {
  mkdirSync(publicDir, { recursive: true });
  if (unpacked.ok) {
    for (const [path, content] of Object.entries(unpacked.files)) {
      if (content.startsWith("data:")) continue;
      writeFileSync(join(publicDir, path), content, "utf8");
    }
  }
  writeFileSync(zipOut, zipBytes);
  check("wrote sample zip to public/extensions", existsSync(zipOut));
} catch (err) {
  check("wrote sample zip to public/extensions", false, String(err?.message || err));
}

// 8. memory registry install/uninstall + icon prune
const mem = createMemoryRegistry();
const installed = mem.install({
  manifest: SAMPLE_MANIFEST,
  files: unpacked.files,
  iconOrder: [null, "calendar", null, "shop"],
});
check("memory install ok", installed.ok === true && installed.extension?.id === SAMPLE_EXT_ID);
check(
  "icon order gained ext id",
  installed.iconOrder.includes(`ext:${SAMPLE_EXT_ID}`),
  JSON.stringify(installed.iconOrder),
);
const removed = mem.uninstall(SAMPLE_EXT_ID, installed.iconOrder);
check(
  "uninstall clears icon",
  !removed.iconOrder.includes(`ext:${SAMPLE_EXT_ID}`)
    && mem.list().length === 0,
  JSON.stringify(removed.iconOrder),
);

const order2 = insertExtIntoIconOrder([null, null], "abc-ext");
check("insertExtIntoIconOrder", order2[0] === "ext:abc-ext");
check(
  "removeExtFromIconOrder",
  removeExtFromIconOrder(order2, "abc-ext").every((id) => id !== "ext:abc-ext"),
);

// scene tag E4
check(
  "phone-ext appId preserved",
  normalizeSceneAppId("phone-ext:sample-calendar-token") === "phone-ext:sample-calendar-token",
);
check("unknown still → pop", normalizeSceneAppId("nope") === "pop");

// token card reminder fallback
check(
  "reminder token renderable",
  isRenderableTokenCard("token_card", { kind: "reminder", title: "提醒" }),
);
const reminderHtml = renderTokenCardHtml({ kind: "reminder", title: "今日提醒", subtitle: "09:00" });
check("reminder card html", reminderHtml.includes("信物 · 提醒") && reminderHtml.includes("今日提醒"));

// backup modules
const mods = listDataModuleIds();
check(
  "DATA_MODULES has extensions/gatePrefs/reports",
  ["extensions", "gatePrefs", "reports"].every((id) => mods.includes(id)),
  mods.filter((id) => ["extensions", "gatePrefs", "reports"].includes(id)).join(","),
);

// catalog / shell markers
const { readFileSync } = await import("node:fs");
const catalog = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
check("apps-catalog has qishi", catalog.includes('id: "qishi"') && catalog.includes("栖市"));
check("qishi market catalog", existsSync(join(root, "src/qishi/market-catalog.js")));
const qishiAppSrc = readFileSync(join(root, "src/qishi/qishi-app.js"), "utf8");
check("qishi UI is coming-soon", qishiAppSrc.includes("comingSoonTitle") && qishiAppSrc.includes("mini-qishi-soon"));
const qishiScreen = readFileSync(join(root, "src/qishi/qishi-screens.js"), "utf8");
check("qishi keeps sideload", qishiScreen.includes("data-qishi-sideload") && qishiScreen.includes("栖市"));
check("EXT_MANIFEST_KIND", EXT_MANIFEST_KIND === "yueqi-phone-ext");

const localDoc = readFileSync(join(root, "docs/LOCAL_CHAT_ASSISTANT.md"), "utf8");
check(
  "LOCAL_CHAT_ASSISTANT.md exists + no banned brands",
  localDoc.includes("本地聊天助手")
    && !/微信|WeChat|Discord|Telegram|WhatsApp/i.test(localDoc),
);

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
