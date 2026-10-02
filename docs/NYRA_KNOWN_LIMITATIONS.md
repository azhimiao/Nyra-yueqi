# 月栖已知限制（CP-21）

> 2026-07-30 · 与台账外部门禁对齐 · 环境内 CP-7…21 **PASSED**（`verify:e2e-cp21`）

## 1. Android App Runtime

**状态**：`IMPLEMENTED_PENDING_ANDROID_RUNTIME`

- Node / Playwright 已证明 OpenClaw Mobile Slice 与助手集成；**App WebView 内** `runAgentLoop` 长任务未在本机验收。
- 历史阻塞：AVD system image 磁盘不足（见 `QIJI_ASSISTANT_ANDROID_RUNTIME_REPORT.md`）。
- **Workaround**：真机或磁盘充足的模拟器 + `docs/NYRA_EXTERNAL_VALIDATION_CHECKLIST.md` §1。

## 2. Live BYOK

**状态**：`IMPLEMENTED_PENDING_EXTERNAL_BYOK`

- OpenAI-compatible **mock** 与协议错误映射已通过；Live chat + function calling 需有效 provider 凭证。
- 本机曾遇 `BYOK_MODEL_NOT_FOUND`（火山方舟 chat FC 模型未开通）。
- **Workaround**：配置支持 tool_calls 的 chat 模型后运行 `npm run verify:qiji-assistant-byok`。

## 3. iOS

**状态**：`IMPLEMENTED_PENDING_IOS_BUILD`

- `ios/` Capacitor 工程存在于 repo；Windows 开发机无法运行 Xcode。
- **Workaround**：Mac 上 `npm run build && npx cap sync ios && npx cap open ios`。

## 4. OpenClaw 全浏览器构建（历史 CP-18 注记）

**状态**：**已缓解**（CP-20）

- **曾阻塞**：主 Vite 生产构建在 `vendor/openclaw-agent-mobile` 中 `node:url` → `fileURLToPath` 被 externalize 导致失败。
- **修复**：`vite.config.js` 复用 `src/integrations/openclaw-mobile/vite-node-shims.js` alias 至 browser shims（与 mobile-slice 构建同源）。
- **残余**：部分 Node 能力在浏览器为 fail-closed stub；Shell / 任意 FS 仍 `UNSUPPORTED_RUNTIME_CAPABILITY`。
- **Probe**：`npm run probe:openclaw-web` 仍可用于上游全量 agent-core 兼容性审计（与 mobile slice 路径不同）。

## 5. 语音（TTS / STT）

**状态**：`THREE_ROUTES`（设备密钥 / Hosted 云端语音 / 设备系统语音）

优先级由 `src/voice/speech-routing.js` 决定，服务端同一套规则在
`server/voice/voice-access.mjs`：

1. **设备密钥（BYOK）**：用户自己的语音密钥优先，永不计 Credits，
   因此 `/voice/tts`、`/voice/stt` 不被 Credits 余额门拦住。
2. **Hosted 云端语音**：仅订阅会话可用，按字符（TTS）/ 按秒（STT）扣 Credits，
   预留—结算与限流同图像路径。**运营方必须同时配置凭据与单价**
   （`YUEQI_SPEECH_*`），缺任一项即 fail closed，宁可不开也不按猜测价计费。
3. **设备系统语音**：无密钥、无 Credits、离线可用。浏览器走 Web Speech；
   Android WebView 没有 Web Speech，改走 `NativeCapabilityPlugin.speak`。

- 只有三条路都不可用时才提示「这台设备没有可用的声音」。
- 设备系统语音没有 `<audio>` 元素，因此**不带口型同步**；口型仅在云端路径生效。
- Android 原生**听写**未接（`speechCapabilities().stt === false`），
  安卓上「说」需要 Hosted 语音或设备密钥。
- **已验证**：`npm run verify:voice`（含 hosted-speech / speech-billing / routing 单测）；
  `npm run verify:voice-device`（Chromium 实测：无密钥无云端时喇叭真的读出文字；
  设备无可用音色时给提示而不是卡住）；
  `/billing/pricing` 在配置凭据+单价后返回 `voice.hostedTts=true` 与预估 Credits。
- **未验证**：真实语音供应商的音频回放、真机系统语音、Hosted 语音的线上扣费。

## 6. 商店 / 合规

- 无 Play / App Store 审核 PASSED 声明。
- 隐私与权限文案以 CP-15/16 为准；提审前需 Legal 复核清单 §4。

## 7. 构建体积

- 生产 main chunk ~1.3 MB（gzip ~428 KB）；openclaw-mobile ~34 KB gzip。
- 大 chunk 警告为已知；CP-18 懒加载已减轻冷启动，未做进一步拆包。
