/**
 * Guard: English UI must not ship hardcoded Chinese placeholders / auth / chrome copy.
 * Run: npm run verify:i18n-locale-leak
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HAN = /[\u4e00-\u9fff]/;

const issues = [];

function read(path) {
  return readFileSync(path, "utf8");
}

function walk(dir, pred, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === "android") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, pred, out);
    else if (pred(full)) out.push(full);
  }
  return out;
}

// 1) index.html: Chinese placeholder without data-i18n-attr
{
  const html = read(join(root, "index.html"));
  const tagRe = /<input\b[^>]*>|<textarea\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const ph = tag.match(/\bplaceholder\s*=\s*"([^"]*)"/i);
    if (!ph || !HAN.test(ph[1])) continue;
    if (!/\bdata-i18n-attr\s*=/.test(tag)) {
      issues.push(`index.html: Chinese placeholder without data-i18n-attr → ${ph[1]}`);
    }
  }
  // Composer chrome must hang phone.pop keys (Chinese fallback text is OK with data-i18n).
  for (const needle of [
    'data-i18n="phone.pop.sticker"',
    'data-i18n="phone.pop.playTogether"',
    'data-i18n="phone.pop.transfer"',
    'data-i18n-attr="aria-label:phone.pop.more"',
    'data-i18n-attr="aria-label:nav.mainNav"',
    'data-i18n-attr="aria-label:nav.bottomNav"',
    'data-i18n-attr="aria-label:brand.phoneShellLabel"',
  ]) {
    if (!html.includes(needle)) {
      issues.push(`index.html: missing composer i18n wiring → ${needle}`);
    }
  }
}

// 2) Auth / onboard hardcodes in key modules
const AUTH_FILES = [
  "src/onboarding/wizard.js",
  "src/account/account-controller.js",
  "src/phone-shell/phone-shell.js",
];
const FORBIDDEN = [
  "请填写账号，密码至少 6 位",
  "请填写用户名，密码至少 6 位",
  "请填写用户名和密码",
  'placeholder="至少 6 位"',
  "注册中…",
  "登录中…",
  "已退出登录",
];
for (const rel of AUTH_FILES) {
  const text = read(join(root, rel));
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      issues.push(`${rel}: hardcoded Chinese UI string «${needle}»`);
    }
  }
}

// 3) Shared App+Pop chrome must not reintroduce literal Chinese UI labels
const SHARED_CHROME = [
  ["src/ui/action-proposal-card.js", ["待确认", "将修改：本地日历", ">确认</button>", ">拒绝</button>"]],
  ["src/ui/confirm.js", ['confirmLabel = "确定"', 'cancelLabel = "取消"', 'confirmLabel = "保存"']],
  ["src/chat/composer-chrome.js", ["我的表情", "请选择表情", "键盘输入"]],
  ["src/chat/share-location.js", ['title = "当前位置"', "当前环境不支持定位"]],
  ["src/chat/token-message.js", [">收款</button>", ">确认支付</button>", '"已到账"', '"已收款"']],
  ["src/games/lobby-ui.js", ['"游戏大厅"', '"去聊天玩"', '"星灯配对"']],
  ["src/economy/ui.js", ['"数字市场"', '"今日精选"', '"前往登录"']],
  ["src/agent/ui/task-center-ui.js", ['"任务中心"', '"允许执行"']],
  ["src/context/ui/context-viewer-ui.js", ['"上下文中心"', '"长期记忆"']],
];
for (const [rel, needles] of SHARED_CHROME) {
  const text = read(join(root, rel));
  for (const needle of needles) {
    if (text.includes(needle)) {
      issues.push(`${rel}: hardcoded Chinese chrome «${needle}» — use t()/locale keys`);
    }
  }
}

// 4) en locale brand chrome should not mix Chinese product chrome (gateLine/tagline/name)
{
  const en = read(join(root, "src/i18n/locales/en.js"));
  const brandBlock = en.match(/brand:\s*\{([\s\S]*?)\n\s*\},/);
  if (brandBlock) {
    const body = brandBlock[1];
    for (const key of ["name:", "tagline:", "gateLine:", "shellLabel:"]) {
      const line = body.split("\n").find((l) => l.includes(key));
      if (line && HAN.test(line)) {
        issues.push(`en.js brand.${key.replace(":", "")} contains Chinese: ${line.trim()}`);
      }
    }
  }
  if (!/passwordPlaceholder:\s*"At least 6 characters"/.test(en)) {
    issues.push("en.js missing onboard.passwordPlaceholder English string");
  }
  for (const key of [
    "shared.sticker.myStickers",
    "shared.actionProposal.statusProposed",
    "phone.economy.title",
    "games.lobbyTitle",
    "appShell.chat.youRecalled",
  ]) {
    // Flattened presence via nested object string search is fragile; check leaf tokens.
    const leaf = key.split(".").pop();
    if (!en.includes(`${leaf}:`)) {
      issues.push(`en.js missing expected key leaf «${leaf}» (${key})`);
    }
  }
}

// 5) phone settings password placeholder exists under phone.settings / onboard
{
  const zh = read(join(root, "src/i18n/locales/zh-CN.js"));
  if (!/passwordPlaceholder:\s*"至少 6 位"/.test(zh)) {
    issues.push("zh-CN.js missing onboard.passwordPlaceholder");
  }
}

// Silence unused walk until a broader scan is needed.
void walk;

if (issues.length) {
  console.error("FAIL verify:i18n-locale-leak");
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}
console.log("PASS verify:i18n-locale-leak");
