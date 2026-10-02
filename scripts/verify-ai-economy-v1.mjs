import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { createFileEconomyStore } from "../server/economy/store.mjs";
import { createEconomyService } from "../server/economy/service.mjs";
import { OFFICIAL_PRODUCTS } from "../server/economy/catalog.mjs";
import { mountEconomyRoutes } from "../server/economy/routes.mjs";

const folder = await mkdtemp(join(tmpdir(), "yueqi-economy-v1-"));
const file = join(folder, "economy.json");

try {
  const service = createEconomyService(createFileEconomyStore(file));
  const userId = "verify-user";
  const companionId = "verify-companion";
  const boot = await service.bootstrap(userId, { companionId, companionName: "月栖" });
  assert.equal(boot.wallets.find((row) => row.ownerActorId === boot.user.actorId)?.balance, 200);
  assert.equal(boot.wallets.find((row) => row.ownerActorId === boot.companion.actorId)?.balance, 40);
  const secondBoot = await service.bootstrap(userId, { companionId: "verify-companion-2", companionName: "另一个角色" });
  assert.equal(
    secondBoot.wallets.find((row) => row.ownerActorId === secondBoot.companion.actorId)?.balance,
    0,
    "creating more characters must not mint unlimited companion endowments",
  );
  assert.ok(OFFICIAL_PRODUCTS.length >= 26, "all official and legacy products must be server-defined");
  const officialWorkMedia = OFFICIAL_PRODUCTS
    .filter((product) => product.kind === "artifact")
    .flatMap((product) => [product.coverUrl, ...(product.previewUrls || [])])
    .filter(Boolean);
  assert.ok(
    officialWorkMedia.every((url) => !url.includes("/assets/characters/") && !url.includes("/xingli/")),
    "marketplace artwork must not reuse companion or desk-pet assets",
  );

  const market = await service.listMarketplace(userId);
  assert.ok(market.some((row) => row.listingId === "listing:official:prd-night-lamp"));
  assert.ok(market.some((row) => row.listingId === "listing:official:official:relationship-chronicle"));

  const commissionInput = {
    listingId: "listing:official:official:relationship-chronicle",
    buyerActorId: boot.user.actorId,
    producerActorId: boot.companion.actorId,
    brief: "把我们确认过的时间线整理成一篇关系纪事。",
    idempotencyKey: "verify:commission:1",
  };
  const commission = await service.purchase(userId, commissionInput);
  assert.equal(commission.order.amount, 16);
  assert.equal(commission.intent.actorId, boot.companion.actorId);
  const duplicate = await service.purchase(userId, commissionInput);
  assert.equal(duplicate.deduped, true, "retry must not debit twice");

  let overview = await service.getOverview(userId, { companionId });
  assert.equal(overview.wallets.find((row) => row.ownerActorId === boot.user.actorId)?.balance, 184);
  assert.equal(overview.wallets.find((row) => row.ownerActorId === boot.companion.actorId)?.balance, 56);

  const run = await service.startProduction(userId, {
    actorId: boot.companion.actorId,
    recipeId: "relationship_chronicle",
    intentId: commission.intent.intentId,
    trigger: "worker_tick",
    sourceRefs: [
      { kind: "timeline_event", id: "timeline:2026-08-10", occurredAt: "2026-08-10T20:00:00.000Z" },
      { kind: "diary", id: "diary:2026-08-10", occurredAt: "2026-08-10T23:00:00.000Z" },
    ],
    idempotencyKey: "verify:production:1",
  });
  assert.equal(run.status, "running");
  const duplicateRun = await service.startProduction(userId, {
    actorId: boot.companion.actorId,
    recipeId: "relationship_chronicle",
    intentId: commission.intent.intentId,
    idempotencyKey: "verify:production:1",
  });
  assert.equal(duplicateRun.productionRunId, run.productionRunId, "production retry must reuse the run");

  const produced = await service.commitProduction(userId, {
    productionRunId: run.productionRunId,
    completeIntent: true,
    outputs: [
      {
        objectType: "artifact",
        artifactType: "relationship_chronicle",
        title: "我们经过的两场雨",
        abstract: "一篇只引用已确认共同经历的关系纪事。",
        content: { sections: [{ title: "回来", body: "你回来的时候，她还记得那场雨。" }] },
      },
      {
        objectType: "claim",
        title: "来源声明",
        abstract: "作品只使用已确认时间线与日记。",
      },
    ],
    listing: { price: 16, license: "private_use", stock: 5 },
  });
  assert.equal(produced.objects.length, 2);
  assert.equal(produced.objects[0].sourceRefs.length, 2);
  assert.equal(produced.listings.length, 1);

  const resale = await service.purchase(userId, {
    listingId: produced.listings[0].listingId,
    buyerActorId: boot.user.actorId,
    idempotencyKey: "verify:artifact-purchase:1",
  });
  assert.equal(resale.ownership.generativeObjectId, produced.objects[0].objectId);

  const failedRun = await service.startProduction(userId, {
    actorId: boot.companion.actorId,
    recipeId: "viewpoint_note",
    trigger: "worker_tick",
    idempotencyKey: "verify:production:failure",
  });
  await service.failProduction(userId, { productionRunId: failedRun.productionRunId, reason: "provider_timeout" });

  overview = await service.getOverview(userId, { companionId });
  assert.equal(overview.wallets.find((row) => row.ownerActorId === boot.user.actorId)?.balance, 168);
  assert.equal(overview.wallets.find((row) => row.ownerActorId === boot.companion.actorId)?.balance, 62);

  const snapshot = await service.getSnapshot(userId, boot.companion.actorId);
  assert.equal(snapshot.schemaVersion, "economy_snapshot.v1");
  assert.ok(snapshot.relevantObjects.some((row) => row.objectId === produced.objects[0].objectId));
  assert.equal(snapshot.activeIntents.length, 0, "completed commission must leave active intent list");

  const raw = JSON.parse(await readFile(file, "utf8"));
  for (const transaction of Object.values(raw.transactions)) {
    const sum = transaction.postings.reduce((total, posting) => total + posting.delta, 0);
    if (transaction.kind === "currency_mint") assert.ok(sum > 0);
    else assert.equal(sum, 0, `${transaction.transactionId} must balance`);
  }
  assert.equal(Object.values(raw.orders).length, 2, "idempotent retry must not create a third order");
  assert.ok(Object.values(raw.generativeObjects).every((row) => Array.isArray(row.sourceRefs)));

  const httpApp = express();
  httpApp.use(express.json());
  mountEconomyRoutes(httpApp, {
    dataFile: join(folder, "http-economy.json"),
    authenticate: (req) => req.get("x-test-user"),
  });
  const httpServer = await new Promise((resolve) => {
    const server = httpApp.listen(0, "127.0.0.1", () => resolve(server));
  });
  try {
    const base = `http://127.0.0.1:${httpServer.address().port}`;
    const denied = await fetch(`${base}/economy/overview`);
    assert.equal(denied.status, 401);
    const headers = { "x-test-user": "http-user", "content-type": "application/json" };
    const bootResponse = await fetch(`${base}/economy/bootstrap`, {
      method: "POST", headers, body: JSON.stringify({ companionId: "http-companion", companionName: "Nyra" }),
    });
    assert.equal(bootResponse.status, 200);
    const httpBoot = await bootResponse.json();
    const orderResponse = await fetch(`${base}/economy/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        listingId: "listing:official:prd-night-lamp",
        buyerActorId: httpBoot.economy.user.actorId,
        idempotencyKey: "http:order:1",
      }),
    });
    assert.equal(orderResponse.status, 200);
    const httpOrder = await orderResponse.json();
    assert.equal(httpOrder.result.order.amount, 28);
  } finally {
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }

  console.log(JSON.stringify({
    ok: true,
    products: OFFICIAL_PRODUCTS.length,
    orders: Object.keys(raw.orders).length,
    productionRuns: Object.keys(raw.productionRuns).length,
    generativeObjects: Object.keys(raw.generativeObjects).length,
    finalUserBalance: 168,
    finalCompanionBalance: 62,
    httpContract: "pass",
  }, null, 2));
} finally {
  await rm(folder, { recursive: true, force: true });
}
