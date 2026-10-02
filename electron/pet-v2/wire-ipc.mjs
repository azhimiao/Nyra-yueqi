/**
 * Register pet-v2 pack + projection IPC (shared by standalone and integrated main).
 */
import { ipcMain, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getPetV2PacksRoot, getPetV2Window, sendToPetV2Window } from "./create-window.mjs";
import { resolvePetV2PushChannel } from "./product-ipc.mjs";

let wired = false;

function softClampPetV2Position(x, y, width, height) {
  const display = screen.getDisplayNearestPoint({
    x: Number(x) + width / 2,
    y: Number(y) + height / 2,
  });
  const area = display.workArea;
  const keepX = Math.max(48, Math.min(width, Math.round(width * 0.45)));
  const keepY = Math.max(48, Math.min(height, Math.round(height * 0.45)));
  return {
    x: Math.round(Math.min(Math.max(area.x + keepX - width, Number(x) || 0), area.x + area.width - keepX)),
    y: Math.round(Math.min(Math.max(area.y + keepY - height, Number(y) || 0), area.y + area.height - keepY)),
  };
}

/**
 * @param {{
 *   onDeepLink?: (payload: unknown, event: Electron.IpcMainEvent) => void,
 * }} [opts]
 */
export function wirePetV2Ipc(opts = {}) {
  if (wired) return;
  wired = true;

  const packsRoot = getPetV2PacksRoot();

  ipcMain.handle("pet-v2:read-catalog", async () => {
    const p = path.join(packsRoot, "catalog.json");
    return JSON.parse(fs.readFileSync(p, "utf8"));
  });

  ipcMain.handle("pet-v2:read-text", async (_e, filePath) => {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(packsRoot)) throw new Error("path outside packs");
    return fs.readFileSync(resolved, "utf8");
  });

  ipcMain.handle("pet-v2:open-character", async (_e, characterId) => {
    const catalog = JSON.parse(fs.readFileSync(path.join(packsRoot, "catalog.json"), "utf8"));
    const entry = (catalog.avatars || []).find((a) => a.characterId === characterId);
    if (!entry) throw new Error(`unknown character ${characterId}`);
    const rel = entry.manifestUrl.replace(/^\/avatar-packs\//, "");
    const manifestPath = path.join(packsRoot, rel);
    const baseDir = path.dirname(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return { manifest, baseDir, manifestPath };
  });

  ipcMain.on("pet-v2:deep-link", (event, payload) => {
    const win = getPetV2Window();
    if (!win || event.sender !== win.webContents) return;
    opts.onDeepLink?.(payload, event);
  });

  for (const alias of [
    "pet-v2:push-embodiment",
    "pet-v2:push-character",
    "pet-v2:push-artifact",
    "pet-v2:push-amplitude",
  ]) {
    ipcMain.on(alias, (_e, payload) => {
      const channel = resolvePetV2PushChannel(alias);
      if (channel) sendToPetV2Window(channel, payload);
    });
  }

  ipcMain.on("pet-v2:set-click-through", (event, enabled) => {
    const win = getPetV2Window();
    if (!win || event.sender !== win.webContents) return;
    win.setIgnoreMouseEvents(Boolean(enabled), { forward: true });
  });

  ipcMain.on("pet-v2:drag-by", (event, dx, dy) => {
    const win = getPetV2Window();
    if (!win || event.sender !== win.webContents) return;
    const safeDx = Number(dx);
    const safeDy = Number(dy);
    if (!Number.isFinite(safeDx) || !Number.isFinite(safeDy)) return;
    const clampedDx = Math.max(-2000, Math.min(2000, safeDx));
    const clampedDy = Math.max(-2000, Math.min(2000, safeDy));
    const [x, y] = win.getPosition();
    const bounds = win.getBounds();
    const next = softClampPetV2Position(x + clampedDx, y + clampedDy, bounds.width, bounds.height);
    win.setPosition(next.x, next.y);
  });
}

/**
 * App → pet push (trusted main app renderer).
 * @param {string} channel
 * @param {unknown} payload
 */
export function pushPetV2FromApp(channel, payload) {
  const resolved = resolvePetV2PushChannel(channel);
  if (!resolved) return { ok: false, reason: "unknown_channel" };
  const sent = sendToPetV2Window(resolved, payload);
  return sent ? { ok: true, channel: resolved } : { ok: false, reason: "pet_v2_unavailable" };
}
