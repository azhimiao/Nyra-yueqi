/**
 * CP-13 YEOS — install → save → session event minimal loop.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { installPackageBytes } from "../../src/yeos/installer.js";
import {
  getInstalledGame,
  listInstalledGames,
  uninstallGame,
  YEOS_GAMES_STORE_KEY,
} from "../../src/yeos/registry-games.js";
import { loadGameSave, saveGameSave, YEOS_SAVES_STORE_KEY } from "../../src/yeos/saves.js";
import { createNyraGameBridge } from "../../src/yeos/bridge-game.js";
import {
  __clearAppEventsForTests,
  __setAppEventStorageForTests,
  listRecentAppEvents,
} from "../../src/world/app-events.js";
import { __setCohabitStorageForTests } from "../../src/memory/cohabit-timeline.js";

const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const storage = makeMemoryStorage();
globalThis.window = { localStorage: storage };
__clearAppEventsForTests();
__setAppEventStorageForTests(storage);
__setCohabitStorageForTests(storage);

const GAME_PERMS = ["game.save", "game.event"];

console.log("=== CP-13 Install package ===");
{
  storage.removeItem(YEOS_GAMES_STORE_KEY);
  storage.removeItem(YEOS_SAVES_STORE_KEY);
  const zipPath = join(root, "sdk/game-package/sample-first-scene.yueqi-game.zip");
  const bytes = readFileSync(zipPath);
  const result = await installPackageBytes(new Uint8Array(bytes), {
    grantedPermissions: GAME_PERMS,
  });
  assert(result.ok, `install ok (${result.code || result.message || "unknown"})`);
  assert(result.kind === "yueqi-game", "kind game");
  assert(result.record?.id === "sample-first-scene", "installed id");
  const listed = listInstalledGames();
  assert(listed.some((g) => g.id === "sample-first-scene"), "listed after install");
  const row = getInstalledGame("sample-first-scene");
  assert(row?.manifest?.entry === "game.html", "manifest entry");
  assert(Boolean(row?.files?.["game.html"]), "entry file stored");
  assert(row?.grantedPermissions?.includes("game.save"), "granted save perm");
}

console.log("=== CP-13 Host save / load ===");
{
  saveGameSave("sample-first-scene", { level: 1, lastText: "门后第一句" });
  const direct = loadGameSave("sample-first-scene");
  assert(direct?.lastText === "门后第一句", "direct host storage read");

  const bridge = createNyraGameBridge({
    pkgId: "sample-first-scene",
    permissions: GAME_PERMS,
    grantedPermissions: GAME_PERMS,
  });
  await bridge.saveGame({ level: 2, lastText: "存档已更新" });
  const loaded = await bridge.loadGame();
  assert(loaded?.level === 2, "bridge loadGame");
  assert(loaded?.lastText === "存档已更新", "bridge saveGame persisted to host");
  assert(loadGameSave("sample-first-scene")?.level === 2, "same yueqi.yeos.saves.v1 bag");
}

console.log("=== CP-13 Session event ===");
{
  const bridge = createNyraGameBridge({
    pkgId: "sample-first-scene",
    permissions: GAME_PERMS,
    grantedPermissions: GAME_PERMS,
  });
  await bridge.recordGameEvent({
    characterIds: ["char-demo"],
    summary: "玩家和角色完成了《第一幕》，走进了门后的音乐声。",
    score: 120,
  });
  const events = listRecentAppEvents(8);
  const hit = events.find((evt) => evt.type === "game.session.completed");
  assert(hit, "game.session.completed emitted");
  assert(hit.detail?.pkgId === "sample-first-scene", "event pkgId");
  assert(hit.detail?.appId === "game:sample-first-scene", "event appId");
  assert(String(hit.detail?.summary || "").includes("第一幕"), "event summary");
  assert(hit.detail?.score === 120, "event score when provided");
  assert(Array.isArray(hit.detail?.characterIds), "event characterIds");
}

console.log("=== CP-13 Uninstall ===");
{
  uninstallGame("sample-first-scene");
  assert(!getInstalledGame("sample-first-scene"), "removed from registry");
  assert(!listInstalledGames().some((g) => g.id === "sample-first-scene"), "absent from list");
  assert(loadGameSave("sample-first-scene")?.level === 2, "save bag survives uninstall");
}

console.log("=== CP-13 Source wiring ===");
{
  const lobby = readFileSync(join(root, "src/games/lobby-ui.js"), "utf8");
  const bridgeSrc = readFileSync(join(root, "src/yeos/bridge-game.js"), "utf8");
  const savesSrc = readFileSync(join(root, "src/yeos/saves.js"), "utf8");
  const installerSrc = readFileSync(join(root, "src/yeos/installer.js"), "utf8");
  assert(lobby.includes("listInstalledGames"), "lobby lists installed yeos games");
  assert(lobby.includes("data-games-yeos"), "lobby yeos start button");
  assert(lobby.includes("onOpenYeosGame"), "lobby opens yeos shell");
  assert(bridgeSrc.includes('emitAppEvent("game.session.completed"'), "bridge emits session event");
  assert(savesSrc.includes("yueqi.yeos.saves.v1"), "host save key");
  assert(installerSrc.includes("upsertInstalledGame"), "installer registers games");
}

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-13 yeos verify PASSED");
