# 月栖 Companion 多端构建

## 已生成

- Web / PWA: `www/`
- Android 工程: `android/`
- iOS 工程: `ios/`
- 本地生态服务: `server/index.mjs`

## 本地运行

```bash
npm run start
```

或分别启动：

```bash
npm run dev
npm run server
```

前端会优先连接 `http://127.0.0.1:8787`：

- `POST /auth/login`
- `POST /sync/upload`
- `GET /sync/download`
- `POST /external/grant`
- `GET /updates/latest`
- `GET /community`

如果服务未启动，App 会继续本地优先运行，记录留在设备内。

## Capacitor 开发模式

真机调试时，可在 `capacitor.config.json` 临时加入（不要提交到生产分支）：

```json
{
  "server": {
    "url": "http://192.168.x.x:5173",
    "cleartext": true
  }
}
```

然后执行 `npx cap sync android` 或 `ios`，App 会加载 Vite 开发服务器。

## 存储适配

| 平台 | 记忆宫殿 / 聊天 / 日记 | 检索引擎 | 设置 | API Key |
|------|------------------------|----------|------|---------|
| **Android / iOS** | SQLite + FTS5 | MemPalace hybrid | Preferences | Secure Store |
| Web 预览 | IndexedDB | 内存 hybrid | localStorage | localStorage |

App 从后台恢复时会尝试云同步（若已登录且开启云端保存）。

MemPalace 记忆在 App 端走 `sqlite-adapter.js` 的 **FTS5 全文索引** + JS 移植的 hybrid 重排，数据不出设备。

## Android

### Debug（开发）

```bash
npm run build:android
```

或分步：

```bash
npm run build
npx cap sync android
cd android
gradlew.bat assembleDebug
```

Debug APK：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### Release（正式发版）

正式包与更新通道已改为命令行签名流程，详见 `docs/RELEASE_SECURITY.md`。

一次性初始化（私钥写到本机 `~/.nyra/release/`，不会进仓库）：

```bash
npm run security:init-release
```

日常发版：

```bash
npm run release:android
```

可选上传：

```bash
npm run release:publish
```

产物在 `dist/release/`（含 release-signed APK、SHA-256、Ed25519 签名 update-manifest）。  
缺少签名材料时 `assembleRelease` 会失败，**不会**回退 debug signing。

以前安装的 debug APK 与正式证书不同，需卸载后安装一次正式版，之后才能覆盖更新。

### 系统悬浮（Phase 1）

- 原生：`OverlayService` + `CompanionOverlayPlugin`（`SYSTEM_ALERT_WINDOW` + 前台服务 `specialUse`）
- 悬浮页：`overlay.html`（收起 / 气泡 / 聊天三态）
- App 内入口：角色页 →「系统悬浮陪伴」
- 未授权或关闭时降级为 App 内浮层，不假装已系统悬浮
- `cap sync` 后请确认 `MainActivity` 仍 `registerPlugin(CompanionOverlayPlugin.class)`，且 Manifest 含 Overlay 权限与 Service
- Play / 真机材料：`docs/ANDROID_OVERLAY_PLAY_CHECKLIST.md`、`docs/ANDROID_OEM_TEST_MATRIX.md`

如果出现 SDK location not found，需要安装 Android Studio / Android SDK，并设置：

```text
ANDROID_HOME=C:\Users\<you>\AppData\Local\Android\Sdk
```

或创建 `android/local.properties`：

```properties
sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

## iOS

```bash
npm run build
npx cap sync ios
```

Windows 可以生成 iOS 工程源码，但不能直接编译 IPA。需要在 macOS 上安装 Xcode 和 CocoaPods 后运行：

```bash
cd ios/App
pod install
open App.xcworkspace
```

## 当前架构边界

- 内置记忆：IndexedDB / SQLite + 简化 embedding + 权重/时间/收藏重排。
- 日记：写入 `memories`，`source = diary.memory`，参与检索。
- 世界书：写入 `worldbook`，触发词命中后进入 prompt。
- 外部能力：日历、位置、音乐、相册、通知只作为授权能力，不参与内置记忆主链路。
- 生态服务：登录、更新检查、可选云保存、社群入口通过本地服务接口运行；开发期使用本地服务，发布后可替换为线上 API。

## PWA

- `manifest.webmanifest` 含 192/512 PNG 与 SVG maskable 图标。
- `sw.js` 缓存 app shell，不缓存 `/model/`、`/sync/` 等 API。
- 构建后版本写入 `www/build-info.json`，与 `package.json` / `APP_VERSION` 一致。

## CI

GitHub Actions 工作流 `.github/workflows/build.yml` 会在 push/PR 时：

1. 构建 Web 产物并上传 artifact
2. 构建 Android **debug** APK 并上传 artifact

正式 release 签名密钥不进 CI；当前正式发版在本机执行 `npm run release:android`。以后若要 CI 发版，先 `npm run security:init-release` 生成身份，再单独导入 GitHub Secrets。
