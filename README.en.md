<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="Yueqi" />
</p>

<h1 align="center">Yueqi</h1>

<p align="center">A lamp left on at night. The person stays. So does the day.</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/azhimiao/Nyra-yueqi/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/azhimiao/Nyra-yueqi?style=social"></a>
</p>

Yueqi is a companion that stays on your own device. Chat, characters, and the days you share are kept locally. Bring an OpenAI-compatible API. This source tree has no cloud account and no paid credits.

If the lamp reaches you, leave a [Star](https://github.com/azhimiao/Nyra-yueqi). It stays at the top of the page, like someone passing by and turning the wick up.

---

### Highlights

- **Two rooms.** The App is the wide room. The Mini Phone fits in the hand. One life, two ways to open the door.
- **The character lives on the card.** Name, address, persona, and memory travel with them. The desktop pet is the figure by the window: the look can change, the person does not.
- **A thread that belongs to the two of you.** Everyday talk lives in Pop. The conversation is written on the device. Close the page, and the words remain.
- **Days spent together.** Diary, world book, listening, reading, the album, and the calendar sit on the same table.
- **A phone you can arrange.** Home widgets can move, and you can bring in one of your own.
- **Another play, another stage.** Scenario theater keeps its own cast and relationships, apart from daily companionship.
- **The key stays with you.** Requests go from this device to your own API. The key remains local.

### Run

Requires **Node 20+**.

```bash
git clone https://github.com/azhimiao/Nyra-yueqi.git
cd Nyra-yueqi
cp .env.example .env
npm install
npm start
```

Open http://127.0.0.1:5173. After you pick a language and a room, open **API** and fill in your own address, key, and model.

> [!TIP]
> Keep keys in local `.env` or Settings. Never commit them.

### Install

To move in first, use the commercial build. Login, hosted models, and Credits live in that package:

https://download.memprism.com/nyra-latest.apk

https://github.com/azhimiao/Nyra-yueqi/releases/latest

This repository is for running and changing the source yourself. Debug build:

```bash
npm run build:android
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (`app.yueqi.open`).

### The edge of this source

Cloud login, hosted models, and BillingCredit live in the website package. Memory palace and turn orchestration are not in this tree. Chat carries the character card and recent messages. See [OPEN_SOURCE.md](./OPEN_SOURCE.md).

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

If you are still here, leave a [Star](https://github.com/azhimiao/Nyra-yueqi). The lamp is still on.

[MIT](./LICENSE) · [Terms and privacy](https://azhimiao.github.io/legal/)
