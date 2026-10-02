import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const userData = await mkdtemp(path.join(os.tmpdir(), "yueqi-electron-smoke-"));
let electronApp;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  electronApp = await electron.launch({
    args: ["electron/main.mjs", `--user-data-dir=${userData}`],
    cwd: root,
    timeout: 30_000,
  });

  await new Promise((resolve) => setTimeout(resolve, 1_800));
  const windows = electronApp.windows();
  const pet = windows.find((window) => window.url().endsWith("/overlay.html"));
  const main = windows.find((window) => window.url().endsWith("/index.html"));
  check(pet && main, `expected pet and app windows, got: ${windows.map((window) => window.url()).join(", ")}`);
  await Promise.all([
    pet.waitForLoadState("domcontentloaded"),
    main.waitForLoadState("domcontentloaded"),
  ]);

  const host = await main.evaluate(() => window.yueqiDesktop.getHostInfo());
  const petState = await pet.evaluate(() => window.yueqiPet.getState());
  check(host.platform === process.platform, "desktop host bridge returned the wrong platform");
  check(["collapsed", "bubble", "chat"].includes(petState.mode), "pet state bridge returned an invalid mode");

  const invalidRejected = await main.evaluate(async () => {
    try {
      await window.yueqiDesktop.updatePetState({ notAllowed: true });
      return false;
    } catch {
      return true;
    }
  });
  check(invalidRejected, "desktop state IPC accepted an unknown field");

  await main.evaluate(() => {
    window.__ipcSmokeTurns = [];
    window.__stopIpcSmoke = window.yueqiDesktop.onPetTurn((turn) => window.__ipcSmokeTurns.push(turn));
  });
  await pet.evaluate(() => window.yueqiPet.sendTurn({ text: "ipc-smoke-text" }));
  await main.waitForFunction(
    () => window.__ipcSmokeTurns?.some((turn) => turn.text === "ipc-smoke-text"),
    null,
    { timeout: 5_000 },
  );
  await pet.evaluate(() => window.yueqiPet.sendTurn({ audioDataUrl: "data:audio/webm;base64,AAAA" }));
  await main.waitForFunction(
    () => window.__ipcSmokeTurns?.some((turn) => turn.source === "desktop_voice"),
    null,
    { timeout: 5_000 },
  );

  const capture = await pet.evaluate(() => window.yueqiPet.captureScreen());
  check(capture.imageDataUrl.startsWith("data:image/jpeg;base64,"), "desktop capture did not return one JPEG frame");
  check(capture.width > 0 && capture.height > 0, "desktop capture dimensions are empty");

  const rightGapBefore = await electronApp.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().endsWith("/overlay.html"));
    const bounds = window.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    window.setPosition(
      area.x + area.width - bounds.width - 8,
      Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height)),
    );
    const moved = window.getBounds();
    return area.x + area.width - (moved.x + moved.width);
  });
  await pet.evaluate(() => window.yueqiPet.resizeContent(360, 420));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const resized = await electronApp.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().endsWith("/overlay.html"));
    const bounds = window.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    return {
      bounds,
      area,
      rightGap: area.x + area.width - (bounds.x + bounds.width),
    };
  });
  check(rightGapBefore === resized.rightGap, "resize did not keep the nearest right edge anchored");
  check(
    resized.bounds.x >= resized.area.x
      && resized.bounds.y >= resized.area.y
      && resized.bounds.x + resized.bounds.width <= resized.area.x + resized.area.width
      && resized.bounds.y + resized.bounds.height <= resized.area.y + resized.area.height,
    "resized pet escaped the display work area",
  );

  console.log(JSON.stringify({
    windows: windows.map((window) => window.url()),
    host,
    petMode: petState.mode,
    stateSchemaRejected: invalidRejected,
    textAndVoiceTurns: true,
    capture: { width: capture.width, height: capture.height, bytes: capture.imageDataUrl.length },
    resizeAnchor: { before: rightGapBefore, after: resized.rightGap },
  }, null, 2));
} finally {
  await electronApp?.close().catch(() => {});
  const resolvedTemp = path.resolve(os.tmpdir());
  const resolvedUserData = path.resolve(userData);
  if (
    resolvedUserData.startsWith(`${resolvedTemp}${path.sep}`)
    && path.basename(resolvedUserData).startsWith("yueqi-electron-smoke-")
  ) {
    await rm(resolvedUserData, { recursive: true, force: true }).catch(() => {});
  }
}
