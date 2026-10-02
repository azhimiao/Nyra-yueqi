/**
 * Pure helpers for main-app ↔ pet-v2 product IPC (CP-AV6).
 * No Electron imports — unit-testable.
 */

/** Channels the app may push into the pet-v2 window. */
export const PET_V2_APP_CHANNELS = Object.freeze([
  "pet-v2:embodimentStateChanged",
  "pet-v2:playAction",
  "pet-v2:characterChanged",
  "pet-v2:artifactReady",
  "pet-v2:speechAmplitude",
]);

/** Aliases used by the standalone pet-v2 host. */
const PUSH_ALIASES = Object.freeze({
  "pet-v2:push-embodiment": "pet-v2:embodimentStateChanged",
  "pet-v2:push-character": "pet-v2:characterChanged",
  "pet-v2:push-artifact": "pet-v2:artifactReady",
  "pet-v2:push-amplitude": "pet-v2:speechAmplitude",
});

/**
 * Map an app/bridge channel to the pet-v2 renderer event name.
 * @param {string} channel
 * @returns {string|null}
 */
export function resolvePetV2PushChannel(channel) {
  const raw = String(channel || "").trim();
  if (!raw) return null;
  if (PET_V2_APP_CHANNELS.includes(raw)) return raw;
  if (Object.hasOwn(PUSH_ALIASES, raw)) return PUSH_ALIASES[raw];
  return null;
}

/**
 * Reject phone-home deep links (product rule: open concrete entity).
 * @param {string} deepLink
 */
export function isConcretePetDeepLink(deepLink) {
  const href = String(deepLink || "").trim();
  if (!href) return false;
  if (href === "/" || href === "/phone" || href === "#phone") return false;
  return true;
}

/**
 * Build route-open stub result + opened receipt for main→app delivery.
 * @param {{ artifactId?: string, deepLink?: string, at?: string }} payload
 * @param {{ buildOpenedReceipt: (p: object) => object }} deps
 */
export function handlePetV2DeepLinkPayload(payload = {}, deps) {
  const deepLink = String(payload?.deepLink || "").trim();
  if (!deepLink) {
    return { ok: false, reason: "missing_deep_link" };
  }
  if (!isConcretePetDeepLink(deepLink)) {
    return { ok: false, reason: "phone_home_forbidden" };
  }
  const artifactId = String(payload?.artifactId || "").trim();
  const receipt = deps.buildOpenedReceipt({
    artifactId: artifactId || undefined,
    deepLink,
    at: payload?.at,
  });
  return {
    ok: true,
    route: {
      kind: "pet-v2-deep-link",
      deepLink,
      artifactId: artifactId || null,
    },
    receipt,
  };
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isPetV2LaunchEnabled(argv = process.argv, env = process.env) {
  if (argv.includes("--pet-v2")) return true;
  const flag = String(env?.YUEQI_PET_V2 || "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}
