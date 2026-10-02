# OPENCLAW_MOBILE_PROVENANCE

> CP-5.5 · 2026-07-30 · UTF-8

## 上游

| 项 | 值 |
|----|-----|
| 包 | `openclaw@2026.7.1-2` |
| 嵌套 | `@openclaw/ai@2026.7.1-2` |
| License | MIT（`vendor/openclaw-agent-mobile/LICENSE`） |
| 来源安装 | `F:\clawtry\app\node_modules\openclaw` |

## 公开符号 → 哈希 chunk

| 公开 export | 映射 chunk（本版本） | 导出别名 |
|-------------|----------------------|----------|
| `openclaw/plugin-sdk/agent-core` | `dist/proxy-BzhBz8iM.js` | `at`→`runAgentLoop`, `H`→`convertToLlm` |
| `openclaw/plugin-sdk/llm` | `dist/validation-DQFzVcBb.js` | `i`→`createAssistantMessageEventStream` |

## Vendoring

路径：`vendor/openclaw-agent-mobile/`

| 文件 | 说明 |
|------|------|
| `UPSTREAM_VERSION` | `openclaw@2026.7.1-2` |
| `LICENSE` | 上游 MIT 副本 |
| `PATCHES.md` | 仅 kill-tree import 改写 |
| `MANIFEST.json` | 复制文件清单 |
| `dist/*` | BFS 自 proxy+validation；算法未改 |
| `dist/kill-tree-mobile-stub.js` | **新** fail-closed stub |

## 环境依赖改动（非算法）

| 上游 | 移动端 |
|------|--------|
| `./kill-tree-*.js` | `./kill-tree-mobile-stub.js`（抛错） |
| `node:child_process` 等 | Vite alias → `src/integrations/openclaw-mobile/shims/*` |

## 未做

- 未根据文档重写 Agent Loop  
- 未恢复 rescue 自研 Runtime  
- 未嵌入完整 302 MB 安装树  
- 未把 stub 静默伪造成功  
