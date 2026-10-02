/**
 * Avatar Factory V2 pet host — transparent always-on-top, no DB/provider access.
 * Standalone entry; integrated product host uses createPetV2Window from main.mjs.
 */
import { app } from "electron";
import { createPetV2Window } from "./create-window.mjs";
import { wirePetV2Ipc } from "./wire-ipc.mjs";

wirePetV2Ipc({
  onDeepLink: (payload) => {
    console.log("[pet-v2] deepLinkRequested", payload);
  },
});

app.whenReady().then(() => {
  createPetV2Window({ userDataPath: app.getPath("userData") });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

export { createPetV2Window } from "./create-window.mjs";
