<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="月栖" />
</p>

<h1 align="center">月栖</h1>

<p align="center">夜里留一盏灯。人在，日子也在。</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/azhimiao/Nyra-yueqi/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/azhimiao/Nyra-yueqi?style=social"></a>
</p>

月栖是一处留在你自己设备上的陪伴。聊天、角色和日子都收在本地。模型接口由你带来，OpenAI 兼容即可。这份源码没有云账号，也没有付费积分。

如果这盏灯也照到了你，请给仓库点一颗 [Star](https://github.com/azhimiao/Nyra-yueqi)。星星会留在页顶，像有人路过，把灯芯拨亮了一下。

---

### 亮点

- **两处居所。** 大屏是 App，掌上是小手机。同一段生活，两种打开的方式。
- **角色住在卡里。** 名字、称呼、人设和记忆跟着角色走。桌宠负责在窗边出现：样子可以换，人还是那个人。
- **一条只属于你们的消息。** 日常说在 Pop 里。会话写在本机，合上页面，话还在。
- **日子是一起过的。** 日记、世界书、一起听、一起看、相册和日历，铺在同一张桌上。
- **小手机可以自己布置。** 桌面上的组件能换位置，也能导入你自己的一块。
- **另一出戏，另开一场。** 情景剧带着自己的人物和关系，不接着日常陪伴往下演。
- **钥匙在你手里。** 请求从这台设备发到你自己的 API。密钥留在本机。

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

想先住进来，可以用官网的商业版。登录、托管模型和积分都在那一份安装包里：

https://download.memprism.com/nyra-latest.apk

https://github.com/azhimiao/Nyra-yueqi/releases/latest

这份仓库用来自己跑、自己改。Debug 包：

```bash
npm run build:android
```

产物在 `android/app/build/outputs/apk/debug/app-debug.apk`，包名 `app.yueqi.open`。

### 这份源码的边界

云登录、托管模型和 BillingCredit 在官网安装包里。记忆宫殿和回合编排的实现没有放进这份源码，聊天带着角色卡和最近的消息。细节见 [OPEN_SOURCE.md](./OPEN_SOURCE.md)。

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

愿意的话，再点一次 [Star](https://github.com/azhimiao/Nyra-yueqi)。灯还亮着。

[MIT](./LICENSE) · [用户协议与隐私政策](https://azhimiao.github.io/legal/)
