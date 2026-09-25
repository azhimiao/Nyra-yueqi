<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="Yueqi" />
</p>

<h1 align="center">Yueqi</h1>

<p align="center">The open-source, local-first AI companion.</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README.en.md">English</a>
</p>

Chat, characters, and memory stay on your device. Bring your own OpenAI-compatible API. This source tree has no cloud login and no paid credits.

---

### Run

Requires **Node 20+**.

```bash
git clone https://github.com/azhimiao/Nyra-yueqi.git
cd Nyra-yueqi
cp .env.example .env
npm install
npm start
```

- App: http://127.0.0.1:5173
- Local gateway: http://127.0.0.1:8787

First launch: pick a language, then App or Mini Phone. Open **API** and set Base URL, API key, and model.

Or run the two processes yourself:

```bash
npm run server
npm run dev
```

> [!TIP]
> Keep keys in local `.env` or Settings. Never commit them.

### Install

The store / website / GitHub Release APK is the commercial build (login, hosted models, Credits). It is not built from this source:

https://download.memprism.com/nyra-latest.apk

https://github.com/azhimiao/Nyra-yueqi/releases/latest

Build a debug APK from this repo:

```bash
npm run build:android
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (`app.yueqi.open`).

### What you get

- **Pop chat** — local conversations; Conversation V2 is the write authority
- **Character cards** — persona, address, memory; pet look is not identity
- **Two shells** — App and Mini Phone
- **Scenario theater** — its own cast and relationship, not a continuation of daily chat
- **Character World and market** — local, no cloud account
- **BYOK** — the gateway forwards your request; keys are not stored in a server DB

### What this is not

- Cloud login / register
- Hosted models
- BillingCredit
- The paid edition (that is the website APK)

This is a standalone free source tree, not a deleted-source dump of the paid edition.

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

[MIT](./LICENSE) · [Terms and privacy](https://azhimiao.github.io/legal/)
