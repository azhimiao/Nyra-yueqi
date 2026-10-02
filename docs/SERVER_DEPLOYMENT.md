# 月栖商业网关部署

## 当前产品契约

- 在线 Billing 和 Nyra Hosted 必须绑定月栖账号；离线模式可使用本地数据和 BYOK。
- `byok`：用户在客户端保存自己的兼容 API 配置，上游凭证不写入服务端数据库。
- `hosted`：模型、TTS、STT、生图凭证只存在服务器环境变量，统一消耗 Billing Credits。
- 没有 Subscription。Hosted 只检查可用 Credits；Nyra Member 只由首次真实购买写入。
- 聊天按 provider cost / usage 换算 Credits；生图使用 reserve → settle / release。

## 1. 服务器准备

建议使用 Ubuntu 24.04、Node.js 22 LTS、Nginx 和 systemd。将代码部署到例如 `/opt/yueqi`，然后执行：

```bash
cd /opt/yueqi
npm ci --omit=dev
sudo mkdir -p /var/lib/yueqi
sudo chown -R yueqi:yueqi /var/lib/yueqi /opt/yueqi
```

复制 `.env.example` 为 `/etc/yueqi.env`。至少填写：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
YUEQI_PUBLIC_SERVER=1
YUEQI_CORS_ORIGINS=https://app.example.com
YUEQI_DATA_FILE=/var/lib/yueqi/store.json
YUEQI_ECONOMY_DATA_FILE=/var/lib/yueqi/economy.json
YUEQI_AUTH_SECRET=替换为至少32字节随机值
YUEQI_ADMIN_TOKEN=替换为独立的至少32字节随机值

YUEQI_MODEL_BASE_URL=https://api.openai.com/v1
YUEQI_MODEL_API_KEY=稍后填写
YUEQI_MODEL=gpt-4.1-mini

YUEQI_TTS_PROVIDER=OpenAI
YUEQI_TTS_API_KEY=稍后填写
YUEQI_TTS_MODEL=gpt-4o-mini-tts
YUEQI_STT_API_KEY=稍后填写

YUEQI_IMAGE_BASE_URL=https://api.openai.com/v1
YUEQI_IMAGE_API_KEY=稍后填写
YUEQI_IMAGE_MODEL=gpt-image-1
```

不要把 `/etc/yueqi.env`、任何 API Key、`YUEQI_AUTH_SECRET` 或 `YUEQI_ADMIN_TOKEN` 放进 APK、Web 前端或 Git。

## 2. systemd

创建 `/etc/systemd/system/yueqi.service`：

```ini
[Unit]
Description=Yueqi commercial API gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=yueqi
Group=yueqi
WorkingDirectory=/opt/yueqi
EnvironmentFile=/etc/yueqi.env
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

启动并检查：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now yueqi
sudo systemctl status yueqi
curl http://127.0.0.1:8787/health
```

生产健康检查应返回 `"mode":"public"`。公网模式不会暴露 `/local/session` 本机令牌。

## 3. Nginx 与 HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
        proxy_buffering off;
    }
}
```

只开放 80/443；不要把 8787 直接暴露到公网。用 Certbot 配置证书并开启自动续期。

## 4. 构建 App

打 APK 前给前端写入公网 HTTPS 地址：

```dotenv
VITE_YUEQI_SERVICE_BASE=https://api.example.com
```

然后执行：

```bash
npm ci
npm run build:android
```

这个地址会进入构建产物；服务端密钥不会。换服务器地址后需要重新构建 APK，或者后续增加受控的环境切换配置。

## 5. 兑换码与测试 Credits

Catfk 商品与固定面额：

- `deep` / `x9xoie` / <https://catfk.com/item/x9xoie> → 8,000 Credits
- `daily` / `991xdy` / <https://catfk.com/item/991xdy> → 3,500 Credits
- `light` / `feshql` / <https://catfk.com/item/feshql> → 1,000 Credits

部署后在服务器生成待上传到 Catfk 的卡密库存（每行一个兑换码）：

```bash
cd /opt/yueqi
set -a
. /etc/yueqi.env
set +a

npm run billing:generate-codes -- \
  --package deep \
  --count 100 \
  --output /var/lib/yueqi/catfk-x9xoie-8000.txt
```

另外两档将 `--package` 和文件名改成：

```bash
npm run billing:generate-codes -- \
  --package daily --count 100 \
  --output /var/lib/yueqi/catfk-991xdy-3500.txt

npm run billing:generate-codes -- \
  --package light --count 100 \
  --output /var/lib/yueqi/catfk-feshql-1000.txt
```

输出文件权限为 `0600`，脚本不会在终端打印明文卡密，也不会覆盖已有文件。
数据库只保存卡密的 SHA-256 摘要。把文件导入对应 Catfk 商品后，应将服务器上的
明文文件转移到受控离线备份或安全删除。

也可通过管理员 API 一次生成最多 500 个；响应中的 `batch.codes` 只出现一次：

```bash
curl -X POST http://127.0.0.1:8787/admin/billing/redeem-code-batches \
  -H 'Content-Type: application/json' \
  -H 'X-Yueqi-Admin-Token: 你的管理员令牌' \
  -d '{"packageId":"deep","count":100}'
```

仅用于测试的 bonus / correction：

```bash
curl -X POST https://api.example.com/admin/billing/grants \
  -H 'Content-Type: application/json' \
  -H 'X-Yueqi-Admin-Token: 你的管理员令牌' \
  -d '{"userId":"user-id","credits":100,"type":"bonus","referenceId":"dev-20260815-1"}'
```

管理员接口不能由客户端直接调用，也不能把管理员令牌放进 App。真实 Whop
支付只由验签后的 `payment.succeeded` webhook 调用统一 grant。

## 6. 上线前边界

Billing Credits 已使用 `YUEQI_BILLING_DATABASE_URL` 指向的独立 PostgreSQL
账本。账号、会话、设备注册和同步数据仍在单进程 `store.json`，因此当前服务仍
不能横向扩容。继续上线前应保持：

- Nyra billing 数据库与 CogPrism `ai_memory_os` 完全分离；
- `pg_dump` 与 JSON 文件的协同备份、恢复演练和密钥轮换；
- `/admin` 路由的内网隔离或独立管理服务。

在账号与会话迁移 PostgreSQL 之前，systemd 只运行一个 Node 进程，不要用
PM2 cluster 或多个容器共享同一个 JSON 文件。
