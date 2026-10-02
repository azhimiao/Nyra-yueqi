# 月栖外部验证清单（CP-20）

> 2026-07-30 · UTF-8  
> **用途**：跨端发布前的人工 / 专用环境验收步骤。本清单 **不** 替代 Node 门禁；每项默认 **PENDING_EXTERNAL** 直至负责人在目标环境勾选完成。

## 状态约定

| 标记 | 含义 |
|------|------|
| `PENDING_EXTERNAL` | 代码/脚本已就绪；需专用机器、凭证或商店账号 |
| `IMPLEMENTED_PENDING_ANDROID_RUNTIME` | Android 实现完成；App WebView 内 Agent 未验收 |
| `IMPLEMENTED_PENDING_EXTERNAL_BYOK` | BYOK 协议/mock 通过；Live chat FC 凭证未验收 |
| `IMPLEMENTED_PENDING_IOS_BUILD` | iOS 工程存在；Xcode 签名/真机未验收 |

**禁止**在本清单或台账中使用：`PASSED_ANDROID_ASSISTANT`、`PASSED_ANDROID`、`PASSED_LIVE_BYOK`、商店已上架等未实测表述。

---

## 1. Android App Runtime / APK

**状态**：`PENDING_EXTERNAL` · **Owner**：Mobile QA / Android 工程师  
**环境需求**：≥20 GB 磁盘（SDK + system image）、Android SDK 34+、adb、模拟器或真机

### 1.1 磁盘与 SDK

- [ ] `ANDROID_SDK_ROOT` 或 `%LOCALAPPDATA%\Android\Sdk` 可用
- [ ] `platform-tools/adb` 在 PATH
- [ ] 目标 API system image 完整安装（非 `.installer` 残留）；参考 CP-6.1：`kernel-ranchu` 缺失会导致 AVD 无法启动
- [ ] 可用空间：C: 或 SDK 所在盘 ≥ 15 GB（镜像 + Gradle cache）

### 1.2 Web 产物与 Capacitor sync

```powershell
cd F:\beautiful
npm run build          # 或 npm run cap:sync
npx cap sync android
```

- [ ] `www/` 由 Vite 生成且无 build 错误
- [ ] `android/app/src/main/assets/public/` 已同步最新 web 资源

### 1.3 Debug APK 构建

```powershell
npm run build:android
# 或：cd android && .\gradlew.bat assembleDebug
```

- [ ] `android/app/build/outputs/apk/debug/app-debug.apk` 存在
- [ ] APK 大小合理（非空壳；含 openclaw-mobile chunk）

### 1.4 安装与 in-app Agent smoke

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb logcat -s chromium WebView Capacitor
```

- [ ] App 冷启动无 WebView 白屏 / JS 致命错误
- [ ] 打开 **栖机助手** → Local Agent 任务（如角色卡修复）→ 观察到 `runAgentLoop` 相关事件或 UI 进度
- [ ] 切后台 / 回前台：任务 pause/resume 无崩溃（声明能力见 `QIJI_ASSISTANT_ANDROID_RUNTIME_REPORT.md`）
- [ ] 记录：设备型号、Android 版本、WebView 版本、Git commit、APK 路径

**完成标准（仍非商店 PASSED）**：App 内 Agent smoke 有日志/UI 证据 → 可将台账 Android 行更新为 **实测通过**（由负责人单独 PR，非 CP-20 自动升级）。

**门禁脚本（不替代人工）**：

```powershell
npm run verify:qiji-assistant-android-runtime
```

---

## 2. Live BYOK chat FC endpoint

**状态**：`PENDING_EXTERNAL` · **Owner**：Backend / ML Ops  
**环境需求**：OpenAI-compatible chat 模型 + function calling；`.env` 或安全密钥库

### 2.1 凭证

- [ ] `YUEQI_BYOK_*` / provider base URL / model ID 配置在 **非提交** 环境
- [ ] 模型支持 **tool_calls**（非仅 completion 文本）
- [ ] 密钥未进入备份导出（CP-15 scrub 回归）

### 2.2 Live smoke

```powershell
npm run verify:qiji-assistant-byok
```

- [ ] Live 路径返回 tool_calls（非 `BYOK_MODEL_NOT_FOUND` / `BYOK_API_KEY_MISSING`）
- [ ] 报告 `.tmp/byok-smoke-report.json` 中 **无** API key / Authorization 明文
- [ ] 助手任务：`character.inspect` → `workspace.write_text` → `WAITING_FOR_APPROVAL` 序列

**当前代码判定**：`IMPLEMENTED_PENDING_EXTERNAL_BYOK`（协议 mock 已通过，Live 凭证不足）。  
详见 `docs/QIJI_ASSISTANT_BYOK_SMOKE_REPORT.md`。

---

## 3. iOS Capacitor sync / build

**状态**：`PENDING_EXTERNAL` · **Owner**：iOS 工程师  
**环境需求**：macOS + Xcode 15+、Apple Developer 账号（真机）

### 3.1 工程存在性（本 repo 已具备）

- [x] `ios/` 目录（Capacitor 6）
- [x] `capacitor.config.json` · `appId`: `app.yueqi.open`
- [ ] 负责人在 Mac 上 clone 同 commit

### 3.2 Sync 与编译

```bash
npm run build
npx cap sync ios
npx cap open ios
```

- [ ] Xcode 打开 `ios/App/App.xcworkspace`（或 `.xcodeproj`）
- [ ] Signing Team / Bundle ID 配置
- [ ] `Product → Build` 成功（Simulator 或 Device）
- [ ] WebView 加载 `www/index.html`；基础导航 smoke（Pop、设置）

**完成标准**：Simulator 或 TestFlight 构建成功 → 台账 iOS 行可改为实测记录（仍非 App Store PASSED）。

---

## 4. Store / Play 合规（高层）

**状态**：`PENDING_EXTERNAL` · **Owner**：Release / Legal  
**环境需求**：Google Play Console、Apple App Store Connect 账号

### 4.1 通用

- [ ] 隐私政策 URL 与 App 内「备份/隐私」说明一致（CP-15）
- [ ] AI 生成内容、用户数据本地存储说明
- [ ] 权限声明与 `AndroidManifest.xml` / iOS Info.plist 一致（通知、文件、网络）
- [ ] 导出合规（加密声明、地区限制）

### 4.2 Google Play

- [ ] `targetSdkVersion` 符合 Play 当期要求
- [ ] Data safety 表单：本地优先、可选 BYOK 外传
- [ ] 内部测试轨道上传 AAB/APK

### 4.3 Apple App Store

- [ ] App Privacy  nutrition labels
- [ ] 若含 BYOK：说明用户自带密钥、数据去向
- [ ] TestFlight 内测

**注意**：CP-20 **不** 声称商店审核已通过。

---

## 5. 本环境 Node 门禁（非外部）

在任意 dev CI 机器可跑：

```powershell
npm run verify:e2e-cp21
```

| 脚本 | 职责 |
|------|------|
| `verify:e2e-cp21` | **CP-21 总验收**：编排 CP-7…20 子 verify + bridge smoke + 完成文档 |
| `verify:cross-cp20` | Capacitor 结构、脚本、清单章节、禁止虚假 PASSED 文案 |
| `verify:security-cp19` | CP-19 安全回归 |

单 CP 回归见 `docs/NYRA_APP_COMPLETION_REPORT.md` 与 `package.json` 中各 `verify:*-cp*`。

---

## 6. 快速参考路径

| 产物 | 路径 |
|------|------|
| Web build 输出 | `www/` |
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Capacitor 配置 | `capacitor.config.json` |
| Android 工程 | `android/` |
| iOS 工程 | `ios/` |
| BYOK 报告 | `.tmp/byok-smoke-report.json` |
| 已知限制 | `docs/NYRA_KNOWN_LIMITATIONS.md` |
