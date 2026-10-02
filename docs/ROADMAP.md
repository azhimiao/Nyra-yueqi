# Roadmap — 下一阶段执行顺序

Updated: 2026-08-13

## Priority 0 — 发版诚实性（先做）

1. 维持 cutover profile = `legacy`，直到 C4–C7 真证据齐。  
2. 修 C6 browser E2E（J2/J3/J7/J8/J9 + console/network）。  
3. 补 C4 staging 真搜索结果 JSON。  
4. 补 C5 真浏览器/Android 迁移样本。  
5. 跑 C7 Android 设备旅程。  
6. 再开 C8 release gate。

证据目录：源仓 `docs/qa/product-cutover/`。

## Priority 1 — 模型提供商收敛（产品可用）

用户意向：火山方舟覆盖对话 + 生图（+ 后续语音）。

1. 网关 `/model/chat` 支持 `YUEQI_MODEL_BASE_URL=https://ark.cn-beijing.volces.com/api/v3`。  
2. `/image/generate` 适配 Ark `/images/generations`（尺寸 ≥ 3686400、Seedream 参数）。  
3. 文档化推荐模型 ID（如 `doubao-seed-2-1-turbo-*`、`doubao-seedream-4-5-*`）。  
4. TTS/STT 另开火山语音对接（控制台已开 ≠ 代码已接）。  
5. 密钥仅服务器 / 用户 BYOK，**禁止**写入 Git。

## Priority 2 — 角色视觉冷启动

1. 图库「她自己」必需资产教学（样例三视图）。  
2. 缺身份参考时自拍诚实降级（现可生图但不像）。  
3. 补月栖昼/夜真实动作帧（替换 idle placeholder）。

## Priority 3 — 统一记忆 / Intelligence 开关

仅在 cutover 进入 `internal_v1` / `production_v1` 后：

1. 按 `docs/qa/unified-memory/` 与 companion-intelligence 顺序开 flag。  
2. 禁止默认打开 `palaceProjectionOnlyV1` 而不懂副作用。

## Priority 4 — 债务清理

1. README 对齐 CURRENT_STATE（去掉过时「P0–P7 已实现即可发」语感）。  
2. 合并或标注废弃 agent 路径。  
3. Avatar V2 目录标明 archived。  
4. 缩短默认 `npm run verify` 为「分层 smoke + 按域 full」。

## Do not schedule as “next”

- 把桌宠选型塞回冷启动引导（已否决）。  
- 用 V2 avatar-factory 当质量主轨。  
- 普通聊天自动打亲密度数值。
