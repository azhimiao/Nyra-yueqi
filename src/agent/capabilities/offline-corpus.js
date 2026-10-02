/**
 * Offline research corpus — deterministic local sources (no live web).
 * Real web search marked external_pending at capability boundary.
 */

/** @typedef {{ id: string, title: string, url: string, tags: string[], excerpt: string, body: string }} CorpusDoc */

/** @type {CorpusDoc[]} */
export const OFFLINE_CORPUS = Object.freeze([
  {
    id: "corp-1",
    title: "可信 Agent 执行与审批",
    url: "local://corpus/agent-approval",
    tags: ["agent", "approval", "runtime", "审计"],
    excerpt: "外部写入前必须展示精确影响并获得用户确认。",
    body: "可信 Agent 运行时要求任务意图、计划图、审批与审计。R2/R3 写入前必须预览 exactEffect。未授权外部写入必须失败且不得宣称完成。",
  },
  {
    id: "corp-2",
    title: "个人上下文图谱与来源",
    url: "local://corpus/context-graph",
    tags: ["memory", "context", "provenance", "来源"],
    excerpt: "每条记忆需要来源、置信度与隐私级别。",
    body: "Personal Context Graph 区分情景、语义、程序、目标与关系记忆。检索需同时考虑角色隔离与来源，不能只做向量相似度。",
  },
  {
    id: "corp-3",
    title: "本地日历与提醒实践",
    url: "local://corpus/calendar-local",
    tags: ["calendar", "reminder", "日程", "空闲"],
    excerpt: "先读空闲时间，再生成草稿，确认后写入。",
    body: "日历能力应先查询空闲时段，生成草稿预览，用户批准后再创建本地事件。真实系统日历 API 属于外部集成。",
  },
  {
    id: "corp-4",
    title: "研究结论的来源归因",
    url: "local://corpus/research-attribution",
    tags: ["research", "citation", "来源", "摘要"],
    excerpt: "每个研究结论必须附带来源列表。",
    body: "离线或在线研究都必须为结论保留 source 引用。缺少来源的结论不得进入完成态。对比摘要时列出各来源要点差异。",
  },
  {
    id: "corp-5",
    title: "授权目录内的文件整理",
    url: "local://corpus/files-sandbox",
    tags: ["files", "sandbox", "授权", "预览"],
    excerpt: "文件移动仅限用户授权目录，且先预览。",
    body: "Windows 文件能力必须限制在授权根目录内。确认前只生成预览清单，确认后执行移动或写入草稿。凭证不得进入前端存储。",
  },
  {
    id: "corp-6",
    title: "邮件与消息草稿边界",
    url: "local://corpus/draft-boundary",
    tags: ["email", "draft", "message", "草稿"],
    excerpt: "首版只生成草稿，不自动发送。",
    body: "消息与邮件草稿读取用户明确选择的上下文后本地生成。发送属于 R3 外部提交，首版禁用自动发送。",
  },
  {
    id: "corp-7",
    title: "每日简报与安静开关",
    url: "local://corpus/daily-briefing",
    tags: ["briefing", "日程", "目标", "关闭"],
    excerpt: "简报可关闭，关闭后不得绕过。",
    body: "每日简报基于日程、目标、项目与关系生成，并保持可追溯。用户关闭后，任何入口（任务、主动推送、任务中心）都不得绕过设置生成简报。",
  },
  {
    id: "corp-8",
    title: "笔记结构化与项目资料",
    url: "local://corpus/notes-project",
    tags: ["notes", "project", "结构化", "聊天"],
    excerpt: "从聊天整理为结构化笔记并挂到项目。",
    body: "笔记能力应从对话或上下文提取标题、要点与正文，预览后写入本地。项目资料需保留来源引用以便复查。",
  },
]);

/**
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {{ doc: CorpusDoc, score: number }[]}
 */
export function searchOfflineCorpus(query, opts = {}) {
  const q = String(query || "").trim().toLowerCase();
  const limit = opts.limit ?? 5;
  if (!q) return [];
  const tokens = q.split(/[\s,，、/]+/).filter((t) => t.length >= 2);
  const scored = OFFLINE_CORPUS.map((doc) => {
    const hay = `${doc.title} ${doc.tags.join(" ")} ${doc.excerpt} ${doc.body}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += t.length >= 4 ? 2 : 1;
      if (doc.tags.some((tag) => tag.toLowerCase().includes(t))) score += 1.5;
    }
    if (hay.includes(q)) score += 3;
    return { doc, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
