# Native 密钥存储方案（X5-3 / L2）

> 品牌：月栖 / Nyra
> 日期：2026-09-10
> 关联代码：`src/platform/secure-store.js` · `src/platform/web-secrets.js` · `NativeSecureStorePlugin`

---

## 1. 现状

| 平台 | 实现 | 说明 |
|------|------|------|
| **Web** | `sessionStorage`（`web-secrets.js`） | 会话结束即清；不写入 `localStorage` |
| **Android** | `EncryptedSharedPreferences` + Android Keystore | `NativeSecureStorePlugin`；API 22 或 Keystore 失败时回退 Preferences |
| **iOS** | Keychain | 同插件名 `NativeSecureStore`；插件未加载时回退 Preferences |
| **SQLite（Native）** | SQLCipher，配置 `androidIsEncryption: true` | 新库加密；已有明文库一次 `encryption` 迁移；失败则仍按 `no-encryption` 打开 |

Web 与 Electron（非 Capacitor native）不走 SQLite 加密，仍是 IndexedDB。

当前 API：`setSecret` / `getSecret` / `removeSecret`（统一前缀 `yueqi.secret.`）。

---

## 2. 目标

上架与安全评审期望：API Key、语音 Key 等敏感字段进入系统级安全存储。

- iOS → **Keychain**
- Android → **Keystore** / EncryptedSharedPreferences
- Web → **保持 sessionStorage**（浏览器无等价 Keychain；不改为 localStorage）

---

## 3. 落地路径

自研 Capacitor 插件 `NativeSecureStore`（不额外加社区 npm 依赖，避免 Cap 6 版本冲突）：

1. Native 优先读 Secure Storage
2. 若无值则回退 Preferences（一次性迁移后删除旧键）
3. 插件不可用或写入失败时继续 Preferences，避免 BYOK / 语音 Key 丢失
4. Web 分支不变，仍走 `web-secrets.js` → `sessionStorage`

SQLCipher 口令由 `@capacitor-community/sqlite` 的 `setEncryptionSecret` 写入插件自己的 Encrypted SharedPreferences，**不**与 BYOK 密钥混用。生物识别提示保持关闭，避免每次开库弹指纹。

---

## 4. 迁移步骤

1. Native 首次 `getSecret`：Preferences → Secure Storage，再 `remove` 旧键
2. 备份/导出：**永不**把明文 Key 写入 JSON 备份（`stripSecretsFromPayload` / `scrubExportPayload`）
3. 已有明文 SQLite：`createConnection(..., true, "encryption")` 就地加密；失败则关闭连接后按 `no-encryption` 打开，数据仍可读
4. 新库：`mode: "secret"` 直接加密

---

## 5. 风险与边界

- Secure Storage 在部分 Android OEM 上行为差异 → 需真机回归登录/Key 保存
- API 22 无 EncryptedSharedPreferences，行为与 L1 相同（Preferences）
- 明文库就地加密失败时保持明文打开，**不会**为了加密而丢掉记忆
- 若库已加密但口令丢失（极少见的部分清数据），SQLite 打不开会回退 IndexedDB，看起来像空记忆
- Web 永远无法达到 Keychain 强度 → 产品文案保持「本地优先、会话密钥」
- Hosted `YUEQI_MODEL_API_KEY` / `ARK_*` 仍只在服务器，不进客户端保险箱
- 备份文件、云同步 payload 继续剥离 secrets

---

## 6. 验收

- [x] 有本文档
- [x] Web 仍为 `sessionStorage`（`web-secrets.js`）
- [x] Native 插件落地 + Preferences 一次性迁移
- [x] SQLite 可加密且明文库可回退
- [x] `verify:apk-hardening-l2` / `verify:security` 断言上述路径
- [ ] 真机：BYOK 保存后杀进程仍在；升级 L1→L2 后记忆/聊天仍在
