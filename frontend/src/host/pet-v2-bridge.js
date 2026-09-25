/**
 * Main-app bridge → Electron pet-v2 embodiment IPC.
 * Projection only; no second personality store.
 */
import {
  reduceProductEvent,
  createIdleEmbodiment,
  buildOpenedReceipt,
} from "../../../packages/avatar-runtime/src/product-adapter.mjs";

/**
 * @param {{
 *   sendToPet?: (channel: string, payload: unknown) => void,
 *   openDeepLink?: (url: string) => void|Promise<void>,
 * }} deps
 */
export function createPetV2Bridge(deps = {}) {
  let state = createIdleEmbodiment();
  const send =
    typeof deps.sendToPet === "function"
      ? deps.sendToPet
      : (channel, payload) => {
          if (typeof window !== "undefined" && window.yueqiDesktop?.sendPetV2) {
            window.yueqiDesktop.sendPetV2(channel, payload);
          }
        };
  const openDeepLink =
    typeof deps.openDeepLink === "function"
      ? deps.openDeepLink
      : async () => ({ ok: false, reason: "no_opener" });

  return {
    getState() {
      return { ...state };
    },

    /** @param {{ type: string, payload?: any }} event */
    dispatch(event) {
      const out = reduceProductEvent(event, state);
      state = out.state;
      send("pet-v2:embodimentStateChanged", state);
      if (out.actionId) send("pet-v2:playAction", out.actionId);
      if (state.artifact) send("pet-v2:artifactReady", state.artifact);
      if (event?.type === "speech.amplitude" || event?.type === "pop.tts_start" || event?.type === "speech.start") {
        send("pet-v2:speechAmplitude", state.mouthOpen ?? event?.payload?.amplitude ?? 0);
      }
      return out;
    },

    setCharacter(characterId) {
      send("pet-v2:characterChanged", characterId);
    },

    async onPetDeepLink(payload) {
      const deepLink = payload?.deepLink;
      if (!deepLink) return { ok: false, reason: "missing_deep_link" };
      if (deepLink === "/" || deepLink === "/phone" || deepLink === "#phone") {
        return { ok: false, reason: "phone_home_forbidden" };
      }
      await openDeepLink(deepLink);
      const receipt = buildOpenedReceipt({
        artifactId: payload.artifactId,
        deepLink,
      });
      return { ok: true, receipt };
    },
  };
}
