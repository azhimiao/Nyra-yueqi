import { randomUUID } from "node:crypto";
import {
  ARTIFACT_TYPES,
  GENERATIVE_OBJECT_TYPES,
  NYRA_CURRENCY,
  OFFICIAL_PRODUCTS,
  PRODUCTION_RECIPES,
  getProductionRecipe,
} from "./catalog.mjs";

const TREASURY_ACTOR_ID = "actor:system:treasury";
const TREASURY_WALLET_ID = "wallet:actor:system:treasury:nyra_coin";
const SYSTEM_MINT_AMOUNT = 1_000_000_000;
const USER_INITIAL_GRANT = 200;
const COMPANION_INITIAL_GRANT = 40;

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function integerAmount(value, { allowZero = false } = {}) {
  const amount = Math.floor(Number(value));
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1)) {
    const error = new Error("invalid_amount");
    error.code = "invalid_amount";
    throw error;
  }
  return amount;
}

function boundedText(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function uniqueStrings(value, max = 32) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))].slice(0, max);
}

function userActorId(userId) {
  return `actor:user:${String(userId || "").trim()}`;
}

function companionActorId(userId, companionId) {
  return `actor:companion:${String(userId || "").trim()}:${String(companionId || "").trim()}`;
}

function walletIdFor(actorId) {
  return `wallet:${actorId}:${NYRA_CURRENCY}`;
}

function publicActor(actor) {
  if (!actor) return null;
  return {
    actorId: actor.actorId,
    actorType: actor.actorType,
    displayName: actor.displayName,
    companionId: actor.companionId || "",
    createdAt: actor.createdAt,
  };
}

function assertActorAccess(state, userId, actorId) {
  const actor = state.actors[actorId];
  if (!actor) throw Object.assign(new Error("actor_not_found"), { code: "actor_not_found" });
  if (actor.principalUserId !== userId) {
    throw Object.assign(new Error("actor_forbidden"), { code: "actor_forbidden" });
  }
  return actor;
}

function ensureActor(state, input) {
  if (state.actors[input.actorId]) return state.actors[input.actorId];
  const actor = {
    actorId: input.actorId,
    actorType: input.actorType,
    principalUserId: input.principalUserId || "",
    companionId: input.companionId || "",
    displayName: boundedText(input.displayName, 80) || input.actorId,
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.actors[actor.actorId] = actor;
  return actor;
}

function ensureWallet(state, actorId) {
  const walletId = walletIdFor(actorId);
  if (!state.wallets[walletId]) {
    state.wallets[walletId] = {
      walletId,
      ownerActorId: actorId,
      currency: NYRA_CURRENCY,
      balance: 0,
      reserved: 0,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }
  return state.wallets[walletId];
}

function appendEvent(state, input) {
  const event = {
    eventId: input.eventId || id("econevt"),
    eventType: boundedText(input.eventType, 80) || "economy.event",
    actorId: input.actorId || "",
    principalUserId: input.principalUserId || "",
    causationId: input.causationId || "",
    correlationId: input.correlationId || input.causationId || "",
    summary: boundedText(input.summary, 300),
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    createdAt: input.createdAt || nowIso(),
  };
  state.events.push(event);
  state.events = state.events.slice(-5000);
  return event;
}

function commitTransaction(state, input) {
  const idem = boundedText(input.idempotencyKey, 180);
  if (idem && state.idempotency[idem]) {
    const previous = state.transactions[state.idempotency[idem]];
    if (previous) return { transaction: previous, deduped: true };
  }
  const postings = (Array.isArray(input.postings) ? input.postings : []).map((posting) => ({
    walletId: String(posting.walletId || "").trim(),
    delta: Math.trunc(Number(posting.delta) || 0),
  })).filter((posting) => posting.walletId && posting.delta !== 0);
  if (!postings.length) throw Object.assign(new Error("missing_postings"), { code: "missing_postings" });
  const sum = postings.reduce((total, posting) => total + posting.delta, 0);
  const mintOrBurn = input.kind === "currency_mint" || input.kind === "currency_burn";
  if (!mintOrBurn && sum !== 0) {
    throw Object.assign(new Error("unbalanced_transaction"), { code: "unbalanced_transaction" });
  }
  for (const posting of postings) {
    const wallet = state.wallets[posting.walletId];
    if (!wallet) throw Object.assign(new Error("wallet_not_found"), { code: "wallet_not_found" });
    if (wallet.status !== "active") throw Object.assign(new Error("wallet_inactive"), { code: "wallet_inactive" });
    if (wallet.ownerActorId !== TREASURY_ACTOR_ID && wallet.balance + posting.delta < 0) {
      throw Object.assign(new Error("insufficient_balance"), {
        code: "insufficient_balance",
        walletId: posting.walletId,
        balance: wallet.balance,
      });
    }
  }
  const transactionId = input.transactionId || id("tx");
  const transaction = {
    transactionId,
    kind: boundedText(input.kind, 80) || "transfer",
    currency: NYRA_CURRENCY,
    postings,
    idempotencyKey: idem,
    causationId: boundedText(input.causationId, 160),
    correlationId: boundedText(input.correlationId || input.causationId, 160),
    note: boundedText(input.note, 240),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    status: "committed",
    createdAt: nowIso(),
  };
  for (const posting of postings) {
    const wallet = state.wallets[posting.walletId];
    wallet.balance += posting.delta;
    wallet.updatedAt = transaction.createdAt;
  }
  state.transactions[transactionId] = transaction;
  if (idem) state.idempotency[idem] = transactionId;
  return { transaction, deduped: false };
}

function transfer(state, input) {
  const amount = integerAmount(input.amount);
  const from = ensureWallet(state, input.fromActorId);
  const to = ensureWallet(state, input.toActorId);
  return commitTransaction(state, {
    kind: input.kind || "transfer",
    idempotencyKey: input.idempotencyKey,
    causationId: input.causationId,
    correlationId: input.correlationId,
    note: input.note,
    metadata: input.metadata,
    postings: [
      { walletId: from.walletId, delta: -amount },
      { walletId: to.walletId, delta: amount },
    ],
  });
}

function ensureSystem(state) {
  ensureActor(state, {
    actorId: TREASURY_ACTOR_ID,
    actorType: "system",
    displayName: "月栖系统财政",
  });
  ensureWallet(state, TREASURY_ACTOR_ID);
  commitTransaction(state, {
    kind: "currency_mint",
    idempotencyKey: "economy:genesis:treasury:v1",
    note: "NyraCoin genesis supply",
    postings: [{ walletId: TREASURY_WALLET_ID, delta: SYSTEM_MINT_AMOUNT }],
  });
  for (const product of OFFICIAL_PRODUCTS) {
    const existingProduct = state.products[product.productId] || {};
    state.products[product.productId] = {
      ...existingProduct,
      ...product,
      producerActorId: TREASURY_ACTOR_ID,
      status: "active",
      currency: NYRA_CURRENCY,
      createdAt: existingProduct.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    const listingId = `listing:official:${product.productId}`;
    const existingListing = state.listings[listingId] || {};
    state.listings[listingId] = {
      ...existingListing,
      listingId,
      sellerActorId: TREASURY_ACTOR_ID,
      productId: product.productId,
      generativeObjectId: "",
      title: product.title,
      description: product.description,
      kind: product.kind,
      price: product.price,
      currency: NYRA_CURRENCY,
      license: product.kind === "artifact" || product.kind === "license"
        ? "private_use"
        : (product.consumable ? "consumable" : "account_use"),
      stock: null,
      salesCount: Number(existingListing.salesCount) || 0,
      status: "active",
      official: true,
      createdAt: existingListing.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
  }
}

function ensureUser(state, userId) {
  ensureSystem(state);
  const actorId = userActorId(userId);
  const actor = ensureActor(state, {
    actorId,
    actorType: "human",
    principalUserId: userId,
    displayName: userId,
  });
  ensureWallet(state, actorId);
  transfer(state, {
    fromActorId: TREASURY_ACTOR_ID,
    toActorId: actorId,
    amount: USER_INITIAL_GRANT,
    kind: "onboarding_grant",
    idempotencyKey: `economy:onboarding:user:${userId}:v1`,
    note: "用户初始生成预算",
  });
  return actor;
}

function ensureCompanion(state, userId, companionId, displayName = "") {
  ensureUser(state, userId);
  const cleanId = boundedText(companionId, 80);
  if (!cleanId) throw Object.assign(new Error("missing_companion_id"), { code: "missing_companion_id" });
  const actorId = companionActorId(userId, cleanId);
  const actor = ensureActor(state, {
    actorId,
    actorType: "companion",
    principalUserId: userId,
    companionId: cleanId,
    displayName: boundedText(displayName, 80) || cleanId,
  });
  ensureWallet(state, actorId);
  transfer(state, {
    fromActorId: TREASURY_ACTOR_ID,
    toActorId: actorId,
    amount: COMPANION_INITIAL_GRANT,
    kind: "identity_bootstrap_grant",
    // One endowment pool per account. Creating disposable characters must not
    // mint unlimited NyraCoin.
    idempotencyKey: `economy:onboarding:companion-pool:${userId}:v1`,
    note: "角色初始自主生产预算",
  });
  return actor;
}

function createOwnership(state, input) {
  const existing = Object.values(state.ownerships).find((row) =>
    row.generativeObjectId === input.generativeObjectId
    && row.productId === input.productId
    && row.ownerActorId === input.ownerActorId
    && row.license === input.license
    && row.status === "active");
  if (existing && input.stackable !== true) return existing;
  const ownershipId = id("own");
  const ownership = {
    ownershipId,
    ownerActorId: input.ownerActorId,
    authorActorId: input.authorActorId || "",
    productId: input.productId || "",
    generativeObjectId: input.generativeObjectId || "",
    license: input.license || "private_use",
    quantity: integerAmount(input.quantity || 1),
    acquiredByTransactionId: input.acquiredByTransactionId || "",
    acquiredAt: nowIso(),
    status: "active",
  };
  state.ownerships[ownershipId] = ownership;
  return ownership;
}

function grantResource(state, actorId, resourceType, quantity, sourceTransactionId) {
  const resourceId = `resource:${actorId}:${resourceType}`;
  const current = state.resources[resourceId] || {
    resourceId,
    ownerActorId: actorId,
    resourceType,
    quantity: 0,
    createdAt: nowIso(),
  };
  current.quantity += integerAmount(quantity || 1);
  current.lastSourceTransactionId = sourceTransactionId || "";
  current.updatedAt = nowIso();
  state.resources[resourceId] = current;
  return current;
}

function normalizeSourceRefs(value) {
  return (Array.isArray(value) ? value : []).slice(0, 64).map((source) => ({
    type: boundedText(source?.type, 60) || "unknown",
    id: boundedText(source?.id || source?.sourceId, 160),
    contentHash: boundedText(source?.contentHash, 160),
  })).filter((source) => source.id);
}

function createGenerativeObject(state, input) {
  const objectType = GENERATIVE_OBJECT_TYPES.includes(input.objectType)
    ? input.objectType
    : "artifact";
  const artifactType = ARTIFACT_TYPES.includes(input.artifactType)
    ? input.artifactType
    : "viewpoint_note";
  const objectId = input.objectId || id("gobj");
  if (state.generativeObjects[objectId]) return state.generativeObjects[objectId];
  const object = {
    schemaVersion: 1,
    objectId,
    objectType,
    artifactType: objectType === "artifact" ? artifactType : "",
    authorActorId: input.authorActorId,
    controllerActorId: input.controllerActorId || input.authorActorId,
    productionRunId: input.productionRunId || "",
    intentId: input.intentId || "",
    projectId: boundedText(input.projectId, 160),
    title: boundedText(input.title, 160) || "未命名产出",
    abstract: boundedText(input.abstract, 600),
    content: input.content ?? null,
    contentRef: boundedText(input.contentRef, 320),
    contentHash: boundedText(input.contentHash, 160),
    sourceRefs: normalizeSourceRefs(input.sourceRefs),
    derivedFrom: uniqueStrings(input.derivedFrom, 64),
    tags: uniqueStrings(input.tags, 24),
    visibility: boundedText(input.visibility, 60) || "private",
    status: "ready",
    economic: {
      productionCost: integerAmount(input.productionCost || 0, { allowZero: true }),
      currency: NYRA_CURRENCY,
      productionTransactionId: input.productionTransactionId || "",
      revenue: 0,
      salesCount: 0,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.generativeObjects[objectId] = object;
  createOwnership(state, {
    ownerActorId: object.controllerActorId,
    authorActorId: object.authorActorId,
    generativeObjectId: objectId,
    license: "creator_control",
  });
  return object;
}

function createIntent(state, input) {
  const intentId = input.intentId || id("intent");
  const intent = {
    intentId,
    actorId: input.actorId,
    intentType: boundedText(input.intentType, 80) || "creative",
    desire: boundedText(input.desire, 500),
    motivation: boundedText(input.motivation, 500),
    priority: Math.max(0, Math.min(1, Number(input.priority) || 0.5)),
    persistence: Math.max(0, Math.min(1, Number(input.persistence) || 0.7)),
    recipeId: boundedText(input.recipeId, 80),
    projectId: boundedText(input.projectId, 160),
    budgetReserved: integerAmount(input.budgetReserved || 0, { allowZero: true }),
    createdFrom: input.createdFrom && typeof input.createdFrom === "object" ? input.createdFrom : {},
    expectedNextTrigger: boundedText(input.expectedNextTrigger, 160),
    status: input.status === "completed" ? "completed" : "active",
    createdAt: nowIso(),
    lastProgressAt: "",
    updatedAt: nowIso(),
  };
  state.intents[intentId] = intent;
  return intent;
}

function createListing(state, input) {
  const idempotencyKey = boundedText(input.idempotencyKey, 180);
  if (idempotencyKey) {
    const existing = Object.values(state.listings).find((row) => row.idempotencyKey === idempotencyKey);
    if (existing) return existing;
  }
  const seller = state.actors[input.sellerActorId];
  if (!seller) throw Object.assign(new Error("seller_not_found"), { code: "seller_not_found" });
  const object = input.generativeObjectId ? state.generativeObjects[input.generativeObjectId] : null;
  const product = input.productId ? state.products[input.productId] : null;
  if (!object && !product) throw Object.assign(new Error("listing_subject_not_found"), { code: "listing_subject_not_found" });
  if (object && object.controllerActorId !== seller.actorId) {
    throw Object.assign(new Error("seller_does_not_control_object"), { code: "seller_does_not_control_object" });
  }
  const listingId = input.listingId || id("listing");
  const listing = {
    listingId,
    sellerActorId: seller.actorId,
    productId: product?.productId || "",
    generativeObjectId: object?.objectId || "",
    title: boundedText(input.title || object?.title || product?.title, 160),
    description: boundedText(input.description || object?.abstract || product?.description, 600),
    kind: input.kind || product?.kind || "artifact",
    price: integerAmount(input.price),
    currency: NYRA_CURRENCY,
    license: boundedText(input.license, 80) || (object ? "private_use" : "consumable"),
    stock: input.stock == null ? null : integerAmount(input.stock, { allowZero: true }),
    salesCount: 0,
    status: "active",
    official: false,
    idempotencyKey,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.listings[listingId] = listing;
  return listing;
}

function purchaseListing(state, input) {
  const listing = state.listings[input.listingId];
  if (!listing || listing.status !== "active") {
    throw Object.assign(new Error("listing_not_available"), { code: "listing_not_available" });
  }
  if (listing.stock != null && listing.stock < 1) {
    throw Object.assign(new Error("out_of_stock"), { code: "out_of_stock" });
  }
  const buyer = state.actors[input.buyerActorId];
  if (!buyer) throw Object.assign(new Error("buyer_not_found"), { code: "buyer_not_found" });
  const product = listing.productId ? state.products[listing.productId] : null;
  const object = listing.generativeObjectId ? state.generativeObjects[listing.generativeObjectId] : null;
  let settlementActorId = listing.sellerActorId;
  if (product?.kind === "service" && input.producerActorId) {
    settlementActorId = input.producerActorId;
  }
  if (buyer.actorId === settlementActorId) {
    throw Object.assign(new Error("self_purchase_not_allowed"), { code: "self_purchase_not_allowed" });
  }
  const transferResult = transfer(state, {
    fromActorId: buyer.actorId,
    toActorId: settlementActorId,
    amount: listing.price,
    kind: "market_purchase",
    idempotencyKey: input.idempotencyKey,
    causationId: listing.listingId,
    note: `购买：${listing.title}`,
    metadata: { listingId: listing.listingId, productId: listing.productId, generativeObjectId: listing.generativeObjectId },
  });
  const previousOrder = Object.values(state.orders).find((row) => row.transactionId === transferResult.transaction.transactionId);
  if (previousOrder) return { order: previousOrder, transaction: transferResult.transaction, deduped: true };
  const orderId = id("order");
  const order = {
    orderId,
    listingId: listing.listingId,
    buyerActorId: buyer.actorId,
    sellerActorId: settlementActorId,
    productId: listing.productId,
    generativeObjectId: listing.generativeObjectId,
    amount: listing.price,
    currency: NYRA_CURRENCY,
    transactionId: transferResult.transaction.transactionId,
    status: "paid",
    createdAt: nowIso(),
  };
  state.orders[orderId] = order;
  if (listing.stock != null) listing.stock -= 1;
  listing.salesCount += 1;
  listing.updatedAt = nowIso();
  let ownership = null;
  let resource = null;
  let intent = null;
  if (object) {
    ownership = createOwnership(state, {
      ownerActorId: buyer.actorId,
      authorActorId: object.authorActorId,
      generativeObjectId: object.objectId,
      license: listing.license,
      acquiredByTransactionId: order.transactionId,
      stackable: listing.license === "consumable",
    });
    object.economic.revenue += listing.price;
    object.economic.salesCount += 1;
    object.updatedAt = nowIso();
  } else if (product?.grant) {
    resource = grantResource(state, buyer.actorId, product.grant.resourceType, product.grant.quantity, order.transactionId);
  } else if (product?.consumable && product.kind !== "service") {
    resource = grantResource(state, buyer.actorId, `product_unit:${product.productId}`, 1, order.transactionId);
  } else if (product && !product.consumable) {
    ownership = createOwnership(state, {
      ownerActorId: buyer.actorId,
      authorActorId: product.producerActorId,
      productId: product.productId,
      license: listing.license,
      acquiredByTransactionId: order.transactionId,
    });
  }
  if (product?.recipeId && input.producerActorId) {
    intent = createIntent(state, {
      actorId: input.producerActorId,
      intentType: "commission",
      desire: input.brief || product.description,
      motivation: "用户已支付并发起委托",
      priority: 0.9,
      persistence: 0.95,
      recipeId: product.recipeId,
      budgetReserved: 0,
      createdFrom: { orderId, buyerActorId: buyer.actorId },
      expectedNextTrigger: "worker_next_tick",
    });
    order.intentId = intent.intentId;
  }
  const event = appendEvent(state, {
    eventType: "economy.purchase.completed",
    actorId: buyer.actorId,
    principalUserId: buyer.principalUserId,
    causationId: orderId,
    summary: `${buyer.displayName} 购买了「${listing.title}」`,
    payload: { orderId, listingId: listing.listingId, amount: listing.price, ownershipId: ownership?.ownershipId || "", intentId: intent?.intentId || "" },
  });
  return { order, transaction: transferResult.transaction, ownership, resource, intent, event, deduped: false };
}

function startProduction(state, input) {
  const actor = state.actors[input.actorId];
  if (!actor) throw Object.assign(new Error("actor_not_found"), { code: "actor_not_found" });
  const recipe = getProductionRecipe(input.recipeId);
  if (!recipe) throw Object.assign(new Error("recipe_not_found"), { code: "recipe_not_found" });
  const runId = input.productionRunId || id("run");
  if (state.productionRuns[runId]) return state.productionRuns[runId];
  const payment = transfer(state, {
    fromActorId: actor.actorId,
    toActorId: TREASURY_ACTOR_ID,
    amount: recipe.nyraCoinCost,
    kind: "production_cost",
    idempotencyKey: input.idempotencyKey || `production:${runId}:cost`,
    causationId: runId,
    note: `生产预算：${recipe.title}`,
    metadata: { recipeId: recipe.recipeId, intentId: input.intentId || "" },
  });
  const previousRun = Object.values(state.productionRuns).find((row) =>
    row.productionTransactionId === payment.transaction.transactionId);
  if (previousRun) return previousRun;
  const run = {
    productionRunId: runId,
    actorId: actor.actorId,
    trigger: boundedText(input.trigger, 80) || "manual",
    recipeId: recipe.recipeId,
    intentId: boundedText(input.intentId, 160),
    projectId: boundedText(input.projectId, 160),
    sourceRefs: normalizeSourceRefs(input.sourceRefs),
    budget: {
      nyraCoin: recipe.nyraCoinCost,
      // API billing is settled by the commercial model gateway, never trusted
      // from a client-supplied number and never converted to NyraCoin.
      billingCredits: 0,
    },
    externalBillingRef: boundedText(input.externalBillingRef, 180),
    productionTransactionId: payment.transaction.transactionId,
    outputIds: [],
    model: boundedText(input.model, 120),
    toolNames: uniqueStrings(input.toolNames, 24),
    status: "running",
    startedAt: nowIso(),
    committedAt: "",
    failedAt: "",
    failureReason: "",
  };
  state.productionRuns[runId] = run;
  appendEvent(state, {
    eventType: "production.started",
    actorId: actor.actorId,
    principalUserId: actor.principalUserId,
    causationId: runId,
    summary: `${actor.displayName} 开始了「${recipe.title}」`,
    payload: { productionRunId: runId, recipeId: recipe.recipeId, cost: recipe.nyraCoinCost },
  });
  return run;
}

function commitProduction(state, input) {
  const run = state.productionRuns[input.productionRunId];
  if (!run) throw Object.assign(new Error("production_run_not_found"), { code: "production_run_not_found" });
  if (run.status === "committed") {
    return { run, objects: run.outputIds.map((objectId) => state.generativeObjects[objectId]).filter(Boolean), listings: [] };
  }
  if (run.status !== "running") throw Object.assign(new Error("production_run_not_running"), { code: "production_run_not_running" });
  const recipe = getProductionRecipe(run.recipeId);
  const outputs = Array.isArray(input.outputs) ? input.outputs.slice(0, 20) : [];
  if (!outputs.length) throw Object.assign(new Error("missing_outputs"), { code: "missing_outputs" });
  const objects = outputs.map((output, index) => createGenerativeObject(state, {
    ...output,
    objectType: output.objectType || (index === 0 ? "artifact" : "claim"),
    artifactType: output.artifactType || recipe.outputType,
    authorActorId: run.actorId,
    controllerActorId: run.actorId,
    productionRunId: run.productionRunId,
    intentId: run.intentId,
    projectId: run.projectId,
    sourceRefs: output.sourceRefs?.length ? output.sourceRefs : run.sourceRefs,
    visibility: output.visibility || recipe.defaultVisibility,
    productionCost: index === 0 ? run.budget.nyraCoin : 0,
    productionTransactionId: run.productionTransactionId,
  }));
  const listings = [];
  const listingInput = input.listing && typeof input.listing === "object" ? input.listing : null;
  if (listingInput && recipe.sellable) {
    const primary = objects.find((object) => object.objectType === "artifact") || objects[0];
    listings.push(createListing(state, {
      sellerActorId: run.actorId,
      generativeObjectId: primary.objectId,
      title: listingInput.title || primary.title,
      description: listingInput.description || primary.abstract,
      kind: "artifact",
      price: listingInput.price || recipe.suggestedPrice,
      license: listingInput.license || "private_use",
      stock: listingInput.stock,
    }));
  }
  run.outputIds = objects.map((object) => object.objectId);
  run.status = "committed";
  run.committedAt = nowIso();
  if (run.intentId && state.intents[run.intentId]) {
    const intent = state.intents[run.intentId];
    intent.lastProgressAt = run.committedAt;
    intent.updatedAt = run.committedAt;
    if (input.completeIntent === true) intent.status = "completed";
  }
  const actor = state.actors[run.actorId];
  const event = appendEvent(state, {
    eventType: "production.committed",
    actorId: run.actorId,
    principalUserId: actor?.principalUserId || "",
    causationId: run.productionRunId,
    summary: `${actor?.displayName || "角色"} 完成了「${objects[0]?.title || recipe.title}」`,
    payload: { productionRunId: run.productionRunId, objectIds: run.outputIds, listingIds: listings.map((item) => item.listingId) },
  });
  return { run, objects, listings, event };
}

function failProduction(state, input) {
  const run = state.productionRuns[input.productionRunId];
  if (!run) throw Object.assign(new Error("production_run_not_found"), { code: "production_run_not_found" });
  if (run.status === "failed") return run;
  if (run.status !== "running") throw Object.assign(new Error("production_run_not_running"), { code: "production_run_not_running" });
  transfer(state, {
    fromActorId: TREASURY_ACTOR_ID,
    toActorId: run.actorId,
    amount: run.budget.nyraCoin,
    kind: "production_refund",
    idempotencyKey: `production:${run.productionRunId}:refund`,
    causationId: run.productionRunId,
    note: "生产失败，退回栖币预算",
  });
  run.status = "failed";
  run.failedAt = nowIso();
  run.failureReason = boundedText(input.reason, 300) || "production_failed";
  appendEvent(state, {
    eventType: "production.failed",
    actorId: run.actorId,
    causationId: run.productionRunId,
    summary: `生产未完成，预算已退回`,
    payload: { productionRunId: run.productionRunId, reason: run.failureReason },
  });
  return run;
}

function economySnapshot(state, userId, actorId) {
  const actor = assertActorAccess(state, userId, actorId);
  const wallet = ensureWallet(state, actor.actorId);
  const recentTransactions = Object.values(state.transactions)
    .filter((transaction) => transaction.postings.some((posting) => posting.walletId === wallet.walletId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 8)
    .map((transaction) => ({
      transactionId: transaction.transactionId,
      kind: transaction.kind,
      delta: transaction.postings.find((posting) => posting.walletId === wallet.walletId)?.delta || 0,
      note: transaction.note,
      createdAt: transaction.createdAt,
    }));
  const activeIntents = Object.values(state.intents)
    .filter((intent) => intent.actorId === actor.actorId && intent.status === "active")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((intent) => ({
      intentId: intent.intentId,
      desire: intent.desire,
      priority: intent.priority,
      recipeId: intent.recipeId,
      lastProgressAt: intent.lastProgressAt,
      expectedNextTrigger: intent.expectedNextTrigger,
    }));
  const relevantObjects = Object.values(state.generativeObjects)
    .filter((object) => object.authorActorId === actor.actorId || object.controllerActorId === actor.actorId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 6)
    .map((object) => ({
      objectId: object.objectId,
      objectType: object.objectType,
      artifactType: object.artifactType,
      title: object.title,
      abstract: object.abstract,
      sourceRefs: object.sourceRefs,
      updatedAt: object.updatedAt,
    }));
  return {
    schemaVersion: "economy_snapshot.v1",
    actor: publicActor(actor),
    currency: NYRA_CURRENCY,
    balance: wallet.balance,
    reserved: wallet.reserved,
    available: wallet.balance - wallet.reserved,
    activeIntents,
    recentTransactions,
    relevantObjects,
    generatedAt: nowIso(),
  };
}

export function createEconomyService(store) {
  return {
    async bootstrap(userId, input = {}) {
      return store.transact((state) => {
        const user = ensureUser(state, userId);
        const companion = input.companionId
          ? ensureCompanion(state, userId, input.companionId, input.companionName)
          : null;
        return {
          user: publicActor(user),
          companion: publicActor(companion),
          wallets: Object.values(state.wallets).filter((wallet) =>
            [user.actorId, companion?.actorId].filter(Boolean).includes(wallet.ownerActorId)),
          recipes: PRODUCTION_RECIPES,
        };
      });
    },

    async getOverview(userId, input = {}) {
      return store.transact((state) => {
        const user = ensureUser(state, userId);
        const companion = input.companionId
          ? ensureCompanion(state, userId, input.companionId, input.companionName)
          : null;
        const actorIds = new Set([user.actorId, companion?.actorId].filter(Boolean));
        return {
          actors: [...actorIds].map((actorId) => publicActor(state.actors[actorId])),
          wallets: Object.values(state.wallets).filter((wallet) => actorIds.has(wallet.ownerActorId)),
          ownerships: Object.values(state.ownerships).filter((row) => actorIds.has(row.ownerActorId)),
          resources: Object.values(state.resources).filter((row) => actorIds.has(row.ownerActorId)),
          intents: Object.values(state.intents).filter((row) => actorIds.has(row.actorId)),
          recentEvents: state.events.filter((row) => row.principalUserId === userId).slice(-30).reverse(),
        };
      });
    },

    async listMarketplace(userId, filters = {}) {
      return store.transact((state) => {
        ensureUser(state, userId);
        let rows = Object.values(state.listings).filter((listing) => listing.status === "active" && (listing.stock == null || listing.stock > 0));
        if (filters.kind) rows = rows.filter((listing) => listing.kind === filters.kind);
        if (filters.sellerActorId) rows = rows.filter((listing) => listing.sellerActorId === filters.sellerActorId);
        return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((listing) => ({
          ...listing,
          seller: publicActor(state.actors[listing.sellerActorId]),
          product: listing.productId ? state.products[listing.productId] : null,
          objectDigest: listing.generativeObjectId ? (() => {
            const object = state.generativeObjects[listing.generativeObjectId];
            return object ? { objectId: object.objectId, objectType: object.objectType, artifactType: object.artifactType, title: object.title, abstract: object.abstract, authorActorId: object.authorActorId, sourceRefs: object.sourceRefs } : null;
          })() : null,
        }));
      });
    },

    async transfer(userId, input) {
      return store.transact((state) => {
        ensureUser(state, userId);
        assertActorAccess(state, userId, input.fromActorId);
        const to = state.actors[input.toActorId];
        if (!to) throw Object.assign(new Error("recipient_not_found"), { code: "recipient_not_found" });
        const result = transfer(state, input);
        const actor = state.actors[input.fromActorId];
        const event = appendEvent(state, {
          eventType: "economy.transfer.completed",
          actorId: input.fromActorId,
          principalUserId: userId,
          causationId: result.transaction.transactionId,
          summary: `${actor.displayName} 转出 ${integerAmount(input.amount)} 栖币`,
          payload: { transactionId: result.transaction.transactionId, toActorId: input.toActorId },
        });
        return { ...result, event };
      });
    },

    async purchase(userId, input) {
      return store.transact((state) => {
        ensureUser(state, userId);
        assertActorAccess(state, userId, input.buyerActorId);
        if (input.producerActorId) assertActorAccess(state, userId, input.producerActorId);
        return purchaseListing(state, input);
      });
    },

    async createListing(userId, input) {
      return store.transact((state) => {
        ensureUser(state, userId);
        assertActorAccess(state, userId, input.sellerActorId);
        const listing = createListing(state, input);
        appendEvent(state, {
          eventType: "market.listing.created",
          actorId: input.sellerActorId,
          principalUserId: userId,
          causationId: listing.listingId,
          summary: `「${listing.title}」已上架`,
          payload: { listingId: listing.listingId, price: listing.price },
        });
        return listing;
      });
    },

    async createIntent(userId, input) {
      return store.transact((state) => {
        ensureUser(state, userId);
        assertActorAccess(state, userId, input.actorId);
        return createIntent(state, input);
      });
    },

    async startProduction(userId, input) {
      return store.transact((state) => {
        ensureUser(state, userId);
        assertActorAccess(state, userId, input.actorId);
        if (input.intentId) {
          const intent = state.intents[input.intentId];
          if (!intent || intent.actorId !== input.actorId) throw Object.assign(new Error("intent_not_found"), { code: "intent_not_found" });
        }
        return startProduction(state, input);
      });
    },

    async commitProduction(userId, input) {
      return store.transact((state) => {
        ensureUser(state, userId);
        const run = state.productionRuns[input.productionRunId];
        if (!run) throw Object.assign(new Error("production_run_not_found"), { code: "production_run_not_found" });
        assertActorAccess(state, userId, run.actorId);
        return commitProduction(state, input);
      });
    },

    async failProduction(userId, input) {
      return store.transact((state) => {
        ensureUser(state, userId);
        const run = state.productionRuns[input.productionRunId];
        if (!run) throw Object.assign(new Error("production_run_not_found"), { code: "production_run_not_found" });
        assertActorAccess(state, userId, run.actorId);
        return failProduction(state, input);
      });
    },

    async getSnapshot(userId, actorId) {
      return store.transact((state) => {
        ensureUser(state, userId);
        return economySnapshot(state, userId, actorId);
      });
    },

    async getObject(userId, objectId) {
      return store.transact((state) => {
        ensureUser(state, userId);
        const object = state.generativeObjects[objectId];
        if (!object) throw Object.assign(new Error("object_not_found"), { code: "object_not_found" });
        const author = state.actors[object.authorActorId];
        const controller = state.actors[object.controllerActorId];
        const visible = object.visibility === "public"
          || author?.principalUserId === userId
          || controller?.principalUserId === userId
          || Object.values(state.ownerships).some((row) => row.generativeObjectId === objectId && state.actors[row.ownerActorId]?.principalUserId === userId);
        if (!visible) throw Object.assign(new Error("object_forbidden"), { code: "object_forbidden" });
        return object;
      });
    },

    async listRecipes() {
      return PRODUCTION_RECIPES;
    },
  };
}

export const economyIds = Object.freeze({
  userActorId,
  companionActorId,
  walletIdFor,
  treasuryActorId: TREASURY_ACTOR_ID,
});
