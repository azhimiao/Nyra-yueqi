/**
 * C1 contract check — consumer home IA (not L3 product acceptance).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const {
  C1_DOCK_ORDER,
  C1_GRID_ORDER,
  FROZEN_HOME_APP_IDS,
  WIDGET_APP_LINKS,
  activeWidgetAppIds,
  MAX_CONSUMER_HOME_ENTRIES,
  LAYOUT_VERSION_C1,
  HOME_PAGE_COUNT_C1,
  selectGreeting,
  selectLocalAtmosphere,
  selectPresenceWidget,
  selectRelationWidget,
  selectTogetherWidget,
  CREATOR_FOLDER_ENTRY,
} = await import("../src/phone-shell/home-layout.js");

const {
  DEFAULT_DOCK_ORDER,
  DEFAULT_ICON_ORDER,
  DEFAULT_FOLDERS,
  HOME_PAGE_COUNT,
  DOCK_SLOT_COUNT,
  packIconSlots,
  stripDockFromIconOrder,
  normalizeDockOrder,
  listDefaultVisibleHomeIds,
  FROZEN_HOME_APP_IDS: catalogFrozen,
} = await import("../src/phone-shell/apps-catalog.js");
const {
  DEFAULT_WIDGETS,
  buildC1HomePrefs,
  loadPhoneOsPrefs,
  savePhoneOsPrefs,
  reconcileWidgetAppPlacement,
} = await import("../src/phone-shell/os-prefs.js");

check("home-layout.js exists", existsSync(join(root, "src/phone-shell/home-layout.js")));
check("layout version includes scenario on home", LAYOUT_VERSION_C1 === "c14-scenario-icon");
check("home page count is 2 (widget + apps)", HOME_PAGE_COUNT === 2 && HOME_PAGE_COUNT_C1 === 2);

const dock = DEFAULT_DOCK_ORDER.filter(Boolean);
check("dock has exactly 4 apps", dock.length === DOCK_SLOT_COUNT && dock.length === 4, `dock=${dock.join(",")}`);
check(
  "new-install dock prioritizes diary, gallery, character, settings",
  dock.join(",") === C1_DOCK_ORDER.join(",") && dock.join(",") === "diary,gallery,profile,settings",
);
check("dock ids unique", new Set(dock).size === dock.length);

const gridDense = DEFAULT_ICON_ORDER.filter(Boolean);
check(
  "grid consumer entries ≤ 12",
  gridDense.length <= MAX_CONSUMER_HOME_ENTRIES,
  `count=${gridDense.length}`,
);
check("grid order matches C1", gridDense.join(",") === C1_GRID_ORDER.join(","));
check("explore on default consumer grid", gridDense.includes("explore"));
check("assist on default consumer grid", gridDense.includes("assist"));
check("sidewrite not on default grid", !gridDense.includes("sidewrite"));
check("xp apps not on default grid", ["scroll", "adventure", "cocreate"].every((id) => !gridDense.includes(id)));
check("scenario on default consumer grid", gridDense.includes("scenario"));
check("widget-backed apps not duplicated on grid", activeWidgetAppIds().every((id) => !gridDense.includes(id)));
check("dock apps not on grid", dock.every((id) => !gridDense.includes(id)));
check("widget-backed apps not duplicated in dock", activeWidgetAppIds().every((id) => !dock.includes(id)));
check("widget links cover chat, listen, calendar", JSON.stringify(WIDGET_APP_LINKS) === JSON.stringify({ today: "pop", listen: "listen", calendar: "calendar" }));

const frozenOnGrid = gridDense.filter((id) => FROZEN_HOME_APP_IDS.includes(id) || catalogFrozen.includes(id));
check("frozen apps not on default grid root", frozenOnGrid.length === 0, frozenOnGrid.join(",") || "ok");

check("creator folder removed from defaults", !DEFAULT_FOLDERS.creator && !gridDense.includes(CREATOR_FOLDER_ENTRY));
check(
  "xp apps frozen for strip",
  ["scroll", "adventure", "cocreate", "sidewrite"].every((id) => FROZEN_HOME_APP_IDS.includes(id)),
);

const packed = packIconSlots(DEFAULT_ICON_ORDER);
check("default icon slots allocate one page", packed.length === 24, `slots=${packed.length}`);
const stripped = stripDockFromIconOrder(packed, DEFAULT_DOCK_ORDER);
const dockNorm = normalizeDockOrder(DEFAULT_DOCK_ORDER, stripped);
check(
  "normalizeDock keeps 4 without grid overlap",
  dockNorm.filter(Boolean).length === 4
    && dockNorm.every((id) => !id || !stripped.includes(id)),
);

const duplicatePlacement = reconcileWidgetAppPlacement({
  iconOrder: ["calendar", "memory", "listen", "folder:f1", ...Array(20).fill(null)],
  dockOrder: ["pop", "moments", "listen", "qishi"],
  folders: { f1: { name: "常用", apps: ["calendar", "diary"] } },
  widgets: DEFAULT_WIDGETS,
  iconPageCount: 1,
});
const activeBacked = new Set(activeWidgetAppIds(DEFAULT_WIDGETS));
const duplicateFolderApps = Object.values(duplicatePlacement.folders).flatMap((folder) => folder.apps);
check(
  "enabled widget apps are stripped from dock, grid, and folders",
  duplicatePlacement.iconOrder.every((id) => !activeBacked.has(id))
    && duplicatePlacement.dockOrder.every((id) => !activeBacked.has(id))
    && duplicateFolderApps.every((id) => !activeBacked.has(id)),
);

const restoredPlacement = reconcileWidgetAppPlacement({
  iconOrder: ["memory", ...Array(23).fill(null)],
  dockOrder: ["moments", "qishi", null, null],
  folders: {},
  widgets: { ...DEFAULT_WIDGETS, today: false, listen: false, calendar: false },
  iconPageCount: 1,
});
const restoredIds = [
  ...restoredPlacement.iconOrder,
  ...restoredPlacement.dockOrder,
  ...Object.values(restoredPlacement.folders).flatMap((folder) => folder.apps),
].filter(Boolean);
check(
  "disabled widgets restore each app exactly once",
  ["pop", "listen", "calendar"].every((id) => restoredIds.filter((item) => item === id).length === 1),
);
check("fresh home prefs contain one icon page", buildC1HomePrefs({}).iconPageCount === 1);
check("commerce remains reachable on the app page", ["moments", "shop", "qishi"].every((id) => gridDense.includes(id)));

const previousLocalStorage = globalThis.localStorage;
const localData = new Map();
globalThis.localStorage = {
  getItem: (key) => localData.get(key) ?? null,
  setItem: (key, value) => localData.set(key, String(value)),
  removeItem: (key) => localData.delete(key),
};
try {
  const oldDefaults = {
    ...buildC1HomePrefs({}), contextAppsVersion: 1,
    dockOrder: ["moments", "qishi", "shop", "settings"],
    iconOrder: packIconSlots(["scenario", "explore", "assist", "diary", "gallery", "read", "games", "memory", "worldbook", "profile", "beautify", "pet"]),
  };
  localData.set("yueqi.phone.os.v1", JSON.stringify(oldDefaults));
  const loaded = loadPhoneOsPrefs();
  check("existing shipped desktop is not reordered", JSON.stringify(loaded.iconOrder) === JSON.stringify(oldDefaults.iconOrder) && JSON.stringify(loaded.dockOrder) === JSON.stringify(oldDefaults.dockOrder));
  const custom = { ...loaded, iconOrder: packIconSlots([null, "worldbook", "folder:mine", "memory"]), folders: { mine: { name: "我的角落", apps: ["gallery", "read"] } }, dockOrder: ["qishi", "settings", null, null] };
  custom.iconOrder = [null, "worldbook", "folder:mine", "memory", ...Array(20).fill(null)];
  localData.set("yueqi.phone.os.v1", JSON.stringify(custom));
  const roundTrip = savePhoneOsPrefs(loadPhoneOsPrefs());
  check("custom icon gaps, folders and dock survive load/save", JSON.stringify(roundTrip.iconOrder) === JSON.stringify(custom.iconOrder) && JSON.stringify(roundTrip.folders) === JSON.stringify(custom.folders) && JSON.stringify(roundTrip.dockOrder) === JSON.stringify(custom.dockOrder));
  check("new fresh defaults do not resurrect removed apps", !roundTrip.iconOrder.includes("shop") && !roundTrip.iconOrder.includes("moments"));
} finally {
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
}

const visible = listDefaultVisibleHomeIds();
const visibleApps = visible.filter((id) => !String(id).startsWith("folder:"));
check("default visible app ids are unique across widget/dock/grid", new Set(visibleApps).size === visibleApps.length);
check(
  "visible root apps exclude frozen",
  visibleApps.every((id) => !FROZEN_HOME_APP_IDS.includes(id)),
);

// Widget selectors — no hardcoded character name / fake fixed clock
const g1 = selectGreeting(new Date("2026-07-26T08:00:00"));
const g2 = selectGreeting(new Date("2026-07-26T20:00:00"));
check("greeting follows real hour", g1 === "早上好" && g2 === "晚上好", `${g1}/${g2}`);

const atmo = selectLocalAtmosphere(new Date("2026-07-26T15:00:00"));
check("atmosphere is local source", atmo.source === "local" && Boolean(atmo.label));

const presence = selectPresenceWidget({ name: "测试角色", lastMessage: "嗨" });
check("presence uses provided name", presence.name === "测试角色" && presence.openApp === "pop");
check("presence fallback is TA not 林星梨", selectPresenceWidget({}).name === "TA");

const relationEmpty = selectRelationWidget({
  events: [],
  anniversaryDate: "",
  characterName: "测试角色",
  now: new Date("2026-07-26T12:00:00"),
});
check("relation empty uses suggestion", relationEmpty.empty === true && relationEmpty.body.includes("测试角色"));

const together = selectTogetherWidget({
  listenState: { title: "夜曲", playlist: "A", paused: false },
  books: [],
  scenarioRun: null,
});
check("together binds listen title", together.kind === "listen" && together.title === "夜曲");

const layoutSrc = readFileSync(join(root, "src/phone-shell/home-layout.js"), "utf8");
check("home-layout has no hardcoded 林星梨", !layoutSrc.includes("林星梨"));
const shellSrc = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check("shell widget markup uses live companion placeholders", shellSrc.includes("data-home-presence-copy") && shellSrc.includes("data-home-relationship-meta"));
check("shell does not hardcode 夜航书页 in widget HTML", !/<strong data-phone-track>夜航书页<\/strong>/.test(shellSrc));

const css = readFileSync(join(root, "src/ui/phone-shell.css"), "utf8");
check("app icon min touch 44px", /\.mini-app-icon\s*\{[^}]*min-height:\s*44px/s.test(css));
check("music widget button 44px", /\.mini-widget--music button\s*\{[^}]*min-height:\s*44px/s.test(css));
check("home overflow hidden (no double scroll)", /\.mini-home\s*\{[^}]*overflow:\s*hidden/s.test(css));

const prefsSrc = readFileSync(join(root, "src/phone-shell/os-prefs.js"), "utf8");
check("os-prefs migrates layoutVersion c1", prefsSrc.includes("LAYOUT_VERSION_C1") && prefsSrc.includes("buildC1HomePrefs"));

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
check("package.json has verify:core-c1", pkg.scripts?.["verify:core-c1"] === "node scripts/verify-core-c1.mjs");

const reviewPath = join(root, "docs/qa/core-experience/C1/REVIEW.md");
check("C1 REVIEW.md exists", existsSync(reviewPath));
if (existsSync(reviewPath)) {
  const review = readFileSync(reviewPath, "utf8");
  check("REVIEW does not self-sign L3", !review.includes("L3 接受") && !review.includes("视觉通过"));
}

const status = readFileSync(join(root, "docs/qa/core-experience/STATUS.md"), "utf8");
check("STATUS marks C1 product_review", /C1[\s\S]*product_review/.test(status) || status.includes("product_review"));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
