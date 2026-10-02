# Avatar Factory V2

锁定栈：AI 关键姿势包 + 程序化面部图层 + Pixi/Canvas + Electron 透明桌宠。  
**禁止** Live2D / Rive / Spine / VRM 阻塞 V1。

## 状态门禁

| Gate | 含义 |
|------|------|
| `contract_green` | 数据合同与校验 |
| `fixture_green` | 三角色 fixture 批处理出包 |
| `runtime_green` | 无硬编码加载/切换 |
| `real_provider_green` | 真图 Provider（需 API Key） |
| `three_character_golden_green` | 真图三角色 |
| `product_integrated_green` | Pop/Artifact 联动 |

## 命令

```bash
npm run avatar:verify-contract
npm run avatar:batch
npm run avatar:verify-runtime
npm run desktop:pet-v2
```

Fixture 包只进 `public/avatar-packs/_fixture/`，`publishable: false`。
