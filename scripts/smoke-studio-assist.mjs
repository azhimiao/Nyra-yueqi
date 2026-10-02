/** Contract smoke for 栖机助手. No live model call and no persistent user data. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const mem = new Map();
const localStorage = {
  getItem: (key) => (mem.has(key) ? mem.get(key) : null),
  setItem: (key, value) => mem.set(key, String(value)),
  removeItem: (key) => mem.delete(key),
};
globalThis.localStorage = localStorage;
globalThis.window = {
  localStorage,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.CustomEvent = class CustomEvent {
  constructor(name, init) {
    this.type = name;
    this.detail = init?.detail;
  }
};

const { executeAssistTool, expandPackGuide } = await import("../src/studio-assist/tools.js");
const { parseAssistActions, runAssistTurn } = await import("../src/studio-assist/engine.js");
const { createAssistChatStore } = await import("../src/studio-assist/chat-store.js");
const { capabilitySummary, listCapabilityPacks } = await import("../src/studio-assist/registry.js");
const { clearAssistAudit, listAssistAudit } = await import("../src/studio-assist/audit-store.js");
const { buildAssistSystemPrompt } = await import("../src/studio-assist/prompts.js");

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

clearAssistAudit();
const rootDir = join(import.meta.dirname, "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const appSource = readFileSync(join(rootDir, "src", "app.js"), "utf8");
const assistEntryCount = (indexHtml.match(/data-assist-nav/g) || []).length;
assert(assistEntryCount >= 3, `global assistant entries ${assistEntryCount}`);
assert(indexHtml.includes('data-i18n="nav.assistShort"'), "mobile assistant locale label missing");
assert(appSource.includes('document.body.dataset.activePanel = "assist"'), "assistant navigation state missing");

const summary = capabilitySummary();
assert(summary.packs >= 15, `capability packs ${summary.packs}`);
assert(summary.tools >= 40, `capability tools ${summary.tools}`);
assert(summary.writes >= 15, `write tools ${summary.writes}`);
assert(expandPackGuide("character").text.includes("character.update"), "character pack is not executable");
assert(expandPackGuide("worldbook").text.includes("worldbook.upsert"), "worldbook pack is not executable");

const ruleId = "assist-smoke-think-rule";
const pending = await executeAssistTool("regex.upsert", {
  id: ruleId,
  name: "收起思考标签",
  direction: "outbound",
  pattern: "<think>[\\s\\S]*?</think>",
  replacement: "",
  flags: "gi",
  enabled: true,
  apiKey: "must-not-enter-audit",
});
assert(pending.needConfirm === true && pending.ok === false, "write bypassed approval gate");
const before = await executeAssistTool("regex.list", { direction: "outbound" });
assert(!before.data?.some((item) => item.id === ruleId), "pending write mutated storage");

const saved = await executeAssistTool("regex.upsert", pending.pendingAction.args, { confirmed: true });
assert(saved.ok, `confirmed write failed: ${saved.summary}`);
const after = await executeAssistTool("regex.list", { direction: "outbound" });
assert(after.data?.some((item) => item.id === ruleId), "confirmed rule missing");
const audit = listAssistAudit(20).find((item) => item.tool === "regex.upsert");
assert(audit?.args?.apiKey === "[redacted]", "audit did not redact secret-shaped fields");

const undoPending = await executeAssistTool("privacy.undo", {});
assert(undoPending.needConfirm === true, "undo bypassed confirmation");
const undone = await executeAssistTool("privacy.undo", {}, { confirmed: true });
assert(undone.ok, `undo failed: ${undone.summary}`);
const afterUndo = await executeAssistTool("regex.list", { direction: "outbound" });
assert(!afterUndo.data?.some((item) => item.id === ruleId), "undo did not restore storage");

const presets = await executeAssistTool("presets.list", {});
assert(presets.ok && Array.isArray(presets.data), "preset read failed");
const navigation = await executeAssistTool("navigation.open_settings", { view: "regex" });
assert(navigation.ok, "navigation action failed");
const panelNavigation = await executeAssistTool("navigation.open_panel", { panel: "api" });
assert(panelNavigation.ok, "App panel navigation failed");

const parsed = parseAssistActions(
  '<yq-pack name="regex" />\n<yq-tool name="regex.list">{"direction":"outbound"}</yq-tool>\n已经检查。',
);
assert(parsed.loads[0] === "regex", "new protocol pack parse failed");
assert(parsed.actions[0]?.name === "regex.list", "new protocol tool parse failed");
assert(parsed.actions[0]?.args?.direction === "outbound", "new protocol JSON parse failed");
assert(parsed.speech === "已经检查。", `protocol speech cleanup failed: ${parsed.speech}`);

const prompt = buildAssistSystemPrompt("identity");
assert(prompt.includes("<yq-tool"), "first-party protocol missing");
assert(prompt.includes("不得索取、读取、复述或输出 API Key"), "secret policy missing");
const englishPrompt = buildAssistSystemPrompt("identity", "en");
assert(englishPrompt.includes("Respond in concise, natural English"), "English response policy missing");
assert(englishPrompt.includes("Never request, read, repeat, or expose API keys"), "English secret policy missing");
assert(listCapabilityPacks("en")[0]?.label === "System guide", "English capability catalog missing");
assert(expandPackGuide("worldbook", "en").text.includes("Create or update entry"), "English pack guide missing");
const englishApproval = await executeAssistTool("regex.upsert", {
  id: "assist-smoke-en-approval",
  name: "English approval check",
  direction: "outbound",
  pattern: "test",
  replacement: "",
  flags: "gi",
  enabled: true,
}, { locale: "en" });
assert(englishApproval.needConfirm === true && /approval|required|approve/i.test(englishApproval.summary), "English write approval missing");

const noKey = await runAssistTurn({
  config: {},
  history: [],
  userText: "去掉思考过程",
  context: "regex",
});
assert(noKey.ok === false && /模型/.test(noKey.speech), `no-key guidance: ${noKey.speech}`);
const noKeyEn = await runAssistTurn({
  config: {},
  history: [],
  userText: "Remove hidden reasoning",
  context: "regex",
  locale: "en",
});
assert(noKeyEn.ok === false && /model connection/i.test(noKeyEn.speech), `English no-key guidance: ${noKeyEn.speech}`);

const store = createAssistChatStore({
  collectProviderConfig: () => ({}),
  context: "identity",
});
assert(/角色设定页/.test(store.list()[0]?.content || ""), "context greeting missing");
const sent = await store.send("检查角色人设");
assert(/模型/.test(sent.message?.content || ""), "store no-key guidance missing");
const englishStore = createAssistChatStore({
  collectProviderConfig: () => ({}),
  context: "identity",
  locale: "en",
});
assert(/Character Settings/.test(englishStore.list()[0]?.content || ""), "English contextual greeting missing");
const englishSent = await englishStore.send("Review this character");
assert(/model connection/i.test(englishSent.message?.content || ""), "English store no-key guidance missing");

if (failures.length) {
  console.error("STUDIO_ASSIST_FAIL", failures);
  process.exit(1);
}
console.log(`STUDIO_ASSIST_OK packs=${summary.packs} tools=${summary.tools} writes=${summary.writes} destructive=${summary.destructive}`);
