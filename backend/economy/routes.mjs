import { createEconomyService } from "./service.mjs";
import { createFileEconomyStore } from "./store.mjs";

const STATUS_BY_CODE = Object.freeze({
  login_required: 401,
  unauthorized: 401,
  actor_forbidden: 403,
  object_forbidden: 403,
  actor_not_found: 404,
  buyer_not_found: 404,
  recipient_not_found: 404,
  seller_not_found: 404,
  intent_not_found: 404,
  object_not_found: 404,
  production_run_not_found: 404,
  recipe_not_found: 404,
  listing_not_available: 404,
  listing_subject_not_found: 404,
  insufficient_balance: 402,
  out_of_stock: 409,
  self_purchase_not_allowed: 409,
  seller_does_not_control_object: 409,
  production_run_not_running: 409,
});

function mapError(error) {
  const code = String(error?.code || error?.message || "economy_failed");
  return {
    status: STATUS_BY_CODE[code] || 400,
    payload: {
      ok: false,
      error: code,
      message: String(error?.message || code),
      ...(error?.balance != null ? { balance: error.balance } : {}),
      ...(error?.walletId ? { walletId: error.walletId } : {}),
    },
  };
}

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      const value = await handler(req, res);
      if (res.headersSent) return;
      res.json({ ok: true, ...value });
    } catch (error) {
      const mapped = mapError(error);
      res.status(mapped.status).json(mapped.payload);
    }
  };
}

/**
 * Mounts the server-authoritative Nyra economy.
 * Billing/subscription credits are intentionally outside this service.
 */
export function mountEconomyRoutes(app, options = {}) {
  const authenticate = options.authenticate;
  if (typeof authenticate !== "function") throw new Error("economy_authenticate_required");
  const store = options.store || createFileEconomyStore(options.dataFile);
  const service = options.service || createEconomyService(store);

  function userId(req) {
    const value = String(authenticate(req) || "").trim();
    if (!value) throw Object.assign(new Error("login_required"), { code: "login_required" });
    return value;
  }

  app.post("/economy/bootstrap", asyncRoute(async (req) => ({
    economy: await service.bootstrap(userId(req), req.body || {}),
  })));

  app.get("/economy/overview", asyncRoute(async (req) => ({
    economy: await service.getOverview(userId(req), {
      companionId: req.query.companionId,
      companionName: req.query.companionName,
    }),
  })));

  app.get("/economy/marketplace", asyncRoute(async (req) => ({
    listings: await service.listMarketplace(userId(req), {
      kind: req.query.kind,
      sellerActorId: req.query.sellerActorId,
    }),
  })));

  app.get("/economy/recipes", asyncRoute(async (req) => {
    userId(req);
    return { recipes: await service.listRecipes() };
  }));

  app.post("/economy/transfers", asyncRoute(async (req) => ({
    result: await service.transfer(userId(req), req.body || {}),
  })));

  app.post("/economy/orders", asyncRoute(async (req) => ({
    result: await service.purchase(userId(req), req.body || {}),
  })));

  app.post("/economy/listings", asyncRoute(async (req) => ({
    listing: await service.createListing(userId(req), req.body || {}),
  })));

  app.post("/economy/intents", asyncRoute(async (req) => ({
    intent: await service.createIntent(userId(req), req.body || {}),
  })));

  app.post("/economy/production-runs", asyncRoute(async (req) => ({
    run: await service.startProduction(userId(req), req.body || {}),
  })));

  app.post("/economy/production-runs/:productionRunId/commit", asyncRoute(async (req) => ({
    result: await service.commitProduction(userId(req), {
      ...(req.body || {}),
      productionRunId: req.params.productionRunId,
    }),
  })));

  app.post("/economy/production-runs/:productionRunId/fail", asyncRoute(async (req) => ({
    run: await service.failProduction(userId(req), {
      ...(req.body || {}),
      productionRunId: req.params.productionRunId,
    }),
  })));

  app.get("/economy/context/:actorId", asyncRoute(async (req) => ({
    snapshot: await service.getSnapshot(userId(req), req.params.actorId),
  })));

  app.get("/economy/objects/:objectId", asyncRoute(async (req) => ({
    object: await service.getObject(userId(req), req.params.objectId),
  })));

  return { service, store };
}

