import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createBillingService,
  ensureBillingStore,
} from "../server/billing/service.mjs";
import { createWhopBillingGateway } from "../server/billing/whop.mjs";
import {
  ARK_PRICE_SOURCE,
  DEFAULT_HOSTED_MODEL_PRICES,
  HOSTED_INTERNAL_MODEL,
  HOSTED_TIER_MODELS,
  listConfiguredHostedModels,
  resolveHostedEndpoint,
  resolveTextSupplierRates,
} from "../server/billing/hosted-catalog.mjs";
import {
  estimateImageCredits,
  estimateTextCredits,
  loadHostedPricing,
  providerCostToCredits,
  publicPricingSnapshot,
  signupBonusCredits,
} from "../server/billing/pricing.mjs";
import { applyDebit } from "../src/wallet/ledger.js";

function createMemoryAccountStore(seed = {}) {
  const store = ensureBillingStore(structuredClone(seed));
  let queue = Promise.resolve();
  return {
    readStore: async () => structuredClone(store),
    transact(mutator) {
      const operation = queue.then(() => mutator(store));
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

const accountStore = createMemoryAccountStore({
  users: {
    u1: { id: "u1", username: "one" },
    u2: { id: "u2", username: "two" },
    "u-signup": { id: "u-signup", username: "signup" },
  },
});
const billing = createBillingService(accountStore, {
  now: () => "2026-08-15T00:30:00.000Z",
});
assert.equal(
  providerCostToCredits(0.0218, { markup: 2, creditCny: 0.01 }),
  5,
  "provider cost is converted to Credits with ceiling",
);

const initial = await billing.getSummary("u1");
assert.deepEqual(initial, {
  balance: 0,
  reserved: 0,
  available: 0,
  debt: 0,
  paidMember: false,
  memberSince: null,
  currency: "CREDIT",
});

await billing.grantCredits({
  userId: "u1",
  credits: 100,
  type: "bonus",
  source: "manual",
  referenceId: "bonus-1",
  description: "测试赠送",
});
assert.equal((await billing.getSummary("u1")).paidMember, false, "bonus must not create membership");

assert.equal(signupBonusCredits(), 200, "¥2 signup maps to 200 Credits at 0.01 CNY/credit");
assert.equal(
  signupBonusCredits({ creditCny: 0.01, markup: 9 }),
  200,
  "signup bonus is face value and ignores markup",
);
const signupGrant = await billing.grantCredits({
  userId: "u-signup",
  credits: signupBonusCredits(),
  type: "bonus",
  source: "signup",
  referenceId: "signup_bonus:u-signup",
  description: "注册赠送 ¥2 Credits",
});
assert.equal(signupGrant.summary.available, 200);
assert.equal(signupGrant.summary.paidMember, false, "signup bonus must not create membership");
const signupAgain = await billing.grantCredits({
  userId: "u-signup",
  credits: signupBonusCredits(),
  type: "bonus",
  source: "signup",
  referenceId: "signup_bonus:u-signup",
});
assert.equal(signupAgain.deduped, true);
assert.equal(signupAgain.summary.available, 200);

const pendingOrder = await billing.createPurchaseOrder({
  userId: "u1",
  channel: "whop",
  externalId: "pay-1",
  credits: 3500,
  amountPaid: 4.49,
  currency: "USD",
});
const purchase = await billing.grantPaidCredits({
  userId: "u1",
  credits: 3500,
  source: "whop",
  referenceId: "pay-1",
  amountPaid: 4.49,
  currency: "USD",
});
assert.equal(purchase.summary.balance, 3600);
assert.equal(purchase.purchase.id, pendingOrder.id);
assert.equal(purchase.summary.paidMember, true);
assert.equal(purchase.summary.memberSince, "2026-08-15T00:30:00.000Z");

const duplicatePurchase = await billing.grantPaidCredits({
  userId: "u1",
  credits: 3500,
  source: "whop",
  referenceId: "pay-1",
});
assert.equal(duplicatePurchase.deduped, true);
assert.equal(duplicatePurchase.summary.balance, 3600);
const originalMemberSince = duplicatePurchase.summary.memberSince;
const secondPurchase = await billing.grantPaidCredits({
  userId: "u1",
  credits: 100,
  source: "whop",
  referenceId: "pay-3",
});
assert.equal(secondPurchase.summary.balance, 3700);
assert.equal(secondPurchase.summary.memberSince, originalMemberSince, "memberSince is immutable");

await billing.createPurchaseOrder({
  userId: "u2",
  channel: "whop",
  externalId: "whop-order-2",
  credits: 1000,
  amountPaid: 1.49,
  currency: "USD",
});
const whop = createWhopBillingGateway(billing);
const whopEvent = {
  id: "evt-payment-2",
  type: "payment.succeeded",
  data: {
    id: "pay-2",
    metadata: { nyraOrderId: "whop-order-2" },
    settlement_amount: 1.49,
    settlement_currency: "usd",
    auto_refunded: false,
    refunded_amount: null,
  },
};
const webhookResults = await Promise.all([
  whop.handleEvent(whopEvent),
  whop.handleEvent(whopEvent),
  whop.handleEvent(whopEvent),
]);
assert.equal(webhookResults.filter((result) => result.outcome === "fulfilled").length, 1);
assert.equal((await billing.getSummary("u2")).balance, 1000);
const refundEvent = {
  id: "evt-refund-2",
  type: "refund.updated",
  data: {
    id: "refund-2",
    status: "succeeded",
    amount: 1.49,
    currency: "usd",
    payment: { metadata: { nyraOrderId: "whop-order-2" } },
  },
};
assert.equal((await whop.handleEvent(refundEvent)).outcome, "refunded");
assert.equal((await whop.handleEvent(refundEvent)).outcome, "deduped");
assert.equal((await billing.getSummary("u2")).balance, 0);
assert.equal((await billing.getSummary("u2")).paidMember, false);

await billing.chargeUsage({
  userId: "u1",
  credits: 4,
  source: "llm",
  referenceId: "chat-1",
  description: "Luna · 聊天",
});
assert.equal((await billing.getSummary("u1")).balance, 3696);

const reserve = await billing.reserveCredits({
  userId: "u1",
  credits: 50,
  source: "image",
  referenceId: "image-reserve-1",
  description: "生成图片",
});
assert.equal(reserve.summary.available, 3646);
assert.equal(reserve.summary.balance, 3696);

const settled = await billing.settleReservation({
  userId: "u1",
  reservationId: reserve.reservationId,
  actualCredits: 42,
  source: "image",
  referenceId: "image-usage-1",
  description: "生成图片",
});
assert.equal(settled.summary.balance, 3654);
assert.equal(settled.summary.reserved, 0);
assert.equal(settled.summary.available, 3654);

await billing.createRedeemCode({
  code: "NYRA-X72A-82KL-A9QP",
  credits: 3500,
  channel: "alipay",
});
const concurrentRedeems = await Promise.allSettled([
  billing.redeemCode({ userId: "u1", code: "NYRA-X72A-82KL-A9QP" }),
  billing.redeemCode({ userId: "u2", code: "NYRA-X72A-82KL-A9QP" }),
]);
assert.equal(
  concurrentRedeems.filter((result) => result.status === "fulfilled").length,
  1,
  "one redeem code can succeed only once globally",
);
const redeemed = concurrentRedeems.find((result) => result.status === "fulfilled").value;
assert.equal(redeemed.summary.paidMember, true);

const ledger = await billing.listLedger("u1", { limit: 20 });
assert.ok(ledger.items.some((entry) => entry.type === "purchase" && entry.deltaCredits === 3500));
assert.ok(ledger.items.some((entry) => entry.type === "usage" && entry.deltaCredits === -4));
assert.ok(ledger.items.every((entry) => entry.balanceAfter >= 0));

const exhausted = await billing.chargeUsage({
  userId: "u2",
  credits: 999999,
  source: "agent",
  referenceId: "too-large",
}).then(
  () => null,
  (error) => error,
);
assert.equal(exhausted?.code, "credits_exhausted");

const billingBeforeCoinSpend = (await billing.getSummary("u1")).balance;
const nyraCoinWallet = applyDebit({
  balance: 200,
  currency: "nyra_coin",
  ledger: [],
}, { amount: 50, reason: "test.case9" });
assert.equal(nyraCoinWallet.balance, 150);
assert.equal((await billing.getSummary("u1")).balance, billingBeforeCoinSpend);

const agentStart = await billing.startAgentRun({
  userId: "u1",
  taskId: "task-agent-1",
  attemptId: "attempt-1",
  businessPurpose: "assistant.character_task",
  runnerKind: "character_fix",
  maxCredits: 120,
});
assert.equal(agentStart.summary.reserved, 120);
assert.equal(agentStart.summary.available, billingBeforeCoinSpend - 120);
await billing.recordAgentChildUsage({
  userId: "u1",
  agentRunId: agentStart.agentRunId,
  modelExecutionId: "mx-1",
  credits: 4,
  usage: { prompt_tokens: 100, completion_tokens: 20 },
});
await billing.recordAgentChildUsage({
  userId: "u1",
  agentRunId: agentStart.agentRunId,
  modelExecutionId: "mx-2",
  credits: 8,
});
const duplicateChild = await billing.recordAgentChildUsage({
  userId: "u1",
  agentRunId: agentStart.agentRunId,
  modelExecutionId: "mx-1",
  credits: 4,
});
assert.equal(duplicateChild.deduped, true);
assert.equal(duplicateChild.accumulatedCredits, 12);
const agentFinal = await billing.finalizeAgentRun({
  userId: "u1",
  agentRunId: agentStart.agentRunId,
});
assert.equal(agentFinal.actualCredits, 12);
assert.equal(agentFinal.summary.reserved, 0);
assert.equal(agentFinal.summary.balance, billingBeforeCoinSpend - 12);
assert.equal(agentFinal.entry?.source, "agent");
assert.equal(agentFinal.entry?.deltaCredits, -12);

const zeroAgent = await billing.startAgentRun({
  userId: "u1",
  taskId: "task-agent-2",
  attemptId: "attempt-1",
  maxCredits: 50,
});
const zeroFinal = await billing.finalizeAgentRun({
  userId: "u1",
  agentRunId: zeroAgent.agentRunId,
});
assert.equal(zeroFinal.actualCredits, 0);
assert.equal(zeroFinal.summary.reserved, 0);

const routesSource = await readFile(new URL("../server/billing/routes.mjs", import.meta.url), "utf8");
assert.match(routesSource, /GET|"\/billing\/summary"/i);
assert.match(routesSource, /"\/billing\/ledger"/);
assert.match(routesSource, /"\/billing\/redeem"/);
assert.match(routesSource, /"\/billing\/whop\/checkout"/);
assert.match(routesSource, /"\/agent\/runs"/);
assert.match(routesSource, /"\/agent\/runs\/:id\/finalize"/);
assert.doesNotMatch(routesSource, /app\.post\("\/billing\/grant/, "public routes must not expose direct credit grants");
assert.match(routesSource, /app\.post\("\/admin\/billing\/grants"/, "operator grants must remain admin-only");

const productAccessSource = await readFile(new URL("../src/account/product-access.js", import.meta.url), "utf8");
assert.match(productAccessSource, /MODEL_SOURCE_HOSTED/);
assert.match(productAccessSource, /MODEL_SOURCE_BYOK/);
assert.doesNotMatch(productAccessSource, /local-offline/);

const onboardingSource = await readFile(new URL("../src/onboarding/wizard.js", import.meta.url), "utf8");
assert.doesNotMatch(onboardingSource, /data-onboard-product|commitProductMode|local-offline/);
assert.doesNotMatch(onboardingSource, /"product"/);

const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.doesNotMatch(indexHtml, /data-onboard-step="product"/);
assert.doesNotMatch(indexHtml, /订阅托管|订阅 · 托管模式/);
assert.match(indexHtml, /data-sidebar-credits/);
assert.match(indexHtml, /data-sidebar-recharge/);
assert.match(indexHtml, /data-sidebar-tier/);
assert.match(indexHtml, /data-sidebar-source/);
assert.doesNotMatch(indexHtml, /me-product-access/);

const serverSource = await readFile(new URL("../server/index.mjs", import.meta.url), "utf8");
assert.match(serverSource, /grantSignupBonus|signup_bonus:/);
assert.match(serverSource, /accountHasVerifiedContact/);
assert.match(serverSource, /emailVerifiedAt \|\| user\?\.phoneVerifiedAt/);
assert.match(serverSource, /signupBonusCredits/);
assert.match(serverSource, /app\.post\("\/auth\/logout"/);
assert.match(serverSource, /activeSessions\.delete/);
assert.match(serverSource, /recordAgentChildUsage/);
assert.match(serverSource, /tool_choice|toolChoice/);
assert.doesNotMatch(serverSource, /error: "subscription_required"/);

const imageRunnerSource = await readFile(new URL("../src/imagegen/runner.js", import.meta.url), "utf8");
assert.match(imageRunnerSource, /confirmCreditEstimate/);
assert.match(imageRunnerSource, /fetchBillingPricing/);
assert.match(serverSource, /reserveCredits/);
assert.match(serverSource, /settleReservation/);
assert.match(serverSource, /releaseReservation/);
assert.match(serverSource, /estimateTextRequestCeiling/);
assert.match(serverSource, /settleHostedTextReservation/);
assert.match(serverSource, /peekAgentRun/);
assert.doesNotMatch(serverSource, /chargeManagedCredits\(userId, 1, \{ operation: "chat_stream"/);
assert.doesNotMatch(serverSource, /chargeManagedCredits\(userId, usageCredits/);

const agentRunnerSource = await readFile(new URL("../src/studio-assist/agent/runner.js", import.meta.url), "utf8");
assert.match(agentRunnerSource, /prepareHostedAgentRun/);
assert.match(agentRunnerSource, /finalizeHostedAgentRun/);
const gatewaySource = await readFile(new URL("../src/studio-assist/agent/byok-stream.js", import.meta.url), "utf8");
assert.match(gatewaySource, /agentRunId/);

// Per-model supplier prices are the only normal Hosted usage path.
const pricingSource = await readFile(new URL("../server/billing/pricing.mjs", import.meta.url), "utf8");
const catalogSource = await readFile(new URL("../server/billing/hosted-catalog.mjs", import.meta.url), "utf8");
assert.match(catalogSource, /DEFAULT_HOSTED_MODEL_PRICES/);
assert.match(pricingSource, /signupBonusCredits/);
assert.match(pricingSource, /SIGNUP_BONUS_CNY/);
assert.match(pricingSource, /getModelPrice/);
assert.doesNotMatch(pricingSource, /YUEQI_MODEL_INPUT_COST_PER_MILLION/);
assert.doesNotMatch(pricingSource, /YUEQI_MODEL_OUTPUT_COST_PER_MILLION/);
assert.doesNotMatch(pricingSource, /fallbackInputCreditsPer1k|YUEQI_MANAGED_INPUT_CREDITS_PER_1K/);
assert.match(serverSource, /resolveHostedEndpoint/);
assert.match(serverSource, /estimateTextCredits\([^\n]+,\s*model/);

const env = {
  ARK_API_KEY: "ark-test",
  ARK_BASE_URL: "https://ark.cn-beijing.volces.com",
};
const standard = listConfiguredHostedModels(env, { tier: "standard" });
const high = listConfiguredHostedModels(env, { tier: "high" });
assert.equal(standard.length, 4, "user-facing Hosted slots: character/task/vision/image");
assert.equal(high.length, 4);
for (const entry of [...standard, ...high]) {
  assert.equal(entry.provider, "volcengine_ark");
  assert.ok(entry.modelId.startsWith("doubao-"), `${entry.capability} must use a doubao modelId`);
  assert.ok(entry.price, `${entry.capability} (${entry.modelId}) must have an independent supplier price`);
  assert.equal(entry.priceError, null);
  assert.ok(DEFAULT_HOSTED_MODEL_PRICES[entry.modelId], `${entry.modelId} must be priced by modelId`);
}

assert.deepEqual(standard.map((entry) => entry.modelId), [
  HOSTED_TIER_MODELS.standard.character,
  HOSTED_TIER_MODELS.standard.task,
  HOSTED_TIER_MODELS.standard.vision,
  HOSTED_TIER_MODELS.standard.image,
]);
assert.deepEqual(high.map((entry) => entry.modelId), [
  HOSTED_TIER_MODELS.high.character,
  HOSTED_TIER_MODELS.high.task,
  HOSTED_TIER_MODELS.high.vision,
  HOSTED_TIER_MODELS.high.image,
]);
assert.equal(HOSTED_TIER_MODELS.standard.character, "doubao-seed-2-1-turbo-260628");
assert.equal(HOSTED_TIER_MODELS.high.character, "doubao-seed-2-1-pro-260628");
assert.equal(HOSTED_TIER_MODELS.standard.task, "doubao-seed-2-1-turbo-260628");
assert.equal(HOSTED_TIER_MODELS.high.task, "doubao-seed-2-1-pro-260628");
assert.equal(HOSTED_TIER_MODELS.standard.image, "doubao-seedream-5-0-260128");
assert.equal(HOSTED_TIER_MODELS.high.image, "doubao-seedream-5-0-pro-260628");

const internal = resolveHostedEndpoint("internal", env, { businessPurpose: "context.branch_summary" });
assert.equal(internal.modelId, HOSTED_INTERNAL_MODEL);
assert.equal(internal.billable, true);
assert.equal(resolveHostedEndpoint("chat", env, { tier: "high" }).modelId, HOSTED_TIER_MODELS.high.character);
assert.equal(resolveHostedEndpoint("task", env, { tier: "high" }).modelId, HOSTED_TIER_MODELS.high.task);

assert.doesNotMatch(catalogSource, /gpt-4|whisper-1|dall-e-3|eleven_multilingual/);
assert.doesNotMatch(serverSource, /hostedImage\.baseUrl \|\| process\.env\.YUEQI_IMAGE_BASE_URL \|\| "https:\/\/api\.openai\.com/);
assert.doesNotMatch(serverSource, /hostedEndpoint\.baseUrl \|\| process\.env\.YUEQI_MODEL_BASE_URL/);
assert.doesNotMatch(catalogSource, /ARK_CHAT_MODEL|fallbackModelEnv/);

assert.equal(ARK_PRICE_SOURCE.fetchedAt, "2026-08-15");
assert.match(ARK_PRICE_SOURCE.aiHub, /ai\.volcengine\.com/);
assert.match(ARK_PRICE_SOURCE.product, /volcengine\.com\/product\/doubao/);
assert.match(catalogSource, /ai\.volcengine\.com\/model/);
assert.match(catalogSource, /volcengine\.com\/product\/doubao/);

const turbo = DEFAULT_HOSTED_MODEL_PRICES["doubao-seed-2-1-turbo-260628"];
const pro = DEFAULT_HOSTED_MODEL_PRICES["doubao-seed-2-1-pro-260628"];
const character = DEFAULT_HOSTED_MODEL_PRICES["doubao-seed-character-260628"];
const mini = DEFAULT_HOSTED_MODEL_PRICES["doubao-seed-2-0-mini-260428"];
const seedream50 = DEFAULT_HOSTED_MODEL_PRICES["doubao-seedream-5-0-260128"];
const seedream50Pro = DEFAULT_HOSTED_MODEL_PRICES["doubao-seedream-5-0-pro-260628"];
assert.equal(turbo.inputCnyPerMillion, 3);
assert.equal(turbo.outputCnyPerMillion, 15);
assert.equal(pro.inputCnyPerMillion, 6);
assert.equal(pro.outputCnyPerMillion, 30);
assert.equal(character.inputCnyPerMillion, 0.8);
assert.equal(character.outputCnyPerMillion, 2);
assert.equal(mini.inputCnyPerMillion, 0.2);
assert.equal(mini.outputCnyPerMillion, 2);
assert.equal(seedream50.providerCnyPerRequest, 0.22);
assert.equal(seedream50Pro.providerCnyPerRequest, 0.3);
assert.equal(seedream50Pro.providerCnyPerReferenceImage, 0.02);

const miniMid = resolveTextSupplierRates(mini, 80_000);
assert.equal(miniMid.inputCnyPerMillion, 0.4);
assert.equal(miniMid.outputCnyPerMillion, 4);
const miniLong = resolveTextSupplierRates(mini, 200_000);
assert.equal(miniLong.inputCnyPerMillion, 0.8);
assert.equal(miniLong.outputCnyPerMillion, 8);

const pricing = loadHostedPricing();
const sampleUsage = { prompt_tokens: 1_000_000, completion_tokens: 500_000 };
const turboCredits = estimateTextCredits(sampleUsage, HOSTED_TIER_MODELS.standard.task, pricing);
const proCredits = estimateTextCredits(sampleUsage, HOSTED_TIER_MODELS.high.task, pricing);
const characterCredits = estimateTextCredits(sampleUsage, HOSTED_TIER_MODELS.standard.character, pricing);
const highCharacterCredits = estimateTextCredits(sampleUsage, HOSTED_TIER_MODELS.high.character, pricing);
assert.equal(turboCredits, providerCostToCredits(3 + 7.5, pricing), "standard task bills turbo 3/15");
assert.equal(proCredits, providerCostToCredits(6 + 15, pricing), "high task bills pro 6/30");
assert.equal(characterCredits, turboCredits, "standard companion chat bills Seed 2.1 Turbo");
assert.equal(highCharacterCredits, proCredits, "high companion chat bills Seed 2.1 Pro");
assert.notEqual(turboCredits, proCredits, "same usage must not be a flat tier fee");
assert.notEqual(characterCredits, highCharacterCredits);

const miniShortCredits = estimateTextCredits(
  { prompt_tokens: 10_000, completion_tokens: 1_000 },
  HOSTED_INTERNAL_MODEL,
  pricing,
);
const miniMidCredits = estimateTextCredits(
  { prompt_tokens: 80_000, completion_tokens: 1_000 },
  HOSTED_INTERNAL_MODEL,
  pricing,
);
assert.equal(
  miniShortCredits,
  providerCostToCredits((10_000 / 1_000_000) * 0.2 + (1_000 / 1_000_000) * 2, pricing),
);
assert.equal(
  miniMidCredits,
  providerCostToCredits((80_000 / 1_000_000) * 0.4 + (1_000 / 1_000_000) * 4, pricing),
);
assert.notEqual(miniShortCredits, miniMidCredits, "mini 80k input must not bill the <=32k band");

const imageCredits = estimateImageCredits(HOSTED_TIER_MODELS.standard.image, pricing);
const altImageCredits = estimateImageCredits(HOSTED_TIER_MODELS.high.image, pricing);
assert.equal(imageCredits, providerCostToCredits(0.22, pricing));
assert.equal(altImageCredits, providerCostToCredits(0.3, pricing));
assert.equal(
  estimateImageCredits(HOSTED_TIER_MODELS.high.image, pricing, { reference_images: 2 }),
  providerCostToCredits(0.3 + 0.04, pricing),
);
assert.notEqual(imageCredits, altImageCredits, "Seedream Lite/Pro keep independent request prices");

const snapshot = publicPricingSnapshot(env);
assert.deepEqual(snapshot.tiers, ["standard", "high"]);
assert.equal(snapshot.image.estimatedCreditsByTier.standard, imageCredits);
assert.equal(snapshot.image.estimatedCreditsByTier.high, altImageCredits);
assert.equal(snapshot.models, undefined, "public pricing must not expose modelIds");

assert.throws(
  () => estimateTextCredits(sampleUsage, "gpt-4.1-mini", pricing),
  /No Ark supplier price/,
  "non-Ark modelIds fail closed",
);

const overridePricing = loadHostedPricing({
  YUEQI_HOSTED_MODEL_PRICES: JSON.stringify({
    "doubao-seed-character-260628": { modality: "text", inputCnyPerMillion: 10, outputCnyPerMillion: 20 },
  }),
});
const overridden = estimateTextCredits(sampleUsage, "doubao-seed-character-260628", overridePricing);
const untouched = estimateTextCredits(sampleUsage, HOSTED_TIER_MODELS.standard.task, overridePricing);
assert.notEqual(overridden, characterCredits, "per-model override changes only that model");
assert.equal(untouched, turboCredits, "peer model prices stay independent under override");

console.log("Billing v1 verify: PASS");
console.log("Hosted Standard:");
for (const entry of standard) {
  console.log(`- ${entry.capability}: ${entry.modelId}`);
}
console.log("Hosted High:");
for (const entry of high) {
  console.log(`- ${entry.capability}: ${entry.modelId}`);
}
