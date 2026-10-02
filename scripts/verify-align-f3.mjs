/**
 * F3 — 一起听 / 一起看 / 日历 / 栖店 (D3–D6).
 * Run: node scripts/verify-align-f3.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
    removeItem(key) {
      delete this._data[key];
    },
  },
};

const { LOCAL_KEYS } = await import("../src/constants.js");
const { normalizeCoListenState } = await import("../src/library/co-listen.js");
const { generateOrderId, shopOrderToSidewriteC6Row, isValidOrderId } = await import("../src/shop/order-id.js");
const { validateShopOrder } = await import("../src/shop/schema.js");
const { placeOrder, clearOrdersFixture, listOrders } = await import("../src/shop/orders.js");
const { listShopCatalog } = await import("../src/shop/catalog.js");
const { listInventory, clearInventoryFixture } = await import("../src/shop/inventory.js");
const {
  loadWallet,
  saveWallet,
  resetWalletFixture,
  clearSettlementCache,
  WALLET_KEY,
} = await import("../src/wallet/ledger.js");
const { listDataModuleIds } = await import("../src/memory/data-modules.js");
const { eventTemplateForChip, LEGACY_TYPE_PROMPTS } = await import("../src/calendar/event-types.js");
const sampleOrder = JSON.parse(
  readFileSync(join(root, "src/shop/fixtures/sample-order.json"), "utf8"),
);

const oid = generateOrderId();
check("generateOrderId format", isValidOrderId(oid) && /^ord-[a-z0-9]+-[a-f0-9]{8}$/.test(oid), oid);

const c6 = shopOrderToSidewriteC6Row(sampleOrder);
check(
  "C6 row fields",
  c6.orderId === sampleOrder.orderId
    && c6.amount === sampleOrder.amount
    && c6.currency === "nyra_coin"
    && c6.shopName === "栖店"
    && Boolean(c6.status)
    && Boolean(c6.title)
    && c6.placedAt === sampleOrder.createdAt,
  JSON.stringify(c6),
);

const emptyListen = normalizeCoListenState({});
check("normalizeCoListenState default coListen", emptyListen.coListen === true && emptyListen.paused === true);

const missingId = validateShopOrder({ ...sampleOrder, orderId: "" });
check("validateShopOrder missing orderId", missingId.ok === false);

const catalog = listShopCatalog();
check("shop catalog ≥6", catalog.length >= 6, String(catalog.length));
check(
  "shop virtual categories present",
  ["皮肤", "表情", "场景"].every((c) => catalog.some((p) => p.category === c)),
);
check("data module shopInventory", listDataModuleIds().includes("shopInventory"));
const lamp = catalog.find((item) => item.productId === "prd-night-lamp") || catalog[0];

clearSettlementCache();
window.localStorage.removeItem(WALLET_KEY);
clearOrdersFixture();
saveWallet(resetWalletFixture({ balance: 10 }));
const poor = placeOrder({ productId: lamp.productId, qty: 1 });
check(
  "placeOrder insufficient",
  poor.ok === false && String(poor.error || "").includes("insufficient"),
  String(poor.error),
);
check("balance unchanged when poor", loadWallet().balance === 10);

clearOrdersFixture();
clearInventoryFixture();
saveWallet(resetWalletFixture({ balance: 100 }));
const before = listOrders().length;
const rich = placeOrder({ productId: lamp.productId, qty: 1 });
const wallet = loadWallet();
const last = wallet.ledger.at(-1);
check("placeOrder ok", rich.ok === true && Boolean(rich.order?.orderId));
check("orders +1", listOrders().length === before + 1);
check("inventory gained item", listInventory().some((row) => row.productId === lamp.productId));
check(
  "ledger shop.purchase",
  last?.type === "debit" && last?.reason === "shop.purchase",
  `${last?.reason} / ${last?.balanceAfter}`,
);
check(
  "balanceAfter",
  Math.abs(wallet.balance - (100 - lamp.price)) < 0.01
    && Math.abs(Number(last?.balanceAfter) - wallet.balance) < 0.01,
  String(wallet.balance),
);

check("LOCAL_KEYS.coListenStateKey", LOCAL_KEYS.coListenStateKey === "yueqi.coListenState.v1");
check("LOCAL_KEYS.shopOrdersKey", LOCAL_KEYS.shopOrdersKey === "yueqi.shop.orders.v1");
check("LOCAL_KEYS.shopInventoryKey", LOCAL_KEYS.shopInventoryKey === "yueqi.shop.inventory.v1");
check("data module shopOrders", listDataModuleIds().includes("shopOrders"));
check("data module shopInventory", listDataModuleIds().includes("shopInventory"));

const listenTpl = eventTemplateForChip("sync_listen");
const readTpl = eventTemplateForChip("co_read");
check(
  "calendar templates",
  listenTpl.title.includes("一起听")
    && listenTpl.prompt === LEGACY_TYPE_PROMPTS.sync_listen
    && readTpl.title.includes("共读")
    && readTpl.prompt === LEGACY_TYPE_PROMPTS.co_read,
);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
check("package verify:align-f3", typeof pkg.scripts["verify:align-f3"] === "string");

const shopJs = readFileSync(join(root, "src/shop/orders.js"), "utf8");
const listenJs = readFileSync(join(root, "src/phone-shell/phone-listen.js"), "utf8");
const readerJs = readFileSync(join(root, "src/phone-shell/phone-reader.js"), "utf8");
const catalogApps = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
const shellJs = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
const css = readFileSync(join(root, "src/ui/phone-shell.css"), "utf8");

check("orders uses applyDebit/shop.purchase", shopJs.includes("applyDebit") && shopJs.includes("shop.purchase"));
check("no debitWallet in shop", !shopJs.includes("debitWallet"));
check("no CNY currency in shop orders", !/currency:\s*["']CNY["']/.test(shopJs));
check("phone-listen mounts", listenJs.includes("normalizeCoListenState") && listenJs.includes("appendCohabitEvent"));
check("phone-reader progress", readerJs.includes("updateBookProgress") && readerJs.includes("saveCoReadAnchor"));
check(
  "apps-catalog 商城",
  catalogApps.includes('id: "shop"')
    && catalogApps.includes('labelKey: "phone.apps.shop"')
    && catalogApps.includes('jobKey: "phone.jobs.shop"'),
);
check("phone-shell mounts F3", shellJs.includes("mountPhoneListen") && shellJs.includes("mountPhoneShop") && shellJs.includes("mountPhoneReader"));
check("shop css cards", css.includes("mini-shop-card") && css.includes("mini-shop-detail-card"));
check("listen controls css", css.includes("mini-listen-controls") && css.includes("mini-listen-play"));
check("no living-timeline draft", !shopJs.includes("living-timeline") && !shellJs.includes("living-timeline"));

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
