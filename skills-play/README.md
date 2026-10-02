# 探索可玩包（skills-play）

拆成两条路径：

| surface | 去哪 | 包 |
|---|---|---|
| `explore-solo` | 探索 → 单人玩法 → **开始玩** | `midnight-train`, `liars-dice`, `wangpai-stage`, `relationship-intelligence` |
| `pop-social` | 探索 → 一起玩 → **带到 Pop**（私聊/群） | `office-werewolf`（已写入 `src/games/pop-games.js`） |

## 怎么玩

1. **单人**：探索 → 插件市场 → 单人玩法 → 开始玩 → 对话里发「开始」
2. **和伴侣/群**：探索 → 一起玩 → 带到 Pop → 进私聊/群 → **+ → 一起玩**

## 维护

```powershell
node scripts/build-play-packs.mjs
node scripts/verify-play-packs.mjs
```

Surface 定义见 `src/skill-platform/play-surfaces.js`。
