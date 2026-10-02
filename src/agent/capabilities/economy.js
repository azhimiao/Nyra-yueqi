import {
  bootstrapEconomy,
  createEconomyIntent,
  createEconomyListing,
  fetchEconomyOverview,
  fulfillProduction,
  listEconomyMarketplace,
  listProductionRecipes,
  purchaseEconomyListing,
  purchaseOfficialProduct,
  transferNyraCoin,
} from "../../economy/client.js";

const WRITE_OPS = new Set(["purchase_official", "purchase_listing", "transfer", "create_intent", "produce", "create_listing"]);

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function validateRead(input = {}) {
  const op = clean(input.op || "overview", 40);
  if (!["overview", "marketplace", "recipes"].includes(op)) return { ok: false, reason: "unknown_economy_read_op" };
  return { ok: true, value: { ...input, op } };
}

function validateWrite(input = {}) {
  const op = clean(input.op, 40);
  if (!WRITE_OPS.has(op)) return { ok: false, reason: "unknown_economy_write_op" };
  if (op === "purchase_official" && !clean(input.productId, 160)) return { ok: false, reason: "missing_productId" };
  if (op === "purchase_listing" && (!clean(input.listingId, 180) || !clean(input.buyerActorId, 220))) {
    return { ok: false, reason: "missing_purchase_subject" };
  }
  if (op === "transfer" && (!clean(input.fromActorId, 220) || !clean(input.toActorId, 220) || Number(input.amount) <= 0)) {
    return { ok: false, reason: "invalid_transfer" };
  }
  if (op === "create_intent" && (!clean(input.actorId, 220) || !clean(input.desire))) return { ok: false, reason: "invalid_intent" };
  if (op === "produce" && (!clean(input.actorId, 220) || !clean(input.recipeId, 80) || !Array.isArray(input.outputs) || !input.outputs.length)) {
    return { ok: false, reason: "invalid_production" };
  }
  if (op === "create_listing" && (!clean(input.sellerActorId, 220) || !clean(input.generativeObjectId, 220) || Number(input.price) <= 0)) {
    return { ok: false, reason: "invalid_listing" };
  }
  return { ok: true, value: { ...input, op } };
}

export const economyReadCapability = {
  id: "economy-read",
  label: "角色经济只读查询",
  risk: "R0",
  description: "读取服务器权威余额、市场、所有权、持续委托与生产配方，不执行扣款。",
  validateInput: validateRead,
  plan(intent) {
    return { nodes: [{ id: "economy-read", stepId: "economy-read", capabilityId: "economy-read", label: "读取角色经济", risk: "R0", requiresApproval: false, inputSummary: intent?.input?.op || "overview", effectSummary: "只读服务器经济投影" }], edges: [] };
  },
  previewEffect(input) {
    return { exactEffect: `读取 ${input.op || "overview"}，不写入、不扣款`, dataUsed: ["账号身份", "角色经济投影"], affects: ["无写入"] };
  },
  async execute(input) {
    const checked = validateRead(input);
    if (!checked.ok) return { ok: false, reason: checked.reason, claimedCompleted: false };
    const value = checked.value;
    if (value.op === "recipes") return listProductionRecipes(value);
    if (value.op === "marketplace") return listEconomyMarketplace(value);
    await bootstrapEconomy(value);
    return fetchEconomyOverview(value);
  },
};

export const economyWriteCapability = {
  id: "economy-write",
  label: "角色经济交易与生产",
  risk: "R2",
  description: "经用户确认后购买、转账、创建委托、提交真实产出或把作品上架。",
  validateInput: validateWrite,
  plan(intent) {
    const op = intent?.input?.op || "write";
    return { nodes: [{ id: "economy-write", stepId: "economy-write", capabilityId: "economy-write", label: `确认经济操作：${op}`, risk: "R2", requiresApproval: true, inputSummary: op, effectSummary: "会改变服务器余额、所有权、Intent 或商品状态" }], edges: [] };
  },
  previewEffect(input = {}) {
    const amount = Number(input.amount || input.price || 0);
    return {
      exactEffect: `${input.op || "经济写入"}${amount > 0 ? `，金额 ${amount} 栖币` : ""}；确认后写入服务器账本`,
      dataUsed: ["账号身份", "角色主体", "商品/作品与来源引用"],
      affects: ["栖币账本", "订单或生产对象", "角色聊天活动流"],
    };
  },
  async execute(input, ctx = {}) {
    const checked = validateWrite(input);
    if (!checked.ok) return { ok: false, reason: checked.reason, claimedCompleted: false };
    if (!ctx.approved && !ctx.confirmed) return { ok: false, reason: "approval_required", claimedCompleted: false };
    const value = checked.value;
    let result;
    if (value.op === "purchase_official") result = await purchaseOfficialProduct(value);
    else if (value.op === "purchase_listing") result = await purchaseEconomyListing(value);
    else if (value.op === "transfer") result = await transferNyraCoin(value);
    else if (value.op === "create_intent") result = await createEconomyIntent(value);
    else if (value.op === "produce") result = await fulfillProduction({ ...value, companionId: value.companionId || value.characterId });
    else result = await createEconomyListing(value);
    return { ok: true, claimedCompleted: true, result };
  },
};

