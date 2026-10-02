import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const server = readFileSync(join(root, "server/index.mjs"), "utf8");
const authCore = readFileSync(join(root, "server/auth/auth-core.mjs"), "utf8");
const utils = readFileSync(join(root, "src/lib/utils.js"), "utf8");
const diary = readFileSync(join(root, "src/ui/diary-book.js"), "utf8");
const app = readAppBundle(root);
const worldbookEditor = readFileSync(join(root, "src/settings/editors/worldbook-editor.js"), "utf8");
const model = readFileSync(join(root, "src/model/client.js"), "utf8");
const voice = readFileSync(join(root, "src/voice/client.js"), "utf8");
const secrets = readFileSync(join(root, "src/platform/secure-store.js"), "utf8");
const webSecrets = readFileSync(join(root, "src/platform/web-secrets.js"), "utf8");
const local = readFileSync(join(root, "src/platform/local-service.js"), "utf8");
const characterPage = readFileSync(join(root, "src/avatar/character-page.js"), "utf8");
const phase3Editor = readFileSync(join(root, "src/avatar/phase3-editor.js"), "utf8");
const phase4Editor = readFileSync(join(root, "src/avatar/phase4-editor.js"), "utf8");
const {
  avatarStateToPackDraft,
  escapeCharacterPackHtml,
  validateCharacterPack,
} = await import("../src/character-pack/schema.js");
const { createDefaultAvatarState } = await import("../src/avatar/looks-model.js");

check("escapeHtml 工具", utils.includes("export function escapeHtml"));
check("日记 XSS 转义", diary.includes("escapeHtmlWithBreaks") && diary.includes("escapeHtml(titleOf"));
check("记忆/日历转义",
  app.includes("escapeHtml(record.rawText.slice")
  && (
    app.includes("escapeHtml(event.title)")
    || app.includes("escapeHtml(displayTitle)")
    || app.includes("escapeHtml(localizeEventTitle")
  ),
);
check("世界书安全赋值", worldbookEditor.includes("escapeHtml as esc")
  && worldbookEditor.includes("esc(entry.id)")
  && worldbookEditor.includes('const title = entry.title || copy.unnamed')
  && worldbookEditor.includes("esc(title)")
  && worldbookEditor.includes("esc(entry.content)")
  && worldbookEditor.includes("esc(paragraph)")
  && worldbookEditor.includes("esc(scopeName(entry))")
  && worldbookEditor.includes("esc(category)")
  && worldbookEditor.includes('value="${esc(value)}"')
  && worldbookEditor.includes("node.textContent = text"), "世界书阅读/编辑层对标题、全文段落、角色范围、分类和属性转义；状态使用 textContent");
check("本地 token 中间件", server.includes("requireLocalToken") && server.includes("/local/session"));
check("CORS 本机限制", server.includes("isAllowedOrigin") && !server.includes("app.use(cors());"));
check("上游 URL 校验", server.includes("assertSafeUpstreamUrl") && (
  server.includes("169.254.169.254")
  || (
    server.includes('from "./upstream-url.mjs"')
    && server.includes("assertSafeUpstreamUrl(rawBaseUrl, { publicServer })")
  )
));
check("上游 SSRF 模块", (() => {
  try {
    const upstream = readFileSync(join(root, "server/upstream-url.mjs"), "utf8");
    return upstream.includes("validateFetchUrl") && upstream.includes("publicServer");
  } catch {
    return false;
  }
})());
check("账号积分串行写入", (() => {
  try {
    const acct = readFileSync(join(root, "server/account-store.mjs"), "utf8");
    return acct.includes("transact") && server.includes("withAccountStore");
  } catch {
    return false;
  }
})());
check("同步冲突检测", server.includes("version_conflict"));
check("external grant 需登录", server.includes('/external/grant') && !server.includes('userFromAuth(req) || "guest"'));
check(
  "同步 HMAC token",
  authCore.includes('createHmac("sha256"')
    && authCore.includes("verifySession")
    && server.includes("userFromAuth")
    && !server.includes("yueqi-local-service"),
);
check("前端带本地令牌", model.includes("localServiceHeaders") && voice.includes("localServiceHeaders"));
check("Web session 密钥", webSecrets.includes("sessionStorage") && secrets.includes("setWebSecret"));
check("Native 密钥走 Keystore 插件", secrets.includes("NativeSecureStore") && secrets.includes("migratePrefsIntoVault"));
check("local-service 模块", local.includes("getLocalServiceToken"));

const defaultDraft = avatarStateToPackDraft(createDefaultAvatarState());
check("默认角色包 schema 回归", validateCharacterPack(defaultDraft).ok);

const payload = `"><img src=x onerror="globalThis.__characterPackXss=1">'&`;
const maliciousDraft = JSON.parse(JSON.stringify(defaultDraft));
maliciousDraft.manifest.name = payload;
maliciousDraft.looks[0].name = payload;
maliciousDraft.looks[0].description = payload;
maliciousDraft.actions[0].name = payload;
maliciousDraft.actions[0].fileName = payload;
maliciousDraft.expressions[0].name = payload;
maliciousDraft.layered = {
  ...maliciousDraft.layered,
  parts: [{
    id: "body",
    name: payload,
    parentId: "",
    fileName: payload,
    mediaId: "",
    asset: "",
  }],
  expressions: {
    idle: {},
    talk: {},
    react: {},
    soft: {},
  },
  lipSync: { mouthPartId: "body" },
};
const persistedDraft = JSON.parse(JSON.stringify(maliciousDraft));
const payloadValidation = validateCharacterPack(persistedDraft);
const encodedPayload = escapeCharacterPackHtml(payload);
const simulatedEditorHtml = `<strong>${encodedPayload}</strong><input value="${encodedPayload}">`;
check("合法文本载荷可导入", payloadValidation.ok, payloadValidation.errors.join(","));
check(
  "持久化 XSS 载荷编码",
  !simulatedEditorHtml.includes("<img")
    && !simulatedEditorHtml.includes(payload)
    && encodedPayload.includes("&lt;img")
    && encodedPayload.includes("&quot;")
    && encodedPayload.includes("&#39;")
    && encodedPayload.includes("&amp;")
);
check(
  "三个角色编辑器统一编码",
  [characterPage, phase3Editor, phase4Editor].every((source) => (
    source.includes("escapeCharacterPackHtml")
    && (source.match(/escapeCharacterPackHtml/g) || []).length >= 4
  ))
);

function cloneDraft() {
  return JSON.parse(JSON.stringify(defaultDraft));
}

const badId = cloneDraft();
badId.looks[0].id = `look"><svg onload=alert(1)>`;
check(
  "角色包 ID 字符集限制",
  validateCharacterPack(badId).errors.some((error) => error.startsWith("invalid_look_id:"))
);

const tooLong = cloneDraft();
tooLong.looks[0].name = "x".repeat(81);
check(
  "角色包文本长度限制",
  validateCharacterPack(tooLong).errors.includes(`look_name_too_long:${tooLong.looks[0].id}`)
);

const tooMany = cloneDraft();
tooMany.looks = Array.from({ length: 65 }, (_, index) => ({
  id: `look_${index}`,
  name: `Look ${index}`,
  asset: "",
}));
tooMany.manifest.defaultLook = "look_0";
check("角色包集合数量限制", validateCharacterPack(tooMany).errors.includes("too_many_looks"));

const badRefs = cloneDraft();
badRefs.actions[0].fallback = "missing_action";
badRefs.expressions[0].actionId = "missing_action";
badRefs.sceneTriggers[0].lookId = "missing_look";
badRefs.manifest.defaultActions.idle = "missing_action";
badRefs.layered = {
  parts: [{ id: "face", name: "Face", parentId: "missing_parent", asset: "" }],
  lipSync: { mouthPartId: "face" },
};
const badRefErrors = validateCharacterPack(badRefs).errors;
check(
  "角色包引用完整性校验",
  badRefErrors.includes(`action_fallback_missing:${badRefs.actions[0].id}`)
    && badRefErrors.includes(`expression_action_missing:${badRefs.expressions[0].id}`)
    && badRefErrors.includes(`scene_look_missing:${badRefs.sceneTriggers[0].id}`)
    && badRefErrors.includes("default_action_missing:idle")
    && badRefErrors.includes("layered_parent_missing:face")
);

const badPath = cloneDraft();
badPath.looks[0].asset = "assets/../payload.png";
check(
  "角色包素材路径校验",
  validateCharacterPack(badPath).errors.includes(`unsafe_path:look:${badPath.looks[0].id}`)
);

const l2 = spawnSync(process.execPath, [join(root, "scripts/verify-apk-hardening-l2.mjs")], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});
if (l2.stdout) process.stdout.write(l2.stdout);
if (l2.stderr) process.stderr.write(l2.stderr);
check("L2 密钥保险箱与库加密", l2.status === 0);

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Security verify failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Security verify passed: ${checks.length}/${checks.length}`);
