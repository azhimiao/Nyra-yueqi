<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="Yueqi" />
</p>

<h1 align="center">Yueqi</h1>

<p align="center">Long-term company. Switch between characters anytime.</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/azhimiao/Nyra-yueqi/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/azhimiao/Nyra-yueqi?style=social"></a>
</p>

Yueqi is for staying with someone over time. Keep several characters, and switch with one tap. Each one keeps their own chat and memory. Data stays on your device. Bring your own OpenAI-compatible API. No cloud account, and no paid credits.

If it fits, leave a [Star](https://github.com/azhimiao/Nyra-yueqi).

<p align="center">
  <img src="docs/assets/readme/board.en.svg" width="880" alt="Keep talking, switch characters, two screens, your API">
</p>

The desktop pet is only a look. Changing it does not change who the character is. Diary, world book, listening, reading, the album, and the calendar sit alongside the chat. Scenario theater keeps its own cast.

### Run

Requires **Node 20+**.

```bash
git clone https://github.com/azhimiao/Nyra-yueqi.git
cd Nyra-yueqi
cp .env.example .env
npm install
npm start
```

Open http://127.0.0.1:5173. After you pick a language and App or Mini Phone, open **API** and fill in your own address, key, and model.

> [!TIP]
> Keep keys in local `.env` or Settings. Never commit them.

### Memory

A long companionship does not work by pouring every old message into the model at once.

Each character carries a card. The origin memories on that card are their own past, written by the author ahead of time. What the two of you have actually said is stored apart, and only for that person. Switch characters, and you switch both the conversation and the memory.

When the next line is due, the old store does not flood in. Memories sit on the device in a palace of drawers. A light lexical search picks a few that might matter, then checks whether this sentence really touches them. Only the ones that match come into the turn. An open question, such as "what do you remember", can bring back real memories. A specific question that does not meet the text is left empty. A nearby-looking record is not used to fill the gap.

The world book holds setting. The diary and the album are evidence from the days you shared. They stay separate from the character's origin, and from any other character's memory.

In the code you clone here, the model sees the character card and the recent conversation. The retrieval that lifts older memories out of the drawers is not in this repository. See [OPEN_SOURCE.md](./OPEN_SOURCE.md).

### Docs

| Need | File |
|---|---|
| How to contribute | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Vulnerability reports | [SECURITY.md](./SECURITY.md) |
| Community rules | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) |
| Terms / privacy | https://azhimiao.github.io/legal/ |

### Community

Read the [contributing guide](./CONTRIBUTING.md) first. Open an Issue before large changes.

| Channel | Value |
|---|---|
| GitHub | https://github.com/azhimiao/Nyra-yueqi |
| QQ group | 1034044082 |
| Discord | CogPrism |
| WeChat | azhimiaoo |
| QQ | 3804762525 |
| Email | 3804762525@qq.com |

### Building on Yueqi

If your project name includes Yueqi / 月栖 / Nyra, add a README note: **not an official Yueqi project, not affiliated with this repository.**

---

If it is useful, leave another [Star](https://github.com/azhimiao/Nyra-yueqi).

[MIT](./LICENSE) · [Terms and privacy](https://azhimiao.github.io/legal/)
