/**
 * E1 剧章 UI — 目录 / 封面 / 阅读 / 结局
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { advanceNode } from "./engine.js";
import {
  getChapter,
  getResumeNodeId,
  isChapterCompleted,
  listChapters,
  markChapterCompleted,
  resetChapterProgress,
  setActiveNode,
  startChapter,
} from "./store.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import { getActiveCharacterId } from "../characters/store.js";

/**
 * @param {HTMLElement} root
 * @param {{ onToast?: (msg: string) => void }} [deps]
 */
export function mountStoryApp(root, deps = {}) {
  if (!root) return { destroy() {}, open() {}, refresh() {} };

  /** @type {"catalog"|"cover"|"read"|"ending"|"corrupt"} */
  let view = "catalog";
  let chapterId = "";
  let nodeId = "";
  let destroyed = false;

  root.classList.add("story-app");
  root.innerHTML = `
    <div class="story-shell" data-story-shell>
      <section class="story-view is-active" data-story-view="catalog">
        <header class="story-top">
          <p class="story-brand">月栖 · 剧章</p>
          <h1>互动阅读</h1>
          <p class="story-lead">点选项推进，没有立绘，只有文字与分叉。</p>
        </header>
        <div class="story-catalog" data-story-catalog></div>
        <p class="story-empty" data-story-empty hidden>还没有章节</p>
      </section>

      <section class="story-view" data-story-view="cover" hidden>
        <button type="button" class="story-back" data-story-to-catalog aria-label="回目录">
          <i data-lucide="chevron-left"></i>
        </button>
        <div class="story-cover" data-story-cover>
          <span class="story-cover__swatch" data-cover-swatch></span>
          <h2 data-cover-title></h2>
          <p data-cover-hook></p>
          <button type="button" class="story-cta" data-story-begin>开始阅读</button>
        </div>
      </section>

      <section class="story-view" data-story-view="read" hidden>
        <header class="story-read-bar">
          <button type="button" class="story-back" data-story-to-catalog aria-label="回目录">
            <i data-lucide="chevron-left"></i>
          </button>
          <strong data-read-progress>第 1 幕</strong>
          <span></span>
        </header>
        <article class="story-body" data-story-body></article>
        <div class="story-choices" data-story-choices></div>
        <button type="button" class="story-cta story-cta--ghost" data-story-continue-beat hidden>继续</button>
      </section>

      <section class="story-view" data-story-view="ending" hidden>
        <div class="story-ending">
          <p class="story-brand">本章收束</p>
          <h2 data-ending-title></h2>
          <p data-ending-summary></p>
          <div class="story-cta-row">
            <button type="button" class="story-cta" data-story-reread>重读本章</button>
            <button type="button" class="story-cta story-cta--ghost" data-story-to-catalog>回目录</button>
          </div>
        </div>
      </section>

      <section class="story-view" data-story-view="corrupt" hidden>
        <div class="story-ending">
          <h2>这一章走散了</h2>
          <p>存档有点不对劲。可以重置进度再读。</p>
          <button type="button" class="story-cta" data-story-reset>重置进度</button>
          <button type="button" class="story-cta story-cta--ghost" data-story-to-catalog>回目录</button>
        </div>
      </section>
    </div>
  `;

  function setView(next) {
    view = next;
    root.querySelectorAll("[data-story-view]").forEach((node) => {
      const active = node.dataset.storyView === next;
      node.classList.toggle("is-active", active);
      node.hidden = !active;
    });
    refreshIcons();
  }

  function toast(msg) {
    deps.onToast?.(msg);
  }

  function renderCatalog() {
    const host = root.querySelector("[data-story-catalog]");
    const empty = root.querySelector("[data-story-empty]");
    const chapters = listChapters();
    if (!host) return;
    if (!chapters.length) {
      host.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    host.innerHTML = chapters.map((ch) => {
      const done = isChapterCompleted(ch.id);
      const resume = getResumeNodeId(ch.id);
      const badge = done ? "已读完" : resume ? "续读" : "未读";
      return `
        <button type="button" class="story-row theme-${escapeHtml(ch.theme)}" data-open-chapter="${escapeHtml(ch.id)}">
          <span class="story-row__swatch" aria-hidden="true"></span>
          <span class="story-row__text">
            <strong>${escapeHtml(ch.title)}</strong>
            <em>${escapeHtml(ch.hook)}</em>
          </span>
          <span class="story-row__badge">${badge}</span>
        </button>
      `;
    }).join("");
  }

  function openCover(id) {
    const ch = getChapter(id);
    if (!ch) {
      setView("corrupt");
      return;
    }
    chapterId = ch.id;
    const title = root.querySelector("[data-cover-title]");
    const hook = root.querySelector("[data-cover-hook]");
    const swatch = root.querySelector("[data-cover-swatch]");
    if (title) title.textContent = ch.title;
    if (hook) hook.textContent = ch.hook;
    swatch?.setAttribute("data-theme", ch.theme);
    const begin = root.querySelector("[data-story-begin]");
    const resume = getResumeNodeId(ch.id);
    if (begin) begin.textContent = resume && !isChapterCompleted(ch.id) ? "继续阅读" : "开始阅读";
    setView("cover");
  }

  function countBeatsBefore(chapter, targetId) {
    let n = 1;
    for (const node of chapter.nodes || []) {
      if (node.id === targetId) break;
      if (node.kind === "beat" || node.kind === "choice") n += 1;
    }
    return Math.max(1, n);
  }

  function renderRead() {
    const chapter = getChapter(chapterId);
    const node = chapter?.nodes?.find((item) => item.id === nodeId);
    if (!chapter || !node) {
      setView("corrupt");
      return;
    }

    const progress = root.querySelector("[data-read-progress]");
    if (progress) progress.textContent = `第 ${countBeatsBefore(chapter, nodeId)} 幕`;

    const body = root.querySelector("[data-story-body]");
    if (body) {
      body.classList.remove("is-enter");
      const text = node.kind === "ending"
        ? (node.endingSummary || node.body || "")
        : (node.body || "");
      body.innerHTML = escapeHtml(text).split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
      requestAnimationFrame(() => body.classList.add("is-enter"));
    }

    const choicesHost = root.querySelector("[data-story-choices]");
    const continueBtn = root.querySelector("[data-story-continue-beat]");
    if (node.kind === "choice") {
      if (continueBtn) continueBtn.hidden = true;
      if (choicesHost) {
        choicesHost.innerHTML = (node.choices || []).map((c) => `
          <button type="button" class="story-pill" data-story-choice="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>
        `).join("");
      }
    } else if (node.kind === "beat") {
      if (choicesHost) choicesHost.innerHTML = "";
      if (continueBtn) continueBtn.hidden = false;
    } else if (node.kind === "ending") {
      showEnding(node);
    }
  }

  function showEnding(node) {
    const title = root.querySelector("[data-ending-title]");
    const summary = root.querySelector("[data-ending-summary]");
    if (title) title.textContent = node.endingTitle || "本章收束";
    if (summary) summary.textContent = node.endingSummary || node.body || "";
    markChapterCompleted(chapterId);
    try {
      const ch = getChapter(chapterId);
      appendCohabitEvent({
        appId: "story",
        kind: "chapter_end",
        summary: `读完剧章《${ch?.title || chapterId}》：${String(node.endingTitle || "").slice(0, 40)}`,
        characterId: getActiveCharacterId(),
        meta: { chapterId, nodeId: node.id },
      });
    } catch {
      /* optional */
    }
    setView("ending");
  }

  function beginReading() {
    const chapter = getChapter(chapterId);
    if (!chapter) {
      setView("corrupt");
      return;
    }
    const resume = getResumeNodeId(chapterId);
    if (resume && !isChapterCompleted(chapterId)) {
      nodeId = resume;
    } else {
      startChapter(chapterId);
      nodeId = chapter.startNodeId;
    }
    setActiveNode(chapterId, nodeId);
    setView("read");
    renderRead();
  }

  function goChoice(choiceId) {
    const chapter = getChapter(chapterId);
    const result = advanceNode(chapter, nodeId, choiceId);
    if (result.error || !result.nextNodeId) {
      toast("出了点小状况");
      return;
    }
    nodeId = result.nextNodeId;
    setActiveNode(chapterId, nodeId);
    const node = chapter.nodes.find((n) => n.id === nodeId);
    if (node?.kind === "ending") {
      showEnding(node);
      return;
    }
    renderRead();
  }

  function continueBeat() {
    const chapter = getChapter(chapterId);
    const result = advanceNode(chapter, nodeId);
    if (result.error || !result.nextNodeId) {
      toast("出了点小状况");
      return;
    }
    nodeId = result.nextNodeId;
    setActiveNode(chapterId, nodeId);
    const node = chapter.nodes.find((n) => n.id === nodeId);
    if (node?.kind === "ending") {
      showEnding(node);
      return;
    }
    renderRead();
  }

  const onClick = (event) => {
    if (destroyed) return;
    const openId = event.target.closest("[data-open-chapter]")?.dataset.openChapter;
    if (openId) {
      openCover(openId);
      return;
    }
    if (event.target.closest("[data-story-to-catalog]")) {
      renderCatalog();
      setView("catalog");
      return;
    }
    if (event.target.closest("[data-story-begin]")) {
      beginReading();
      return;
    }
    const choiceId = event.target.closest("[data-story-choice]")?.dataset.storyChoice;
    if (choiceId) {
      goChoice(choiceId);
      return;
    }
    if (event.target.closest("[data-story-continue-beat]")) {
      continueBeat();
      return;
    }
    if (event.target.closest("[data-story-reread]")) {
      resetChapterProgress(chapterId);
      startChapter(chapterId);
      nodeId = getChapter(chapterId)?.startNodeId || "";
      setView("read");
      renderRead();
      return;
    }
    if (event.target.closest("[data-story-reset]")) {
      resetChapterProgress(chapterId || listChapters()[0]?.id);
      renderCatalog();
      setView("catalog");
      toast("进度已重置");
    }
  };

  root.addEventListener("click", onClick);
  renderCatalog();
  setView("catalog");
  refreshIcons();

  return {
    open() {
      renderCatalog();
      setView("catalog");
    },
    refresh() {
      renderCatalog();
    },
    destroy() {
      destroyed = true;
      root.removeEventListener("click", onClick);
      root.replaceChildren();
    },
  };
}
