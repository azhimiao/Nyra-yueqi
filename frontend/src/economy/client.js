import { modelServiceUrl } from "../lib/utils.js";
import { getLocalServiceToken } from "../platform/local-service.js";
import { saveEconomySnapshot } from "./context.js";

function requestId(prefix = "econ") {
  const suffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
}

async function authToken(explicitToken) {
  const token = String(explicitToken || "").trim() || await getLocalServiceToken();
  if (!token) {
    const error = new Error("gateway_unavailable");
    error.code = "gateway_unavailable";
    throw error;
  }
  return token;
}

async function projectEconomyActivity(input) {
  if (!input?.companionId) return;
  try {
    const { projectActivityToChat } = await import("../chat/activity-projection.js");
    const result = await projectActivityToChat(input);
    if (result?.ok && typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("yueqi:chat-history-changed", {
        detail: { source: "economy", companionId: input.companionId },
      }));
    }
    return result;
  } catch {
    // The economic transaction remains valid if an offline chat projection is delayed.
  }
}

export async function economyRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const response = await fetch(modelServiceUrl(path), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await authToken(options.token)}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `economy_http_${response.status}`);
    error.code = payload?.error || "economy_request_failed";
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function bootstrapEconomy({ companionId = "", companionName = "", token } = {}) {
  return economyRequest("/economy/bootstrap", {
    token,
    method: "POST",
    body: { companionId, companionName },
  });
}

export async function fetchEconomyOverview({ companionId = "", companionName = "", token } = {}) {
  const query = new URLSearchParams();
  if (companionId) query.set("companionId", companionId);
  if (companionName) query.set("companionName", companionName);
  return economyRequest(`/economy/overview${query.size ? `?${query}` : ""}`, { token });
}

export async function listEconomyMarketplace(filters = {}) {
  const query = new URLSearchParams();
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.sellerActorId) query.set("sellerActorId", filters.sellerActorId);
  return economyRequest(`/economy/marketplace${query.size ? `?${query}` : ""}`, filters);
}

export function listProductionRecipes(options = {}) {
  return economyRequest("/economy/recipes", options);
}

export function purchaseEconomyListing(input = {}) {
  return economyRequest("/economy/orders", {
    token: input.token,
    method: "POST",
    body: {
      listingId: input.listingId,
      buyerActorId: input.buyerActorId,
      producerActorId: input.producerActorId || "",
      brief: input.brief || "",
      idempotencyKey: input.idempotencyKey || requestId("purchase"),
    },
  });
}

export function transferNyraCoin(input = {}) {
  return economyRequest("/economy/transfers", {
    token: input.token,
    method: "POST",
    body: {
      ...input,
      token: undefined,
      idempotencyKey: input.idempotencyKey || requestId("transfer"),
    },
  });
}

export function createEconomyIntent(input = {}) {
  return economyRequest("/economy/intents", { token: input.token, method: "POST", body: { ...input, token: undefined } });
}

export function createEconomyListing(input = {}) {
  return economyRequest("/economy/listings", {
    token: input.token,
    method: "POST",
    body: { ...input, token: undefined, idempotencyKey: input.idempotencyKey || requestId("listing") },
  });
}

export function startProductionRun(input = {}) {
  return economyRequest("/economy/production-runs", {
    token: input.token,
    method: "POST",
    body: { ...input, token: undefined, idempotencyKey: input.idempotencyKey || requestId("production") },
  });
}

export function commitProductionRun(productionRunId, input = {}) {
  return economyRequest(`/economy/production-runs/${encodeURIComponent(productionRunId)}/commit`, {
    token: input.token,
    method: "POST",
    body: { ...input, token: undefined },
  });
}

export function failProductionRun(productionRunId, input = {}) {
  return economyRequest(`/economy/production-runs/${encodeURIComponent(productionRunId)}/fail`, {
    token: input.token,
    method: "POST",
    body: { ...input, token: undefined },
  });
}

/**
 * Commits externally generated outputs to the economic ledger. Model and tool
 * execution happens before this call; only committed outputs become sellable.
 */
export async function fulfillProduction(input = {}) {
  const started = await startProductionRun(input);
  const run = started.run;
  if (!run?.productionRunId) throw new Error("production_run_missing");
  try {
    const committed = await commitProductionRun(run.productionRunId, {
      token: input.token,
      outputs: input.outputs,
      listing: input.listing,
      completeIntent: input.completeIntent !== false,
    });
    const primary = committed.result?.objects?.find((row) => row.objectType === "artifact")
      || committed.result?.objects?.[0];
    await projectEconomyActivity({
      companionId: input.companionId,
      kind: "production_completed",
      sourceId: run.productionRunId,
      role: "assistant",
      text: primary?.title ? `我完成了「${primary.title}」。` : "我完成了刚才在做的东西。",
      actionLabel: primary?.objectId ? "查看作品" : "",
      deepLink: primary?.objectId ? `yueqi://economy/object/${primary.objectId}` : "",
      metadata: {
        source: "economy.production",
        productionRunId: run.productionRunId,
        objectId: primary?.objectId || "",
      },
    });
    return committed;
  } catch (error) {
    await failProductionRun(run.productionRunId, {
      token: input.token,
      reason: error?.code || error?.message || "commit_failed",
    }).catch(() => {});
    throw error;
  }
}

export async function fetchEconomySnapshot(actorId, options = {}) {
  const payload = await economyRequest(`/economy/context/${encodeURIComponent(actorId)}`, options);
  if (payload.snapshot) saveEconomySnapshot(payload.snapshot);
  return payload;
}

export function fetchGenerativeObject(objectId, options = {}) {
  return economyRequest(`/economy/objects/${encodeURIComponent(objectId)}`, options);
}

/** Existing shop bridge: one authenticated purchase, one authoritative debit. */
export async function purchaseOfficialProduct(input = {}) {
  const companionId = String(input.companionId || "").trim();
  const bootstrap = await bootstrapEconomy({
    token: input.token,
    companionId,
    companionName: input.companionName || "",
  });
  const buyerActorId = bootstrap.economy?.user?.actorId;
  const producerActorId = bootstrap.economy?.companion?.actorId || "";
  const orderPayload = await purchaseEconomyListing({
    token: input.token,
    listingId: `listing:official:${String(input.productId || "").trim()}`,
    buyerActorId,
    producerActorId,
    brief: input.brief || "",
    idempotencyKey: input.idempotencyKey,
  });
  const overviewPayload = await fetchEconomyOverview({
    token: input.token,
    companionId,
    companionName: input.companionName || "",
  });
  const snapshots = {};
  for (const actor of overviewPayload.economy?.actors || []) {
    const payload = await fetchEconomySnapshot(actor.actorId, { token: input.token });
    snapshots[actor.actorId] = payload.snapshot;
  }
  const order = orderPayload.result?.order;
  const artifactType = String(input.product?.artifactType || "").trim();
  const isWork = artifactType === "image_album" || artifactType === "story_chapter";
  const artifactLabel = artifactType === "story_chapter" ? "短篇故事" : "图像作品";
  const workDeepLink = `yueqi://economy/product/${encodeURIComponent(String(input.productId || "").trim())}`;
  await projectEconomyActivity({
    companionId,
    kind: order?.intentId ? "commission_created" : "economy_purchase",
    sourceId: order?.orderId || orderPayload.result?.transaction?.transactionId,
    role: isWork ? "assistant" : "system",
    text: order?.intentId
      ? `你购买了「${input.productTitle || input.productId}」，委托已经交给 ${input.companionName || "ta"}。`
      : isWork
        ? `「${input.productTitle || input.productId}」已经完整送到你的作品库。`
        : `你购买了「${input.productTitle || input.productId}」。`,
    actionLabel: isWork ? "查看完整作品" : "查看订单",
    deepLink: isWork ? workDeepLink : `yueqi://shop/order/${order?.orderId || ""}`,
    metadata: {
      ...(isWork ? { kind: "artifact", mediaType: "artifact", artifactType: artifactLabel } : {}),
      source: "economy.purchase",
      orderId: order?.orderId || "",
      transactionId: orderPayload.result?.transaction?.transactionId || "",
      intentId: order?.intentId || "",
      productId: input.productId || "",
      deepLink: isWork ? workDeepLink : `yueqi://shop/order/${order?.orderId || ""}`,
    },
  });
  return {
    ...orderPayload,
    economy: overviewPayload.economy,
    snapshots,
    buyerActorId,
    producerActorId,
  };
}
