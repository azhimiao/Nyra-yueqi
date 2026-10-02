# Data Ownership Matrix (R1)

唯一权威与唯一写入者。其他模块只能 Adapter / 只读投影。

| 数据域 | 唯一权威 | 唯一写入者 | 其他模块 | 旧实现归属 |
|--------|----------|------------|----------|------------|
| Companion Identity | Companion Repository | First Light / Character Editor | 只读 | `src/characters/*` → Adapter |
| Relationship Contract | Relationship Repository | 用户显式设置与受控迁移 | 只读 | experience relationship store → Adapter |
| Conversation | Conversation V2 | Conversation Service | 投影 | 旧 IDB 消息库 → 迁移源/只读投影 |
| Canonical Event | Relationship Timeline | Timeline Command Service | 投影 | cohabit/life/scenario writers → Adapter |
| Understanding Candidate | Candidate Ledger | Analysis Pipeline / 用户明确陈述 | 检索与审核 | skill memory candidates → Ledger Adapter |
| Stable Memory | Memory Repository | Candidate Promotion / 用户显式添加 | 只读 | traditional memories / context graph → Adapter |
| Relationship State | Timeline Reducer | Reducer | 禁止直接改数值 | intimacy/trust counters → derived |
| Agent Profile | Agent Registry | Agent Manager | 引用 | `src/agents/*` |
| Skill Package | Package Registry | Package Manager | 引用 | skill-platform store |
| Task | Unified Task Repository | Task Runtime | 适配器 | `yueqi.agent.tasks.v1` / assist tasks / skill runs → migrate |
| Approval | Policy Engine | Approval Gateway | 引用 | scattered grants/approvals → merge |
| Experience Session | Experience Repository | Experience Runtime | 投影 | scenario/adventure/scroll/cocreate sessions |
| Projection | Projection Store | Projection Workers | 不得回写同义事件 | diary/moments/calendar/lock UI |
| Billing Account | Server Billing Core | Billing Service | 只读余额 | **未实现**；禁止复用本地栖币 |
| NyraCoin | 本地虚拟钱包 | 游戏与虚拟商城 | 与 Billing 隔离 | `src/wallet/ledger.js` |

## Hard rules

1. 禁止新增 localStorage 真相源。新状态必须进入版本化 Repository（或明确声明为 ephemeral cache）。
2. Conversation Message、Timeline Event、Task/Execution Log 语义不同，禁止未经证明物理合并。
3. Projection 必须携带 `sourceEventId` + `projectionVersion`；不得反向产生同义 canonical event。
4. `realityNamespace` 必填：`reality | shared_fiction | simulation | creative_work`。
