# Skill template · `local-echo-status`

低风险（R0）示例能力包：格式化用户提供的本地状态文案。默认无 `network` / `file` / `clipboard` / `credentials` 权限。

## 30 分钟内跑通本地模拟器

```bash
# 从仓库根目录
node -e "
import { readFileSync } from 'node:fs';
import { runSkillSimulator } from './src/skills/index.js';
import { execute } from './sdk/skill-package/template/index.js';
const manifest = JSON.parse(readFileSync('./sdk/skill-package/template/skill.json','utf8'));
const r = await runSkillSimulator({
  manifest,
  execute,
  input: { statusText: '今天想整理书桌', label: '今日' },
}, { mode: 'normal' });
console.log(r);
"
```

故障模式：`permission_deny` · `offline` · `timeout` · `cancel` · `duplicate`（见 `runSimulatorFaultMatrix`）。

## 包结构

- `skill.json` — 清单（schema / 版本 / 权限 / 风险）
- `index.js` — entry handlers
- 完整文档：`docs/sdk/SKILL_SDK.md`
