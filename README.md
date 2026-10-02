<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="月栖" />
</p>

<h1 align="center">月栖</h1>

<p align="center">长期陪伴。多个角色，随时切换。</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/azhimiao/Nyra-yueqi/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/azhimiao/Nyra-yueqi?style=social"></a>
</p>

月栖用来长期陪着你。可以同时留着很多个角色，点一下就换到另一个人，聊天和记忆各自保存。数据在你自己的设备上。模型接口自己带，OpenAI 兼容就行。没有云账号，也没有付费积分。

用着觉得对，就给这个仓库点个 [Star](https://github.com/azhimiao/Nyra-yueqi)。

<p align="center">
  <img src="docs/assets/readme/board.zh.svg" width="880" alt="长期聊、多个角色、两个界面、自己的接口">
</p>

桌宠只管样子，换外观不换角色。日记、世界书、一起听、一起看、相册、日历都在旁边。情景剧的人物和关系不接到日常陪伴上。

### 运行

需要 **Node 20+**。

```bash
git clone https://github.com/azhimiao/Nyra-yueqi.git
cd Nyra-yueqi
cp .env.example .env
npm install
npm start
```

打开 http://127.0.0.1:5173 。选好语言和要进的界面之后，到 **接口** 填上你自己的地址、密钥和模型名。

> [!TIP]
> 密钥只放在本机 `.env` 或设置页，不要提交到 Git。

### 记忆

陪得久，靠的不是把以前的话一次全倒给模型。

每个角色自己带着一张卡。卡上的起源记忆是这个人的身世，作者事先写好的。你们真正说过的话另记一处，只属于这个人。换一个角色，就换一套聊天，也换一套记忆。

下一句要说的时候，旧事不会整库涌进来。记忆放在本机的宫殿里，按抽屉收着。先用很轻的字面检索找出可能相关的几条，再看这句话有没有真的提到那些事。对得上，才带进这一轮。问得很开，比如「你记得什么」，可以带回真实记得的内容。问的是一件具体的事，原文里对不上，这一轮就空着，不拿一条看起来相近的记录去填。

世界书管设定。日记和相册是日子里留下的证据。这几样和角色的身世分开存，也不会跟另一个角色的记忆混在一起。

你拉下来的这份代码，模型看到的是角色卡和最近的对话。把旧事从抽屉里捞出来的检索没有放进仓库，说明在 [OPEN_SOURCE.md](./OPEN_SOURCE.md)。

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

觉得有用，再点一次 [Star](https://github.com/azhimiao/Nyra-yueqi)。

[MIT](./LICENSE) · [用户协议与隐私政策](https://azhimiao.github.io/legal/)
