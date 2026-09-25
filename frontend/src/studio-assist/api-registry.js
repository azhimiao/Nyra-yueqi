/** Lightweight assistant API registry used by both product shells. */

let assistApi = null;
let phoneAssistApi = null;

/** @param {{ open: Function, refresh?: Function }} api */
export function registerStudioAssist(api) {
  assistApi = api;
}

/** @param {{ open: Function, refresh?: Function }} api */
export function registerPhoneStudioAssist(api) {
  phoneAssistApi = api;
}

/** @param {{ context?: string, seed?: string }} [opts] */
export function openStudioAssist(opts = {}) {
  const preferPhone = document.body?.dataset?.appMode === "phone";
  const api = preferPhone && phoneAssistApi?.open ? phoneAssistApi : assistApi;
  if (!api?.open) {
    console.warn("[yueqi.assist] not mounted");
    return false;
  }
  if (preferPhone) {
    window.dispatchEvent(new CustomEvent("yueqi.assist.open-app", { detail: { app: "assist" } }));
  }
  void api.open(opts);
  return true;
}
