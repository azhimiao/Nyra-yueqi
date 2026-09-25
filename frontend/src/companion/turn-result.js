/**
 * Unified companion turn surface for chat + direct actions.
 * Selfie/diary may short-circuit execution, but the product rhythm is always:
 * user said → action result (optional) → assistant speech + optional artifact.
 */

/** Narrow Pop companion capabilities (not full OpenClaw FC). */
export const COMPANION_NARROW_CAPABILITIES = Object.freeze([
  "companion.selfie",
  "companion.diary",
  "companion.listen",
  "web.weather",
  "calendar",
  "calendar-draft",
  "runtime.avatar",
  "artifact.show",
]);

/**
 * @param {{
 *   capabilityId?: string,
 *   ok?: boolean,
 *   speech?: string,
 *   artifact?: object|null,
 *   metadata?: object,
 *   route?: object|null,
 *   raw?: object|null,
 * }} input
 */
export function createCompanionTurnResult(input = {}) {
  const capabilityId = String(input.capabilityId || "").trim();
  const ok = Boolean(input.ok);
  const speech = String(input.speech || "").trim();
  const metadata = input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {};
  const artifact = input.artifact && typeof input.artifact === "object" ? input.artifact : null;
  return {
    kind: "companion_turn_result",
    capabilityId,
    ok,
    speech,
    artifact,
    metadata,
    route: input.route || null,
    raw: input.raw || null,
  };
}

/**
 * Map selfie / diary / listen dispatch payloads into TurnResult.
 * @param {"companion.selfie"|"companion.diary"|"companion.listen"} capabilityId
 * @param {object} dispatch
 * @param {object|null} [route]
 */
export function turnResultFromDirectAction(capabilityId, dispatch, route = null) {
  const ok = Boolean(dispatch?.ok);
  const isSelfie = capabilityId === "companion.selfie";
  const isListen = capabilityId === "companion.listen";
  const defaultOk = isSelfie
    ? "拍好了，你看看～"
    : isListen
      ? "好呀，歌已经在放了。"
      : "写好啦，你看看～";
  const defaultFail = isSelfie
    ? "我还不能真的拍照。"
    : isListen
      ? "我现在还放不了歌。"
      : "我还不能写日记。";
  const speech = ok
    ? String(dispatch?.speech || dispatch?.message || defaultOk)
    : String(dispatch?.message || defaultFail);

  const artifact = ok
    ? {
      artifactId: dispatch.artifactId || "",
      mediaId: dispatch.mediaId || "",
      diaryId: dispatch.diaryId || "",
      diaryDay: dispatch.diaryDay || "",
      trackId: dispatch.trackId || "",
      title: dispatch.title || "",
      deepLink: dispatch.deepLink || "",
    }
    : null;

  const kind = ok
    ? (isSelfie ? "selfie-artifact" : isListen ? "listen-play" : "diary-artifact")
    : (isSelfie ? "selfie-failed" : isListen ? "listen-failed" : "diary-failed");

  return createCompanionTurnResult({
    capabilityId,
    ok,
    speech,
    artifact,
    route,
    raw: dispatch,
    metadata: {
      kind,
      source: isSelfie ? "companion_selfie" : isListen ? "companion_listen" : "companion_diary",
      artifactId: dispatch?.artifactId || "",
      mediaId: dispatch?.mediaId || "",
      diaryId: dispatch?.diaryId || "",
      diaryDay: dispatch?.diaryDay || "",
      trackId: dispatch?.trackId || "",
      title: dispatch?.title || "",
      playlist: dispatch?.playlist || "",
      deepLink: dispatch?.deepLink || "",
      failureReason: ok ? "" : (dispatch?.reason || ""),
    },
  });
}

export function isNarrowCompanionCapability(capabilityId) {
  const id = String(capabilityId || "").trim();
  return COMPANION_NARROW_CAPABILITIES.includes(id);
}
