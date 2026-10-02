# Deployment

Canonical longer form in source: `docs/SERVER_DEPLOYMENT.md`.

## Topology

```text
Browser/App ──HTTPS──► Nginx ──► Node server/index.mjs (127.0.0.1:8787)
                                      │
                                      ├ store.json / economy.json (durable disk)
                                      └ upstream model/TTS/STT/image APIs
```

Static web：`npm run build` → `www/`（可由 Nginx 同域或 CDN 托管）。  
Capacitor 包内嵌 `www/`；**生产必须**把 `VITE_YUEQI_SERVICE_BASE` 指到可达 HTTPS 网关。

## Required server env

| Var | Purpose |
|-----|---------|
| `YUEQI_AUTH_SECRET` | 会话签名（≥32B） |
| `YUEQI_ADMIN_TOKEN` | 管理激活订阅等 |
| `YUEQI_CORS_ORIGINS` | 允许的前端 Origin |
| `YUEQI_DATA_FILE` | 账号库路径 |
| `YUEQI_ECONOMY_DATA_FILE` | 经济账本 |
| `YUEQI_PUBLIC_SERVER=1` | 公网模式 |

### Managed subscription extras

`YUEQI_MODEL_BASE_URL`, `YUEQI_MODEL_API_KEY`, `YUEQI_MODEL`,  
`YUEQI_SPEECH_*`（Hosted 语音，凭据+单价缺一即关闭）, `YUEQI_IMAGE_*`,  
可选检索：`BRAVE_API_KEY` / `TAVILY_API_KEY`

### Local Ark tooling (not required for gateway)

`ARK_API_KEY`, `ARK_IMAGE_MODEL`, `ARK_BASE_URL` — 用于 `generate:xingli` 等脚本。

## Product modes reminder

- **developer:** 客户端 BYOK，服务器不存用户供应商 Key  
- **subscription:** 只用服务器 Key；客户端提交的供应商 Key 忽略；需有效订阅+积分  

## Never deploy

- 明文密钥进 APK / JS bundle  
- `server/data/*.json` 进客户端  
- 未设 CORS 的 `YUEQI_PUBLIC_SERVER` 裸奔  

## Health

网关提供 health/info（见 `server/index.mjs`）；部署后用 HTTPS 探活。

## Android / iOS

- `npm run build && npx cap sync`  
- Overlay / 前台服务权限见 `ANDROID_OVERLAY_PLAY_CHECKLIST.md`  
- OEM 差异：`ANDROID_OEM_TEST_MATRIX.md`
