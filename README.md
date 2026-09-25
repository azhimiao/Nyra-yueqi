<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="月栖" />
</p>

<h1 align="center">月栖</h1>

<p align="center">开源的本地优先 AI 陪伴。</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README.en.md">English</a>
</p>

聊天、角色、记忆都在你自己的设备上。模型接口你自带（OpenAI 兼容）。没有云登录，没有付费积分。

---

### 运行

需要 **Node 20+**。

```bash
git clone https://github.com/azhimiao/Nyra-yueqi.git
cd Nyra-yueqi
cp .env.example .env
npm install
npm start
```

- 界面：http://127.0.0.1:5173
- 本机网关：http://127.0.0.1:8787

第一次打开：选语言，再选 App 或小手机。到 **接口** 填 Base URL、API Key、模型名。

也可以分开跑：

```bash
npm run server
npm run dev
```

> [!TIP]
> 密钥只放在本机 `.env` 或设置页，不要提交到 Git。

### 安装包

官方 Android 包：

https://download.memprism.com/nyra-latest.apk

自己从源码打 Debug 包：

```bash
npm run build:android
```

产物在 `android/app/build/outputs/apk/debug/app-debug.apk`，包名 `app.yueqi.open`。

### 这里有什么

- **Pop 聊天** — 本地会话，Conversation V2 是权威写入
- **角色卡** — 人设、称呼、记忆；桌宠外观不是角色身份
- **双壳** — App 大屏 / 小手机桌面
- **情景剧** — 作品自己的角色和关系，不接着日常陪伴聊天
- **角色世界 · 数字市场** — 本机可用，不需要云账号
- **BYOK** — 请求经本机网关转发到你的 API，密钥不落服务端库

### 这里没有什么

- 云登录 / 注册
- 托管模型与 BillingCredit
- 付费完整版

这是可以独立交付的免费产品形态，不是付费版的删减备份。

### 文档

| 想做的事 | 去哪 |
|---|---|
| 怎么贡献 | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| 报漏洞 | [SECURITY.md](./SECURITY.md) |
| 社区约定 | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) |
| 用户协议 / 隐私 | https://azhimiao.github.io/legal/ |

### 社区

先读 [贡献指南](./CONTRIBUTING.md)。大改动请先开 Issue 对齐，再发 PR。

| 入口 | 内容 |
|---|---|
| GitHub | https://github.com/azhimiao/Nyra-yueqi |
| QQ 群 | 1034044082 |
| Discord | CogPrism |
| 微信 | azhimiaoo |
| QQ | 3804762525 |
| 邮箱 | 3804762525@qq.com |

### 在月栖之上做衍生

如果你的项目名字里带「月栖 / Yueqi / Nyra」，请在 README 写明：**不是月栖官方项目，与本仓库无隶属关系。**

---

[MIT](./LICENSE) · [用户协议与隐私政策](https://azhimiao.github.io/legal/)
