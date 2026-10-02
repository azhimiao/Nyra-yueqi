# Character / World Studio（PAIOS P6）

创作者可制作独特的角色与世界包，而不是只上传一张立绘和一段提示词。

## 范围（phase-1）

| 支持 | 不支持 |
|------|--------|
| 本地导入 / 导出 | 公开商城目录 |
| 私有分享 + 包签名 | 支付 / 抽成 / 广告 / 结算 |
| 版本与宿主兼容检查 | 隐藏权限 / 任意脚本 |

## Character Package

路径约定：`sdk/character-package/template/character.json`

必含：

- 身份、关系模式、边界、说话风格、价值观
- 外观、动作状态机、表情、口型 hooks、声音与同角色降级素材
- chat / task / waiting / success / failure 映射
- 记忆策略与关系策略
- 多分辨率预览比例

一致性自动报错：缺动作、错比例、背景未透明、跨身份资产混用。

缺失资产 → **仅同角色安全降级**，禁止回退到其他角色。

## World Package

路径约定：`sdk/world-package/template/world.json`

含：世界书、地点、事件、道具、背景、叙事剧本、共同经历模板。

真实能力只通过 `skillDependencies` 引用 Skill Package；场景关系事件经 `validateRelationEventWrite`。

## 升级与记忆

`upgradeCharacterPackage` **不会**覆盖 `yueqi.studio.relation-memory.v1` 中的用户关系记忆。

## 验证

```bash
npm run verify:core-p6
```
