# Billing v1 — final product contract

## Product definition

月栖没有传统订阅系统。用户可以免费使用本地 / BYOK 能力，也可以购买
Billing Credits 使用 Nyra Hosted。Credits 是文本、图片、语音、Agent 等托管
算力的统一消费单位。首次真实购买 Credits 后，账号永久获得 Nyra Member
身份标识；该标识不参与计费或权限判断。人民币通过外部购买的兑换码到账，
美元通过 Whop 支付；两条支付链最终进入同一个 Billing Ledger。NyraCoin
属于独立关系玩法经济，与 Billing Credits 永不兑换、永不共用账表。

## Invariants

- `paidMember = memberSince != null = lifetimePaidCredits > 0`。
- 只有 `whop` 和 `redeem_code` 的真实 purchase 可以首次写入 `memberSince`。
- Hosted 权限只检查在线账号和 `available = balance - reserved`，不检查会员。
- Ledger 是事实来源；wallet balance / reserved 是事务内维护的缓存。
- 所有 grant、usage、reserve、settle、release 都只能由服务端执行。
- 每个支付渠道的 external ID、每个 usage reference ID、每个兑换码只能结算一次。
- 离线模式没有云端 userId 或伪 token；仅允许本地数据和 BYOK。
- 旧 `productMode`、`subscription` 字段只用于迁移读取，不得产生新产品状态。

## Server records

- `users`: 账号、密码摘要、`memberSince`、`lifetimePaidCredits`。
- `billingWallets`: `balance`、`reserved`、`updatedAt`。
- `billingLedger`: 不可变 purchase / usage / refund / bonus / correction。
- `redeemCodes`: 只存 SHA-256 code hash、额度、状态、渠道和兑换归属。
- `purchaseOrders`: pending / completed / failed / refunded，渠道 external ID 幂等。
- `usageEvents`: Hosted 消耗及其 ledger / reservation 关联。

- 当前生产权威账本是独立 Postgres（`YUEQI_BILLING_DATABASE_URL`），不是
  CogPrism `ai_memory_os` / `StudioUser.credits`。JSON store 只保留账号会话，
  并作为一次性导入源；导入默认 dry-run、校验 checksum，且不删除 JSON。

## Public API

- `GET /billing/summary`
- `GET /billing/ledger`
- `POST /billing/redeem`
- `POST /billing/whop/checkout`
- `POST /billing/whop/webhook`（Whop Standard Webhooks 签名验证）
- `POST /agent/runs`（Hosted Agent 预授权；服务端决定 `maxCredits`）
- `POST /agent/runs/:id/finalize`（按服务端累计子用量结算 / 释放）

`grantCredits`、`grantPaidCredits`、`chargeUsage`、reserve / settle / release 是服务端
模块接口，不是客户端 API。Agent 子调用通过 `POST /model/chat` 携带 opaque
`agentRunId` 记账，客户端不得提交最终费用。

## Client surface

- 注册赠送：每个账号首次发放 ¥2 面额 Credits（默认 `creditCny=0.01` → 200），
  `source=signup` / `referenceId=signup_bonus:${userId}`，类型 `bonus`，
  **不**写入 `memberSince`。登录与 `/auth/me` 幂等补发，已有记录则跳过。
- App 左侧菜单显示剩余积分、模型来源（Hosted / 自带 API）；仅 Hosted 再显示
  「充值」和档位（Standard / High）。账号子页不再重复这两套选择。
  点击余额打开积分概览，充值进入独立充值页，再选额度与支付方式。
- App：`我的` 首页「账户」组的「积分与账户」行是一级入口，右侧直显可用余额；
  点进 `data-settings-view="credits"` 子页只看余额与明细；「充值」再打开额度与付款方式。
- 小手机：`设置 → 模型来源` 下方内联挂载同一块面板。
- `openCreditsSurface()` 通过 `yueqi:open-settings-route` 事件跳转，两种壳都可用；
  402 弹层与预授权弹层不得硬编码语言，按 `document.documentElement.lang` 取文案。
- 档位选择只对 Whop 生效；兑换码到账额度以码本身为准，界面必须显式说明并在
  到账额度与所选档位不一致时提示。
- `BILLING_CHECKOUT.whopEnabled` 为 false 时不展示美元价格。

## Hosted model pricing

Nyra Hosted launch is **Volcengine Ark only** and **Standard / High only**.
Users never see provider or modelId. Server maps the selected tier + capability
to a fixed Ark model, then bills that modelId from real usage. There is no
intelligent router, dual-model chain, Seed-Evolving, auto-degrade, or A/B.

| tier | Character | task / vision | image |
|---|---|---|---|
| Standard | Seed 2.1 Turbo | Seed 2.1 Turbo | Seedream 5.0 Lite |
| High | Seed 2.1 Pro | Seed 2.1 Pro | Seedream 5.0 Pro |

Internal summary / classification always uses Seed 2.0 Mini and is **not**
charged as its own user line. TTS/STT are **not** Hosted yet.

Usage → Credits only via the modelId that actually ran, using official Ark
list prices in `server/billing/hosted-catalog.mjs`. Tiers do not have a flat
Credit price. Global OpenAI cost env vars are not used. Missing Ark key or
an unknown modelId fails closed.

Official rates retrieved 2026-08-15 from
[AI Hub](https://ai.volcengine.com/model),
[豆包产品页](https://www.volcengine.com/product/doubao),
and [扣子内置集成价目](https://docs.volcengine.com/docs/84458/2123431?lang=zh)
(same Doubao 2.0 token bands). Formula:

```
Credits = ceil(providerCostCny * markup / creditCny)
markup default 2    (YUEQI_BILLING_MARKUP)
creditCny default 0.01  (YUEQI_CREDIT_CNY)
floor 1 Credit
```

| modelId | official supplier rate | source |
|---|---|---|
| `doubao-seed-character-260628` | 输入 0.8起 / 输出 2起 元/百万 tokens | 豆包产品页 |
| `doubao-seed-2-1-turbo-260628` | 输入 3 / 输出 15 元/百万 tokens | AI Hub |
| `doubao-seed-2-1-pro-260628` | 输入 6 / 输出 30 元/百万 tokens | AI Hub |
| `doubao-seed-2-0-mini-260428` | ≤32k: 0.2 / 2；32–128k: 0.4 / 4；128–256k: 0.8 / 8；缓存 0.04 / 0.08 / 0.16 | AI Hub + 扣子价目 |
| `doubao-seedream-5-0-260128` | 0.22 元/张（文生图 / 图生图） | AI Hub |
| `doubao-seedream-5-0-pro-260628` | 输出 0.30 元/张 + 参考图 0.02 元/张 | AI Hub |

Mini bills the official input-length band from `prompt_tokens` when a price is computed; Hosted does not charge that line to the user. Cache-hit tokens use the published cache rate when Ark returns `cached_tokens`. Turbo / Pro / Character have no published cache band on AI Hub, so cached tokens bill at the input rate.

## Errors

Hosted 余额不足统一返回 HTTP `402`：

```json
{
  "error": "credits_exhausted",
  "message": "Credits 不足，请获取 Credits 或使用自己的 API。",
  "required": 40,
  "available": 17
}
```

客户端必须显示获取 Credits 与切换 BYOK 两个动作。

## External evidence boundary

Whop 代码和幂等测试通过不代表真实收款已打通。只有配置真实
`WHOP_API_KEY`、`WHOP_WEBHOOK_SECRET`、`WHOP_ACCOUNT_ID`、
`WHOP_PRODUCT_ID`，并完成 sandbox / live 支付与重复 webhook 外部证据后，才能
声明 Whop 可用。
