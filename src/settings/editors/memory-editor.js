import { getLocale } from "../../i18n/index.js";
import { escapeHtml } from "../../lib/utils.js";
import { getActiveCharacterId, listCharacters } from "../../characters/store.js";
import { listManagedMemories, readManagedMemorySource, saveManagedMemory, deleteManagedMemory, setManagedMemoryRecall } from "../../memory/manager.js";
import "./memory-editor.css";

const COPY = {
  "zh-CN": {
    title: "记忆", character: "记忆归属", search: "搜索记忆内容", back: "返回", close: "关闭", add: "手动补记", save: "保存", cancel: "取消", edit: "编辑这条记忆", remove: "删除记忆", confirmDelete: "确认删除", discard: "放弃修改", keep: "继续编辑",
    stream: "留下的记忆", heading: "相处，慢慢留下痕迹", subheading: "按时间接续的记录，来源随时可查。", tools: "查找与筛选", all: "全部记录", manage: "管理这条记忆", sourceChat: "查看来源对话", sourceUnavailable: "关联的原文已不在当前可见的对话中。", sourcePartial: "部分来源原文已不可见，下面仅展示仍保存的内容。", sourceCurrent: "当前保存的来源对话", noChatSource: "这条记录没有关联聊天原文。", manualSource: "由你手动写下，未关联聊天。", background: "角色背景", backgroundHint: "作者或你填写的过往，不属于共同经历。", originHeading: "相识之前的故事", originAdd: "补充角色背景", backToStream: "回到记忆", emptyBody: "保存的对话片段、活动记录和你的补记，会在这里慢慢接续。", unknownTime: "未记录时间", filterLabel: "记录类型", collapse: "收起", retry: "重新读取", unsavedTitle: "写下一件想记住的事", editTitle: "继续写这段记忆",
    recent: "聊天原文", shared: "活动记录", long: "长期记忆", core: "重要记忆", origin: "角色起源",
    recentHint: "当前会话分支里真实保存的消息。查看记录不会改动聊天。",
    sharedHint: "一起听、一起读等已记录的活动。虚构活动会单独标明。",
    longHint: "留下的片段，可以补写，也可以暂时收起。收起后不再用于后续对话，原记录仍保留，随时可以恢复。",
    coreHint: "你标记的重要片段。对话涉及这些内容时，角色会更优先想起它们。",
    originHint: "角色作者或你填写的过往设定，不代表你们共同经历过。",
    empty: "这里还没有记录", noResults: "没有匹配的记忆", loading: "正在读取记忆…", noCharacters: "请先创建一个角色。", failure: "暂时无法读取或保存，请重试。", saved: "已保存", removed: "已删除记忆，原聊天仍保留", updated: "已更新对话使用设置", titleField: "标题", content: "内容", tags: "关键词（逗号分隔）", recall: "用于后续对话", coreField: "标为重要记忆", enabled: "会在对话中想起", disabled: "暂不用于对话", source: "来源", details: "来源详情", createdAt: "记录时间", edited: "已手动编辑", readOnly: "这是来源记录；请在原功能里修改。", user: "你", assistant: "角色", discardTitle: "放弃未保存的修改？", discardBody: "返回后，本次未保存的内容将丢失。", deleteTitle: "删除这条记忆？", deleteBody: "这条记忆将从记忆库移除，不再作为长期记忆用于对话。原聊天与来源记录仍会保留；当前聊天上下文也可能仍包含原文。", fiction: "虚构活动", required: "请填写记忆内容。", tooLong: "记忆内容最多 12000 字。", missing: "这条记忆已被移除，请刷新后再试。",
    legacyUnverified: "旧记录，尚未核对原话",
    sourceLabels: { origin: "角色设定", manual: "手动记录", diary: "日记", summary: "聊天总结", chat: "聊天记忆", imported: "来源记录", history: "聊天原文", timeline: "活动记录" },
  },
  en: {
    title: "Memories", character: "Memories with", search: "Search memory content", back: "Back", close: "Close", add: "Write a memory", save: "Save", cancel: "Cancel", edit: "Edit this memory", remove: "Delete memory", confirmDelete: "Delete", discard: "Discard changes", keep: "Keep editing",
    stream: "Saved memories", heading: "What stays with you", subheading: "Records follow one another in time, with their sources close at hand.", tools: "Find and filter", all: "All records", manage: "Manage this memory", sourceChat: "Read source conversation", sourceUnavailable: "The linked words are no longer in the visible conversation.", sourcePartial: "Some source messages are no longer visible. Only the available words are shown below.", sourceCurrent: "Source conversation as currently saved", noChatSource: "No original conversation is linked to this record.", manualSource: "Written by you, with no linked conversation.", background: "Character background", backgroundHint: "Backstory by you or the author, separate from shared experiences.", originHeading: "Before you met", originAdd: "Add backstory", backToStream: "Back to memories", emptyBody: "Saved conversation notes, activities and things you write will gather here over time.", unknownTime: "Time not recorded", filterLabel: "Record type", collapse: "Collapse", retry: "Load again", unsavedTitle: "Something to remember", editTitle: "Continue this memory",
    recent: "Conversations", shared: "Activities", long: "Long-term", core: "Important", origin: "Origins",
    recentHint: "Messages saved in the current branches of your conversations. Viewing them does not change your chats.",
    sharedHint: "Recorded activities such as listening or reading together. Fictional activities are labeled separately.",
    longHint: "Saved moments you can add to or set aside. A memory set aside is kept here but is no longer used in later conversations; you can restore it anytime.",
    coreHint: "Moments you marked as important. They have greater priority when relevant to the conversation.",
    originHint: "Backstory written by you or the character’s author. These are not shared experiences with you.",
    empty: "No records here yet", noResults: "No matching memories", loading: "Loading memories…", noCharacters: "Create a character first.", failure: "Could not load or save. Please try again.", saved: "Saved", removed: "Memory deleted. The original chat is preserved.", updated: "Conversation setting updated", titleField: "Title", content: "Content", tags: "Keywords (comma separated)", recall: "Use in later conversations", coreField: "Mark as important", enabled: "Remembered in conversation", disabled: "Set aside from conversation", source: "Source", details: "Source details", createdAt: "Recorded", edited: "Edited by you", readOnly: "This is a source record. Edit it in its original feature.", user: "You", assistant: "Character", discardTitle: "Discard unsaved changes?", discardBody: "Your unsaved changes will be lost when you leave.", deleteTitle: "Delete this memory?", deleteBody: "This note will leave the memory library and long-term recall. Its original chat and source remain; the current chat context may still include the original words.", fiction: "Fictional activity", required: "Enter some memory content.", tooLong: "Memory content can be up to 12,000 characters.", missing: "This memory was removed. Refresh and try again.",
    legacyUnverified: "Older note; not yet checked against the original words",
    sourceLabels: { origin: "Character backstory", manual: "Manual note", diary: "Diary", summary: "Chat summary", chat: "Chat memory", imported: "Source record", history: "Original chat", timeline: "Activity" },
  },
};

const e = escapeHtml;
const CHEVRON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>';
const SEARCH = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.5 12.5 4 4"/></svg>';
const ECHO = '<svg class="memory-editor__echo" viewBox="0 0 62 48" aria-hidden="true"><path d="M6 34c9-18 41-18 50 0M12 35c7-12 31-12 38 0M18 36c5-7 19-7 24 0M30.5 11v8"/><circle cx="31" cy="7" r="2"/></svg>';
const language = () => getLocale().startsWith("en") ? "en" : "zh-CN";
const timestamp = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(language() === "en" ? "en-US" : "zh-CN", { dateStyle: "medium", timeStyle: "short" });
};

/** Same editor for both shells; selecting a character never switches the chat. */
export function mountMemoryEditor(host, options = {}) {
  if (!host?.replaceChildren) throw new Error("memory_editor_host_required");
  // Both settings shells already route their back action through handleBack().
  // Keep local navigation only when the editor is mounted on its own.
  const shellOwnsNavigation = options.shellNavigation === true || Boolean(host.closest(".author-route"));
  let characterId = String(options.characterId || getActiveCharacterId() || "");
  let layer = "stream", query = "", characters = [], rows = [], selected = null, draft = null;
  let dirty = false, busy = false, destroyed = false, revision = 0, status = "", confirmation = null;
  let loading = false, failed = false, toolsOpen = false, sourceOpen = false, managementOpen = false;
  const root = document.createElement("section");
  root.className = "author-editor memory-editor";
  root.dataset.memoryEditor = "";
  root.dataset.contextSpace = "memory";
  host.replaceChildren(root);
  const copy = () => COPY[language()];
  const button = (action, label, cls = "", attrs = "") => `<button type="button" class="${cls}" data-memory-action="${action}"${busy ? " disabled" : ""} ${attrs}>${e(label)}</button>`;
  const characterName = () => {
    const character = characters.find((entry) => entry.id === characterId);
    return character?.profile?.name || character?.name || copy().assistant;
  };
  const rowTitle = (row) => {
    if (row.kind === "history") return row.role === "user" ? copy().user : characterName();
    // Activity producers may use an event/app identifier as a fallback title.
    // Lead with their recorded words instead of exposing IDs as the headline.
    if (row.kind === "timeline" && /^[a-z][a-z0-9_.:-]*$/i.test(row.title || "")) return row.rawText.slice(0, 36);
    return row.title || row.rawText.slice(0, 36);
  };
  const dateLabel = (value) => {
    const date = new Date(value);
    return !value || Number.isNaN(date.getTime()) ? copy().unknownTime : date.toLocaleDateString(language() === "en" ? "en-US" : "zh-CN", { year: "numeric", month: "long", day: "numeric" });
  };
  const timeLabel = (value) => {
    const date = new Date(value);
    return !value || Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(language() === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" });
  };
  const sourceLabel = (row) => [copy().sourceLabels[row.sourceLabel] || copy().source, row.pinned && copy().core, row.editedByUser && row.sourceLabel !== "manual" && copy().edited, row.searchable === false && copy().disabled, row.realityNamespace && row.realityNamespace !== "reality" && copy().fiction, row.verification === "legacy_unverified" && copy().legacyUnverified].filter(Boolean).join(" · ");

  function renderRows() {
    const list = root.querySelector("[data-memory-list]");
    if (!list) return;
    const t = copy();
    if (loading) { list.innerHTML = `<p class="author-muted memory-editor__empty" role="status">${e(t.loading)}</p>`; return; }
    let previousDate = "";
    list.innerHTML = rows.length ? rows.map((row, index) => {
      const open = selected?.id === row.id;
      const title = rowTitle(row);
      const day = dateLabel(row.createdAt);
      const dayHeading = day !== previousDate ? `<h3 class="memory-editor__date">${e(day)}</h3>` : "";
      previousDate = day;
      return `${dayHeading}<article class="memory-editor__event${open ? " is-open" : ""}" data-memory-id="${e(row.id)}">
        <time class="memory-editor__time"${row.createdAt ? ` datetime="${e(row.createdAt)}"` : ""}>${e(timeLabel(row.createdAt))}</time>
        <div class="memory-editor__paper"><button type="button" class="memory-editor__row" data-memory-open="${e(row.id)}" aria-expanded="${open}" aria-controls="memory-entry-${uid}-${index}"${busy ? " disabled" : ""}>
        <span><strong>${e(title)}</strong>${!open && row.rawText.trim() !== title.trim() ? `<span class="memory-editor__preview">${e(row.rawText.slice(0, 180))}</span>` : ""}<small class="memory-editor__source-label"><i aria-hidden="true"></i>${e(sourceLabel(row))}</small></span><span class="memory-editor__chevron"><span>${e(open ? t.collapse : language() === "en" ? "Read" : "展开")}</span>${CHEVRON}</span></button>
        ${open ? `<section id="memory-entry-${uid}-${index}" class="memory-editor__detail">${detailHtml(t, row)}</section>` : ""}</div></article>`;
    }).join("") : `<div class="memory-editor__empty"><span class="memory-editor__empty-mark" aria-hidden="true"></span><h3>${e(query ? t.noResults : t.empty)}</h3><p class="author-muted">${e(query ? t.search : layer === "origin" ? t.originHint : layer === "recent" ? t.recentHint : t.emptyBody)}</p></div>`;
  }

  function render() {
    if (destroyed) return;
    const t = copy();
    if (confirmation) {
      const deleting = confirmation.kind === "delete";
      root.innerHTML = `<section class="author-section memory-editor__confirmation" role="alertdialog" aria-labelledby="memory-confirm-title-${uid}" aria-describedby="memory-confirm-body-${uid}">
        <h3 id="memory-confirm-title-${uid}">${e(deleting ? t.deleteTitle : t.discardTitle)}</h3><p id="memory-confirm-body-${uid}">${e(deleting ? t.deleteBody : t.discardBody)}</p>
        <div class="author-actions">${button("confirm-cancel", deleting ? t.cancel : t.keep)}${button("confirm-accept", deleting ? t.confirmDelete : t.discard, "author-primary")}</div></section>`;
      root.querySelector('[data-memory-action="confirm-cancel"]')?.focus();
      return;
    }
    root.innerHTML = `${shellOwnsNavigation ? "" : draft ? button("back", t.back, "author-quiet") : options.onClose ? button("close", t.close, "author-quiet") : ""}<div class="memory-editor__person">
      <span class="memory-editor__avatar" aria-hidden="true">${e(Array.from(characterName())[0] || "·")}</span>
      <label class="author-field"><span>${e(t.character)}</span><select data-memory-character ${busy || draft ? "disabled" : ""}>${characters.map((char) => `<option value="${e(char.id)}"${char.id === characterId ? " selected" : ""}>${e(char.profile?.name || char.name || char.id)}</option>`).join("")}</select></label>
      <span class="memory-editor__person-note">${e(layer === "origin" ? t.background : t.title)}</span>
    </div><p class="author-status" role="${failed ? "alert" : "status"}" aria-live="polite">${e(status)}</p>${failed && !draft ? button("retry", t.retry, "author-quiet") : ""}
    ${!characters.length ? `<p class="author-muted">${e(loading ? t.loading : t.noCharacters)}</p>` : draft ? formHtml(t) : listHtml(t)}`;
    if (!draft) renderRows();
  }
  const uid = Math.random().toString(36).slice(2, 9);

  function listHtml(t) {
    const origin = layer === "origin";
    return `<nav class="author-tabs memory-editor__tabs" aria-label="${e(t.title)}">${origin ? button("tab:stream", `‹ ${t.backToStream}`, "author-quiet") : ["stream", "recent"].map((id) => button(`tab:${id}`, t[id], "", `aria-current="${(id === "stream" ? !["recent", "origin"].includes(layer) : id === layer) ? "page" : "false"}"`)).join("")}</nav>
      <header class="memory-editor__heading"><div class="memory-editor__heading-line"><h2>${e(origin ? t.originHeading : layer === "recent" ? t.recent : t.heading)}</h2>${ECHO}</div><p class="author-muted">${e(origin ? t.originHint : layer === "recent" ? t.recentHint : t.subheading)}</p></header>
      <div class="memory-editor__browse"><details class="memory-editor__tools" data-memory-tools${toolsOpen ? " open" : ""}><summary>${SEARCH}<span>${e(t.tools)}</span>${CHEVRON}</summary><div class="memory-editor__search"><label class="author-field"><span class="memory-editor__sr">${e(t.search)}</span><input type="search" data-memory-search placeholder="${e(t.search)}" value="${e(query)}"${busy ? " disabled" : ""}></label></div>
      ${!origin && layer !== "recent" ? `<nav class="author-tabs memory-editor__filters" aria-label="${e(t.filterLabel)}">${["stream", "long", "shared", "core"].map((id) => button(`tab:${id}`, id === "stream" ? t.all : t[id], "", `aria-current="${id === layer ? "page" : "false"}"`)).join("")}</nav>` : ""}</details>${!["recent", "shared"].includes(layer) ? button("add", `+ ${origin ? t.originAdd : t.add}`, "author-primary memory-editor__add") : ""}</div>
      <div class="memory-editor__timeline" data-memory-list aria-label="${e(origin ? t.background : t.title)}"></div>
      ${!origin ? `<aside class="memory-editor__background">${button("tab:origin", t.background, "author-quiet")}<p class="author-muted">${e(t.backgroundHint)}</p></aside>` : ""}`;
  }
  function detailHtml(t, row) {
    const ref = row.sourceRef || {};
    const refs = [ref.conversationId || ref.sessionId, ref.sourceId, ...(ref.messageIds || []), ...(ref.evidenceRefs || [])].filter(Boolean);
    const source = readManagedMemorySource(characterId, row);
    const sourceHtml = source.linkedCount ? `${source.missingCount ? `<p class="author-muted">${e(source.messages.length ? t.sourcePartial : t.sourceUnavailable)}</p>` : ""}${source.messages.length ? `<p class="author-muted">${e(t.sourceCurrent)}</p>` : ""}${source.messages.map((message) => `<blockquote class="memory-editor__quote"><small>${e(message.role === "user" ? t.user : characterName())} · ${e(timestamp(message.createdAt))}</small><p>${e(message.rawText)}</p></blockquote>`).join("")}` : `<p class="author-muted">${e(row.sourceLabel === "origin" ? t.originHint : row.sourceLabel === "manual" ? t.manualSource : t.noChatSource)}</p>`;
    return `<p class="memory-editor__body">${e(row.rawText)}</p>
      <details class="memory-editor__source" data-memory-source${sourceOpen ? " open" : ""}><summary><span>${e(source.linkedCount && row.kind !== "history" ? t.sourceChat : t.details)}</span>${CHEVRON}</summary>${row.kind === "history" ? `<p class="author-muted">${e(t.recentHint)}</p>` : sourceHtml}
      <details class="memory-editor__references"><summary>${e(t.details)}</summary><dl><dt>${e(t.source)}</dt><dd>${e(row.source || "")}</dd><dt>${e(t.createdAt)}</dt><dd>${e(timestamp(row.createdAt))}</dd></dl>${refs.length ? `<p>${refs.map(e).join("<br>")}</p>` : ""}</details></details>
      ${row.readonly ? `<p class="author-muted memory-editor__readonly">${e(t.readOnly)}</p>` : `<details class="memory-editor__management" data-memory-management${managementOpen ? " open" : ""}><summary><span>${e(t.manage)}</span>${CHEVRON}</summary><label class="author-row memory-editor__toggle"><span>${e(t.recall)}</span><input type="checkbox" data-memory-recall ${row.searchable !== false ? "checked" : ""} ${busy ? "disabled" : ""}></label><div class="author-actions">${button("edit", t.edit, "author-quiet")}${button("delete", t.remove, "memory-editor__danger author-quiet")}</div></details>`}`;
  }
  function formHtml(t) {
    return `<form data-memory-form class="memory-editor__form"><header class="memory-editor__heading"><h2>${e(draft.id ? t.editTitle : layer === "origin" ? t.originAdd : t.unsavedTitle)}</h2><p class="author-muted">${e(layer === "origin" ? t.originHint : draft.id ? t.edited : t.manualSource)}</p></header>
      <label class="author-field"><span>${e(t.titleField)}</span><input data-memory-field="title" maxlength="160" value="${e(draft.title)}" ${busy ? "disabled" : ""}></label>
      <label class="author-field"><span>${e(t.content)}</span><textarea data-memory-field="rawText" rows="8" maxlength="12000" required ${busy ? "disabled" : ""}>${e(draft.rawText)}</textarea></label>
      <label class="author-field"><span>${e(t.tags)}</span><input data-memory-field="tagsText" maxlength="500" value="${e(draft.tagsText)}" ${busy ? "disabled" : ""}></label>
      <label class="author-row memory-editor__toggle"><span>${e(t.recall)}</span><input type="checkbox" data-memory-field="searchable" ${draft.searchable ? "checked" : ""} ${busy ? "disabled" : ""}></label>
      ${layer !== "origin" ? `<label class="author-row memory-editor__toggle"><span>${e(t.coreField)}</span><input type="checkbox" data-memory-field="pinned" ${draft.pinned ? "checked" : ""} ${busy ? "disabled" : ""}></label>` : ""}
      <div class="author-actions">${button("cancel-edit", t.cancel)}<button type="submit" class="author-primary"${busy ? " disabled" : ""}>${e(t.save)}</button></div></form>`;
  }
  async function loadRows() {
    const current = ++revision;
    loading = true; failed = false;
    renderRows();
    try {
      const result = await listManagedMemories(characterId, { layer, query });
      if (destroyed || current !== revision) return;
      rows = result; loading = false;
      if (selected) selected = rows.find((row) => row.id === selected.id) || null;
      renderRows();
    } catch { if (!destroyed && current === revision) { loading = false; failed = true; status = copy().failure; render(); } }
  }
  async function refresh() {
    if (draft || busy || destroyed) return;
    const current = ++revision;
    status = ""; loading = true; failed = false;
    render();
    try {
      const nextCharacters = await listCharacters();
      if (destroyed || current !== revision) return;
      characters = nextCharacters;
      if (!characters.some((char) => char.id === characterId)) characterId = characters[0]?.id || "";
      const nextRows = await listManagedMemories(characterId, { layer, query });
      if (destroyed || current !== revision) return;
      rows = nextRows; loading = false;
      if (selected) selected = rows.find((row) => row.id === selected.id) || null;
      status = "";
      render();
    } catch { if (!destroyed && current === revision) { loading = false; failed = true; status = copy().failure; render(); } }
  }
  function requestLeave(callback) {
    if (busy) return false;
    if (!dirty) { callback?.(); return true; }
    confirmation = { kind: "discard", accept: () => { dirty = false; draft = null; callback?.(); } };
    render();
    return false;
  }
  function handleBack() {
    if (busy) return true;
    if (confirmation) { confirmation = null; render(); return true; }
    if (draft || selected) {
      requestLeave(() => { draft = null; selected = null; status = ""; render(); });
      return true;
    }
    if (layer !== "stream") { changeLayer("stream"); return true; }
    return false;
  }
  async function runMutation(fn, success) {
    if (busy) return;
    busy = true; status = ""; failed = false; render();
    try {
      await fn();
      if (destroyed) return;
      status = success;
    } catch (error) {
      failed = true;
      const t = copy();
      status = ({ memory_content_required: t.required, memory_content_too_long: t.tooLong, memory_not_found: t.missing })[error?.message] || t.failure;
    } finally { busy = false; if (!destroyed) render(); }
  }
  function startEdit(row) {
    draft = { id: row?.id || "", layer, title: row?.title || "", rawText: row?.rawText || "", tagsText: (row?.tags || []).filter((tag) => !["palace", "conversations", "authored-origin", "character-history"].includes(tag)).join(", "), pinned: row?.pinned || layer === "core", searchable: row?.searchable !== false };
    dirty = false; status = ""; failed = false; render();
    root.querySelector("[data-memory-field=title]")?.focus();
  }
  function onClick(event) {
    if (busy) return;
    const open = event.target.closest("[data-memory-open]");
    if (open) {
      const id = open.dataset.memoryOpen;
      selected = selected?.id === id ? null : rows.find((row) => row.id === id) || null;
      sourceOpen = false; managementOpen = false; status = ""; renderRows();
      [...root.querySelectorAll("[data-memory-open]")].find((item) => item.dataset.memoryOpen === id)?.focus({ preventScroll: true });
      return;
    }
    const action = event.target.closest("[data-memory-action]")?.dataset.memoryAction;
    if (!action || busy) return;
    if (action === "confirm-cancel") { confirmation = null; render(); return; }
    if (action === "confirm-accept") { const fn = confirmation?.accept; confirmation = null; fn?.(); return; }
    if (action === "back") { handleBack(); return; }
    if (action === "close") { requestLeave(() => options.onClose?.()); return; }
    if (action.startsWith("tab:")) { changeLayer(action.slice(4)); return; }
    if (action === "retry") { void refresh(); return; }
    if (action === "add") { startEdit(null); return; }
    if (action === "edit") { startEdit(selected); return; }
    if (action === "cancel-edit") { requestLeave(() => { draft = null; render(); }); return; }
    if (action === "delete" && selected) {
      const id = selected.id, cid = characterId;
      confirmation = { kind: "delete", accept: () => void runMutation(async () => {
        await deleteManagedMemory(cid, id); selected = null;
        rows = await listManagedMemories(cid, { layer, query });
      }, copy().removed) };
      render();
    }
  }
  function changeLayer(next) {
    if (!["stream", "recent", "shared", "long", "core", "origin"].includes(next)) return;
    requestLeave(() => {
      layer = next; selected = null; rows = []; status = ""; query = ""; sourceOpen = false; managementOpen = false;
      render(); void loadRows();
    });
  }
  function onInput(event) {
    if (busy) return;
    if (event.target.matches("[data-memory-search]")) { query = event.target.value; selected = null; void loadRows(); return; }
    const field = event.target.dataset.memoryField;
    if (draft && field) { draft[field] = event.target.type === "checkbox" ? event.target.checked : event.target.value; dirty = true; }
  }
  function onChange(event) {
    if (busy) return;
    if (event.target.matches("[data-memory-character]")) {
      const next = event.target.value;
      requestLeave(() => { characterId = next; query = ""; selected = null; rows = []; status = ""; sourceOpen = false; managementOpen = false; render(); void loadRows(); });
    }
    if (selected && event.target.matches("[data-memory-recall]")) {
      const cid = characterId, id = selected.id, checked = event.target.checked;
      void runMutation(async () => { await setManagedMemoryRecall(cid, id, checked); selected.searchable = checked; rows = await listManagedMemories(cid, { layer, query }); }, copy().updated);
    }
  }
  function onSubmit(event) {
    if (!event.target.matches("[data-memory-form]")) return;
    event.preventDefault();
    if (!draft) return;
    const cid = characterId, data = { ...draft };
    void runMutation(async () => {
      const saved = await saveManagedMemory(cid, data); dirty = false; draft = null;
      rows = await listManagedMemories(cid, { layer, query });
      selected = rows.find((row) => row.id === saved.id) || null;
    }, copy().saved);
  }
  function onToggle(event) {
    if (!root.contains(event.target)) return;
    if (event.target.matches("[data-memory-tools]")) toolsOpen = event.target.open;
    if (event.target.matches("[data-memory-source]")) sourceOpen = event.target.open;
    if (event.target.matches("[data-memory-management]")) managementOpen = event.target.open;
  }
  function onLocale() { render(); }
  root.addEventListener("click", onClick); root.addEventListener("input", onInput);
  root.addEventListener("change", onChange); root.addEventListener("submit", onSubmit);
  root.addEventListener("toggle", onToggle, true);
  window.addEventListener("yueqi:locale-changed", onLocale);
  render();
  const ready = refresh();
  return {
    ready, refresh, handleBack, requestLeave,
    get hasUnsaved() { return dirty || busy; },
    get characterId() { return characterId; },
    setCharacterId(id) { requestLeave(() => { characterId = String(id || ""); selected = null; draft = null; rows = []; query = ""; sourceOpen = false; managementOpen = false; void refresh(); }); },
    destroy() { destroyed = true; revision++; root.removeEventListener("click", onClick); root.removeEventListener("input", onInput); root.removeEventListener("change", onChange); root.removeEventListener("submit", onSubmit); root.removeEventListener("toggle", onToggle, true); window.removeEventListener("yueqi:locale-changed", onLocale); root.remove(); },
  };
}
