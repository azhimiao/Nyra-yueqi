# Checker · F6 实现自检（R12）

> 评审轮次：**R12**（Impl-F6 落地自检）  
> 日期：2026-07-25  
> 对照：[F6.md](./F6.md) · [_QUALITY_BAR.md](./_QUALITY_BAR.md) · [CHECKER_F6_R2.md](./CHECKER_F6_R2.md)  
> 对象：G1 绘境 · G2 TTS · G3 STT · G5 场景工坊（**无 G4**）

---

## 结论

```
阶段: F6
结论: 放行（R12 · 主 Agent 复核 verify 28/28 + F4–F5 未回归）
质量门槛: U✓ E✓ P✓（P1=N/A；可选投影已用 appendCohabitEvent）
§9 手测: 路径已按文档实现；真机 Key/麦克风需环境 B 人工确认
风险: BYOK 依赖本地 /image/generate；glb 缺失时走程序化小室 / poster；真 Key 出图未在 CI 打
必改: （无阻塞）
```

**verify：** `npm run verify:align-f6` → **28/28**  
**回归：** `verify:align-f0`–`f5` 全绿（16/24/29/26/24/20）

---

## 范围核对

| ID | 状态 | 说明 |
|----|------|------|
| G1 绘境 | ✓ | App `studio`；无 Key 空态 + 去接口；runner → media；存入相册 `pg-ai-studio`；jobs 历史 |
| G2 TTS | ✓ | Pop `data-phone-speak`；autoSpeak；接口「测试朗读」 |
| G3 STT | ✓ | Pop `data-phone-mic` 按住说话；无 Key disabled；拒权 hint |
| G5 场景工坊 | ✓ | App `workshop`；出壳 + three 程序化/可选 glb；poster 降级 + 重试；零 Key |
| G4 | **未做** | 锁死 |
| F7 / 侧写内层生图 | **未做** | 锁死 |

---

## §9.0 质量门槛自检

| 条款 | 结果 |
|------|------|
| U1–U12 绘境 / 工坊 / Pop 语音 / 接口生图段 | ✓（栖机 App 壳；空/错态有 CTA；44px 热区） |
| E1 存储/引擎/UI 三分 | ✓ `imagegen/*` · `scene-workshop/*` · `phone-voice.js` |
| E2 键唯一 + DATA_MODULES | ✓ `imagegen` / `sceneWorkshop` |
| E3 job/prefs degrade | ✓ verify 覆盖 |
| E5 verify | ✓ `verify:align-f6` |
| E6 无 Key | ✓ 空态 / disabled + 文案；工坊零 Key |
| E8 voice API 兼容 | ✓ 复用 tts/stt/record；仅补 `phoneVoiceEnabled` |
| E9 &lt;300ms 出壳 | ✓ 立即壳 + 异步加载 |
| P1 | **N/A**；可选：存相册后 `appendCohabitEvent({ appId:"studio", … })` |
| P2 | N/A（无角色专属生图） |
| G4 | **不做** |

---

## §9.3 自动断言（已绿）

- `validateImagegenJob` / `degradeImagegenJob`
- `isImagegenConfigured`
- `importGeneratedImageBlob` → `mediaId` + `photo.groupId===pg-ai-studio`
- `validateSceneWorkshopPrefs` / degrade
- `scene-tags` 含 `studio` / `workshop`
- `POST /image/generate`
- `data-phone-mic` / `data-phone-speak`
- `apps-catalog` studio + workshop

---

## 未做 / 后续

1. **G4** 第三方在线音乐 API  
2. 真 glb 资产（当前程序化小室 + SVG poster；`default-room.glb` 可选）  
3. 批量生图 / 图生图 / ControlNet  
4. 场景工坊多场景编辑  
5. 正式 Checker 环境 B 手测（有效 Key 出图 / TTS / STT）  

---

## 主要落点

- `src/settings/imagegen-preferences.js` · `src/imagegen/*` · `src/media/import-image.js`
- `src/scene-workshop/*` · `src/phone-shell/phone-voice.js`
- `server/index.mjs` `POST /image/generate`
- `scripts/verify-align-f6.mjs` · `package.json` `verify:align-f6`
