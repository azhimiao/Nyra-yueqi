/**
 * F1 — token messages + wallet ledger (B7 + I3, B4 basics).
 * Run: node scripts/verify-align-f1.mjs
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
const {
  parseToken,
  parseTokenMessage,
  validateToken,
  renderTokenCardHtml,
  isTokenMediaType,
  markTokenSettled,
} = await import("../src/chat/token-message.js");
const {
  loadWallet,
  applyDebit,
  applyCredit,
  applyTokenSettlement,
  resetWalletFixture,
  canAfford,
  exportWallet,
  importWallet,
  clearSettlementCache,
  WALLET_KEY,
} = await import("../src/wallet/ledger.js");
const { normalizeMoment } = await import("../src/moments/store.js");
const { appendCohabitEvent } = await import("../src/memory/cohabit-timeline.js");
const { listDataModuleIds } = await import("../src/memory/data-modules.js");

check("parse 信物 transfer", parseToken("[信物:transfer amount=8.88 note=hi]").ok === true);
check("parse 转账 pipe", parseTokenMessage("[转账|8.88|给你]").ok === true);
check("legacy 红包 degrades to text", parseTokenMessage("[红包|8.88|恭喜]").ok === false);
check("parse transfer negative fails", parseToken("[信物:transfer amount=-1]").ok === false);
check("parse hello fails", parseToken("hello").ok === false);
check(
  "validate zero amount degrades",
  validateToken({ kind: "transfer", amount: 0 }).display.mediaType === "text",
);

const plain = parseTokenMessage("普通一句话");
check("plain text not token", !plain.ok && plain.display?.mediaType === "text");

window.localStorage.removeItem(WALLET_KEY);
clearSettlementCache();
let w = resetWalletFixture({ balance: 200 });
check("initial balance 200", w.balance === 200 && w.ledger.length >= 1);
w = applyDebit(w, { amount: 50, reason: "token.transfer" });
check("debit 50 → 150", w.balance === 150 && w.ledger.at(-1).balanceAfter === 150);
w = applyCredit(w, { amount: 8.88, reason: "token.transfer" });
check("credit 8.88", Math.abs(w.balance - 158.88) < 0.01);
check("canAfford", canAfford(10, w) && !canAfford(999, w));

clearSettlementCache();
window.localStorage.removeItem(WALLET_KEY);
loadWallet();
const r1 = applyTokenSettlement({ kind: "transfer", amount: 8.88, direction: "in" }, "m1");
const r2 = applyTokenSettlement({ kind: "transfer", amount: 8.88, direction: "in" }, "m1");
check("idempotent transfer", r1.ok === true && r2.ok === true && r2.duplicate === true);

const packet = parseTokenMessage("[转账|8.88|给你]");
const settledToken = markTokenSettled(packet.token, r1);
check("mark settled", settledToken.status === "completed");

const moment = normalizeMoment({ image: "/a.png" });
check("moment images migrate", moment.images[0] === "/a.png" && moment.image === "/a.png");

check("LOCAL_KEYS.walletKey", LOCAL_KEYS.walletKey === "yueqi.wallet.v1");
check("data module wallet", listDataModuleIds().includes("wallet"));

const phoneShell = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check(
  "phone-shell token render",
  phoneShell.includes("renderTokenCardHtml") && phoneShell.includes("parseTokenMessage"),
);
check("phone-shell settlement", phoneShell.includes("applyTokenSettlement"));
const backupJs = readFileSync(join(root, "src/memory/backup.js"), "utf8");
check("backup exports wallet", backupJs.includes("wallet: exportWallet") && backupJs.includes("importWallet"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
check("package verify:align-f1", typeof pkg.scripts["verify:align-f1"] === "string");

const card = renderTokenCardHtml({ kind: "transfer", amount: 8.88, note: "测试", direction: "out", status: "completed" }, { messageId: "x" });
check("token card html", card.includes("mini-token-card--transfer") && card.includes("已到账"));
check("token media types", isTokenMediaType("transfer") && !isTokenMediaType("redpacket") && !isTokenMediaType("text"));

const event = appendCohabitEvent({ appId: "pop", kind: "token.transfer", summary: "完成转账 8.88" });
check("cohabit event shape", Boolean(event?.id) && event.appId === "pop");

const css = readFileSync(join(root, "src/ui/phone-shell.css"), "utf8");
check("token css transfer/teal", css.includes("mini-token-card--transfer") && css.includes("#4d9187"));

const exported = exportWallet();
window.localStorage.removeItem(WALLET_KEY);
importWallet(exported);
check("wallet roundtrip", loadWallet().balance === exported.balance);

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
