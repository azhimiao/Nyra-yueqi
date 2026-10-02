/**
 * 栖店虚拟商城目录 — 本地 seed，栖币结算，无物流。
 */

import { normalizeProduct } from "./schema.js";
import { t, getLocale } from "../i18n/index.js";

function pickProductField(productId, field, fallback, locale) {
  const key = `phone.shop.products.${productId}.${field}`;
  const value = t(key, locale);
  return value !== key ? value : (fallback || "");
}

export const SHOP_CATEGORIES = Object.freeze(["皮肤", "表情", "场景", "道具", "礼物", "限定"]);

const SEED_PRODUCTS = [
  // —— 保留原商品（兼容旧订单 / 校验）——
  {
    productId: "prd-night-lamp",
    title: "暖光夜灯",
    subtitle: "书桌一角的柔光",
    price: 28,
    category: "道具",
    coverTone: "coral",
    coverEmoji: "💡",
    tag: "热卖",
    salesHint: 1286,
    blurb: "虚拟摆件：点亮聊天背景角落的暖黄光晕，适合夜聊。",
  },
  {
    productId: "prd-soft-scarf",
    title: "雾感围巾",
    subtitle: "冬天的一点点温柔",
    price: 42,
    category: "礼物",
    coverTone: "ink",
    coverEmoji: "🧣",
    tag: "送礼",
    salesHint: 864,
    blurb: "虚拟礼物：送给 TA 后会出现在关系小记里，不是实体围巾。",
  },
  {
    productId: "prd-tea-set",
    title: "双人茶杯",
    subtitle: "一起喝一杯",
    price: 36,
    category: "礼物",
    coverTone: "mint",
    coverEmoji: "🍵",
    salesHint: 652,
    blurb: "虚拟成套茶杯，下单后记入「我们的小物」收藏。",
  },
  {
    productId: "prd-sticky-notes",
    title: "栖息便签本",
    subtitle: "随手留下一句",
    price: 12,
    category: "道具",
    coverTone: "yellow",
    coverEmoji: "📝",
    salesHint: 2104,
    blurb: "虚拟便签皮肤：写短句时多一种纸张质感。",
  },
  {
    productId: "prd-star-pin",
    title: "星光徽章",
    subtitle: "限定收藏",
    price: 18,
    category: "限定",
    coverTone: "blue",
    coverEmoji: "⭐",
    tag: "限定",
    salesHint: 431,
    blurb: "本季限定数字徽章，收入你的收藏柜。",
  },
  {
    productId: "prd-rain-umbrella",
    title: "晴雨折伞",
    subtitle: "雨天也从容",
    price: 48,
    category: "道具",
    coverTone: "sea",
    coverEmoji: "☂️",
    salesHint: 398,
    blurb: "虚拟雨伞道具：雨天氛围场景可装备。",
  },
  {
    productId: "prd-letter-set",
    title: "手写信笺",
    subtitle: "慢一点说喜欢",
    price: 22,
    category: "礼物",
    coverTone: "rose",
    coverEmoji: "✉️",
    tag: "心动",
    salesHint: 977,
    blurb: "虚拟信纸套装，写信或共创时可用的纸样。",
  },
  {
    productId: "prd-moon-keychain",
    title: "月相钥匙扣",
    subtitle: "限定联名感",
    price: 16,
    category: "限定",
    coverTone: "dusk",
    coverEmoji: "🌙",
    tag: "限定",
    salesHint: 712,
    blurb: "数字钥匙扣藏品，挂在个人页小挂件栏。",
  },

  // —— 新增虚拟货 ——
  {
    productId: "prd-chat-bubble-cream",
    title: "奶油气泡皮肤",
    subtitle: "聊天框换新衣",
    price: 32,
    category: "皮肤",
    coverTone: "peach",
    coverEmoji: "💬",
    tag: "新品",
    salesHint: 1540,
    blurb: "Pop 气泡皮肤：圆角奶油底，仅影响显示，不改聊天内容。",
  },
  {
    productId: "prd-avatar-frame-gold",
    title: "金箔头像框",
    subtitle: "轻轻描一圈光",
    price: 58,
    category: "皮肤",
    coverTone: "amber",
    coverEmoji: "🖼️",
    tag: "热卖",
    salesHint: 2201,
    blurb: "角色头像框皮肤，佩戴后在朋友圈与 Pop 显示。",
  },
  {
    productId: "prd-sticker-pack-soft",
    title: "软软表情包",
    subtitle: "12 张日常贴图",
    price: 15,
    category: "表情",
    coverTone: "blush",
    coverEmoji: "😌",
    salesHint: 3088,
    blurb: "虚拟表情包：收入贴纸柜，可在聊天输入旁选用。",
  },
  {
    productId: "prd-sticker-pack-night",
    title: "夜航贴纸组",
    subtitle: "深夜限定贴",
    price: 18,
    category: "表情",
    coverTone: "dusk",
    coverEmoji: "🌌",
    tag: "限定",
    salesHint: 889,
    blurb: "夜航主题贴纸，适合熬夜聊天时甩一张。",
  },
  {
    productId: "prd-scene-rain-cafe",
    title: "雨声咖啡厅",
    subtitle: "场景背景",
    price: 45,
    category: "场景",
    coverTone: "sea",
    coverEmoji: "☕",
    tag: "氛围",
    salesHint: 667,
    blurb: "虚拟场景：可作共读/共听背景，带细雨声氛围（本地循环）。",
  },
  {
    productId: "prd-scene-rooftop-dusk",
    title: "黄昏天台",
    subtitle: "晚风场景",
    price: 52,
    category: "场景",
    coverTone: "ember",
    coverEmoji: "🌇",
    salesHint: 512,
    blurb: "黄昏天台场景皮肤，适合日记与情景开场。",
  },
  {
    productId: "prd-theme-desk-mint",
    title: "薄荷绿桌面主题",
    subtitle: "手机壁纸主题包",
    price: 38,
    category: "皮肤",
    coverTone: "mint",
    coverEmoji: "📱",
    salesHint: 1190,
    blurb: "小手机壁纸主题包（虚拟），装进美化可选列表。",
  },
  {
    productId: "prd-voice-card-hello",
    title: "问候语音卡",
    subtitle: "一句专属开场",
    price: 26,
    category: "道具",
    coverTone: "lilac",
    coverEmoji: "🎙️",
    salesHint: 743,
    blurb: "虚拟语音卡：解锁一句问候开场文案模板（需模型接口才可生成音频）。",
  },
  {
    productId: "prd-memory-capsule",
    title: "记忆胶囊",
    subtitle: "收藏一段对话",
    price: 20,
    category: "道具",
    coverTone: "blue",
    coverEmoji: "💊",
    tag: "实用",
    salesHint: 1655,
    blurb: "虚拟道具：额外一次「收藏重要对话」额度，收入记忆柜。",
  },
  {
    productId: "prd-gift-bouquet-digital",
    title: "数字花束",
    subtitle: "送 TA 一束光",
    price: 66,
    category: "礼物",
    coverTone: "rose",
    coverEmoji: "💐",
    tag: "送礼",
    salesHint: 934,
    blurb: "虚拟花束礼物：购买后可投递到朋友圈或关系小记。",
  },
  {
    productId: "prd-limited-starlight-ticket",
    title: "星光入场券",
    subtitle: "本季限定通行证",
    price: 88,
    category: "限定",
    coverTone: "dusk",
    coverEmoji: "🎟️",
    tag: "限定",
    salesHint: 276,
    blurb: "本季限定虚拟通行证，收藏柜展示用，无实体快递。",
  },
  {
    productId: "prd-companion-pillow",
    title: "云朵陪伴枕",
    subtitle: "桌宠旁的小软垫",
    price: 34,
    category: "道具",
    coverTone: "lilac",
    coverEmoji: "☁️",
    salesHint: 1088,
    blurb: "桌宠旁的虚拟软垫装饰，仅影响陪伴视觉。",
  },
].map(normalizeProduct);

/** Display labels for shop cards — productId and category ids stay stable. */
export function localizeShopProduct(product, locale) {
  if (!product) return product;
  const loc = locale || getLocale();
  const { productId } = product;
  return {
    ...product,
    title: pickProductField(productId, "title", product.title, loc),
    subtitle: pickProductField(productId, "subtitle", product.subtitle, loc),
    blurb: pickProductField(productId, "blurb", product.blurb, loc),
    tag: product.tag ? pickProductField(productId, "tag", product.tag, loc) : "",
  };
}

export function listShopCatalog({ category = "", query = "" } = {}) {
  const cat = String(category || "").trim();
  const q = String(query || "").trim().toLowerCase();
  const locale = getLocale();
  let rows = SEED_PRODUCTS.slice();
  if (cat && cat !== "全部") {
    rows = rows.filter((item) => item.category === cat);
  }
  if (q) {
    rows = rows.filter((item) => {
      const localized = localizeShopProduct(item, locale);
      const hay = `${localized.title} ${localized.subtitle} ${localized.blurb} ${item.category} ${localized.tag}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return rows;
}

export function getShopProduct(productId) {
  const id = String(productId || "").trim();
  return SEED_PRODUCTS.find((item) => item.productId === id) || null;
}
