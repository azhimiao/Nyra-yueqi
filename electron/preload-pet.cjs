const { contextBridge, ipcRenderer } = require("electron");

const api = Object.freeze({
  getState: () => ipcRenderer.invoke("pet:get-state"),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:state", listener);
    return () => ipcRenderer.removeListener("pet:state", listener);
  },
  setMode: (mode) => ipcRenderer.send("pet:set-mode", mode),
  dragBy: (dx, dy) => ipcRenderer.send("pet:drag-by", dx, dy),
  snapToEdge: () => ipcRenderer.send("pet:snap"),
  resizeContent: (width, height) => ipcRenderer.send("pet:resize-content", width, height),
  setClickThrough: (enabled) => ipcRenderer.send("pet:set-click-through", enabled),
  sendTurn: (payload) => ipcRenderer.send("pet:send-turn", payload),
  captureScreen: () => ipcRenderer.invoke("pet:capture-screen"),
  openApp: () => ipcRenderer.send("pet:open-app"),
  /** Alias used by shared DeskPetHostAdapter openPhone(). */
  openPhone: () => ipcRenderer.send("pet:open-app"),
  closePet: () => ipcRenderer.send("pet:close"),
  hidePet: () => ipcRenderer.send("pet:hide"),
  requestAction: (actionId) => ipcRenderer.send("pet:request-action", actionId),
  getSensing: () => ipcRenderer.invoke("pet:get-sensing"),
  setSensing: (patch) => ipcRenderer.send("pet:set-sensing", patch),
});

contextBridge.exposeInMainWorld("yueqiPet", api);
