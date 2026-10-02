const { contextBridge, ipcRenderer } = require("electron");

const api = Object.freeze({
  getHostInfo: () => ipcRenderer.invoke("desktop:get-host-info"),
  updatePetState: (patch) => ipcRenderer.invoke("desktop:update-pet-state", patch),
  setMuted: (muted) => ipcRenderer.invoke("desktop:set-muted", muted),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("desktop:set-open-at-login", enabled),
  showPet: () => ipcRenderer.invoke("desktop:show-pet"),
  setSensing: (sensing) => ipcRenderer.invoke("desktop:set-sensing", sensing),
  captureScreen: () => ipcRenderer.invoke("desktop:capture-screen"),
  getCaptureSourceId: () => ipcRenderer.invoke("desktop:get-capture-source-id"),
  openPhone: () => ipcRenderer.invoke("desktop:open-phone"),
  projectTask: (task) => ipcRenderer.invoke("desktop:project-task", task),
  getCaptureGrant: () => ipcRenderer.invoke("desktop:get-capture-grant"),
  revokeCaptureGrant: () => ipcRenderer.invoke("desktop:revoke-capture-grant"),
  onPetTurn: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:pet-turn", listener);
    return () => ipcRenderer.removeListener("desktop:pet-turn", listener);
  },
  onPetAction: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:pet-action", listener);
    return () => ipcRenderer.removeListener("desktop:pet-action", listener);
  },
  onSensingChanged: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:sensing-changed", listener);
    return () => ipcRenderer.removeListener("desktop:sensing-changed", listener);
  },
  /** CP-AV6 — push embodiment / character / artifact / amplitude / playAction to pet-v2 */
  sendPetV2: (channel, payload) => ipcRenderer.invoke("desktop:pet-v2-send", channel, payload),
  onPetV2DeepLink: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:pet-v2-deep-link", listener);
    return () => ipcRenderer.removeListener("desktop:pet-v2-deep-link", listener);
  },
  onPetV2OpenedReceipt: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:pet-v2-opened-receipt", listener);
    return () => ipcRenderer.removeListener("desktop:pet-v2-opened-receipt", listener);
  },
  isDesktop: true,
});

contextBridge.exposeInMainWorld("yueqiDesktop", api);
