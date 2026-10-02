/**
 * Shared pet-v2 BrowserWindow factory (standalone host + integrated main).
 * Projection surface only — no personality DB / provider access.
 */
import { BrowserWindow, screen } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PREF_NAME = "pet-v2-prefs.json";

/** @type {import('electron').BrowserWindow|null} */
let petV2Window = null;

function prefsPath(userDataPath) {
  return path.join(userDataPath, PREF_NAME);
}

function loadPrefs(userDataPath) {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(userDataPath), "utf8"));
  } catch {
    return { x: null, y: null, scale: 1, visible: true };
  }
}

function savePrefs(userDataPath, prefs) {
  const file = prefsPath(userDataPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(prefs, null, 2));
}

export function getPetV2Window() {
  if (petV2Window && !petV2Window.isDestroyed()) return petV2Window;
  return null;
}

/**
 * @param {{
 *   userDataPath: string,
 *   packsRoot?: string,
 *   show?: boolean,
 * }} opts
 */
export function createPetV2Window(opts) {
  const existing = getPetV2Window();
  if (existing) {
    if (opts?.show !== false) existing.showInactive?.() || existing.show();
    return existing;
  }

  const userDataPath = opts.userDataPath;
  const packsRoot = opts.packsRoot || path.join(ROOT, "public", "avatar-packs");
  const prefs = loadPrefs(userDataPath);
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const w = 360;
  const h = 480;

  petV2Window = new BrowserWindow({
    width: w,
    height: h,
    x: prefs.x ?? width - w - 24,
    y: prefs.y ?? height - h - 24,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    show: opts?.show !== false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  petV2Window.setAlwaysOnTop(true, "screen-saver");
  // Transparent margins pass through until renderer disables over character/HUD
  petV2Window.setIgnoreMouseEvents(true, { forward: true });
  const petHtml = path.join(__dirname, "pet.html");
  petV2Window.loadFile(petHtml, {
    query: { packsRoot },
  });

  petV2Window.webContents.on("did-finish-load", () => {
    if (!petV2Window || petV2Window.isDestroyed()) return;
    petV2Window.webContents.send("pet-v2:init", {
      packsPath: packsRoot,
      catalogFile: path.join(packsRoot, "catalog.json"),
    });
  });

  petV2Window.on("moved", () => {
    if (!petV2Window || petV2Window.isDestroyed()) return;
    const [x, y] = petV2Window.getPosition();
    prefs.x = x;
    prefs.y = y;
    savePrefs(userDataPath, prefs);
  });

  petV2Window.on("closed", () => {
    petV2Window = null;
  });

  return petV2Window;
}

/**
 * Forward a resolved channel payload to the pet-v2 window.
 * @param {string} channel
 * @param {unknown} payload
 * @returns {boolean}
 */
export function sendToPetV2Window(channel, payload) {
  const win = getPetV2Window();
  if (!win) return false;
  win.webContents.send(channel, payload);
  return true;
}

export function getPetV2PacksRoot() {
  return path.join(ROOT, "public", "avatar-packs");
}

export function getPetV2Root() {
  return ROOT;
}
