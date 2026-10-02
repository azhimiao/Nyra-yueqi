# Development

Source repo: `F:/beautiful`

## Prerequisites

- Node.js 20+（仓库实测 20.11；部署文档建议 22 LTS）  
- npm  
- 可选：Android Studio、Xcode、Electron  

## First run

```bash
cd F:/beautiful
npm install
cp .env.example .env   # 填本地服务项；密钥勿提交
npm run start          # Vite http://127.0.0.1:5173 + 尝试拉起 8787
```

仅前端：`npm run dev`  
仅网关：`npm run server`

## App modes

- 冷启动走引导（`src/onboarding/wizard.js`）  
- 重置引导：设置内「重新引导」或清 `yueqi.onboarding.v1`  
- 强制开发者诊断：`localStorage.yueqi.developerMode = "1"`（见用户运行指南）

## Configuring models (dev)

1. 完成登录 + 选 developer 模式  
2. 打开「接口」页填 Base URL / API Key / Model  
3. 或服务器托管模式配 `.env` 中 `YUEQI_MODEL_*`

方舟示例（托管）：

```dotenv
YUEQI_MODEL_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
YUEQI_MODEL_API_KEY=ark-***
YUEQI_MODEL=doubao-seed-2-1-turbo-260628
```

生图需额外适配 Seedream 尺寸/路径（见 ROADMAP P1）。

## Pet assets (轨 A)

```bash
# 需 ARK_API_KEY；控制台开通对应 Seedream
npm run generate:yueqi-female -- --stage ...
npm run import:yueqi-female
npm run verify:xingli
```

V2：`npm run avatar:*` — **实验 only**。

## Desktop

```bash
npm run desktop:dev
npm run desktop
```

## Mobile

```bash
npm run build
npx cap sync android   # or ios
npm run build:android  # debug APK 流水线
```

详见源仓 `MOBILE_BUILD.md`。

## Code style expectations

- ES modules（`"type":"module"`）  
- 改 UI 跟现有 CSS 变量 / 壳密度文件，勿引入第三套设计系统  
- 用户可见文案走 `src/i18n/locales/`  
- 安全：用户内容进 `innerHTML` 必须 `escapeHtml`

## Do not

- Commit `.env` / `server/data/*.json` / 用户密钥  
- 把桌宠选型加回引导  
- 默认打开所有 intelligence flags
