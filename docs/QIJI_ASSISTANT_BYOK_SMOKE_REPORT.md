# 栖机助手 BYOK Smoke 报告（CP-6.1）

> 2026-07-30 · UTF-8  
> 自动产物：`.tmp/byok-smoke-report.json`

## 判定

```text
IMPLEMENTED_PENDING_EXTERNAL_BYOK
```

含义：

* BYOK `streamFn` + OpenClaw Mobile `runAgentLoop` **协议闭环已证明**（OpenAI-compatible mock，真实 tool_calls）；
* **Live** 聊天模型凭证不可用：本机 `.env` 仅有火山方舟 **生图** Key；`/chat/completions` 对 chat/functioncall 模型返回 `InvalidEndpointOrModel.NotFound`；
* 不得把 Fake Model 或 mock 当成产品 Live BYOK 通过。

## 脱敏 Provider 信息

| 字段 | 值 |
|------|-----|
| Provider 类型 | OpenAI-compatible（ARK_* 尝试） |
| Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| 尝试模型 | `doubao-pro-32k-functioncall-240515`（及若干 catalog 模型） |
| Live 结果 | `BYOK_MODEL_NOT_FOUND` → 任务 `CANDIDATE_MISSING`（不伪造候选） |

报告与日志 **未** 写入 API Key / Authorization / 私密 Prompt。

## 协议 Happy Path（mock，计为适配器证明）

```text
character.inspect → workspace.write_text → candidate → WAITING_FOR_APPROVAL
requests≈3  toolCalls≥2
```

证据：不得发明工具；`requireToolCalls` 时普通文本 → `BYOK_NO_TOOL_CALL`。

## 失败路径（已映射为用户可读文案）

| # | 场景 | 代码 |
|---|------|------|
| 1 | API Key 缺失 | `BYOK_API_KEY_MISSING` |
| 2 | API Key 无效 (401) | `BYOK_API_KEY_INVALID` |
| 3 | 模型不支持 / 无 Tool Call 文本 | `BYOK_NO_TOOL_CALL` / `BYOK_TOOLS_UNSUPPORTED` |
| 4 | Tool 参数 JSON 非法 | `BYOK_TOOL_ARGS_INVALID` |
| 5 | 网络 | `BYOK_NETWORK` |
| 6 | 超时/取消 | `BYOK_TIMEOUT` |
| 7 | 额度 | `BYOK_QUOTA_EXCEEDED` |
| 8 | 模型不存在 | `BYOK_MODEL_NOT_FOUND` |

未退化成「自由文本描述工具 → 客户端猜测执行」。

## 升级条件

配置可用的 `YUEQI_MODEL_BASE_URL` + `YUEQI_MODEL_API_KEY` + **支持 Tool Calling 的** `YUEQI_MODEL` 后重跑：

```bash
npm run verify:qiji-assistant-byok
```

Live 成功且无伪造候选时，可将本报告改为 `PASSED_BYOK`。
