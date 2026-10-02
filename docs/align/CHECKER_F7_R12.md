# Checker · F7 实现自检（R12）

> 评审轮次：**R12**（Impl-F7 落地自检）  
> 日期：2026-07-25  
> 对照：[F7.md](./F7.md) · [_QUALITY_BAR.md](./_QUALITY_BAR.md) · [CHECKER_R2.md](./CHECKER_R2.md)  
> 对象：H1 栖市 · H2 扩展 SDK · H3 账号/门禁 · H4 成年审核 · H5 举报 · H6 本地聊天助手

---

## 结论

```
阶段: F7
结论: 放行（R12 · 主 Agent 复核 verify 28/28 + F0/F1/F2/F6 抽检未回归）
质量门槛: U✓ E✓ P✓（P1=N/A 样例未调 timeline.write；E4 phone-ext:* 已保留）
§9 手测: 路径已按文档实现；侧载 zip / 权限 sheet / 举报队列可单机演示
风险: 云目录 / 云门禁 / 举报 sync 为占位；iframe sandbox 无 allow-same-origin（靠 srcdoc 注入 host）
必改: （无阻塞）
```

**verify：** `npm run verify:align-f7` → **28/28**  
**回归：** `verify:align-f0`–`f6` 全绿（16/24/29/26/24/20/28）

---

## 范围核对

| ID | 状态 | 说明 |
|----|------|------|
| H1 栖市 | ✓ | App `qishi`；已安装 / 侧载 / 详情；发现 Tab 默认隐藏 |
| H2 扩展 SDK | ✓ | manifest / registry / package-io / host-api / permission-ui / runtime；样例 `sample-calendar-token` |
| H3 账号/门禁 | ✓ | 本地模式默认开；云门禁默认关；占位登录 |
| H4 成年审核 | ✓ | 默认关；mature 安装拦截 |
| H5 举报 | ✓ | 表单 + 本地队列；云 sync 可选 |
| H6 本地聊天助手 | ✓ | 默认关；文档 `docs/LOCAL_CHAT_ASSISTANT.md`；实验开关开启后入口 |
| 侧写 / 付费结算 / 热更新 / 真 OAuth / 外部 IM Hook | **未做** | 锁死 |

---

## §9.0 质量门槛自检

| 条款 | 结果 |
|------|------|
| U1–U12 栖市 / 扩展壳 / 门禁 / 举报 | ✓（空/错态 CTA；权限拒绝去授权） |
| U7 权限拒绝 | ✓ `PermissionDeniedError` + sheet / inline 去授权 |
| E1 分层 | ✓ `phone-ext/*` · `qishi/*` · `gate/*` |
| E2 DATA_MODULES | ✓ `extensions` / `gatePrefs` / `reports` |
| E3 manifest schema | ✓ `validateManifest` |
| E4 phone-ext:* | ✓ `normalizeSceneAppId` 保留前缀 |
| E5 verify | ✓ `verify:align-f7` |
| E6 离线 | ✓ 侧载 + 样例 zip 无云 |
| P1 | **N/A**；样例未调用 `timeline.write` |
| P3 开关默认关 | ✓ 云门禁 / 发现 / 举报 sync / H6 |

---

## §9.3 自动断言

1. `validateManifest` 合法 / 缺 kind / bad id / bad permissions  
2. `PERMISSION_IDS` ≥ 10 含 `calendar.read`、`chat.send_token` + `labelZh`  
3. `checkPermission` 允许 / 拒绝  
4. `permissionDeniedMessage` 含「读取日历」  
5. `parseExtDesktopId`  
6. `normalizeGatePrefs({})` 默认本地开、云关、H6 关  
7. 样例 zip 解包 entry 存在  
8. memory registry 安装 / 卸载 + icon 清理  

---

## 未做 / 后续

1. 栖市付费结算、扩展远程热更新、真 OAuth  
2. 侧写子应用（C*）  
3. H6 文件监听自动导入（当前仅粘贴）  
4. 正式环境 B 手测：装样例 → 授权日历 → 发信物 → 卸载  
5. 举报队列 IndexedDB 专库（当前 localStorage `yueqi.phone.reports.v1`，契约键已登记）

---

## 主要落点

- `src/phone-ext/*` · `src/qishi/*` · `src/gate/*`
- `src/phone-shell/apps-catalog.js` · `os-prefs.js` · `phone-shell.js` · `app-screens.js`
- `docs/LOCAL_CHAT_ASSISTANT.md` · `public/extensions/sample-calendar-token*`
- `scripts/verify-align-f7.mjs` · `package.json` `verify:align-f7`
