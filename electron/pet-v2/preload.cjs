const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petV2", {
  readCatalog: () => ipcRenderer.invoke("pet-v2:read-catalog"),
  readText: (p) => ipcRenderer.invoke("pet-v2:read-text", p),
  openCharacter: (id) => ipcRenderer.invoke("pet-v2:open-character", id),
  onInit: (cb) => ipcRenderer.on("pet-v2:init", (_e, data) => cb(data)),
  deepLink: (payload) => ipcRenderer.send("pet-v2:deep-link", payload),
  dragBy: (dx, dy) => ipcRenderer.send("pet-v2:drag-by", dx, dy),
  setClickThrough: (enabled) => ipcRenderer.send("pet-v2:set-click-through", enabled),
  onEmbodimentStateChanged: (cb) =>
    ipcRenderer.on("pet-v2:embodimentStateChanged", (_e, state) => cb(state)),
  onCharacterChanged: (cb) =>
    ipcRenderer.on("pet-v2:characterChanged", (_e, id) => cb(id)),
  onArtifactReady: (cb) => ipcRenderer.on("pet-v2:artifactReady", (_e, a) => cb(a)),
  onSpeechAmplitude: (cb) => ipcRenderer.on("pet-v2:speechAmplitude", (_e, n) => cb(n)),
  onPlayAction: (cb) => ipcRenderer.on("pet-v2:playAction", (_e, actionId) => cb(actionId)),
});
