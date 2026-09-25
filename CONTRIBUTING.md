# 贡献指南

谢谢你来改月栖开源版。先把 Issue / PR 写清楚，比一次改一整棵树更有用。

## 这是哪个产品

这个仓库是 **免费开源形态**：自带本机网关、BYOK、无云登录、无 BillingCredit。仓库地址是 https://github.com/azhimiao/Nyra-yueqi 。

不要把托管模型、账号体系或 BillingCredit 合进来。

## 硬约束

1. **桌宠 ≠ 角色**。外观是 `selectedPetId`，身份是 `activeCharacterId`。
2. **聊天写入走 Conversation V2**。只写 IndexedDB messages 不算成功。
3. **不要提交密钥**。`.env`、`backend/data/`、`*.jks`、`*.keystore`、`.local-token` 都不进 Git。
4. **情景剧角色和日常陪伴分开**。不要复用 Pop 会话当舞台。
5. 用户可见文案不要塞测试人名。

## 本地跑起来

```bash
cp .env.example .env
npm install
npm start
```

改 Android 前先能在 5173 复现。

## 怎么提 PR

1. 先开 Issue 说明要改什么、为什么。
2. 一个 PR 只做一件事。
3. 说明怎么验证（网页路径、或你跑过的命令）。
4. 不要把 `frontend/www/`、`android/app/build/`、APK 打进提交。

## 想先改哪

| 域 | 入口 |
|---|---|
| 启动 | `frontend/src/app.js` |
| 聊天 | `frontend/src/panels/chat.js` |
| 会话 | `frontend/src/conversation/` |
| 角色 | `frontend/src/characters/store.js` |
| 情景剧 | `frontend/src/scenario/` |
| 本机网关 | `backend/index.mjs` |

## 许可

贡献按仓库根目录 [MIT](./LICENSE) 授权。
