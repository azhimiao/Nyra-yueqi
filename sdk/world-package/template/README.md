# World Package Template

PAIOS P6 创作者世界包模板。

## 规则

- **无**直接系统权限（network / file / clipboard / credentials / shell 等）
- 需要真实能力时，在 `skillDependencies` 中声明已安装的 Skill Package id
- `scripts` 仅为叙事节拍，不可 `executable`，不可包含可执行代码
- 场景写入关系事件必须经运行时 `validateRelationEventWrite`

## 分发

本地导入导出与私有分享；不做支付、广告、公开目录。
