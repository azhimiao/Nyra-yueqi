# 月栖游戏包模板（YEOS）

把本目录打成 zip（**根目录直接是 `manifest.json`**），后缀建议 `.yueqi-game.zip`。

```text
manifest.json
game.html
icon.svg          # 可选
README.md
```

1. 修改 `manifest.json` 的 `id` / `name` / `permissions`。  
2. 编辑 `game.html`，只通过 `window.NyraGame` 访问角色与模型。  
3. 栖市 → 侧载 → 打开试玩。  

完整 API 见 [`docs/sdk/YUEQI_EXPERIENCE_OS.md`](../../docs/sdk/YUEQI_EXPERIENCE_OS.md)。
