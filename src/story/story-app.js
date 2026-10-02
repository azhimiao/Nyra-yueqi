/**
 * 剧情 App：角色故事阅读器（纸感会话），不是即时通讯壳。
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { callModel } from "../model/client.js";
import {
  getActiveCharacterId,
  getCharacterSync,
  listCharactersSync,
} from "../characters/store.js";
import { resolveCharacterAvatarUrl } from "../characters/avatar.js";
import { pushExperienceProjectionWithDelivery } from "../experience/projections-feed.js";

export const STORY_STORE_KEY = "yueqi.story.sessions.v1";

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORY_STORE_KEY) || "{}");
    return { sessions: raw?.sessions && typeof raw.sessions === "object" ? raw.sessions : {} };
  } catch {
    return { sessions: {} };
  }
}

function writeBag(bag) {
  try {
    window.localStorage.setItem(STORY_STORE_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}

function getSession(characterId) {
  const id = String(characterId || "").trim();
  const bag = readBag();
  const raw = bag.sessions[id];
  return {
    characterId: id,
    messages: Array.isArray(raw?.messages) ? raw.messages : [],
    updatedAt: String(raw?.updatedAt || ""),
  };
}

function saveSession(characterId, messages) {
  const id = String(characterId || "").trim();
  if (!id) return;
  const bag = readBag();
  bag.sessions[id] = { characterId: id, messages: messages.slice(-80), updatedAt: nowIso() };
  writeBag(bag);
  const last = messages.filter((m) => m.role === "assistant").at(-1);
  if (last?.content) {
    void pushExperienceProjectionWithDelivery({
      kind: "story",
      characterId: id,
      entityId: id,
      summary: last.content,
    });
  }
}

function formatStoryHtml(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return clean
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   collectProviderConfig?: Function,
 *   onToast?: Function,
 *   onOpenTheater?: Function,
 *   onOpenCharacters?: Function,
 *   onHome?: Function,
 * }} [deps]
 */
export function mountStoryApp(root, deps = {}) {
  if (!root) return { destroy() {}, open() {} };

  let destroyed = false;
  let view = "select";
  let characterId = "";
  let messages = [];
  let busy = false;

  root.classList.add("story-app");
  const toast = (msg) => deps.onToast?.(String(msg || "").slice(0, 120));

  function renderSelect() {
    view = "select";
    const chars = listCharactersSync();
    root.innerHTML = `
      <section class="story-reader" data-story-select>
        <div class="story-reader__ornament" aria-hidden="true"></div>
        <header class="story-reader__bar">
          <button type="button" class="story-icon" data-story-home aria-label="返回">${icon("chevron-left")}</button>
          <div class="story-reader__brand"><span>STORY</span><strong>剧情</strong></div>
          <button type="button" class="story-text" data-story-theater>舞台</button>
        </header>
        <div class="story-reader__hero">
          <h1>把故事读下去</h1>
          <p>选一位同行者。你写这一刻，ta以故事文回应——像读一本还没写完的书。</p>
        </div>
        ${chars.length ? `
          <div class="story-cast">
            ${chars.map((item) => {
              const avatar = resolveCharacterAvatarUrl(item);
              const session = getSession(item.id);
              const preview = session.messages.filter((m) => m.role === "assistant").at(-1)?.content || "";
              return `
                <button type="button" class="story-cast__card" data-story-pick="${escapeHtml(item.id)}">
                  <span class="story-cast__cover">
                    ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : `<em>${escapeHtml((item.name || "?").slice(0, 1))}</em>`}
                  </span>
                  <span class="story-cast__body">
                    <strong>${escapeHtml(item.name || "未命名")}</strong>
                    <small>${session.messages.length ? `已有 ${session.messages.length} 段` : "故事从这里开始"}</small>
                    ${preview ? `<em>${escapeHtml(preview.slice(0, 48))}${preview.length > 48 ? "…" : ""}</em>` : ""}
                  </span>
                </button>`;
            }).join("")}
          </div>
        ` : `
          <div class="story-empty">
            <p>还没有角色。</p>
            <button type="button" class="story-primary" data-story-open-chars>去创建角色</button>
          </div>
        `}
      </section>
    `;
    refreshIcons(root);
  }

  function renderThread() {
    view = "thread";
    const char = getCharacterSync(characterId);
    if (!char) return renderSelect();
    const avatar = resolveCharacterAvatarUrl(char);
    const title = char.name ? `与${char.name}` : "本次阅读";
    root.innerHTML = `
      <section class="story-reader is-thread" data-story-thread-view>
        <div class="story-reader__ornament" aria-hidden="true"></div>
        <header class="story-reader__bar">
          <button type="button" class="story-icon" data-story-back aria-label="返回">${icon("chevron-left")}</button>
          <div class="story-reader__brand"><span>READING</span><strong>${escapeHtml(char.name || "剧情")}</strong></div>
          <button type="button" class="story-text" data-story-theater>舞台</button>
        </header>
        <div class="story-stage" data-story-thread>
          <article class="story-meta">
            <span class="story-meta__cover">
              ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : `<em>${escapeHtml((char.name || "?").slice(0, 1))}</em>`}
            </span>
            <div>
              <span>本次阅读</span>
              <h2>${escapeHtml(title)}</h2>
              <p>${busy ? "ta正在写下下一段…" : "故事从这里继续"}</p>
            </div>
          </article>
          ${messages.length ? messages.map((msg) => {
            const isUser = msg.role === "user";
            return `
              <article class="story-entry ${isUser ? "is-user" : "is-ai"}">
                ${isUser ? "" : `
                  <span class="story-entry__avatar">
                    ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : `<em>${escapeHtml((char.name || "?").slice(0, 1))}</em>`}
                  </span>
                `}
                <div class="story-entry__body">
                  <header>
                    <strong>${isUser ? "你" : escapeHtml(char.name || "ta")}</strong>
                  </header>
                  <div class="story-entry__prose">${isUser ? `<p>${escapeHtml(msg.content)}</p>` : formatStoryHtml(msg.content)}</div>
                </div>
              </article>`;
          }).join("") : `
            <div class="story-empty-thread">
              <p>故事从这里开始。</p>
              <p>写一句发生了什么，或对ta说的话。</p>
            </div>
          `}
          ${busy ? `<div class="story-typing" aria-live="polite"><span></span><span></span><span></span></div>` : ""}
        </div>
        <form class="story-composer" data-story-form>
          <textarea rows="2" maxlength="1200" placeholder="写下这一刻…" data-story-input ${busy ? "disabled" : ""}></textarea>
          <button type="submit" ${busy ? "disabled" : ""} aria-label="发送">${icon("send")}</button>
        </form>
      </section>
    `;
    refreshIcons(root);
    const thread = root.querySelector("[data-story-thread]");
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  async function sendTurn(text) {
    const content = String(text || "").trim();
    if (!content || busy) return;
    const char = getCharacterSync(characterId);
    if (!char) return;
    messages = [...messages, { id: `u-${Date.now()}`, role: "user", content, at: nowIso() }];
    saveSession(characterId, messages);
    busy = true;
    renderThread();
    try {
      const config = typeof deps.collectProviderConfig === "function"
        ? await deps.collectProviderConfig()
        : null;
      if (!config?.apiKey || !config?.baseUrl || !config?.model) {
        throw new Error("请先在接口页配置模型");
      }
      const llmMessages = [
        {
          role: "system",
          content: `你是角色「${char.name}」的剧情写手。用第二人称或角色对白推进一段关系故事。用中文，分自然段，像短篇小说片段，不要输出 JSON 或系统说明。`,
        },
        ...messages.slice(-20).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
      ];
      const result = await callModel(config, llmMessages, {
        stream: false,
        temperature: 0.85,
        businessPurpose: "creative.story_continue",
        capability: "chat",
        companionId: characterId,
      });
      const reply = String(result?.content || "").trim() || "……（ta没有接下这一句）";
      messages = [...messages, { id: `a-${Date.now()}`, role: "assistant", content: reply, at: nowIso() }];
      saveSession(characterId, messages);
    } catch (error) {
      toast(error?.message || "生成失败");
      messages = messages.slice(0, -1);
      saveSession(characterId, messages);
    } finally {
      busy = false;
      renderThread();
    }
  }

  function onClick(event) {
    if (event.target.closest("[data-story-home]")) return deps.onHome?.();
    if (event.target.closest("[data-story-theater]")) return deps.onOpenTheater?.();
    if (event.target.closest("[data-story-open-chars]")) return deps.onOpenCharacters?.();
    if (event.target.closest("[data-story-back]")) {
      characterId = "";
      messages = [];
      return renderSelect();
    }
    const id = event.target.closest("[data-story-pick]")?.getAttribute("data-story-pick");
    if (id) {
      characterId = id;
      messages = getSession(id).messages.slice();
      return renderThread();
    }
  }

  function onSubmit(event) {
    const form = event.target.closest("[data-story-form]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("[data-story-input]");
    const text = input?.value || "";
    if (input) input.value = "";
    return sendTurn(text);
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);

  function open() {
    if (destroyed) return;
    const active = getActiveCharacterId();
    if (active && listCharactersSync().some((c) => c.id === active)) {
      characterId = active;
      messages = getSession(active).messages.slice();
      renderThread();
    } else {
      renderSelect();
    }
  }

  open();

  return {
    open,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener("click", onClick);
      root.removeEventListener("submit", onSubmit);
      root.replaceChildren();
      root.classList.remove("story-app");
    },
  };
}
