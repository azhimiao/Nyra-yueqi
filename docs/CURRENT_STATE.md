# Current State — 月栖

Updated: 2026-09-27

Source of truth for release: `docs/qa/product-cutover/STATUS.md` in source repo.
**默认真正接通的用户路径：** `docs/WHAT_IS_LIVE.md`（代码在 ≠ 生效）。

## Verdict

**工程厚、门禁多、产品 cutover = NOT READY。**  
大量 Node verify 可绿；浏览器 E2E / Android 真机 / 真搜索 Key 证据仍阻塞发版。

## Already implemented (code exists)

2026-09-26 编辑能力补充：App 与小手机已接入共享 Prompt、世界书、记忆和外观编辑器；场景、示例及历史后指令进入实际请求。使用入口与局部验收见 `docs/qa/authoring/README.md`。这项局部验证不改变下面的产品发布结论。

2026-09-27 阅读空间：世界书与记忆改为独立内容页，App 侧边栏/移动抽屉直达，小手机桌面子应用；世界书阅读真实设定、记忆沿时间连续展开，原文来源与角色背景分开。编辑能力与原存储共用。小手机旧桌面仅一次性补入世界书，不重排；在线字体不再阻塞启动。局部验收与截图见 `docs/qa/context-spaces/README.md`，不改变发版状态。

| 域 | 状态 |
|----|------|
| 双壳 App / 小手机 | 可用；引导：语言→账号→模式→界面（**无桌宠选型**） |
| 冷启动开屏 | 每次启动手写 Nyra 字标（`src/splash/boot-splash.js`），字写完才编译应用包；`verify:boot-splash` |
| 登录 / 注册门禁 | 协议勾选仅注册态出现；CTA 置灰时给出具体缺项；`index.html` 的 i18n 键由 `verify:i18n` 全量校验 |
| GitHub 开源入口 | 公共仓库 `azhimiao/Nyra-yueqi` 已建立；首次选择 App 版本与「联系与社群」提供 Star / 查看入口，源码状态明确为整理中 |
| 多角色 + Pop 通讯录 | Characters M0–M5 有 verify |
| Conversation V2 + 流式聊天 | 主路径 |
| MemPalace / RAG / 日记 / 世界书 | 有；统一记忆投影 **flag 默认关** |
| 桌宠：月栖·昼/夜、星梨、气泡 | 可切换；浮窗与桌宠库预览都会轮播现有姿势（含占位静帧） |
| 视觉记忆相册（ta自己/经历/共享） | UI 有；「ta自己」标必需 |
| 商业：Nyra Hosted / BYOK + Billing Credits | v1 权威账本、Hosted 仅 Standard/High 两档、按实际 modelId+usage 计费；Whop 外部实付证据待补 |
| 经济：市场 / 栖币 | UI + server economy |
| 情景 / 卷轴 / 冒险 / 共创 | 创意模式栈 + verify |
| 技能 / YEOS / OpenClaw 切片 | 多 CP 报告；外部 BYOK/Android 常未证 |
| Electron 桌宠拖拽 / overlay | 有 |
| Capacitor Android/iOS 工程 | 有 |
| i18n zh/en | 有泄漏门禁 |

## Not done / not release-ready

| 项 | 说明 |
|----|------|
| Product cutover C6 | Browser E2E **FAIL** 7/12（2026-08-08） |
| C4 真搜索 | 缺 staging 真 Key 证据 |
| C5 真机迁移样本 | 缺 Android/browser 样本 |
| C7 Android device | 未跑 |
| C8 Release | FAIL |
| Unified memory / intelligence flags | 默认 legacy / off |
| 火山全家桶接线 | Hosted 文本/生图走方舟 Standard/High；语音已接豆包语音（openspeech），需运营方同时配凭据+单价才开启；BYOK 仍可自配 |
| 语音三路由 | 设备密钥 > Hosted 云端语音（计 Credits） > 设备系统语音（免费离线）；见 `docs/adr/2026-08-17-nyra-hosted-speech.md` |
| 月栖默认宠动作 | 多 clip 为 idle 占位，非完整星梨级动作集 |
| Native Keystore | 仍 Preferences 方案 |
| Avatar Factory V2 | **PAUSED** |

## External blockers

1. 真模型 / 生图 / 语音 Key（托管或 BYOK）与 Live 冒烟证据  
2. Brave/Tavily 等检索 Key（C4）  
3. Android 真机矩阵证据（C7）  
4. Whop sandbox / live 真实支付与重复 webhook 外部证据

## Historical debt

- README Phase 0–8 清单过时，**低估** Companion OS  
- 数十份 `NYRA_CP*_REPORT`「完成」≠ 可发版  
- 多套 agent / memory / conversation 并存  
- 巨型脏工作树；scripts/verify-* 数量爆炸，全量 `npm run verify` 极长  
- `verify:security` 曾因日历转义检查过期失败 → **2026-08-13 已修**（接受 `escapeHtml(displayTitle)`）

## What works for local demo

```bash
npm run start
# 接口页配 OpenAI 兼容或后续接方舟
# 引导完成 → App 或小手机聊天
```

## Honest claims allowed

- 「Node 合同门禁 PASS」  
- 「某 CP 工程门禁 PASS」  

## Forbidden claims

- 「产品已过审 / 可上架」除非 C8 + 外部证据齐  
- 「Avatar V2 已达观感验收」  
- 「统一记忆已对用户开启」除非 flags + cutover 明示
