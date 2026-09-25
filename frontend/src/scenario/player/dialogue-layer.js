/** Dialogue timeline projected from Conversation V2. */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";

/** @param {HTMLElement} host @param {{onAction?:(action:string,message:object)=>void}} deps */
export function createDialogueLayer(host, deps = {}) {
  if (!host) return { render() {}, destroy() {} };

  host.classList.add("scenario-dialogue-layer");
  host.innerHTML = `<div class="scenario-dialogue-current" data-dialogue-current aria-live="polite"></div>`;
  const current = host.querySelector("[data-dialogue-current]");

  function formatTime(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function avatarMarkup({ name, src = "", user = false }) {
    if (src && !user) return `<img src="${escapeHtml(src)}" alt="" draggable="false" />`;
    return `<span aria-hidden="true">${escapeHtml(user ? "我" : String(name || "角色").slice(0, 1))}</span>`;
  }

  function normalizeRows(input = {}) {
    if (Array.isArray(input.messages)) {
      return input.messages
        .map((row) => ({
          id: String(row.messageId || row.id || ""),
          role: row.role === "user" ? "user" : row.role === "system" ? "system" : "assistant",
          text: String(row.text || row.content || ""),
          createdAt: row.createdAt || row.at,
          contentBlocks: Array.isArray(row.contentBlocks || row.meta?.contentBlocks)
            ? (row.contentBlocks || row.meta.contentBlocks)
            : [],
          candidateCount: Number(row.candidateCount || row.meta?.candidateCount || 1),
        }))
        .filter((row) => row.text || row.contentBlocks.length);
    }
    return (input.beats || [])
      .map((beat) => ({
        id: String(beat.id || ""),
        role: beat.kind === "user" || beat.kind === "choice"
          ? "user"
          : beat.kind === "narration" || beat.kind === "system" ? "system" : "assistant",
        text: String(beat.text || ""),
        createdAt: beat.at || beat.createdAt,
        contentBlocks: [],
        candidateCount: 1,
      }))
      .filter((row) => row.text);
  }

  function actionMarkup(row) {
    const id = escapeHtml(row.id);
    const common = `data-scenario-message-id="${id}"`;
    const actions = [
      `<button type="button" data-scenario-message-action="copy" ${common} aria-label="复制"><i data-lucide="copy"></i></button>`,
    ];
    if (row.role === "user") {
      actions.push(`<button type="button" data-scenario-message-action="edit" ${common} aria-label="编辑"><i data-lucide="pencil"></i></button>`);
    }
    if (row.role === "assistant") {
      actions.push(`<button type="button" data-scenario-message-action="regenerate" ${common} aria-label="重新生成"><i data-lucide="refresh-cw"></i></button>`);
    }
    if (row.role !== "system") {
      actions.push(`<button type="button" data-scenario-message-action="fork" ${common} aria-label="从这里分支"><i data-lucide="git-branch"></i></button>`);
    }
    return `<div class="scenario-message-actions">${actions.join("")}</div>`;
  }

  function assistantContent(row) {
    if (!row.contentBlocks.length) {
      return `<div class="scenario-story-bubble"><p>${escapeHtml(row.text)}</p></div>`;
    }
    return row.contentBlocks.map((block) => {
      const type = ["narration", "dialogue", "inner"].includes(block?.type)
        ? block.type
        : "dialogue";
      const speaker = block?.speakerName
        ? `<strong class="scenario-block-speaker">${escapeHtml(block.speakerName)}</strong>`
        : "";
      if (type === "narration") {
        return `<div class="scenario-content-block is-narration"><p>${escapeHtml(block.text)}</p></div>`;
      }
      if (type === "inner") {
        return `<div class="scenario-content-block is-inner">${speaker}<p>${escapeHtml(block.text)}</p></div>`;
      }
      return `<div class="scenario-story-bubble scenario-content-block is-dialogue">${speaker}<p>${escapeHtml(block.text)}</p></div>`;
    }).join("");
  }

  function render(input = {}) {
    if (!current) return;
    const rows = normalizeRows(input).slice(-80);
    const leadName = input.leadName || "主演";
    const leadAvatar = input.leadAvatar || "";
    if (!rows.length) {
      current.innerHTML = `<div class="scenario-story-empty"><span>STORY</span><strong>故事从这里开始</strong><p>写下你的行动或第一句话。</p></div>`;
      return;
    }
    current.innerHTML = rows.map((row, index) => {
      const latest = index === rows.length - 1;
      if (row.role === "system") {
        return `<article class="scenario-story-row scenario-beat is-narration ${latest ? "is-current" : ""}" data-role="system" data-message-id="${escapeHtml(row.id)}"><p>${escapeHtml(row.text)}</p>${actionMarkup(row)}</article>`;
      }
      const user = row.role === "user";
      const speaker = user ? "我" : leadName;
      return `<article class="scenario-story-row scenario-beat ${user ? "is-user" : "is-npc"} ${latest ? "is-current" : ""}" data-role="${row.role}" data-message-id="${escapeHtml(row.id)}">
        <div class="scenario-story-avatar">${avatarMarkup({ name: speaker, src: leadAvatar, user })}</div>
        <div class="scenario-story-bubble-wrap"><header><strong>${escapeHtml(speaker)}</strong><time>${escapeHtml(formatTime(row.createdAt))}</time>${row.candidateCount > 1 ? `<em>${row.candidateCount} 个版本</em>` : ""}</header>${user ? `<div class="scenario-story-bubble"><p>${escapeHtml(row.text)}</p></div>` : assistantContent(row)}${actionMarkup(row)}</div>
      </article>`;
    }).join("");
    refreshIcons();
  }

  let lastInput = {};
  const onClick = (event) => {
    const save = event.target.closest("[data-scenario-edit-save]");
    const cancel = event.target.closest("[data-scenario-edit-cancel]");
    if (cancel) {
      renderWithCache(lastInput);
      return;
    }
    if (save) {
      const article = save.closest("[data-message-id]");
      const id = String(article?.dataset.messageId || "");
      const row = inputCache.find((item) => item.id === id);
      const editedText = String(article?.querySelector("[data-scenario-edit-input]")?.value || "").trim();
      if (row && editedText) deps.onAction?.("edit", { ...row, editedText });
      return;
    }
    const button = event.target.closest("[data-scenario-message-action]");
    if (!button) return;
    const id = String(button.dataset.scenarioMessageId || "");
    const action = String(button.dataset.scenarioMessageAction || "");
    const row = inputCache.find((item) => item.id === id);
    if (!row) return;
    if (action === "edit") {
      const article = button.closest("[data-message-id]");
      const wrap = article?.querySelector(".scenario-story-bubble-wrap");
      const bubble = wrap?.querySelector(".scenario-story-bubble");
      if (!wrap || !bubble) return;
      bubble.outerHTML = `<div class="scenario-message-editor"><textarea data-scenario-edit-input aria-label="编辑你的行动或台词">${escapeHtml(row.text)}</textarea><div><button type="button" data-scenario-edit-cancel>取消</button><button type="button" data-scenario-edit-save>保存并分支</button></div></div>`;
      article.querySelector("[data-scenario-edit-input]")?.focus();
      return;
    }
    deps.onAction?.(action, row);
  };
  let inputCache = [];
  const originalRender = render;
  function renderWithCache(input = {}) {
    lastInput = input;
    inputCache = normalizeRows(input);
    originalRender({ ...input, messages: inputCache });
  }
  host.addEventListener("click", onClick);

  return {
    render: renderWithCache,
    destroy() {
      host.removeEventListener("click", onClick);
      host.replaceChildren();
    },
  };
}
