/**
 * PAIOS P3 — Electron main bridge into shared Core host adapters.
 * Keeps desk-pet rendering isolated from Agent executor imports.
 */

import {
  createDeskPetHostAdapter,
  createScreenCaptureGate,
  projectTaskState,
  SCREEN_CAPTURE_GRANT_KEY,
  HOST_PLATFORMS,
} from "../src/host/index.js";

/**
 * File-backed storage adapter over a mutable store object field.
 * @param {() => object} getStore
 * @param {(next: object) => void} persist
 */
export function createStoreBackedStorage(getStore, persist) {
  return {
    getItem(key) {
      if (key !== SCREEN_CAPTURE_GRANT_KEY) return null;
      const grant = getStore()?.screenCaptureGrant;
      return grant ? JSON.stringify(grant) : null;
    },
    setItem(key, value) {
      if (key !== SCREEN_CAPTURE_GRANT_KEY) return;
      let parsed = null;
      try {
        parsed = JSON.parse(String(value));
      } catch {
        parsed = null;
      }
      const store = getStore();
      store.screenCaptureGrant = parsed;
      persist(store);
    },
    removeItem(key) {
      if (key !== SCREEN_CAPTURE_GRANT_KEY) return;
      const store = getStore();
      store.screenCaptureGrant = null;
      persist(store);
    },
  };
}

/**
 * @param {{
 *   getStore: () => object,
 *   writeStore: () => void,
 *   pushStateToPet: () => void,
 *   createAppWindow: (opts?: { show?: boolean }) => unknown,
 *   updatePetState: (patch: object) => void,
 *   sendToPetV2?: (channel: string, payload: unknown) => { ok: boolean, reason?: string, channel?: string },
 * }} ctx
 */
export function createElectronHostCore(ctx) {
  const storage = createStoreBackedStorage(ctx.getStore, () => ctx.writeStore());
  const captureGate = createScreenCaptureGate({ storage });

  const deskPet = createDeskPetHostAdapter({
    platform: HOST_PLATFORMS.WINDOWS_ELECTRON,
    getPetState: () => ({ ...(ctx.getStore()?.state || {}) }),
    updatePetState: async (patch) => {
      ctx.updatePetState(patch);
    },
    openPhone: async () => {
      ctx.createAppWindow({ show: true });
    },
  });

  function syncGrantFromSensing(sensing) {
    const enabled = Boolean(sensing?.screenWatch?.enabled);
    if (enabled) {
      if (!captureGate.hasActiveGrant()) {
        captureGate.grant({
          surface: HOST_PLATFORMS.WINDOWS_ELECTRON,
          scope: "session",
        });
      }
    } else {
      captureGate.revoke();
    }
  }

  function assertCaptureAllowed() {
    return captureGate.assertCanCapture({ surface: HOST_PLATFORMS.WINDOWS_ELECTRON });
  }

  async function projectTaskToPet(task) {
    const projection = projectTaskState(task);
    return deskPet.showTaskBubble(projection);
  }

  /** Additive pet-v2 projection (no-op when window absent). */
  function sendPetV2(channel, payload) {
    if (typeof ctx.sendToPetV2 !== "function") {
      return { ok: false, reason: "pet_v2_not_wired" };
    }
    return ctx.sendToPetV2(channel, payload);
  }

  function pushPetV2Embodiment(state) {
    return sendPetV2("pet-v2:embodimentStateChanged", state);
  }

  function pushPetV2Character(characterId) {
    return sendPetV2("pet-v2:characterChanged", characterId);
  }

  function pushPetV2Artifact(artifact) {
    return sendPetV2("pet-v2:artifactReady", artifact);
  }

  function pushPetV2SpeechAmplitude(n) {
    return sendPetV2("pet-v2:speechAmplitude", n);
  }

  return {
    captureGate,
    deskPet,
    syncGrantFromSensing,
    assertCaptureAllowed,
    projectTaskToPet,
    openPhone: () => deskPet.openPhone(),
    pushPetState: (patch) => deskPet.pushPetState(patch),
    sendPetV2,
    pushPetV2Embodiment,
    pushPetV2Character,
    pushPetV2Artifact,
    pushPetV2SpeechAmplitude,
  };
}
