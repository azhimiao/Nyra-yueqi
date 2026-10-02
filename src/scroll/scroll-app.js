/**
 * 漫卷 App：选角色（影院选角）→ 章节 hub → VN 帧局。
 * UI 对齐通用 Gal 手感（全屏场景 + 底对话框 + 点屏推进），不复制参考源码。
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { listCharactersSync, getCharacterSync, getActiveCharacterId } from "../characters/store.js";
import { resolveCharacterAvatarUrl } from "../characters/avatar.js";
import { generateVnCompletion } from "./vn-engine.js";
import {
  clearCharacterScrollSession,
  getCharacterScrollSession,
  projectScrollMemory,
  saveCharacterScrollSession,
} from "./character-session.js";

const MOOD_SCENES = Object.freeze({
  quiet: "radial-gradient(120% 80% at 50% -10%, rgb(120 170 155 / 28%), transparent 55%), linear-gradient(165deg, #e8f0ec 0%, #dfeae4 48%, #eef3f0 100%)",
  warm: "radial-gradient(120% 80% at 80% 0%, rgb(220 180 140 / 32%), transparent 50%), linear-gradient(165deg, #f5efe6 0%, #ebe3d6 50%, #f3eee6 100%)",
  night: "radial-gradient(100% 70% at 50% 0%, rgb(120 150 180 / 22%), transparent 55%), linear-gradient(165deg, #e4ebf2 0%, #d8e2ec 50%, #eef2f6 100%)",
  rain: "radial-gradient(100% 70% at 40% 0%, rgb(130 160 170 / 24%), transparent 55%), linear-gradient(165deg, #e4ecee 0%, #d7e2e5 50%, #eef3f4 100%)",
  soft: "radial-gradient(120% 80% at 50% -10%, rgb(170 150 180 / 20%), transparent 55%), linear-gradient(165deg, #efeaf2 0%, #e6e0ec 50%, #f4f1f6 100%)",
});

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function moodOf(frame) {
  const m = String(frame?.mood || "").toLowerCase();
  if (MOOD_SCENES[m]) return m;
  const text = String(frame?.text || "");
  if (/雨|伞|水/.test(text)) return "rain";
  if (/夜|灯|月/.test(text)) return "night";
  if (/暖|茶|笑|春/.test(text)) return "warm";
  if (/轻|柔|风/.test(text)) return "soft";
  return "quiet";
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   onHome?: () => void,
 *   onToast?: (msg: string) => void,
 *   collectProviderConfig?: () => Promise<object>|object,
 *   onOpenCharacters?: () => void,
 * }} [deps]
 */
export function mountScrollPlayer(root, deps = {}) {
  if (!root) return { destroy() {}, open() {} };

  let destroyed = false;
  /** @type {"select"|"hub"|"live"|"demo"} */
  let view = "select";
  let characterId = "";
  let liveFrames = [];
  let liveIndex = 0;
  let liveOptions = null;
  let liveEnding = null;
  let liveBusy = false;
  let freeInputOpen = false;
  let autoMode = false;
  let typewriterDone = true;
  let typewriterTimer = 0;
  let autoTimer = 0;
  let currentFullText = "";
  let uiHidden = false;

  root.classList.add("scroll-player");
  const toast = (msg) => deps.onToast?.(String(msg || "").slice(0, 120));

  function character() {
    return getCharacterSync(characterId) || null;
  }

  function setView(next) {
    view = next;
    root.dataset.scrollView = next;
  }

  function clearTimers() {
    window.clearTimeout(typewriterTimer);
    window.clearTimeout(autoTimer);
    typewriterTimer = 0;
    autoTimer = 0;
  }

  function renderSelect() {
    setView("select");
    clearTimers();
    const chars = listCharactersSync();
    root.innerHTML = `
      <section class="scroll-cinema" data-scroll-select>
        <div class="scroll-cinema__glow" aria-hidden="true"></div>
        <header class="scroll-cinema__bar">
          <button type="button" class="scroll-icon-btn" data-scroll-home aria-label="返回桌面">${icon("chevron-left")}</button>
          <div><strong>漫卷</strong><span>VISUAL NOVEL</span></div>
          <span></span>
        </header>
        <div class="scroll-cinema__hero">
          <em>和谁一起演？</em>
          <h1>选一位同行者</h1>
          <p>点开卡片开始。局内点屏幕推进，选项出现时再选，或自己说话续写。</p>
        </div>
        ${chars.length ? `
          <div class="scroll-strip" data-scroll-strip>
            ${chars.map((item, index) => {
              const avatar = resolveCharacterAvatarUrl(item);
              const session = getCharacterScrollSession(item.id);
              const tone = ["warm", "night", "soft", "rain", "quiet"][index % 5];
              const progress = session.frames.length
                ? `第 ${session.chapterIndex + 1} 章 · ${session.frames.length} 帧`
                : "尚未开幕";
              return `
                <button type="button" class="scroll-strip__card tone-${tone}" data-scroll-pick-char="${escapeHtml(item.id)}">
                  <span class="scroll-strip__art" style="background:${MOOD_SCENES[tone]}">
                    ${avatar
                      ? `<img src="${escapeHtml(avatar)}" alt="" />`
                      : `<em>${escapeHtml((item.name || "?").slice(0, 1))}</em>`}
                  </span>
                  <span class="scroll-strip__meta">
                    <strong>${escapeHtml(item.name || "未命名")}</strong>
                    <small>${escapeHtml(progress)}</small>
                  </span>
                </button>`;
            }).join("")}
          </div>
        ` : `
          <div class="scroll-cinema__empty">
            <p>还没有角色，无法开幕。</p>
            <button type="button" class="scroll-command" data-scroll-open-chars>去创建角色${icon("arrow-right")}</button>
          </div>
        `}
      </section>
    `;
    refreshIcons(root);
  }

  function renderHub() {
    setView("hub");
    clearTimers();
    const char = character();
    if (!char) return renderSelect();
    const session = getCharacterScrollSession(characterId);
    const avatar = resolveCharacterAvatarUrl(char);
    root.innerHTML = `
      <section class="scroll-hub" data-scroll-hub>
        <div class="scroll-hub__scene" style="background:${MOOD_SCENES.night}" aria-hidden="true"></div>
        <header class="scroll-cinema__bar is-on-dark">
          <button type="button" class="scroll-icon-btn" data-scroll-back-select aria-label="重选角色">${icon("chevron-left")}</button>
          <div><strong>${escapeHtml(char.name || "角色")}</strong><span>章节</span></div>
          <span></span>
        </header>
        <div class="scroll-hub__cast">
          <span class="scroll-hub__avatar">${avatar
            ? `<img src="${escapeHtml(avatar)}" alt="" />`
            : `<em>${escapeHtml((char.name || "?").slice(0, 1))}</em>`}</span>
          <div>
            <span>CURRENT CHAPTER</span>
            <h2>${escapeHtml(session.chapterTitle || "第一章")}</h2>
            <p>${session.frames.length
              ? `本章已有 ${session.frames.length} 段对白，可继续读`
              : "还没开场：先写下你想从哪开始，再由模型演出"}</p>
          </div>
        </div>
        <div class="scroll-hub__actions">
          ${session.frames.length ? `
            <button type="button" class="scroll-command is-primary" data-scroll-live-continue>
              继续阅读${icon("play")}
            </button>
          ` : ""}
          <button type="button" class="scroll-command ${session.frames.length ? "" : "is-primary"}" data-scroll-open-compose>
            ${session.frames.length ? "新开一章" : "写下开场"}${icon("sparkles")}
          </button>
          ${session.frames.length ? `<button type="button" class="scroll-ghost" data-scroll-live-reset>清空本章</button>` : ""}
        </div>
      </section>
    `;
    refreshIcons(root);
  }

  function renderCompose() {
    setView("hub");
    const char = character();
    if (!char) return renderSelect();
    root.innerHTML = `
      <section class="scroll-hub scroll-hub--compose" data-scroll-compose-view>
        <div class="scroll-hub__scene" aria-hidden="true"></div>
        <header class="scroll-cinema__bar">
          <button type="button" class="scroll-icon-btn" data-scroll-back-hub aria-label="返回">${icon("chevron-left")}</button>
          <div class="scroll-cinema__title">
            <strong>${escapeHtml(char.name || "角色")}</strong>
            <span>你来定义开场</span>
          </div>
          <span class="scroll-cinema__spacer" aria-hidden="true"></span>
        </header>
        <form class="scroll-compose" data-scroll-compose-form>
          <label>
            <span>章节标题</span>
            <input type="text" maxlength="40" placeholder="例如：雨停之前（可留空）" data-compose-title />
          </label>
          <label>
            <span>开场（你想从哪里开始）</span>
            <textarea rows="5" maxlength="600" placeholder="用自己的话写下第一幕的情境、地点或想说的话。不会使用任何默认故事。" data-compose-opening required></textarea>
          </label>
          <button type="submit" class="scroll-command is-primary">用这个开场开始${icon("sparkles")}</button>
        </form>
      </section>
    `;
    refreshIcons(root);
  }

  function persistLive(partial = {}) {
    saveCharacterScrollSession(characterId, {
      frames: liveFrames,
      frameIndex: liveIndex,
      options: liveOptions,
      ending: liveEnding,
      ...partial,
    });
  }

  function currentFrame() {
    return liveFrames[liveIndex] || null;
  }

  function runTypewriter(textEl, text) {
    clearTimers();
    typewriterDone = false;
    currentFullText = text;
    textEl.textContent = "";
    let cursor = 0;
    const tick = () => {
      if (destroyed || view !== "live") return;
      cursor += 1;
      textEl.textContent = text.slice(0, cursor);
      if (cursor >= text.length) {
        typewriterDone = true;
        typewriterTimer = 0;
        scheduleAuto();
        return;
      }
      typewriterTimer = window.setTimeout(tick, 28);
    };
    tick();
  }

  function completeTypewriter() {
    window.clearTimeout(typewriterTimer);
    typewriterTimer = 0;
    const textEl = root.querySelector("[data-scroll-text]");
    if (textEl) textEl.textContent = currentFullText;
    typewriterDone = true;
    scheduleAuto();
  }

  function scheduleAuto() {
    window.clearTimeout(autoTimer);
    if (!autoMode || !typewriterDone || liveBusy) return;
    const frame = currentFrame();
    if (!frame) return;
    const atEnd = liveIndex >= liveFrames.length - 1;
    if (atEnd && (liveOptions?.length || liveEnding || freeInputOpen)) return;
    autoTimer = window.setTimeout(() => advanceLive(), 1600);
  }

  function renderLive() {
    setView("live");
    const char = character();
    const frame = currentFrame();
    // First open: generation runs with empty frames. Show waiting stage instead of
    // bouncing to hub with a jargon toast ("还没有剧情帧").
    if (!frame) {
      if (!liveBusy) return renderHub();
      root.innerHTML = `
        <section class="scroll-stage" data-scroll-live data-mood="quiet">
          <div class="scroll-stage__scene" style="background:${MOOD_SCENES.quiet}">
            <div class="scroll-stage__atmosphere"><span>开场中</span></div>
          </div>
          <header class="scroll-stage__bar">
            <button type="button" data-live-back aria-label="返回">${icon("chevron-left")}</button>
            <div><strong>${escapeHtml(char?.name || "漫卷")}</strong><span>正在写下第一幕…</span></div>
            <span></span>
          </header>
          <section class="scroll-dialogue" data-live-dialogue>
            <span class="scroll-dialogue__narrator">旁白</span>
            <p class="scroll-dialogue__text" data-scroll-text>根据你的开场生成剧情，稍等片刻。</p>
            <footer><span>生成中</span></footer>
          </section>
        </section>
      `;
      refreshIcons(root);
      return;
    }
    const atEnd = liveIndex >= liveFrames.length - 1;
    const showOptions = atEnd && Array.isArray(liveOptions) && liveOptions.length && !liveEnding;
    const mood = moodOf(frame);
    const speaker = frame.speaker || "";
    const isNarration = !speaker || /旁白|narrat/i.test(speaker);

    root.innerHTML = `
      <section class="scroll-stage ${uiHidden ? "is-ui-hidden" : ""}" data-scroll-live data-mood="${escapeHtml(mood)}">
        <div class="scroll-stage__scene" style="background:${MOOD_SCENES[mood]}">
          <div class="scroll-stage__atmosphere">
            <span>${escapeHtml(frame.bg || "场景")}</span>
          </div>
        </div>
        ${!isNarration ? `
          <figure class="scroll-stage__portrait is-presence">
            <span class="scroll-stage__presence">
              <em>${escapeHtml((speaker || char?.name || "?").slice(0, 1))}</em>
            </span>
          </figure>
        ` : ""}
        <button type="button" class="scroll-stage__tap" data-live-tap aria-label="继续"></button>
        <header class="scroll-stage__bar">
          <button type="button" data-live-back aria-label="返回">${icon("chevron-left")}</button>
          <div><strong>${escapeHtml(char?.name || "漫卷")}</strong><span>${liveBusy ? "正在续写…" : "点屏幕推进"}</span></div>
          <button type="button" data-live-hide aria-label="隐藏界面">${icon(uiHidden ? "eye" : "eye-off")}</button>
        </header>
        <div class="scroll-stage__restore" aria-hidden="true">点击恢复界面</div>
        <section class="scroll-dialogue ${showOptions || freeInputOpen ? "has-choices" : ""}" data-live-dialogue>
          ${!isNarration
            ? `<strong class="scroll-dialogue__speaker">${escapeHtml(speaker)}</strong>`
            : `<span class="scroll-dialogue__narrator">旁白</span>`}
          <p class="scroll-dialogue__text" data-scroll-text></p>
          ${showOptions ? `<div class="scroll-dialogue__choices">${liveOptions.map((opt) => `
            <button type="button" data-live-choice="${escapeHtml(opt.id)}">${escapeHtml(opt.label)}${icon("arrow-right")}</button>
          `).join("")}
            <button type="button" class="is-free" data-live-free>我想说…${icon("pencil")}</button>
          </div>` : ""}
          ${freeInputOpen ? `
            <form class="scroll-live-form" data-live-form>
              <textarea rows="2" maxlength="400" placeholder="对ta说一句…" data-live-input autofocus></textarea>
              <button type="submit">发送</button>
            </form>
          ` : ""}
          ${liveEnding ? `
            <div class="scroll-live-ending">
              <span>ENDING</span>
              <strong>${escapeHtml(liveEnding.title)}</strong>
              <p>${escapeHtml(liveEnding.summary || "")}</p>
              <button type="button" data-live-finish>收下结局</button>
            </div>
          ` : ""}
          <footer>
            <span>${liveBusy ? "生成中" : atEnd ? (showOptions ? "做出选择" : liveEnding ? "结局" : "等待续写") : "点击继续"}</span>
            ${!showOptions && !freeInputOpen && !liveEnding && !liveBusy ? `<button type="button" data-live-next>下一句</button>` : ""}
          </footer>
        </section>
        <nav class="scroll-controls" aria-label="阅读控制">
          <button type="button" data-live-auto class="${autoMode ? "is-on" : ""}" aria-pressed="${autoMode}" title="自动">${autoMode ? icon("pause") : icon("play")}</button>
          <button type="button" data-live-hide title="隐藏界面">${icon("eye-off")}</button>
        </nav>
      </section>
    `;
    refreshIcons(root);
    const textEl = root.querySelector("[data-scroll-text]");
    if (!textEl) return;
    currentFullText = frame.text || "";
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || liveBusy) {
      textEl.textContent = currentFullText;
      typewriterDone = true;
      scheduleAuto();
    } else {
      runTypewriter(textEl, currentFullText);
    }
  }

  async function requestGeneration(userTurn, asChoiceLabel = "") {
    if (liveBusy) return;
    const char = character();
    if (!char) return;
    liveBusy = true;
    freeInputOpen = false;
    clearTimers();
    renderLive();
    try {
      const session = getCharacterScrollSession(characterId);
      const history = session.historyMessages || [];
      const turn = asChoiceLabel
        ? `用户选择了：${asChoiceLabel}`
        : userTurn;
      const result = await generateVnCompletion({
        collectProviderConfig: deps.collectProviderConfig,
        characterName: char.name,
        characterId,
        history,
        userTurn: turn,
      });
      const baseId = Date.now().toString(36);
      const newFrames = result.frames.map((frame, index) => ({
        ...frame,
        id: `${baseId}-${index}`,
      }));
      liveFrames = [...liveFrames, ...newFrames];
      liveIndex = Math.max(0, liveFrames.length - newFrames.length);
      liveOptions = result.options;
      liveEnding = result.ending;
      const nextHistory = [
        ...history,
        { role: "user", content: turn },
        { role: "assistant", content: result.rawText.slice(0, 4000) },
      ].slice(-40);
      persistLive({ historyMessages: nextHistory });
      if (liveEnding) {
        projectScrollMemory(characterId, `${char.name}·漫卷：${liveEnding.title} — ${liveEnding.summary || ""}`);
      }
    } catch (error) {
      const code = error?.code || "";
      const msg = code === "provider_missing"
        ? "请先在设置里配置模型接口，再开漫卷"
        : code === "vn_parse_failed"
          ? "模型没写出可用剧情，请再试一次"
          : (error?.message || "续写失败，请再试一次");
      toast(msg);
    } finally {
      liveBusy = false;
      if (liveFrames.length) renderLive();
      else renderHub();
    }
  }

  async function startLiveChapter(fresh = false, userOpening = null) {
    const char = character();
    if (!char) return renderSelect();
    if (fresh) clearCharacterScrollSession(characterId);
    const session = getCharacterScrollSession(characterId);
    if (!fresh && session.frames.length && !userOpening) {
      liveFrames = session.frames.slice();
      liveIndex = Math.min(session.frameIndex, Math.max(0, liveFrames.length - 1));
      liveOptions = session.options;
      liveEnding = session.ending;
      return renderLive();
    }
    const opening = String(userOpening?.text || "").trim();
    const title = String(userOpening?.title || "").trim() || `第 ${(session.chapterIndex || 0) + 1} 章`;
    if (!opening) return renderCompose();
    liveFrames = [];
    liveIndex = 0;
    liveOptions = null;
    liveEnding = null;
    persistLive({
      chapterIndex: fresh || session.frames.length ? (session.chapterIndex || 0) + (session.frames.length ? 1 : 0) : session.chapterIndex,
      chapterTitle: title,
      historyMessages: [],
      frames: [],
      frameIndex: 0,
      options: null,
      ending: null,
    });
    await requestGeneration(`【用户自定义开场】标题：${title}\n情境：${opening}\n请据此生成第一幕帧，不要改用其他默认故事。`);
  }

  function advanceLive() {
    if (liveBusy) return;
    if (!typewriterDone) {
      completeTypewriter();
      return;
    }
    if (liveEnding && liveIndex >= liveFrames.length - 1) return;
    if (liveIndex < liveFrames.length - 1) {
      liveIndex += 1;
      persistLive();
      return renderLive();
    }
    if (liveOptions?.length) {
      toast("先选一个方向，或点「我想说」");
      return;
    }
    if (liveEnding) return;
    return requestGeneration("请根据上文继续推进剧情。");
  }

  function openDemo() {
    toast("已取消示范短篇，请用自己的开场");
  }

  function onClick(event) {
    const t = event.target;
    if (t.closest("[data-scroll-home]")) return deps.onHome?.();
    if (t.closest("[data-scroll-open-chars]")) return deps.onOpenCharacters?.();
    if (t.closest("[data-scroll-open-demo]")) return openDemo();
    if (t.closest("[data-scroll-back-select]")) {
      characterId = "";
      return renderSelect();
    }
    if (t.closest("[data-scroll-back-hub]")) return renderHub();
    // Open-compose is button-only. Never put this attr on the compose view shell —
    // clicks on submit/inputs would remount the form and look "dead".
    if (t.closest("[data-scroll-open-compose]")) return renderCompose();
    const pick = t.closest("[data-scroll-pick-char]")?.getAttribute("data-scroll-pick-char");
    if (pick) {
      characterId = pick;
      return renderHub();
    }
    if (t.closest("[data-scroll-live-continue]")) return startLiveChapter(false);
    if (t.closest("[data-scroll-live-start]")) return renderCompose();
    if (t.closest("[data-scroll-live-reset]")) {
      clearCharacterScrollSession(characterId);
      toast("已清空");
      return renderHub();
    }
    if (t.closest("[data-live-back]")) {
      clearTimers();
      autoMode = false;
      return renderHub();
    }
    if (t.closest("[data-live-hide]")) {
      uiHidden = !uiHidden;
      return renderLive();
    }
    if (t.closest("[data-live-auto]")) {
      autoMode = !autoMode;
      if (autoMode) scheduleAuto();
      else window.clearTimeout(autoTimer);
      return renderLive();
    }
    if (t.closest("[data-live-next]") || t.closest("[data-live-tap]")) {
      if (uiHidden) {
        uiHidden = false;
        return renderLive();
      }
      return advanceLive();
    }
    if (t.closest("[data-live-free]")) {
      freeInputOpen = true;
      return renderLive();
    }
    const choiceId = t.closest("[data-live-choice]")?.getAttribute("data-live-choice");
    if (choiceId) {
      const opt = (liveOptions || []).find((item) => item.id === choiceId);
      return requestGeneration("", opt?.label || choiceId);
    }
    if (t.closest("[data-live-finish]")) {
      clearTimers();
      return renderHub();
    }
  }

  function onSubmit(event) {
    const compose = event.target.closest("[data-scroll-compose-form]");
    if (compose) {
      event.preventDefault();
      const title = compose.querySelector("[data-compose-title]")?.value || "";
      const text = compose.querySelector("[data-compose-opening]")?.value || "";
      if (!String(text).trim()) {
        toast("请先写下开场");
        return;
      }
      return startLiveChapter(true, { title, text });
    }
    const form = event.target.closest("[data-live-form]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("[data-live-input]");
    const text = String(input?.value || "").trim();
    if (!text) return;
    return requestGeneration(text);
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);

  function open() {
    if (destroyed) return;
    const active = getActiveCharacterId();
    if (active && listCharactersSync().some((c) => c.id === active)) {
      characterId = active;
      const session = getCharacterScrollSession(active);
      if (session.frames.length) return renderHub();
    }
    renderSelect();
  }

  open();

  return {
    open,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimers();
      root.removeEventListener("click", onClick);
      root.removeEventListener("submit", onSubmit);
      root.replaceChildren();
      root.classList.remove("scroll-player");
    },
  };
}
