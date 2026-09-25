# 安全说明

## 支持范围

请只报告 **这个开源仓库** 里的漏洞。付费完整版、运营网关、第三方模型厂商不在本页。

## 怎么报告

不要在公开 Issue 里贴密钥、聊天记录或用户数据。

优先走 GitHub Security Advisory（仓库 Settings → Security）。还没有开通前，用 Issue 标 `security`，正文只写复现步骤，不写密钥。

## 已知边界

- 模型 Key 由使用者自己保管。本机网关转发请求，不把用户 Key 写入服务端数据库。
- `backend/data/` 和 `.local-token` 是本机运行时文件，不得提交。
- 对外协议以 https://azhimiao.github.io/legal/ 为准。

## 请不要做的事

- 不要把真实 API Key 写进 PR、截图或 fixture。
- 不要上传用户备份、`.nyra` 快照或聊天导出到本仓库。
