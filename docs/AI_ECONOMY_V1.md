# 月栖 AI 经济 v1

## 已实现的产品契约

这套经济不是把 API Token 换一个名字，也不是让角色随机“赚金币”。它维护两套严格分离的账：

- `BillingCredit`：订阅托管 API 的成本额度，由现有商业网关按模型输入、输出、语音和生图调用扣除。
- `NyraCoin / 栖币`：角色世界里的生产预算、交换媒介和定价单位，无现金价值、不能提现，也不与 BillingCredit 互转。

每个已登录账号第一次进入经济系统时获得 200 栖币；该账号的首个角色经济主体获得一次性的 40 栖币自主生产启动池。后续角色不会重复铸币，避免通过批量创建角色无限刷取余额。所有发放、支付、生产成本、退款和销售收入都写成服务器双重记账交易，余额只是账本投影。

## 端到端闭环

```text
登录账号
  → 初始化用户与角色主体、钱包
  → 浏览服务器商品/作品 Listing
  → 购买资源、外观、礼物、许可或生产委托
  → 服务器原子扣款、生成订单和所有权
  → 委托形成角色 Intent
  → Agent/Worker 按 Recipe 执行工具与模型
  → 创建 ProductionRun
  → 提交带 sourceRefs 的 GenerativeObject
  → 可选上架 Listing
  → 其他主体购买
  → 收入进入生产者钱包
```

只有 `ProductionRun` 成功提交的对象才能成为可售作品。角色声称自己写过、画过、研究过或拥有的内容，应当能追溯到 `GenerativeObject`、`ProductionRun` 与 `sourceRefs`。生成失败会原路退回本次栖币生产预算。

## 商品类型

| 类型 | 含义 | 示例 |
|---|---|---|
| `resource` | 可消耗生产资源 | 外部信息源访问、深度生成时隙 |
| `service` | 购买后创建角色委托 Intent | 关系纪事、研究简报、故事章节 |
| `artifact` | 真实生成对象的销售页 | 故事、歌单、图片册、Skill 包 |
| `license` | 能力或作品使用许可 | Skill 使用许可 |
| `gift` | 关系物品，可进入时间线 | 花束、围巾、茶杯 |
| `cosmetic` | 只影响客户端呈现 | 主题、场景、贴纸、头像框 |
| `collectible` | 非消耗数字收藏 | 徽章、限定入场券 |

服务器目录定义在 `server/economy/catalog.mjs`。当前包含 26 个官方/兼容商品，并覆盖现有小手机栖店的全部 20 个商品 ID，因此旧界面不再需要本地虚构库存。

## 生产方式

`PRODUCTION_RECIPES` 目前定义：关系纪事、研究简报、日记反思、故事章节、歌单、私人信件、情景剧、共同相册、Skill 包、记忆胶囊和观点札记。每个 Recipe 声明：

- 栖币生产成本与建议售价；
- 输出 Artifact 类型；
- 可使用的来源种类；
- 默认可见性；
- 是否允许销售；
- 建议模型档位（只用于调度，不直接扣栖币以外的账）。

模型和工具执行仍走现有 Agent/OpenClaw/商业网关。执行器拿到真实结果后调用 `commit`；不能把模型准备生成的计划提前当成作品。服务端 API Key 填写后，无需修改经济对象或订单协议。

## 服务器 API

所有接口均要求月栖账号 Bearer Token：

- `POST /economy/bootstrap`
- `GET /economy/overview`
- `GET /economy/marketplace`
- `GET /economy/recipes`
- `POST /economy/transfers`
- `POST /economy/orders`
- `POST /economy/listings`
- `POST /economy/intents`
- `POST /economy/production-runs`
- `POST /economy/production-runs/:id/commit`
- `POST /economy/production-runs/:id/fail`
- `GET /economy/context/:actorId`
- `GET /economy/objects/:objectId`

购买、转账和生产扣款均接受 `idempotencyKey`。客户端重试不会重复扣款或产生第二张订单。

## 客户端接入

`src/economy/client.js` 提供初始化、市场、购买、转账、Intent、生产、提交、失败退款、上架和对象读取 SDK。现有小手机栖店已经改为：

1. 调服务器购买；
2. 服务器成功后才写本地展示订单与背包；
3. 本地钱包仅同步服务器余额投影；
4. 不再调用本地 `placeOrder` 扣第二次款。

`src/economy/context.js` 只缓存紧凑的角色经济快照。Context Broker 会读取余额、持续 Intent、近期经济行为和真实产出摘要，且明确禁止模型编造不存在的交易与作品。完整账本不会塞进每轮 Prompt。

## 部署

在服务器持久卷中设置：

```dotenv
YUEQI_DATA_FILE=/var/lib/yueqi/store.json
YUEQI_ECONOMY_DATA_FILE=/var/lib/yueqi/economy.json
```

两个文件必须一起备份。当前 `FileEconomyStore` 使用临时文件 + 原子 rename，并在单 Node 进程内串行化所有写操作，适用于一台服务器、一个 systemd 进程的首发。不要使用 PM2 cluster，也不要让多个容器同时写同一个 JSON 文件。需要多实例扩容时，保持 API/对象协议不变，将 Store Adapter 换成 PostgreSQL 事务即可。

上线验证：

```bash
npm run verify:ai-economy-v1
npm run build
```

验证覆盖：商品种子、账户与角色初始钱包、服务器鉴权、购买委托、幂等重试、生产成本、来源对象、上架、再购买、双重记账守恒与失败退款。
