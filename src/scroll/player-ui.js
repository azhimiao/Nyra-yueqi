/** 漫卷产品 UI：作品库 → 章节 → 点读舞台 → 结局。 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { getFrame, getStartFrame, isTerminalFrame, resolveNextFrameId } from "./schema.js";
import { getScrollChapter, getScrollWork, listScrollWorks } from "./presets.js";
import {
  appendScrollEvent,
  completeScrollChapter,
  getScrollSession,
  loadQuickSlot,
  loadScrollState,
  pushHistory,
  saveAutoProgress,
  saveQuickSlot,
  saveScrollPreferences,
} from "./store.js";

const AUTO_DELAY_MS = 1450;
const SKIP_DELAY_MS = 150;

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function formatTime(value) {
  if (!value) return "空书签";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "已保存";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function progressFor(work, session) {
  const total = work.chapters.length;
  const done = session.completedChapters.length;
  if (!session.autoSave) return { label: "尚未开始", ratio: 0 };
  if (done >= total) return { label: "已读完", ratio: 1 };
  const currentIndex = Math.max(0, work.chapters.findIndex((chapter) => chapter.id === session.autoSave.chapterId));
  return { label: `读到第 ${currentIndex + 1} 章`, ratio: Math.min(0.95, (done + 0.4) / total) };
}

function chapterState(work, chapter, session) {
  const index = work.chapters.findIndex((item) => item.id === chapter.id);
  const completed = session.completedChapters.includes(chapter.id);
  const unlocked = index === 0 || session.completedChapters.includes(work.chapters[index - 1]?.id);
  const active = session.autoSave?.chapterId === chapter.id;
  return { index, completed, unlocked, active };
}

export function mountScrollPlayer(root, deps = {}) {
  if (!root) return { destroy() {}, open() {} };

  let destroyed = false;
  let view = "library";
  let selectedWorkId = "";
  let selectedChapterId = "";
  let frameId = "";
  let history = [];
  let flags = {};
  let branchPath = [];
  let ending = null;
  let typewriterTimer = 0;
  let flowTimer = 0;
  let typewriterDone = true;
  let currentFullText = "";
  let autoMode = false;
  let skipReadMode = false;
  let uiHidden = false;
  let historyOpen = false;
  let saveOpen = false;
  let settingsOpen = false;
  let preferences = loadScrollState().preferences;

  root.classList.add("scroll-player");
  root.tabIndex = 0;

  const currentWork = () => getScrollWork(selectedWorkId);
  const currentChapter = () => getScrollChapter(currentWork(), selectedChapterId);
  const currentFrame = () => getFrame(currentChapter(), frameId);

  function clearTimers() {
    window.clearTimeout(typewriterTimer);
    window.clearTimeout(flowTimer);
    typewriterTimer = 0;
    flowTimer = 0;
  }

  function setView(next) {
    view = next;
    root.dataset.scrollView = next;
  }

  function showToast(message) {
    deps.onToast?.(message);
  }

  function renderLibrary() {
    clearTimers();
    setView("library");
    const state = loadScrollState();
    const works = listScrollWorks();
    root.innerHTML = `
      <section class="scroll-library" data-scroll-library>
        <header class="scroll-library__bar">
          <button type="button" class="scroll-icon-btn" data-scroll-home aria-label="返回桌面">${icon("chevron-left")}</button>
          <div><strong>漫卷</strong><span>点屏幕往下读 · 遇选项再选</span></div>
          <span class="scroll-library__count">${works.length} 部</span>
        </header>
        <div class="scroll-library__intro">
          <span>怎么玩</span>
          <h2>今晚想读哪一部？</h2>
          <p class="scroll-library__howto">选故事 → 选章节 → 点屏幕推进对话；出现选项时点选项。立绘与桌宠无关。</p>
        </div>
        <div class="scroll-work-list">
          ${works.map((work) => {
            const session = getScrollSession(work.id);
            const progress = progressFor(work, session);
            const cover = String(work.cover || "").trim();
            return `
              <article class="scroll-work" data-accent="${escapeHtml(work.accent)}">
                <button type="button" class="scroll-work__cover" data-scroll-work="${escapeHtml(work.id)}" aria-label="打开${escapeHtml(work.title)}">
                  ${cover
                    ? `<img src="${escapeHtml(cover)}" alt="" />`
                    : `<span class="scroll-asset-missing"><em>${escapeHtml(work.character.name || "故事")}</em><b>${escapeHtml(work.title)}</b></span>`}
                  <span class="scroll-work__chapter-count">${work.chapters.length} 章</span>
                </button>
                <div class="scroll-work__body">
                  <p>${escapeHtml(work.subtitle)}</p>
                  <h3>${escapeHtml(work.title)}</h3>
                  <span class="scroll-work__synopsis">${escapeHtml(work.synopsis)}</span>
                  <div class="scroll-work__tags">${work.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
                  <div class="scroll-work__progress"><span style="--progress:${progress.ratio}"></span><em>${progress.label}</em></div>
                  <button type="button" class="scroll-command" data-scroll-${session.autoSave ? "continue" : "work"}="${escapeHtml(work.id)}">
                    ${session.autoSave ? "继续阅读" : "查看章节"}${icon("arrow-right")}
                  </button>
                </div>
              </article>
            `;
          }).join("")}
        </div>
        <p class="scroll-library__note">场景用背景图；角色正式立绘未交付时会显示占位，不会借用桌宠图。</p>
      </section>
    `;
    refreshIcons(root);
  }

  function renderChapters() {
    clearTimers();
    setView("chapters");
    const work = currentWork();
    if (!work) return renderLibrary();
    const session = getScrollSession(work.id);
    root.innerHTML = `
      <section class="scroll-chapters">
        <header class="scroll-library__bar">
          <button type="button" class="scroll-icon-btn" data-scroll-library-back aria-label="返回作品库">${icon("chevron-left")}</button>
          <div><strong>${escapeHtml(work.title)}</strong><span>${escapeHtml(work.character.name)} · ${work.chapters.length} 章</span></div>
          <span></span>
        </header>
        <div class="scroll-chapters__hero" data-accent="${escapeHtml(work.accent)}">
          ${String(work.cover || "").trim()
            ? `<img src="${escapeHtml(work.cover)}" alt="" />`
            : `<div class="scroll-asset-missing is-hero"><em>${escapeHtml(work.character.name || "")}</em><b>${escapeHtml(work.title)}</b></div>`}
          <div><span>STORY LINE</span><h2>${escapeHtml(work.title)}</h2><p>${escapeHtml(work.synopsis)}</p></div>
        </div>
        ${session.autoSave ? `
          <button type="button" class="scroll-resume" data-scroll-resume>
            <span>${icon("bookmark")}<em>自动书签</em></span>
            <strong>继续 ${escapeHtml(work.chapters.find((item) => item.id === session.autoSave.chapterId)?.title || "上次阅读")}</strong>
            ${icon("arrow-right")}
          </button>
        ` : ""}
        <div class="scroll-chapter-list">
          ${work.chapters.map((chapter) => {
            const state = chapterState(work, chapter, session);
            const status = state.completed ? "已读完" : state.active ? "阅读中" : state.unlocked ? `${chapter.estimatedMinutes} 分钟` : "完成上一章后解锁";
            return `
              <button type="button" class="scroll-chapter" data-scroll-chapter="${escapeHtml(chapter.id)}" ${state.unlocked ? "" : "disabled"}>
                <span class="scroll-chapter__index">${String(state.index + 1).padStart(2, "0")}</span>
                <span class="scroll-chapter__copy"><strong>${escapeHtml(chapter.title)}</strong><em>${escapeHtml(chapter.subtitle)}</em><small>${status}</small></span>
                ${state.completed ? icon("check") : state.unlocked ? icon("chevron-right") : icon("lock-keyhole")}
              </button>
            `;
          }).join("")}
        </div>
        ${session.endings.length ? `<p class="scroll-ending-count">已收录 ${session.endings.length} 个结局</p>` : ""}
      </section>
    `;
    refreshIcons(root);
  }

  function snapshot() {
    return { chapterId: selectedChapterId, frameId, history, flags, branchPath };
  }

  function persistFrame() {
    const result = saveAutoProgress(selectedWorkId, snapshot());
    return result.ok;
  }

  function panelMarkup() {
    const work = currentWork();
    const chapter = currentChapter();
    const session = getScrollSession(selectedWorkId);
    if (historyOpen) {
      const rows = history.map((id) => getFrame(chapter, id)).filter(Boolean);
      return `
        <aside class="scroll-drawer" data-scroll-panel="history">
          <header><div><strong>阅读回顾</strong><span>${rows.length} 段已读内容</span></div><button data-scroll-close-panel aria-label="关闭">${icon("x")}</button></header>
          <div class="scroll-history">${rows.map((row) => `<article><span>${escapeHtml(row.speaker || "旁白")}</span><p>${escapeHtml(row.text)}</p></article>`).join("") || "<p>还没有已读内容</p>"}</div>
        </aside>`;
    }
    if (saveOpen) {
      return `
        <aside class="scroll-drawer" data-scroll-panel="saves">
          <header><div><strong>书签盒</strong><span>自动档之外的三枚快存书签</span></div><button data-scroll-close-panel aria-label="关闭">${icon("x")}</button></header>
          <div class="scroll-save-list">
            ${session.quickSaves.map((slot) => `
              <div class="scroll-save-slot">
                <input value="${escapeHtml(slot.name)}" data-scroll-slot-name="${slot.id}" aria-label="书签名称" maxlength="24" />
                <span>${slot.snapshot ? `${escapeHtml(chapter?.title || "章节")} · ${formatTime(slot.updatedAt)}` : "还没有保存内容"}</span>
                <div><button data-scroll-save-slot="${slot.id}">${icon("save")}覆盖保存</button><button data-scroll-load-slot="${slot.id}" ${slot.snapshot ? "" : "disabled"}>${icon("folder-open")}读取</button></div>
              </div>
            `).join("")}
          </div>
        </aside>`;
    }
    if (settingsOpen) {
      return `
        <aside class="scroll-drawer" data-scroll-panel="settings">
          <header><div><strong>阅读设置</strong><span>只影响漫卷播放器</span></div><button data-scroll-close-panel aria-label="关闭">${icon("x")}</button></header>
          <div class="scroll-setting-list">
            <label>文字速度<select data-scroll-speed><option value="12" ${preferences.textSpeed === 12 ? "selected" : ""}>快</option><option value="24" ${preferences.textSpeed === 24 ? "selected" : ""}>标准</option><option value="40" ${preferences.textSpeed === 40 ? "selected" : ""}>慢</option></select></label>
            <button type="button" data-scroll-mute><span>${preferences.muted ? icon("volume-x") : icon("volume-2")}声音</span><em>${preferences.muted ? "已静音" : "当前作品无音轨"}</em></button>
            <p>场景图未安装时会显示资源缺失提示，不会用颜色块伪装成正式背景。</p>
          </div>
        </aside>`;
    }
    return "";
  }

  function renderPlayer({ typewrite = true } = {}) {
    setView("player");
    const work = currentWork();
    const chapter = currentChapter();
    const frame = currentFrame();
    if (!work || !chapter || !frame) return renderChapters();

    const background = frame.bg ? work.assets.backgrounds[frame.bg] : null;
    const portrait = frame.portrait ? work.assets.portraits[frame.portrait] : null;
    const choices = frame.choices || [];
    const terminal = isTerminalFrame(chapter, frame.id);
    const saved = persistFrame();

    root.innerHTML = `
      <section class="scroll-stage ${uiHidden ? "is-ui-hidden" : ""}" data-scroll-stage data-mood="${escapeHtml(frame.mood || "quiet")}">
        <div class="scroll-stage__scene">
          ${background?.src ? `<img class="scroll-stage__bg" src="${escapeHtml(background.src)}" alt="${escapeHtml(background.alt)}" />` : `
            <div class="scroll-stage__missing" data-scroll-asset-missing="background">
              ${icon("image-off")}<span>场景素材未安装</span><strong>${escapeHtml(background?.label || frame.bg || "未指定场景")}</strong>
            </div>
          `}
        </div>
        ${portrait && frame.portrait !== "narrator" ? `
          <figure class="scroll-stage__portrait ${portrait.src ? "" : "is-missing"}">
            ${portrait.src
              ? `<img src="${escapeHtml(portrait.src)}" alt="${escapeHtml(portrait.label || "")}" draggable="false" />`
              : `<span data-scroll-asset-missing="portrait"><em>${escapeHtml(portrait.label || "角色")}</em><b>立绘未安装</b><small>不使用桌宠图</small></span>`}
          </figure>
        ` : ""}
        <button type="button" class="scroll-stage__tap" data-scroll-tap aria-label="继续阅读"></button>
        <header class="scroll-stage__bar">
          <button type="button" data-scroll-to-chapters aria-label="返回章节">${icon("chevron-left")}</button>
          <div><strong>${escapeHtml(work.title)}</strong><span>${escapeHtml(chapter.title)} · ${saved ? "自动保存" : "保存失败"}</span></div>
          <button type="button" data-scroll-settings aria-label="阅读设置">${icon("sliders-horizontal")}</button>
        </header>
        <div class="scroll-stage__restore" aria-hidden="true">点击恢复界面</div>
        <section class="scroll-dialogue ${choices.length ? "has-choices" : ""}">
          ${frame.speaker ? `<strong class="scroll-dialogue__speaker">${escapeHtml(frame.speaker)}</strong>` : `<span class="scroll-dialogue__narrator">旁白</span>`}
          <p class="scroll-dialogue__text" data-scroll-text></p>
          ${choices.length ? `<div class="scroll-dialogue__choices">${choices.map((choice) => `<button type="button" data-scroll-choice="${escapeHtml(choice.id)}">${escapeHtml(choice.label)}${icon("arrow-right")}</button>`).join("")}</div>` : ""}
          <footer><span>${terminal ? "读到结尾" : choices.length ? "做出选择" : "点击继续"}</span>${!choices.length ? `<button type="button" data-scroll-next>${terminal ? "收下结局" : "下一句"}</button>` : ""}</footer>
        </section>
        <nav class="scroll-controls" aria-label="阅读控制">
          <button type="button" data-scroll-history title="阅读回顾">${icon("history")}</button>
          <button type="button" data-scroll-auto class="${autoMode ? "is-on" : ""}" aria-pressed="${autoMode}" title="自动播放">${autoMode ? icon("pause") : icon("play")}</button>
          <button type="button" data-scroll-skip class="${skipReadMode ? "is-on" : ""}" aria-pressed="${skipReadMode}" title="已读快进">${icon("fast-forward")}</button>
          <button type="button" data-scroll-hide title="隐藏界面">${icon("eye-off")}</button>
          <button type="button" data-scroll-saves title="快存书签">${icon("bookmark")}</button>
          <button type="button" data-scroll-mute title="静音">${preferences.muted ? icon("volume-x") : icon("volume-2")}</button>
        </nav>
        ${panelMarkup()}
      </section>
    `;
    refreshIcons(root);
    currentFullText = frame.text;
    const textEl = root.querySelector("[data-scroll-text]");
    if (!textEl) return;
    if (typewrite && !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) runTypewriter(textEl, frame.text);
    else {
      textEl.textContent = frame.text;
      typewriterDone = true;
      scheduleFlow();
    }
  }

  function runTypewriter(textEl, text) {
    clearTimers();
    typewriterDone = false;
    textEl.textContent = "";
    let cursor = 0;
    const tick = () => {
      if (destroyed || view !== "player") return;
      cursor += 1;
      textEl.textContent = text.slice(0, cursor);
      if (cursor >= text.length) {
        typewriterDone = true;
        typewriterTimer = 0;
        scheduleFlow();
        return;
      }
      typewriterTimer = window.setTimeout(tick, preferences.textSpeed);
    };
    tick();
  }

  function completeTypewriter() {
    window.clearTimeout(typewriterTimer);
    typewriterTimer = 0;
    const textEl = root.querySelector("[data-scroll-text]");
    if (textEl) textEl.textContent = currentFullText;
    typewriterDone = true;
    scheduleFlow();
  }

  function scheduleFlow() {
    window.clearTimeout(flowTimer);
    const frame = currentFrame();
    const chapter = currentChapter();
    if (!frame || !chapter || frame.choices?.length || isTerminalFrame(chapter, frame.id)) return;
    if (skipReadMode) {
      const nextId = resolveNextFrameId(frame);
      const read = getScrollSession(selectedWorkId).readFrames.includes(nextId);
      if (!read) {
        skipReadMode = false;
        showToast("已到未读内容，快进已暂停");
        renderPlayer({ typewrite: false });
        return;
      }
      flowTimer = window.setTimeout(() => advance(), SKIP_DELAY_MS);
    } else if (autoMode) {
      flowTimer = window.setTimeout(() => advance(), AUTO_DELAY_MS);
    }
  }

  function enterFrame(nextId) {
    const chapter = currentChapter();
    const next = getFrame(chapter, nextId);
    if (!next) {
      showToast("下一帧不存在，已停止推进");
      appendScrollEvent(selectedWorkId, "runtime.error", { chapterId: selectedChapterId, frameId, target: nextId });
      return;
    }
    frameId = next.id;
    history = pushHistory(history, next.id);
    appendScrollEvent(selectedWorkId, "frame.viewed", { chapterId: selectedChapterId, frameId: next.id });
    renderPlayer();
  }

  function finishEnding() {
    const frame = currentFrame();
    if (!frame?.ending) return;
    ending = frame.ending;
    completeScrollChapter(selectedWorkId, { chapterId: selectedChapterId, ending, flags, branchPath });
    renderEnding();
  }

  function advance() {
    const chapter = currentChapter();
    const frame = currentFrame();
    if (!chapter || !frame) return;
    if (!typewriterDone) return completeTypewriter();
    if (frame.choices?.length) return showToast("先选一个方向");
    if (isTerminalFrame(chapter, frame.id)) return finishEnding();
    const nextId = resolveNextFrameId(frame);
    if (nextId) enterFrame(nextId);
  }

  function choose(choiceId) {
    const frame = currentFrame();
    const choice = frame?.choices?.find((item) => item.id === choiceId);
    if (!choice) return;
    flags = { ...flags, ...choice.setFlags };
    branchPath = [...branchPath, choice.id].slice(-80);
    appendScrollEvent(selectedWorkId, "choice.selected", {
      chapterId: selectedChapterId,
      frameId,
      choiceId: choice.id,
      label: choice.label,
      flags: choice.setFlags,
    });
    enterFrame(choice.nextFrameId);
  }

  function startChapter(chapterId, resume = false) {
    const work = currentWork();
    const chapter = getScrollChapter(work, chapterId);
    if (!work || !chapter) return;
    selectedChapterId = chapter.id;
    const session = getScrollSession(work.id);
    const saved = resume && session.autoSave?.chapterId === chapter.id ? session.autoSave : null;
    const start = getStartFrame(chapter);
    frameId = saved?.frameId || start?.id || "";
    history = saved?.history?.length ? saved.history.slice() : frameId ? [frameId] : [];
    flags = saved?.flags ? { ...saved.flags } : {};
    branchPath = saved?.branchPath ? saved.branchPath.slice() : [];
    ending = null;
    historyOpen = false;
    saveOpen = false;
    settingsOpen = false;
    appendScrollEvent(work.id, saved ? "chapter.resumed" : "chapter.started", { chapterId: chapter.id, frameId });
    renderPlayer();
  }

  function restoreSnapshot(saved) {
    const work = currentWork();
    const chapter = getScrollChapter(work, saved?.chapterId);
    const frame = getFrame(chapter, saved?.frameId);
    if (!work || !chapter || !frame) return showToast("书签内容与当前作品版本不兼容");
    selectedChapterId = chapter.id;
    frameId = frame.id;
    history = saved.history.slice();
    flags = { ...saved.flags };
    branchPath = saved.branchPath.slice();
    historyOpen = false;
    saveOpen = false;
    settingsOpen = false;
    renderPlayer({ typewrite: false });
    showToast("已回到书签位置");
  }

  function renderEnding() {
    clearTimers();
    setView("ending");
    const work = currentWork();
    const chapter = currentChapter();
    const session = getScrollSession(selectedWorkId);
    const currentIndex = work.chapters.findIndex((item) => item.id === chapter.id);
    const nextChapter = work.chapters[currentIndex + 1];
    root.innerHTML = `
      <section class="scroll-ending" data-scroll-ending>
        <div class="scroll-ending__mark">${icon("sparkles")}</div>
        <span>ENDING RECORDED</span>
        <h2>${escapeHtml(ending?.title || "故事告一段落")}</h2>
        <p>${escapeHtml(ending?.summary || "你读完了这一章。")}</p>
        <div class="scroll-ending__meta"><span>${escapeHtml(chapter.title)}</span><span>${branchPath.length} 次选择</span><span>共 ${session.endings.length} 个结局</span></div>
        <div class="scroll-ending__actions">
          ${nextChapter ? `<button type="button" class="scroll-command" data-scroll-next-chapter="${escapeHtml(nextChapter.id)}">读下一章${icon("arrow-right")}</button>` : ""}
          <button type="button" data-scroll-replay>${icon("rotate-ccw")}重读本章</button>
          <button type="button" data-scroll-ending-chapters>${icon("list") }返回章节</button>
          <button type="button" data-scroll-ending-library>${icon("library")}返回作品库</button>
        </div>
      </section>
    `;
    refreshIcons(root);
  }

  function open() {
    if (destroyed) return;
    preferences = loadScrollState().preferences;
    selectedWorkId = "";
    selectedChapterId = "";
    renderLibrary();
  }

  function onClick(event) {
    const target = event.target;
    if (target.closest("[data-scroll-home]")) return deps.onHome?.();
    if (target.closest("[data-scroll-library-back], [data-scroll-ending-library]")) return renderLibrary();
    if (target.closest("[data-scroll-to-chapters], [data-scroll-ending-chapters]")) return renderChapters();

    const workId = target.closest("[data-scroll-work]")?.dataset.scrollWork;
    if (workId) {
      selectedWorkId = workId;
      return renderChapters();
    }
    const continueId = target.closest("[data-scroll-continue]")?.dataset.scrollContinue;
    if (continueId) {
      selectedWorkId = continueId;
      const session = getScrollSession(continueId);
      return startChapter(session.autoSave?.chapterId, true);
    }
    if (target.closest("[data-scroll-resume]")) {
      const session = getScrollSession(selectedWorkId);
      return startChapter(session.autoSave?.chapterId, true);
    }
    const chapterId = target.closest("[data-scroll-chapter]")?.dataset.scrollChapter;
    if (chapterId) {
      const session = getScrollSession(selectedWorkId);
      return startChapter(chapterId, session.autoSave?.chapterId === chapterId);
    }
    const nextChapterId = target.closest("[data-scroll-next-chapter]")?.dataset.scrollNextChapter;
    if (nextChapterId) return startChapter(nextChapterId, false);
    if (target.closest("[data-scroll-replay]")) return startChapter(selectedChapterId, false);

    const choiceId = target.closest("[data-scroll-choice]")?.dataset.scrollChoice;
    if (choiceId) return choose(choiceId);
    if (target.closest("[data-scroll-next]")) return advance();
    if (target.closest("[data-scroll-tap]")) {
      if (uiHidden) {
        uiHidden = false;
        return renderPlayer({ typewrite: false });
      }
      return advance();
    }
    if (target.closest("[data-scroll-history]")) {
      historyOpen = true; saveOpen = false; settingsOpen = false; return renderPlayer({ typewrite: false });
    }
    if (target.closest("[data-scroll-saves]")) {
      saveOpen = true; historyOpen = false; settingsOpen = false; return renderPlayer({ typewrite: false });
    }
    if (target.closest("[data-scroll-settings]")) {
      settingsOpen = true; historyOpen = false; saveOpen = false; return renderPlayer({ typewrite: false });
    }
    if (target.closest("[data-scroll-close-panel]")) {
      historyOpen = false; saveOpen = false; settingsOpen = false; return renderPlayer({ typewrite: false });
    }
    if (target.closest("[data-scroll-hide]")) {
      uiHidden = true; return renderPlayer({ typewrite: false });
    }
    if (target.closest("[data-scroll-auto]")) {
      autoMode = !autoMode; skipReadMode = false; renderPlayer({ typewrite: false }); return scheduleFlow();
    }
    if (target.closest("[data-scroll-skip]")) {
      skipReadMode = !skipReadMode; autoMode = false; renderPlayer({ typewrite: false }); return scheduleFlow();
    }
    if (target.closest("[data-scroll-mute]")) {
      const result = saveScrollPreferences({ muted: !preferences.muted });
      preferences = result.preferences;
      showToast(preferences.muted ? "漫卷已静音" : "漫卷声音已开启");
      return renderPlayer({ typewrite: false });
    }
    const saveSlotId = target.closest("[data-scroll-save-slot]")?.dataset.scrollSaveSlot;
    if (saveSlotId) {
      const name = root.querySelector(`[data-scroll-slot-name="${saveSlotId}"]`)?.value || "";
      const result = saveQuickSlot(selectedWorkId, saveSlotId, name, snapshot());
      showToast(result.ok ? "书签已保存" : "保存失败，请检查浏览器存储权限");
      return renderPlayer({ typewrite: false });
    }
    const loadSlotId = target.closest("[data-scroll-load-slot]")?.dataset.scrollLoadSlot;
    if (loadSlotId) {
      const result = loadQuickSlot(selectedWorkId, loadSlotId);
      return result.snapshot ? restoreSnapshot(result.snapshot) : showToast("这枚书签还是空的");
    }
  }

  function onChange(event) {
    if (!event.target.matches("[data-scroll-speed]")) return;
    const result = saveScrollPreferences({ textSpeed: Number(event.target.value) });
    preferences = result.preferences;
    showToast("文字速度已更新");
  }

  function onKeyDown(event) {
    if (view !== "player") return;
    if (event.key === "Escape" && (historyOpen || saveOpen || settingsOpen)) {
      event.preventDefault();
      historyOpen = false; saveOpen = false; settingsOpen = false;
      renderPlayer({ typewrite: false });
    } else if ((event.key === " " || event.key === "Enter") && !event.target.closest("button, input, select, textarea")) {
      event.preventDefault();
      advance();
    }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("keydown", onKeyDown);
  open();

  return {
    open,
    restart: () => selectedChapterId ? startChapter(selectedChapterId, false) : renderLibrary(),
    getFrameId: () => frameId,
    getPackId: () => selectedWorkId,
    getView: () => view,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimers();
      root.removeEventListener("click", onClick);
      root.removeEventListener("change", onChange);
      root.removeEventListener("keydown", onKeyDown);
      root.replaceChildren();
      root.classList.remove("scroll-player");
      delete root.dataset.scrollView;
    },
  };
}
