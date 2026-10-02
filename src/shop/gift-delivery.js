/**
 * Gift delivery — inventory → Artifact (gift) → delivery outbox (DEL-06).
 * Shop purchase alone does not deliver; sendGift consumes inventory and enqueues channels.
 */

import { getShopProduct } from "./catalog.js";
import { getInventoryItem, consumeFromInventory } from "./inventory.js";
import { getCharacterSync } from "../characters/store.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";

const GIFT_CATEGORY = "礼物";

function giftArtifactId() {
  return `gift:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {object|null|undefined} product
 */
export function isGiftProduct(product) {
  return String(product?.category || "").trim() === GIFT_CATEGORY;
}

/**
 * Send a owned gift item to the active companion.
 * @param {{ productId: string, characterId?: string, orderId?: string }} input
 */
export async function sendGift(input = {}) {
  const productId = String(input.productId || "").trim();
  const characterId = String(input.characterId || "").trim();
  if (!productId) return { ok: false, error: "missing_productId" };
  if (!characterId) return { ok: false, error: "missing_characterId" };

  const product = getShopProduct(productId);
  if (!product) return { ok: false, error: "product_not_found" };
  if (!isGiftProduct(product)) return { ok: false, error: "not_gift_product" };

  const owned = getInventoryItem(productId);
  if (!owned || (owned.qty || 0) < 1) {
    return { ok: false, error: "insufficient_inventory" };
  }

  const consumed = consumeFromInventory(productId, 1);
  if (!consumed.ok) {
    return { ok: false, error: consumed.error || "consume_failed" };
  }

  return deliverGift({
    product,
    characterId,
    orderId: String(input.orderId || owned.lastOrderId || "").trim(),
  });
}

/**
 * Register gift artifact + delivery channels (after inventory consumed).
 * @param {{ product: object, characterId: string, orderId?: string }} input
 */
export async function deliverGift(input = {}) {
  const product = input.product;
  const characterId = String(input.characterId || "").trim();
  if (!product?.productId) return { ok: false, error: "missing_product" };
  if (!characterId) return { ok: false, error: "missing_characterId" };

  const character = getCharacterSync(characterId);
  const characterName = String(character?.name || "TA").trim() || "TA";
  const artifactId = giftArtifactId();
  const orderId = String(input.orderId || "").trim();
  const previewText = `送出了${product.title}，等${characterName}收下`;

  let art = null;
  try {
    const { upsertArtifact, enqueueDelivery, artifactDeepLink } = await import("../artifacts/index.js");
    art = upsertArtifact({
      artifactId,
      companionId: characterId,
      type: "gift",
      status: "ready",
      title: `礼物 · ${product.title}`,
      previewText,
      resourceUrl: `shop://${product.productId}`,
      deepLink: artifactDeepLink(artifactId) || `yueqi://artifact/${artifactId}`,
      readyAt: new Date().toISOString(),
      meta: {
        productId: product.productId,
        orderId,
        coverEmoji: product.coverEmoji,
        coverTone: product.coverTone,
        category: product.category,
        companionId: characterId,
      },
    });
    if (!art?.ok) {
      return { ok: false, error: art?.reason || "artifact_failed" };
    }

    const channels = ["phone_today", "phone_badge", "pop", "system_notification"];
    const deliveries = [];
    for (const channel of channels) {
      const row = enqueueDelivery({
        artifactId: art.artifact.artifactId,
        channel,
        companionId: characterId,
        dedupeKey: `${artifactId}:${channel}`,
      });
      if (!row.ok) {
        return {
          ok: false,
          error: "delivery_failed",
          reason: row.reason,
          artifact: art.artifact,
        };
      }
      deliveries.push(row.item);
    }

    try {
      appendCohabitEvent({
        appId: "shop",
        kind: "gift",
        summary: `送出礼物：${product.title} → ${characterName}`,
        characterId,
        meta: {
          artifactId: art.artifact.artifactId,
          productId: product.productId,
          orderId,
        },
      });
    } catch {
      /* timeline optional */
    }

    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("yueqi:gift-sent", {
        detail: {
          artifactId: art.artifact.artifactId,
          productId: product.productId,
          companionId: characterId,
          deepLink: art.artifact.deepLink,
          orderId,
        },
      }));
    }

    return {
      ok: true,
      artifact: art.artifact,
      deliveries,
      productId: product.productId,
      characterId,
      orderId,
    };
  } catch (error) {
    console.warn("[yueqi.gift] delivery failed", error);
    return {
      ok: false,
      error: "delivery_failed",
      message: error?.message || String(error),
      artifact: art?.artifact || null,
    };
  }
}
