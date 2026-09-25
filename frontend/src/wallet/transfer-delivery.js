/**
 * Transfer / collect settlement → Artifact + delivery outbox (DEL-08).
 */

/**
 * @param {{
 *   messageId: string,
 *   token?: object,
 *   characterId?: string,
 *   ledgerId?: string,
 * }} input
 */
export async function deliverTransferSettlement(input = {}) {
  const messageId = String(input.messageId || "").trim();
  const token = input.token && typeof input.token === "object" ? input.token : {};
  const kind = String(token.kind || "").trim();
  if (!messageId || !kind || !["transfer", "collect"].includes(kind)) {
    return { ok: false, reason: "invalid_token" };
  }

  const characterId = String(
    input.characterId || token.counterpartyId || "",
  ).trim();
  if (!characterId) return { ok: false, reason: "missing_characterId" };

  const amount = Number(token.amount) || 0;
  const note = String(token.note || token.blessing || "").slice(0, 60);
  const direction = token.direction === "out" ? "out" : "in";
  const ledgerId = String(input.ledgerId || token.ledgerId || "").trim();
  const artifactId = `transfer:${messageId}`;
  const title = kind === "collect"
    ? `收款 · ${amount.toFixed(2)} 栖币`
    : direction === "out"
      ? `转账 · ${amount.toFixed(2)} 栖币`
      : `收到转账 · ${amount.toFixed(2)} 栖币`;
  const previewText = note || title;

  try {
    const { upsertArtifact, enqueueDelivery, artifactDeepLink } = await import("../artifacts/index.js");
    const art = upsertArtifact({
      artifactId,
      companionId: characterId,
      type: "transfer",
      status: "ready",
      title,
      previewText,
      sourceMessageId: messageId,
      deepLink: artifactDeepLink(artifactId) || `yueqi://artifact/${artifactId}`,
      readyAt: new Date().toISOString(),
      meta: {
        messageId,
        ledgerId,
        amount,
        note,
        kind,
        direction,
        companionId: characterId,
      },
    });
    if (!art?.ok) return { ok: false, reason: art?.reason || "artifact_failed" };

    const channels = ["phone_today", "phone_badge", "pop", "system_notification"];
    for (const channel of channels) {
      enqueueDelivery({
        artifactId: art.artifact.artifactId,
        channel,
        companionId: characterId,
        dedupeKey: `${artifactId}:${channel}`,
      });
    }

    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("yueqi:transfer-settled", {
        detail: {
          artifactId: art.artifact.artifactId,
          messageId,
          ledgerId,
          companionId: characterId,
          deepLink: art.artifact.deepLink,
        },
      }));
    }

    return { ok: true, artifact: art.artifact, artifactId };
  } catch (error) {
    return { ok: false, reason: error?.message || "delivery_failed" };
  }
}
