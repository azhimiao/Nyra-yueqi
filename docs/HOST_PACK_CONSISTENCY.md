# Android / Windows 角色包一致性验收（Phase 1–2）

同一角色包应在 Web 预览、Android 系统悬浮、Windows 桌宠上呈现一致外表与动作符号。

## 步骤

1. 在 Web / Electron 主界面导出角色包 ZIP（含外表素材）
2. **Windows**：`npm run desktop` → 导入角色包 → 显示桌宠 → 确认立绘、缩放、说话态
3. **Android**：`npm run build:android` → 安装 → 导入同一 ZIP → 开启系统悬浮 → 确认立绘与三态
4. 主动消息：两侧气泡文案与 `talking` 态均可触发（失败只降级，不阻断文字）

## 记录

| 包版本 | Windows | Android | 差异 | 日期 |
|--------|---------|---------|------|------|
| | ☐ | ☐ | | |
