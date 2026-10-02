/** 共创 V3 — project-first long-form writing studio. */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { callModel } from "../model/client.js";
import {
  addOutlineNode,
  addWritingChapter,
  countManuscriptWords,
  createRevision,
  createWritingId,
  createWritingProject,
  deleteWritingProject,
  exportWritingProjectMarkdown,
  getActiveWritingProject,
  getWritingProject,
  listWritingProjects,
  moveWritingChapter,
  removeWritingChapter,
  resolveRevision,
  restoreWritingSnapshot,
  setActiveChapter,
  setActiveWritingProject,
  updateBibleCollection,
  updateOutlineNode,
  updateWritingChapter,
  updateWritingProject,
} from "./project-store.js";
import { JOB_LABELS, runWritingJob } from "./writing-runtime.js";

const STATUS_LABELS = Object.freeze({ draft: "草稿", revising: "修订中", complete: "已完成", archived: "已归档" });

function projectWordCount(project) {
  return project?.chapters?.reduce((sum, chapter) => sum + countManuscriptWords(chapter.content), 0) || 0;
}

function formatUpdated(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   collectProviderConfig?: () => object|Promise<object>,
 *   onToast?: (msg: string) => void,
 * }} [deps]
 */
export function mountCocreateApp(root, deps = {}) {
  if (!root) return { destroy() {}, open() {} };

  let view = "library";
  let tab = "draft";
  let projectId = getActiveWritingProject()?.id || "";
  let busy = false;
  let destroyed = false;
  const pendingSaves = new Map();

  root.classList.add("cocreate-app", "cocreate-app--v2", "cocreate-app--v3");

  function currentProject() {
    return projectId ? getWritingProject(projectId) : null;
  }

  function currentChapter(project = currentProject()) {
    return project?.chapters?.find((item) => item.id === project.activeChapterId)
      || project?.chapters?.[0]
      || null;
  }

  function icon(name) {
    return `<i data-lucide="${name}" aria-hidden="true"></i>`;
  }

  function renderLibrary() {
    const projects = listWritingProjects();
  root.innerHTML = `
      <div class="cc3-shell" data-cc-view="library">
        <header class="cc3-library-head">
          <div>
            <span class="cc3-eyebrow">怎么玩</span>
            <h1>写作台</h1>
            <p>点右上角 + 建作品 → 写章节；可让 AI 续写/改写。不是和角色聊天。</p>
          </div>
          <button type="button" class="cc3-icon-command" data-cc-new-project aria-label="新建作品" title="新建作品">${icon("plus")}</button>
        </header>
        <main class="cc3-library-main">
          <div class="cc3-library-summary">
            <strong>${projects.length}</strong><span>部作品</span>
            <strong>${projects.reduce((sum, item) => sum + item.chapters.length, 0)}</strong><span>个章节</span>
            <strong>${projects.reduce((sum, item) => sum + projectWordCount(item), 0).toLocaleString("zh-CN")}</strong><span>字</span>
          </div>
          <section class="cc3-project-list" aria-label="作品列表">
            ${projects.map((project) => `
              <article class="cc3-project-row">
                <button type="button" class="cc3-project-open" data-cc-open-project="${escapeHtml(project.id)}">
                  <span class="cc3-project-index">${String(project.chapters.length).padStart(2, "0")}</span>
                  <span class="cc3-project-copy">
                    <strong>${escapeHtml(project.title)}</strong>
                    <em>${escapeHtml(project.subtitle || project.bible.premise || "尚未填写简介")}</em>
                    <small>${escapeHtml(project.bible.genre)} · ${projectWordCount(project).toLocaleString("zh-CN")} 字 · ${escapeHtml(formatUpdated(project.updatedAt))}</small>
                  </span>
                  ${icon("chevron-right")}
                </button>
              </article>
            `).join("")}
          </section>
        </main>
      </div>`;
    refreshIcons();
  }

  function renderNewProject() {
    root.innerHTML = `
      <div class="cc3-shell" data-cc-view="new">
        <header class="cc3-topbar">
          <button type="button" class="cc3-icon-command" data-cc-back-library aria-label="返回作品库">${icon("chevron-left")}</button>
          <div><strong>新建作品</strong><span>先定方向，随后再补完整故事圣经</span></div>
          <span class="cc3-topbar-spacer"></span>
        </header>
        <main class="cc3-new-main">
          <form class="cc3-new-form" data-cc-new-form>
            <label><span>作品名</span><input name="title" maxlength="60" required placeholder="未命名长篇" /></label>
            <label><span>一句话故事</span><textarea name="premise" rows="4" maxlength="500" required placeholder="谁，在什么处境下，必须完成什么改变？"></textarea></label>
            <div class="cc3-form-grid">
              <label><span>类型</span><input name="genre" maxlength="40" placeholder="都市奇幻" /></label>
              <label><span>叙事视角</span><select name="pov"><option>第三人称限知</option><option>第一人称</option><option>第三人称全知</option><option>多视角</option></select></label>
            </div>
            <label><span>文风约束</span><input name="style" maxlength="160" placeholder="克制、具体、重视人物动作" /></label>
            <button type="submit" class="cc3-primary-command">创建并开始写作 ${icon("arrow-right")}</button>
          </form>
        </main>
      </div>`;
    refreshIcons();
  }

  function chapterRail(project) {
    return `
      <aside class="cc3-chapters" data-cc-chapter-drawer>
        <header><strong>章节</strong><button type="button" data-cc-add-chapter aria-label="新增章节" title="新增章节">${icon("plus")}</button></header>
        <div class="cc3-chapter-list">
          ${project.chapters.map((chapter, index) => `
            <button type="button" class="cc3-chapter-item ${chapter.id === project.activeChapterId ? "is-active" : ""}" data-cc-open-chapter="${escapeHtml(chapter.id)}">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <strong>${escapeHtml(chapter.title)}</strong>
              <em>${chapter.wordCount.toLocaleString("zh-CN")}</em>
            </button>
          `).join("")}
        </div>
      </aside>`;
  }

  function pendingRevision(project, chapter) {
    return project.revisions.find((item) => item.chapterId === chapter.id && item.status === "pending") || null;
  }

  function renderDraft(project, chapter) {
    const revision = pendingRevision(project, chapter);
    return `
      <section class="cc3-draft" data-cc-panel="draft">
        <div class="cc3-document-head">
          <input class="cc3-chapter-title" data-cc-chapter-title value="${escapeHtml(chapter.title)}" aria-label="章节标题" />
          <input class="cc3-chapter-summary" data-cc-chapter-summary value="${escapeHtml(chapter.summary)}" placeholder="本章目标或摘要" aria-label="章节摘要" />
          <div class="cc3-chapter-actions">
            <button type="button" data-cc-move-chapter="-1" aria-label="章节上移" title="章节上移">${icon("arrow-up")}</button>
            <button type="button" data-cc-move-chapter="1" aria-label="章节下移" title="章节下移">${icon("arrow-down")}</button>
            <button type="button" data-cc-remove-chapter aria-label="删除章节" title="删除章节">${icon("trash-2")}</button>
              </div>
            </div>
        <div class="cc3-editor-wrap">
          <textarea class="cc3-manuscript" data-cc-manuscript spellcheck="true" placeholder="从这里开始写正文……">${escapeHtml(chapter.content)}</textarea>
          <footer class="cc3-editor-status"><span data-cc-save-state>已保存</span><span data-cc-word-count>${chapter.wordCount.toLocaleString("zh-CN")} 字</span></footer>
        </div>
        <div class="cc3-ai-tools" aria-label="AI 写作工具">
          <div class="cc3-tool-row">
            ${["continue", "rewrite", "expand", "describe", "dialogue"].map((kind) => `
              <button type="button" data-cc-tool="${kind}" ${busy ? "disabled" : ""}>${escapeHtml(JOB_LABELS[kind])}</button>
            `).join("")}
          </div>
          <div class="cc3-guidance">
            <input data-cc-instruction maxlength="240" placeholder="可选：更克制、增加冲突、保留这句对白……" />
            <span>${busy ? "正在生成候选" : "选中文字后调用；续写从光标处开始"}</span>
          </div>
        </div>
        ${revision ? `
          <section class="cc3-revision" data-cc-revision="${escapeHtml(revision.id)}">
            <header><strong>${escapeHtml(JOB_LABELS[revision.kind] || "编辑")}候选</strong><span>不会自动改正文</span></header>
            ${revision.before ? `<div><em>原文</em><p>${escapeHtml(revision.before)}</p></div>` : ""}
            <div><em>候选</em><p>${escapeHtml(revision.after)}</p></div>
            <footer>
              <button type="button" class="cc3-secondary-command" data-cc-reject-revision="${escapeHtml(revision.id)}">放弃</button>
              <button type="button" class="cc3-primary-command" data-cc-accept-revision="${escapeHtml(revision.id)}">接受修改</button>
            </footer>
          </section>` : ""}
      </section>`;
  }

  function renderOutline(project) {
    return `
      <section class="cc3-structured" data-cc-panel="outline">
        <header class="cc3-section-head"><div><strong>故事大纲</strong><span>大纲节点会进入生成上下文</span></div><button type="button" data-cc-add-outline aria-label="新增大纲节点">${icon("plus")}</button></header>
        <label class="cc3-wide-field"><span>故事简介</span><textarea data-cc-bible-field="synopsis" rows="5">${escapeHtml(project.bible.synopsis)}</textarea></label>
        <ol class="cc3-outline-list">
          ${project.outline.map((node, index) => `
            <li data-cc-outline-row="${escapeHtml(node.id)}">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <div>
                <input data-cc-outline-field="title" value="${escapeHtml(node.title)}" aria-label="大纲标题" />
                <textarea data-cc-outline-field="summary" rows="3" aria-label="大纲摘要">${escapeHtml(node.summary)}</textarea>
              </div>
              <select data-cc-outline-field="chapterId" aria-label="关联章节">
                <option value="">未关联章节</option>
                ${project.chapters.map((chapter) => `<option value="${escapeHtml(chapter.id)}" ${node.chapterId === chapter.id ? "selected" : ""}>${escapeHtml(chapter.title)}</option>`).join("")}
              </select>
            </li>
          `).join("")}
        </ol>
      </section>`;
  }

  function renderBible(project) {
    return `
      <section class="cc3-structured" data-cc-panel="bible">
        <header class="cc3-section-head"><div><strong>故事圣经</strong><span>项目的持续事实来源</span></div></header>
        <div class="cc3-bible-grid">
          <label><span>核心设定</span><textarea data-cc-bible-field="premise" rows="4">${escapeHtml(project.bible.premise)}</textarea></label>
          <label><span>类型</span><input data-cc-bible-field="genre" value="${escapeHtml(project.bible.genre)}" /></label>
          <label><span>文风</span><input data-cc-bible-field="style" value="${escapeHtml(project.bible.style)}" /></label>
          <label><span>视角</span><input data-cc-bible-field="pov" value="${escapeHtml(project.bible.pov)}" /></label>
          <label><span>时态</span><input data-cc-bible-field="tense" value="${escapeHtml(project.bible.tense)}" /></label>
            </div>
        <section class="cc3-record-section">
          <header><strong>人物档案</strong><button type="button" data-cc-add-cast>${icon("plus")} 新人物</button></header>
          <div class="cc3-record-list">
            ${project.bible.cast.map((item) => `
              <article data-cc-cast-row="${escapeHtml(item.id)}">
                <div><input data-cc-cast-field="name" value="${escapeHtml(item.name)}" aria-label="人物姓名" /><input data-cc-cast-field="role" value="${escapeHtml(item.role)}" aria-label="人物角色" /></div>
                <textarea data-cc-cast-field="description" rows="3" aria-label="人物描述">${escapeHtml(item.description)}</textarea>
                <button type="button" data-cc-remove-cast="${escapeHtml(item.id)}" aria-label="删除人物">${icon("trash-2")}</button>
              </article>
            `).join("")}
        </div>
      </section>
        <section class="cc3-record-section">
          <header><strong>世界设定</strong><button type="button" data-cc-add-world>${icon("plus")} 新设定</button></header>
          <div class="cc3-record-list">
            ${project.bible.world.map((item) => `
              <article data-cc-world-row="${escapeHtml(item.id)}">
                <input data-cc-world-field="title" value="${escapeHtml(item.title)}" aria-label="设定标题" />
                <textarea data-cc-world-field="content" rows="3" aria-label="设定内容">${escapeHtml(item.content)}</textarea>
                <input data-cc-world-field="triggers" value="${escapeHtml(item.triggers.join("、"))}" placeholder="触发词，以顿号分隔" aria-label="触发词" />
                <button type="button" data-cc-remove-world="${escapeHtml(item.id)}" aria-label="删除设定">${icon("trash-2")}</button>
              </article>
            `).join("")}
          </div>
        </section>
      </section>`;
  }

  function renderHistory(project) {
    const revisions = project.revisions.slice(0, 30);
    const snapshots = project.snapshots.slice(0, 30);
    return `
      <section class="cc3-structured" data-cc-panel="history">
        <header class="cc3-section-head"><div><strong>版本与修订</strong><span>接受 AI 修改和手动恢复都会留下记录</span></div></header>
        <h3 class="cc3-subhead">版本快照</h3>
        <div class="cc3-history-list">
          ${snapshots.length ? snapshots.map((item) => {
            const chapter = project.chapters.find((row) => row.id === item.chapterId);
            return `<article><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(chapter?.title || "已删除章节")} · ${escapeHtml(formatUpdated(item.createdAt))}</span></div><button type="button" data-cc-restore-snapshot="${escapeHtml(item.id)}">恢复</button></article>`;
          }).join("") : `<p class="cc3-empty">还没有快照。接受修改或删除正文前会自动创建。</p>`}
        </div>
        <h3 class="cc3-subhead">AI 修订记录</h3>
        <div class="cc3-history-list">
          ${revisions.length ? revisions.map((item) => `<article><div><strong>${escapeHtml(JOB_LABELS[item.kind] || "编辑")}</strong><span>${escapeHtml(item.status)} · ${escapeHtml(formatUpdated(item.createdAt))}</span></div><p>${escapeHtml(item.after.slice(0, 120))}</p></article>`).join("") : `<p class="cc3-empty">还没有修订记录。</p>`}
        </div>
      </section>`;
  }

  function renderWorkspace() {
    const project = currentProject();
    if (!project) {
      view = "library";
      renderLibrary();
      return;
    }
    const chapter = currentChapter(project);
    const panels = {
      draft: renderDraft(project, chapter),
      outline: renderOutline(project),
      bible: renderBible(project),
      history: renderHistory(project),
    };
    root.innerHTML = `
      <div class="cc3-shell cc3-workspace" data-cc-view="workspace">
        <header class="cc3-topbar">
          <button type="button" class="cc3-icon-command" data-cc-back-library aria-label="返回作品库">${icon("chevron-left")}</button>
          <div class="cc3-title-block"><strong>${escapeHtml(project.title)}</strong><span>${project.chapters.length} 章 · ${projectWordCount(project).toLocaleString("zh-CN")} 字 · ${escapeHtml(STATUS_LABELS[project.status] || project.status)}</span></div>
          <button type="button" class="cc3-icon-command" data-cc-export aria-label="导出手稿" title="导出手稿">${icon("download")}</button>
        </header>
        <nav class="cc3-tabs" aria-label="写作台视图">
          ${[["draft", "正文"], ["outline", "大纲"], ["bible", "档案"], ["history", "版本"]].map(([id, label]) => `<button type="button" class="${tab === id ? "is-active" : ""}" data-cc-tab="${id}">${label}</button>`).join("")}
        </nav>
        <div class="cc3-work-body">
          ${chapterRail(project)}
          <main class="cc3-panel">${panels[tab]}</main>
        </div>
      </div>`;
    refreshIcons();
    if (tab === "draft" && pendingRevision(project, chapter)) {
      requestAnimationFrame(() => root.querySelector(".cc3-revision")?.scrollIntoView?.({ block: "nearest" }));
    }
  }

  function render() {
    if (view === "new") renderNewProject();
    else if (view === "workspace") renderWorkspace();
    else renderLibrary();
  }

  function reportSaveResult(result) {
    const state = root.querySelector("[data-cc-save-state]");
    if (state) state.textContent = result?.ok === false ? "保存失败" : "已保存";
    if (result?.ok === false) deps.onToast?.("保存失败，请检查本地存储空间");
  }

  function flushSave(key) {
    const pending = pendingSaves.get(key);
    if (!pending) return null;
    window.clearTimeout(pending.timer);
    pendingSaves.delete(key);
    const result = pending.write();
    reportSaveResult(result);
    return result;
  }

  function flushPendingSaves() {
    for (const key of [...pendingSaves.keys()]) flushSave(key);
  }

  function saveSoon(key, write) {
    const previous = pendingSaves.get(key);
    if (previous) window.clearTimeout(previous.timer);
    const state = root.querySelector("[data-cc-save-state]");
    if (state) state.textContent = "保存中";
    const pending = { write, timer: 0 };
    pending.timer = window.setTimeout(() => flushSave(key), 280);
    pendingSaves.set(key, pending);
  }

  function commitField(target) {
    const project = currentProject();
    if (!project) return;
    const chapter = currentChapter(project);
    if (target.matches("[data-cc-manuscript]")) {
      const value = target.value;
      const count = countManuscriptWords(value);
      const label = root.querySelector("[data-cc-word-count]");
      if (label) label.textContent = `${count.toLocaleString("zh-CN")} 字`;
      saveSoon(`chapter:${project.id}:${chapter.id}:content`, () => updateWritingChapter(project.id, chapter.id, { content: value }));
      return;
    }
    if (target.matches("[data-cc-chapter-title]")) {
      const value = target.value;
      saveSoon(`chapter:${project.id}:${chapter.id}:title`, () => updateWritingChapter(project.id, chapter.id, { title: value }));
      return;
    }
    if (target.matches("[data-cc-chapter-summary]")) {
      const value = target.value;
      saveSoon(`chapter:${project.id}:${chapter.id}:summary`, () => updateWritingChapter(project.id, chapter.id, { summary: value }));
      return;
    }
    if (target.dataset.ccBibleField) {
      const key = target.dataset.ccBibleField;
      const value = target.value;
      saveSoon(`bible:${project.id}:${key}`, () => updateWritingProject(project.id, { bible: { [key]: value } }));
      return;
    }
    const outlineRow = target.closest("[data-cc-outline-row]");
    if (outlineRow && target.dataset.ccOutlineField) {
      const rowId = outlineRow.dataset.ccOutlineRow;
      const field = target.dataset.ccOutlineField;
      const value = target.value;
      saveSoon(`outline:${project.id}:${rowId}:${field}`, () => updateOutlineNode(project.id, rowId, { [field]: value }));
      return;
    }
    const castRow = target.closest("[data-cc-cast-row]");
    if (castRow && target.dataset.ccCastField) {
      const rowId = castRow.dataset.ccCastRow;
      const field = target.dataset.ccCastField;
      const value = target.value;
      saveSoon(`cast:${project.id}:${rowId}:${field}`, () => {
        const latest = getWritingProject(project.id);
        const rows = latest.bible.cast.map((item) => item.id === rowId ? { ...item, [field]: value } : item);
        return updateBibleCollection(project.id, "cast", rows);
      });
      return;
    }
    const worldRow = target.closest("[data-cc-world-row]");
    if (worldRow && target.dataset.ccWorldField) {
      const key = target.dataset.ccWorldField;
      const value = key === "triggers"
        ? target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean)
        : target.value;
      const rowId = worldRow.dataset.ccWorldRow;
      saveSoon(`world:${project.id}:${rowId}:${key}`, () => {
        const latest = getWritingProject(project.id);
        const rows = latest.bible.world.map((item) => item.id === rowId ? { ...item, [key]: value } : item);
        return updateBibleCollection(project.id, "world", rows);
      });
    }
  }

  function selectionForTool(textarea, kind) {
    const content = textarea.value;
    let start = textarea.selectionStart ?? content.length;
    let end = textarea.selectionEnd ?? start;
    if (kind === "continue" || kind === "guided") return { start, end: start };
    if (start === end) {
      const beforeBreak = content.lastIndexOf("\n", Math.max(0, start - 1));
      const afterBreak = content.indexOf("\n", start);
      start = beforeBreak < 0 ? 0 : beforeBreak + 1;
      end = afterBreak < 0 ? content.length : afterBreak;
    }
    return { start, end };
  }

  async function runTool(kind) {
    if (busy) return;
    const project = currentProject();
    const chapter = currentChapter(project);
    const textarea = root.querySelector("[data-cc-manuscript]");
    if (!project || !chapter || !textarea) return;
    const range = selectionForTool(textarea, kind);
    const instruction = String(root.querySelector("[data-cc-instruction]")?.value || "").trim();
    busy = true;
    renderWorkspace();
    try {
      const config = await deps.collectProviderConfig?.();
      if (!config?.baseUrl || !config?.apiKey || !config?.model) {
        deps.onToast?.("请先在接口页配置模型；手动写作、目录、版本和导出仍可使用");
        return;
      }
      const result = await runWritingJob({
        project,
        chapter,
        kind,
        start: range.start,
        end: range.end,
        instruction,
        callModel: async ({ messages, temperature }) => callModel(config, messages, {
          stream: false,
          temperature,
          businessPurpose: `creative.cocreate_${kind}`,
          capability: "chat",
          companionId: project?.characterId || "",
        }),
      });
      if (!result.ok) {
        deps.onToast?.("模型没有返回可用正文，原稿未改变");
        return;
      }
      const targetEnd = kind === "continue" || kind === "guided" ? range.start : range.end;
      const created = createRevision(project.id, {
        chapterId: chapter.id,
        kind,
        instruction,
        start: range.start,
        end: targetEnd,
        before: chapter.content.slice(range.start, targetEnd),
        after: result.text,
        source: "model",
        contextSnapshot: result.context,
      });
      if (!created.ok) deps.onToast?.("候选保存失败，原稿未改变");
    } catch (error) {
      console.warn("writing tool failed", error);
      deps.onToast?.("生成失败，原稿未改变");
    } finally {
      busy = false;
      renderWorkspace();
    }
  }

  const onClick = async (event) => {
    if (destroyed) return;
    flushPendingSaves();
    const target = event.target;
    if (target.closest("[data-cc-new-project]")) {
      view = "new";
      render();
      return;
    }
    if (target.closest("[data-cc-back-library]")) {
      view = "library";
      render();
      return;
    }
    const openProject = target.closest("[data-cc-open-project]")?.dataset.ccOpenProject;
    if (openProject) {
      projectId = openProject;
      setActiveWritingProject(projectId);
      view = "workspace";
      tab = "draft";
      render();
      return;
    }
    const nextTab = target.closest("[data-cc-tab]")?.dataset.ccTab;
    if (nextTab) {
      tab = nextTab;
      renderWorkspace();
      return;
    }
    const chapterId = target.closest("[data-cc-open-chapter]")?.dataset.ccOpenChapter;
    if (chapterId) {
      setActiveChapter(projectId, chapterId);
      tab = "draft";
      renderWorkspace();
      return;
    }
    if (target.closest("[data-cc-add-chapter]")) {
      addWritingChapter(projectId, { title: `第 ${currentProject().chapters.length + 1} 章` });
      tab = "draft";
      renderWorkspace();
      return;
    }
    const move = target.closest("[data-cc-move-chapter]")?.dataset.ccMoveChapter;
    if (move) {
      moveWritingChapter(projectId, currentProject().activeChapterId, Number(move));
      renderWorkspace();
      return;
    }
    if (target.closest("[data-cc-remove-chapter]")) {
      const result = removeWritingChapter(projectId, currentProject().activeChapterId);
      deps.onToast?.(result.ok ? "章节已删除" : "作品至少需要一个章节");
      renderWorkspace();
      return;
    }
    const tool = target.closest("[data-cc-tool]")?.dataset.ccTool;
    if (tool) {
      await runTool(tool);
      return;
    }
    const accept = target.closest("[data-cc-accept-revision]")?.dataset.ccAcceptRevision;
    if (accept) {
      const result = resolveRevision(projectId, accept, "accept");
      deps.onToast?.(result.ok ? "修改已写入，原文已保存为版本" : result.reason === "document_changed" ? "正文已变化，请重新生成候选" : "无法接受修改");
      renderWorkspace();
      return;
    }
    const reject = target.closest("[data-cc-reject-revision]")?.dataset.ccRejectRevision;
    if (reject) {
      resolveRevision(projectId, reject, "reject");
      renderWorkspace();
      return;
    }
    const restore = target.closest("[data-cc-restore-snapshot]")?.dataset.ccRestoreSnapshot;
    if (restore) {
      restoreWritingSnapshot(projectId, restore);
      deps.onToast?.("已恢复版本；恢复前正文也已保留");
      renderWorkspace();
      return;
    }
    if (target.closest("[data-cc-add-outline]")) {
      addOutlineNode(projectId, { title: "新情节节点", summary: "" });
      renderWorkspace();
      return;
    }
    if (target.closest("[data-cc-add-cast]")) {
      const project = currentProject();
      updateBibleCollection(project.id, "cast", [...project.bible.cast, { id: createWritingId("cast"), name: "新人物", role: "主要角色", description: "" }]);
      renderWorkspace();
      return;
    }
    const removeCast = target.closest("[data-cc-remove-cast]")?.dataset.ccRemoveCast;
    if (removeCast) {
      const project = currentProject();
      updateBibleCollection(project.id, "cast", project.bible.cast.filter((item) => item.id !== removeCast));
      renderWorkspace();
      return;
    }
    if (target.closest("[data-cc-add-world]")) {
      const project = currentProject();
      updateBibleCollection(project.id, "world", [...project.bible.world, { id: createWritingId("world"), title: "新设定", content: "", triggers: [] }]);
      renderWorkspace();
      return;
    }
    const removeWorld = target.closest("[data-cc-remove-world]")?.dataset.ccRemoveWorld;
    if (removeWorld) {
      const project = currentProject();
      updateBibleCollection(project.id, "world", project.bible.world.filter((item) => item.id !== removeWorld));
      renderWorkspace();
      return;
    }
    if (target.closest("[data-cc-export]")) {
      const exported = exportWritingProjectMarkdown(projectId);
      if (exported.ok) downloadText(`${exported.project.title}.md`, exported.content);
      return;
    }
    const projectDelete = target.closest("[data-cc-delete-project]")?.dataset.ccDeleteProject;
    if (projectDelete && window.confirm("删除这个写作项目？此操作不会影响角色和聊天。")) {
      deleteWritingProject(projectDelete);
      view = "library";
      render();
    }
  };

  const onInput = (event) => commitField(event.target);
  const onChange = (event) => commitField(event.target);

  const onSubmit = (event) => {
    if (!event.target.matches("[data-cc-new-form]")) return;
    event.preventDefault();
    const form = new FormData(event.target);
    const created = createWritingProject({
      title: form.get("title"),
      premise: form.get("premise"),
      genre: form.get("genre"),
      pov: form.get("pov"),
      style: form.get("style"),
    });
    if (!created.ok || !created.value) {
      deps.onToast?.("创建失败，请检查本地存储空间");
      return;
    }
    projectId = created.value.id;
    view = "workspace";
    tab = "draft";
    render();
  };

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  render();

  return {
    open() {
      flushPendingSaves();
      if (!projectId) projectId = getActiveWritingProject()?.id || "";
      render();
    },
    destroy() {
      flushPendingSaves();
      destroyed = true;
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
      root.replaceChildren();
    },
  };
}
