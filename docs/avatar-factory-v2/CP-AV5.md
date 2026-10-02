# CP-AV5 完成报告 — 自动 QA 与降级

对照：`MASTER_PLAN.md` → gate `qa_green`

## 完成项

- [x] Python `python/avatar-media-worker/matte.py`（isnet-anime）接入 matting stage
- [x] deps 缺失 / 失败 → `fallback_matting` 灰键控，写入 `matting-report.json` + `provenance.matting`
- [x] 配准（纯 JS pngjs alpha bbox）：脚底≤4px、中心≤8px、高度≤3%；自动平移；retry；降级关键帧数
- [x] `quality-report.json` 结果枚举：`PASS | RETRYABLE_FAIL | DEGRADED_PASS | HARD_FAIL`
- [x] 同动作重复 hash 帧 → 该动作 / 整包 `HARD_FAIL`（duplicate policy）
- [x] 面部包 A→B→C→D 降级，不阻塞整包
- [x] 单测：`packages/avatar-factory/tests/avatar-matting.test.mjs`、`avatar-registration.test.mjs`
- [x] Fixture 与 real 路径均写出合规 quality-report（real 待 CP-AV4 provider；QA 阶段已就绪）

## 命令

```bash
node packages/avatar-factory/tests/avatar-matting.test.mjs
node packages/avatar-factory/tests/avatar-registration.test.mjs
npm run avatar:batch
npm run avatar:qa-green
```

## 环境

| 变量 | 含义 |
|------|------|
| `AVATAR_MATTE_PYTHON` / `PYTHON` | matte.py 解释器 |
| `AVATAR_SKIP_PYTHON_MATTE=1` | 强制灰键控（跳过 rembg 探测） |

## Gate

**`qa_green`** = 上述单测 PASS + `npm run avatar:batch` 出包且 `quality-report.result` ∈ 枚举
