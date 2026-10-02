import "./worldbook-editor.css";
import { getLocale } from "../../i18n/index.js";
import { escapeHtml as esc } from "../../lib/utils.js";
import { listCharacters } from "../../characters/store.js";
import {
  listWorldbookEntries, upsertWorldbookEntry, deleteWorldbookEntry,
  worldbookVisibleForCharacter, bindWorldbookToCharacter,
} from "../../worldbook/store.js";
import {
  validateWorldbookEntry, parseWorldbookImport, exportWorldbookJson, mergeWorldbookEntries,
} from "../../worldbook/transfer.js";

const COPY = {
  zh: {
    title: "世界书", heading: "让相处，有所依循", intro: "供对话参考的背景与规则。", close: "返回", new: "添加设定",
    search: "寻找一条设定", all: "全部角色", global: "共享 · 所有角色", forCharacter: "当前角色与共享设定", more: "导入与导出",
    scopeLabel: "适用范围", context: "背景与规则", allCategories: "全部", uncategorized: "未分类", categoryLabel: "设定分类", searchToggle: "搜索设定", reading: "阅读设定", expand: "展开", collapse: "收起",
    emptyTitle: "这里还没有设定", empty: "从一个地点、一段人物关系，或一条生活规则开始。点上方「添加设定」，留下对话可以依循的背景。", footnote: "设定描述角色生活的背景，不作为共同经历。",
    source: "来源", importedSource: "角色世界书导入", packageSource: "设定包",
    usage: "使用方式", usageEdit: "调整使用规则", useAllowed: "允许用于对话", sharedWarning: "这是一条共享设定，修改会影响所有角色。", linkedWarning: "这条设定适用于多个角色，修改会同时影响它们。",
    usageNote: "这里只表示使用配置，不代表某次回复已引用；实际提供还受本轮匹配与额度限制。", alwaysNote: "配置为随对话提供的背景。", triggerNote: "遇到符合触发规则的话题时，可提供这条设定。", pausedNote: "当前已暂停用于对话。", triggerMissing: "尚未填写触发条件，可在使用规则中补充。",
    import: "导入 JSON", export: "导出当前范围", importHint: "支持月栖 JSON 与角色世界书。导入会合并条目，同 ID 更新；其他条目保留。",
    loading: "正在读取设定…", noMatch: "没有匹配的设定，换个关键词或分类试试。", unnamed: "未命名",
    enabled: "允许用于对话", disabled: "已暂停", constant: "随对话提供", triggered: "相关话题时提供", edit: "编辑条目", name: "条目名称", content: "设定正文",
    binding: "适用角色", advancedScope: "保留现有范围", multiple: "保留多个角色绑定", keywordTitle: "触发方式", primary: "主关键词",
    keywordHint: "每行一个关键词。常驻条目无需填写。", any: "任一命中（OR）", allKeys: "全部命中（AND）", none: "所有关键词均未命中",
    primaryMode: "主关键词规则", secondary: "辅助关键词", secondaryMode: "辅助关键词规则", combine: "两组关键词关系", and: "同时满足（AND）", or: "任一组满足（OR）",
    caseSensitive: "区分大小写", regex: "正则触发", regexHint: "填写表达式正文，不含 / 包裹。正则命中可独立触发，大小写规则同上。",
    advanced: "高级设置", category: "分类", priority: "优先级", priorityHint: "数字越大，越优先放入对话。", position: "注入位置", before: "历史消息之前", after: "历史消息之后",
    preservedPosition: "保留原位置", budget: "单条字量上限（Token）", budgetHint: "0 表示使用共享剩余额度；所有条目仍受本轮总额度限制。", scan: "关键词扫描长度（字符）", scanHint: "0 表示扫描本轮与最近聊天的完整选定窗口。",
    save: "保存条目", cancel: "取消", delete: "删除条目", deleteAsk: "确定删除这个条目？此操作只删除当前条目。", confirmDelete: "确认删除",
    saved: "已保存，下次对话会按新规则生效。", deleted: "条目已删除。", exported: "已导出当前范围的条目。", failed: "操作失败，请重试。", busy: "正在保存…",
    discard: "离开会丢失尚未保存的修改。", leave: "放弃修改", stay: "继续编辑", legacy: "此条目保留了导入来源及其他扩展字段，保存不会删除它们。",
    importReady: (count, conflicts) => `已验证 ${count} 条，${conflicts} 条将更新同 ID 条目。`, merge: "确认合并", imported: (count) => `已合并 ${count} 条世界书。`, count: (count) => `${count} 条`,
    errors: {
      invalid_json: "JSON 格式不正确。", entries_required: "文件需要包含 entries 数组或世界书条目数组。", entries_empty: "文件中没有可导入的条目。", invalid_entry: "条目必须是对象。",
      content_required: "请填写设定正文。", invalid_list: "关键词与绑定列表必须是字符串数组。", invalid_number: "数值不正确；上限和扫描长度不能为负数。", invalid_scope: "适用范围无法识别。",
      character_required: "请选择适用角色。", invalid_regex: "正则表达式无效。", duplicate_id: "导入文件内存在重复 ID，请先修正。", invalid_value: "条目字段的类型或取值不正确。",
    },
    errorEntry: (index, message) => `第 ${index + 1} 条：${message}`,
  },
  en: {
    title: "Worldbook", heading: "A world to draw on", intro: "Background and rules your conversations can draw on.", close: "Back", new: "Add detail",
    search: "Find a world detail", all: "All characters", global: "Shared · all characters", forCharacter: "Current character + shared details", more: "Import and export",
    scopeLabel: "Applies to", context: "Background & rules", allCategories: "All", uncategorized: "Uncategorized", categoryLabel: "Categories", searchToggle: "Search details", reading: "Read detail", expand: "Expand", collapse: "Collapse",
    emptyTitle: "Room for your world", empty: "Start with a place, a relationship, or a rule of everyday life. Choose Add detail above to give conversations some background.", footnote: "These details describe the character’s world, not your shared experiences.",
    source: "Source", importedSource: "Imported character worldbook", packageSource: "World package",
    usage: "How it is used", usageEdit: "Edit usage rules", useAllowed: "Allow in conversations", sharedWarning: "This is a shared detail. Changes affect every character.", linkedWarning: "This detail is linked to multiple characters. Changes affect all of them.",
    usageNote: "This is a configuration, not proof that a reply used the detail. Matching rules and the turn’s allowance still apply.", alwaysNote: "Configured as background to provide with conversations.", triggerNote: "May be provided when the conversation matches its activation rules.", pausedNote: "Currently paused for conversations.", triggerMissing: "No activation conditions yet. Add them in usage rules.",
    import: "Import JSON", export: "Export this scope", importHint: "Import Yueqi JSON or character books. Matching IDs update existing entries; other entries are kept.",
    loading: "Loading world details…", noMatch: "No matching details. Try another word or category.", unnamed: "Untitled",
    enabled: "Allow in conversations", disabled: "Paused", constant: "Provide with conversations", triggered: "On related topics", edit: "Edit detail", name: "Title", content: "World detail",
    binding: "Applies to", advancedScope: "Keep existing scope", multiple: "Keep multiple character links", keywordTitle: "Activation", primary: "Primary keywords",
    keywordHint: "One keyword per line. Always-included entries do not need keywords.", any: "Any match (OR)", allKeys: "All match (AND)", none: "None of the keywords match",
    primaryMode: "Primary matching", secondary: "Secondary keywords", secondaryMode: "Secondary matching", combine: "Combine keyword groups", and: "Both groups (AND)", or: "Either group (OR)",
    caseSensitive: "Case sensitive", regex: "Regex trigger", regexHint: "Enter the expression without / delimiters. A regex match activates independently and follows the case setting above.",
    advanced: "Advanced settings", category: "Category", priority: "Priority", priorityHint: "Higher values are included first.", position: "Insertion position", before: "Before history", after: "After history",
    preservedPosition: "Keep original position", budget: "Entry limit (tokens)", budgetHint: "0 uses the remaining shared allowance. The turn's total allowance still applies.", scan: "Keyword scan length (characters)", scanHint: "0 scans the full selected window of recent chat and the current message.",
    save: "Save entry", cancel: "Cancel", delete: "Delete entry", deleteAsk: "Delete this entry? Only the current entry will be removed.", confirmDelete: "Confirm deletion",
    saved: "Saved. The next conversation uses these rules.", deleted: "Entry deleted.", exported: "Exported entries in this scope.", failed: "Something went wrong. Please retry.", busy: "Saving…",
    discard: "Leaving will discard your unsaved changes.", leave: "Discard changes", stay: "Keep editing", legacy: "Imported source details and extension fields are retained when you save.",
    importReady: (count, conflicts) => `${count} validated entries; ${conflicts} will update matching IDs.`, merge: "Merge entries", imported: (count) => `Merged ${count} worldbook entries.`, count: (count) => `${count} entries`,
    errors: {
      invalid_json: "Invalid JSON.", entries_required: "The file must contain an entries array or an array of worldbook entries.", entries_empty: "The file contains no entries.", invalid_entry: "Each entry must be an object.",
      content_required: "Enter the world detail.", invalid_list: "Keywords and links must be arrays of strings.", invalid_number: "Enter valid numbers; limits and scan length cannot be negative.", invalid_scope: "Unrecognized scope.",
      character_required: "Select a character.", invalid_regex: "Invalid regular expression.", duplicate_id: "The import contains duplicate IDs. Resolve them first.", invalid_value: "An entry field has an invalid type or value.",
    },
    errorEntry: (index, message) => `Entry ${index + 1}: ${message}`,
  },
};

const words = (value) => String(value || "").split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
const selected = (a, b) => a === b ? " selected" : "";
const option = (value, text, current) => `<option value="${esc(value)}"${selected(value, current)}>${esc(text)}</option>`;
let worldbookMountNumber = 0;

/** Both shells use this component and the same persistent worldbook records. */
export function mountWorldbookEditor(host, { characterId = "", onClose } = {}) {
  if (!host) throw new TypeError("Worldbook editor requires a host");
  const copy = COPY[String(getLocale()).startsWith("en") ? "en" : "zh"];
  const readingIdPrefix = `wb-reading-${++worldbookMountNumber}`;
  const state = { entries: [], characters: [], filter: characterId || "all", query: "", category: "", expanded: null, usageOpen: false, searchOpen: false, draft: null, editingRules: false, loading: true, dirty: false, busy: false, destroyed: false, pendingImport: null, deleting: false, pendingLeave: null, status: "", error: false };
  host.classList.add("author-editor", "worldbook-editor");
  host.dataset.contextSpace = "worldbook";
  const scopeRows = () => state.entries.filter((entry) => state.filter === "all" || (state.filter === "global"
    ? entry.scope === "global" || (!entry.scope && !entry.characterId && !entry.linkedCharacterIds?.length)
    : worldbookVisibleForCharacter(entry, state.filter)));
  const shownRows = () => scopeRows().filter((entry) => (!state.category || (entry.category || "__uncategorized") === state.category) && (!state.query || [entry.title, entry.content, entry.category, ...(entry.keys || []), ...(entry.secondaryKeys || [])].join("\n").toLocaleLowerCase().includes(state.query.toLocaleLowerCase())));
  const characterName = (id) => state.characters.find((character) => character.id === id)?.name || id;
  const field = (label, control, hint = "") => `<label class="author-field"><span>${esc(label)}</span>${control}${hint ? `<small class="author-muted">${esc(hint)}</small>` : ""}</label>`;
  const input = (name, value, extra = "") => `<input name="${name}" value="${esc(value)}" ${extra}>`;
  const select = (name, choices, current) => `<select name="${name}">${choices.map(([value, label]) => option(value, label, current)).join("")}</select>`;
  const toggle = (name, label, checked) => `<label class="author-row wb-toggle"><span>${esc(label)}</span><input type="checkbox" name="${name}"${checked ? " checked" : ""}></label>`;
  const isShared = (entry) => entry.scope === "global" || (!entry.characterId && !entry.linkedCharacterIds?.length && !entry.scope);
  const scopeName = (entry) => entry.scope && !["global", "character"].includes(entry.scope) ? `${copy.advancedScope} · ${entry.scope}`
    : isShared(entry) ? copy.global : (entry.linkedCharacterIds?.length ? entry.linkedCharacterIds : [entry.characterId]).filter(Boolean).map(characterName).join(" · ");
  const sharingNote = (entry) => isShared(entry) ? copy.sharedWarning : entry.linkedCharacterIds?.length > 1 ? copy.linkedWarning : "";
  const entryButton = (id) => [...host.querySelectorAll("[data-wb-open]")].find((node) => node.dataset.wbOpen === id);
  const sourceName = (entry) => entry.sourceRef?.kind === "character_book" ? copy.importedSource
    : entry.sourcePackageId ? `${copy.packageSource} · ${entry.sourcePackageId}` : "";
  const orbit = `<svg class="wb-orbit" viewBox="0 0 96 76" fill="none" aria-hidden="true"><path d="M9 53h78M48 4v64"/><ellipse cx="48" cy="38" rx="38" ry="18" transform="rotate(-28 48 38)"/><ellipse cx="48" cy="38" rx="22" ry="31" transform="rotate(28 48 38)"/><circle cx="48" cy="38" r="5"/><circle cx="78" cy="22" r="3"/><path d="M18 12v8m-4-4h8M72 61v8m-4-4h8"/></svg>`;

  function status(text, error = false) {
    state.status = text;
    state.error = error;
    const node = host.querySelector("[data-wb-status]");
    if (node) {
      node.textContent = text;
      node.classList.toggle("is-error", error);
      node.setAttribute("role", error ? "alert" : "status");
    }
  }

  function errorMessage(error) {
    const message = copy.errors[error?.code] || copy.failed;
    return error?.index >= 0 ? copy.errorEntry(error.index, message) : message;
  }

  function listHtml() {
    const rows = shownRows();
    if (state.loading) return `<p class="author-muted wb-empty" role="status">${esc(copy.loading)}</p>`;
    return `${rows.length ? rows.map((entry, index) => {
      const open = state.expanded === entry.id;
      const title = entry.title || copy.unnamed;
      const bodyId = `${readingIdPrefix}-${index}`;
      const note = sharingNote(entry);
      const hasTriggers = entry.keys?.length || entry.triggers?.length || entry.secondaryKeys?.length || entry.regex;
      return `<article class="wb-entry-row${open ? " is-open" : ""}" data-world-entry="${esc(entry.id)}">
        <button type="button" class="wb-entry-open" data-wb-open="${esc(entry.id)}" aria-expanded="${open}" aria-controls="${bodyId}">
          <span class="wb-entry-heading"><span class="wb-kicker">${esc(entry.category || copy.uncategorized)}</span><strong>${esc(title)}</strong>${open ? "" : `<span class="wb-entry-excerpt">${esc(entry.content)}</span>`}</span>
          <span class="wb-entry-meta">${esc(scopeName(entry))}<span aria-hidden="true"> · </span>${esc(entry.enabled === false ? copy.disabled : entry.constant ? copy.constant : copy.triggered)}</span>
          <span class="wb-expand-mark"><span>${esc(open ? copy.collapse : copy.expand)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></span>
        </button>
        <div class="wb-reading" id="${bodyId}"${open ? "" : " hidden"}>
          <div class="wb-reading-copy">${String(entry.content || "").split(/\n\s*\n/).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}</div>
          <dl class="wb-reading-context"><div><dt>${esc(copy.scopeLabel)}</dt><dd>${esc(scopeName(entry))}</dd></div>${sourceName(entry) ? `<div><dt>${esc(copy.source)}</dt><dd>${esc(sourceName(entry))}</dd></div>` : ""}</dl>
          <div class="wb-reading-actions"><button class="author-quiet" type="button" data-wb-edit="${esc(entry.id)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 3.5 4 4M3 17l4.5-1 10-10-3.5-3.5-10 10L3 17Z"/></svg>${esc(copy.edit)}</button>
            <details class="wb-usage"${open && state.usageOpen ? " open" : ""}><summary>${esc(copy.usage)}</summary><div class="wb-usage-content">
              <p class="author-muted">${esc(entry.enabled === false ? copy.pausedNote : entry.constant ? copy.alwaysNote : hasTriggers ? copy.triggerNote : copy.triggerMissing)}</p>
              ${note ? `<p class="wb-sharing-note">${esc(note)}</p>` : ""}
              <label class="wb-toggle"><span>${esc(copy.useAllowed)}</span><input type="checkbox" data-wb-enabled="${esc(entry.id)}"${entry.enabled !== false ? " checked" : ""}${state.busy ? " disabled" : ""}></label>
              <p class="author-muted">${esc(copy.usageNote)}</p><button type="button" class="author-quiet" data-wb-rules="${esc(entry.id)}">${esc(copy.usageEdit)}</button>
            </div></details>
          </div>
        </div>
      </article>`;
    }).join("") : state.query || state.category ? `<p class="author-muted wb-empty">${esc(copy.noMatch)}</p>` : `<div class="wb-empty"><span class="wb-empty-line" aria-hidden="true"></span><h3>${esc(copy.emptyTitle)}</h3><p class="author-muted">${esc(copy.empty)}</p></div>`}`;
  }

  function categoriesHtml() {
    const categories = [...new Set(scopeRows().map((entry) => entry.category || "__uncategorized"))];
    if (!categories.length) return "";
    return `<nav class="wb-categories" aria-label="${esc(copy.categoryLabel)}"><button type="button" data-wb-category="" aria-pressed="${!state.category}">${esc(copy.allCategories)}</button>${categories.map((category) => `<button type="button" data-wb-category="${esc(category)}" aria-pressed="${state.category === category}">${esc(category === "__uncategorized" ? copy.uncategorized : category)}</button>`).join("")}</nav>`;
  }

  function formHtml() {
    const entry = state.draft;
    const linked = entry.linkedCharacterIds || [];
    const specialScope = entry.scope && !["global", "character"].includes(entry.scope);
    const binding = entry.scope === "global" ? "" : specialScope || linked.length > 1 ? "__existing" : (entry.characterId || linked[0] || "");
    const bindings = [["", copy.global], ...state.characters.map((character) => [character.id, character.name])];
    if (binding === "__existing") bindings.push(["__existing", specialScope ? `${copy.advancedScope} · ${entry.scope}` : copy.multiple]);
    if (binding && binding !== "__existing" && !bindings.some(([id]) => id === binding)) bindings.push([binding, characterName(binding)]);
    const primaryMode = entry.primaryMatchMode || entry.matchMode || "any";
    const secondaryLogic = entry.secondaryLogic || (entry.matchMode === "all" ? "and" : "or");
    const positions = [["before_history", copy.before], ["post_history", copy.after]];
    const position = entry.insertPosition || "before_history";
    if (!positions.some(([value]) => value === position)) positions.push([position, `${copy.preservedPosition} · ${position}`]);
    return `<form data-wb-form class="wb-form"><div class="wb-edit-heading"><span class="wb-kicker">${esc(copy.title)}</span><h3>${esc(entry.id ? copy.edit : copy.new)}</h3></div>
      <div class="wb-form-savebar"><button type="button" class="author-quiet" data-wb-action="back">‹ ${esc(copy.close)}</button><button class="author-primary" type="submit"${state.busy ? " disabled" : ""}>${esc(state.busy ? copy.busy : copy.save)}</button></div>
      <p data-wb-status class="author-status${state.error ? " is-error" : ""}" role="${state.error ? "alert" : "status"}" aria-live="polite">${esc(state.status)}</p>
      ${field(copy.name, input("title", entry.title || "", "required maxlength=240"))}
      ${field(copy.content, `<textarea name="content" rows="8" required>${esc(entry.content || "")}</textarea>`)}
      ${field(copy.category, input("category", entry.category || ""))}
      ${field(copy.binding, select("binding", bindings, binding))}
      <p class="wb-sharing-note" data-wb-sharing${sharingNote(entry) ? "" : " hidden"}>${esc(sharingNote(entry))}</p>
      <details class="author-section wb-disclosure wb-form-usage"${state.editingRules ? " open" : ""}><summary>${esc(copy.usage)}</summary>
      <p class="author-muted">${esc(copy.usageNote)}</p>
      <div class="wb-usage-toggles">${toggle("enabled", copy.enabled, entry.enabled !== false)}${toggle("constant", copy.constant, entry.constant)}</div>
      <details class="author-section wb-disclosure"${entry.constant ? "" : " open"}><summary>${esc(copy.keywordTitle)}</summary>
        ${field(copy.primary, `<textarea name="keys" rows="3" spellcheck="false">${esc((entry.keys || entry.triggers || []).join("\n"))}</textarea>`, copy.keywordHint)}
        ${field(copy.primaryMode, select("primaryMode", [["any", copy.any], ["all", copy.allKeys], ["not_any", copy.none]], primaryMode))}
        ${field(copy.secondary, `<textarea name="secondaryKeys" rows="2" spellcheck="false">${esc((entry.secondaryKeys || []).join("\n"))}</textarea>`)}
        <div class="wb-field-pair">${field(copy.combine, select("secondaryLogic", [["and", copy.and], ["or", copy.or]], secondaryLogic))}${field(copy.secondaryMode, select("secondaryMatchMode", [["any", copy.any], ["all", copy.allKeys]], entry.secondaryMatchMode || "any"))}</div>
        ${toggle("caseSensitive", copy.caseSensitive, entry.caseSensitive)}
      </details>
      <details class="author-section wb-disclosure"><summary>${esc(copy.advanced)}</summary>
        ${field(copy.priority, input("priority", entry.priority ?? 50, 'type="number" step="1" required'), copy.priorityHint)}
        ${field(copy.position, select("insertPosition", positions, position))}
        ${field(copy.budget, input("tokenBudget", entry.tokenBudget ?? 0, 'type="number" min="0" step="1" required'), copy.budgetHint)}
        ${field(copy.scan, input("scanDepth", entry.scanDepth ?? 0, 'type="number" min="0" step="1" required'), copy.scanHint)}
        ${field(copy.regex, input("regex", entry.regex || "", 'spellcheck="false"'), copy.regexHint)}
        <p class="author-muted">${esc(copy.legacy)}</p>
      </details>
      </details>
      <div class="author-actions"><button type="button" class="author-quiet" data-wb-action="back">${esc(copy.cancel)}</button></div>
      ${entry.id ? `<div class="author-section wb-danger">${state.deleting ? `<p>${esc(copy.deleteAsk)}</p><div class="author-actions"><button type="button" data-wb-action="confirm-delete">${esc(copy.confirmDelete)}</button><button type="button" data-wb-action="cancel-delete">${esc(copy.cancel)}</button></div>` : `<button type="button" data-wb-action="delete">${esc(copy.delete)}</button>`}</div>` : ""}
    </form>`;
  }

  function render() {
    if (state.destroyed) return;
    const scopeChoices = [["all", copy.all], ["global", copy.global], ...state.characters.map((character) => [character.id, character.name])];
    if (state.filter !== "all" && state.filter !== "global" && !scopeChoices.some(([id]) => id === state.filter)) scopeChoices.push([state.filter, copy.forCharacter]);
    const currentName = state.filter === "all" ? copy.all : state.filter === "global" ? copy.global : characterName(state.filter);
    host.innerHTML = `${state.draft ? formHtml() : `<div class="wb-scope"><span class="wb-scope-mark" aria-hidden="true">${esc(state.filter === "all" || state.filter === "global" ? "◌" : Array.from(currentName)[0])}</span><label><span>${esc(copy.scopeLabel)}</span><select data-wb-filter aria-label="${esc(copy.scopeLabel)}">${scopeChoices.map(([value, label]) => option(value, label, state.filter)).join("")}</select></label><span class="wb-scope-count">${esc(copy.count(scopeRows().length))}</span></div>
      <header class="wb-heading"><div><h2>${esc(copy.heading)}</h2><p class="author-muted">${esc(copy.intro)}</p></div>${orbit}${onClose ? `<button type="button" class="author-quiet" data-wb-action="close">${esc(copy.close)}</button>` : ""}</header>
      <div class="wb-browse-tools"><button type="button" class="author-quiet wb-search-toggle" data-wb-action="search" aria-expanded="${state.searchOpen}" aria-label="${esc(copy.searchToggle)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5"></path></svg><span>${esc(copy.searchToggle)}</span></button><button class="author-primary wb-add" type="button" data-wb-action="new"><span aria-hidden="true">＋</span>${esc(copy.new)}</button></div>
      <label class="author-field wb-search"${state.searchOpen ? "" : " hidden"}><span class="wb-sr-only">${esc(copy.search)}</span><input type="search" data-wb-search value="${esc(state.query)}" placeholder="${esc(copy.search)}"></label>
      <div data-wb-categories>${categoriesHtml()}</div>
      <section data-wb-list>${listHtml()}</section>
      <p class="author-muted wb-footnote">${esc(copy.footnote)}</p>
      <details class="author-section wb-disclosure wb-transfer"><summary>${esc(copy.more)}</summary><p class="author-muted">${esc(copy.importHint)}</p><div class="author-actions"><button type="button" data-wb-action="import">${esc(copy.import)}</button><button type="button" data-wb-action="export"${scopeRows().length ? "" : " disabled"}>${esc(copy.export)}</button></div><input type="file" accept=".json,application/json" data-wb-file hidden></details>`}
      ${state.pendingImport ? `<section class="author-section wb-import-review"><p>${esc(copy.importReady(state.pendingImport.length, state.pendingImport.filter((entry) => state.entries.some((row) => row.id === entry.id)).length))}</p><div class="author-actions"><button type="button" class="author-primary" data-wb-action="merge"${state.busy ? " disabled" : ""}>${esc(copy.merge)}</button><button type="button" data-wb-action="cancel-import">${esc(copy.cancel)}</button></div></section>` : ""}
      ${state.pendingLeave ? `<section class="author-section wb-leave"><p>${esc(copy.discard)}</p><div class="author-actions"><button type="button" data-wb-action="discard">${esc(copy.leave)}</button><button type="button" data-wb-action="stay">${esc(copy.stay)}</button></div></section>` : ""}
      ${state.draft ? "" : `<p data-wb-status class="author-status${state.error ? " is-error" : ""}" role="${state.error ? "alert" : "status"}" aria-live="polite">${esc(state.status)}</p>`}`;
  }

  async function refresh() {
    if (state.draft || state.busy || state.destroyed) return;
    const [entries, characters] = await Promise.all([listWorldbookEntries(), listCharacters()]);
    if (state.destroyed || state.draft || state.busy) return;
    state.entries = entries.sort((a, b) => Number(b.priority) - Number(a.priority) || a.title.localeCompare(b.title));
    state.characters = characters;
    state.loading = false;
    if (state.category && !scopeRows().some((entry) => (entry.category || "__uncategorized") === state.category)) state.category = "";
    render();
  }

  function leave(callback) {
    if (!state.dirty) { callback(); return; }
    // Retain typed values before rendering the inline confirmation.
    state.draft = readDraft(false);
    state.pendingLeave = callback;
    render();
    host.querySelector(".wb-leave")?.scrollIntoView({ block: "nearest" });
  }

  function back() {
    state.draft = null;
    state.dirty = false;
    state.deleting = false;
    state.pendingLeave = null;
    render();
    entryButton(state.expanded)?.focus({ preventScroll: true });
  }

  function readDraft(validate = true) {
    const form = host.querySelector("[data-wb-form]");
    const data = new FormData(form);
    const primaryMode = String(data.get("primaryMode") || "any");
    let draft = {
      ...state.draft,
      title: String(data.get("title") || "").trim(), content: String(data.get("content") || ""), category: String(data.get("category") || ""),
      keys: words(data.get("keys")), triggers: words(data.get("keys")), secondaryKeys: words(data.get("secondaryKeys")),
      enabled: data.has("enabled"), constant: data.has("constant"), caseSensitive: data.has("caseSensitive"),
      matchMode: primaryMode, primaryMatchMode: primaryMode === "not_any" ? undefined : primaryMode,
      secondaryMatchMode: primaryMode === "not_any" ? undefined : String(data.get("secondaryMatchMode")),
      secondaryLogic: primaryMode === "not_any" ? undefined : String(data.get("secondaryLogic")),
      priority: Number(data.get("priority")), tokenBudget: Number(data.get("tokenBudget")), scanDepth: Number(data.get("scanDepth")),
      insertPosition: String(data.get("insertPosition")), regex: String(data.get("regex") || "").trim(),
    };
    if (data.get("binding") !== "__existing") {
      const id = String(data.get("binding") || "");
      // Binding explicitly clears old scope, but does not generate an ID for a
      // not-yet-saved draft (the delete action must only target persisted rows).
      const originalId = draft.id;
      draft = bindWorldbookToCharacter(draft, id);
      if (!originalId) delete draft.id;
    }
    return validate ? validateWorldbookEntry(draft) : draft;
  }

  async function mutate(action, success) {
    if (state.busy) return;
    state.busy = true;
    host.querySelectorAll("button, input, select, textarea").forEach((element) => { element.disabled = true; });
    try {
      await action();
      state.busy = false;
      state.dirty = false;
      status(success);
      await refresh();
      globalThis.window?.dispatchEvent(new CustomEvent("yueqi:worldbook-changed"));
    } catch (error) {
      state.busy = false;
      status(errorMessage(error), true);
      render();
    }
  }

  async function onSubmit(event) {
    if (!event.target.matches("[data-wb-form]")) return;
    event.preventDefault();
    try {
      const draft = readDraft();
      state.draft = draft;
      state.editingRules = Boolean(host.querySelector(".wb-form-usage")?.open);
      await mutate(async () => {
        const saved = await upsertWorldbookEntry(draft);
        state.expanded = saved.id;
        state.category = "";
        state.query = "";
        state.draft = null; state.pendingLeave = null; state.deleting = false;
      }, copy.saved);
    } catch (error) { status(errorMessage(error), true); }
  }

  async function onClick(event) {
    const readButton = event.target.closest("[data-wb-open]");
    if (readButton && !state.busy) {
      const id = readButton.dataset.wbOpen;
      state.expanded = state.expanded === id ? null : id;
      state.usageOpen = false;
      host.querySelector("[data-wb-list]").innerHTML = listHtml();
      entryButton(id)?.focus({ preventScroll: true });
      return;
    }
    const categoryButton = event.target.closest("[data-wb-category]");
    if (categoryButton && !state.busy) {
      state.category = categoryButton.dataset.wbCategory;
      host.querySelector("[data-wb-categories]").innerHTML = categoriesHtml();
      host.querySelector("[data-wb-list]").innerHTML = listHtml();
      [...host.querySelectorAll("[data-wb-category]")].find((node) => node.dataset.wbCategory === state.category)?.focus({ preventScroll: true });
      return;
    }
    const editButton = event.target.closest("[data-wb-edit],[data-wb-rules]");
    if (editButton && !state.busy) {
      const id = editButton.dataset.wbEdit || editButton.dataset.wbRules;
      const entry = state.entries.find((row) => row.id === id);
      if (!entry) return;
      state.draft = structuredClone(entry);
      state.expanded = id;
      state.editingRules = Boolean(editButton.dataset.wbRules);
      state.dirty = false;
      state.status = "";
      render();
      host.querySelector(state.editingRules ? '.wb-form-usage > summary' : '[name="title"]')?.focus();
      return;
    }
    const action = event.target.closest("[data-wb-action]")?.dataset.wbAction;
    if (!action || state.busy) return;
    if (action === "new") {
      state.draft = { title: "", content: "", characterId: ["all", "global"].includes(state.filter) ? "" : state.filter, enabled: true, priority: 50, insertPosition: "before_history" };
      state.editingRules = false; state.dirty = false; state.status = ""; render(); host.querySelector('[name="title"]')?.focus();
    } else if (action === "search") {
      state.searchOpen = !state.searchOpen;
      if (!state.searchOpen) state.query = "";
      render();
      host.querySelector(state.searchOpen ? "[data-wb-search]" : '[data-wb-action="search"]')?.focus({ preventScroll: true });
    } else if (action === "back") leave(back);
    else if (action === "close") leave(() => onClose?.());
    else if (action === "discard") { const callback = state.pendingLeave; state.pendingLeave = null; state.dirty = false; callback?.(); }
    else if (action === "stay") { state.draft = readDraft(false); state.pendingLeave = null; render(); }
    else if (action === "delete" || action === "cancel-delete") { state.draft = readDraft(false); state.deleting = action === "delete"; render(); }
    else if (action === "confirm-delete") await mutate(async () => { await deleteWorldbookEntry(state.draft.id); state.draft = null; state.deleting = false; }, copy.deleted);
    else if (action === "import") host.querySelector("[data-wb-file]")?.click();
    else if (action === "cancel-import") { state.pendingImport = null; render(); }
    else if (action === "merge") {
      const entries = state.pendingImport;
      await mutate(async () => { await mergeWorldbookEntries(entries); state.pendingImport = null; }, copy.imported(entries.length));
    } else if (action === "export") {
      const blob = new Blob([exportWorldbookJson(scopeRows())], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `yueqi-worldbook-${new Date().toISOString().slice(0, 10)}.json`;
      host.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status(copy.exported);
    }
  }

  async function onChange(event) {
    const element = event.target;
    if (state.busy) return;
    if (element.matches("[data-wb-filter]")) { state.filter = element.value; state.category = ""; state.expanded = null; state.usageOpen = false; render(); }
    else if (element.matches("[data-wb-enabled]")) {
      const entry = state.entries.find((row) => row.id === element.dataset.wbEnabled);
      if (!entry) return;
      state.usageOpen = Boolean(element.closest(".wb-usage")?.open);
      await mutate(() => upsertWorldbookEntry({ ...entry, enabled: element.checked }), copy.saved);
    } else if (element.matches('[name="binding"]')) {
      const note = host.querySelector("[data-wb-sharing]");
      if (note) { note.textContent = sharingNote(readDraft(false)); note.hidden = !note.textContent; }
    } else if (element.matches("[data-wb-file]")) {
      const file = element.files?.[0];
      if (!file) return;
      const importFilter = state.filter;
      try {
        const text = await file.text();
        // File reads may complete after the user switches character or opens an
        // editor. Never attach an imported character book to a later scope.
        if (state.destroyed || state.busy || state.draft || state.filter !== importFilter) return;
        state.pendingImport = parseWorldbookImport(text, { characterId: ["all", "global"].includes(importFilter) ? "" : importFilter });
        state.status = ""; render(); host.querySelector(".wb-import-review")?.scrollIntoView({ block: "nearest" });
      } catch (error) { element.value = ""; status(errorMessage(error), true); }
    }
  }

  function onInput(event) {
    if (event.target.matches("[data-wb-search]")) {
      state.query = event.target.value;
      host.querySelector("[data-wb-list]").innerHTML = listHtml();
    } else if (event.target.closest("[data-wb-form]")) state.dirty = true;
  }

  host.addEventListener("click", onClick);
  host.addEventListener("submit", onSubmit);
  host.addEventListener("change", onChange);
  host.addEventListener("input", onInput);
  status(copy.loading);
  render();
  const ready = refresh().then(() => status("")).catch((error) => { state.loading = false; render(); status(errorMessage(error), true); });
  return {
    ready, refresh,
    get characterId() { return ["all", "global"].includes(state.filter) ? "" : state.filter; },
    setCharacterId(id) {
      if (state.busy) return;
      leave(() => { state.filter = String(id || "all"); state.query = ""; state.category = ""; state.expanded = null; state.usageOpen = false; state.draft = null; state.dirty = false; state.pendingLeave = null; render(); });
    },
    get hasUnsaved() { return state.dirty || state.busy; },
    requestLeave(callback) {
      if (state.busy) return false;
      leave(callback);
      return !state.dirty;
    },
    handleBack() {
      if (!state.draft) return false;
      if (!state.busy) leave(back);
      return true;
    },
    destroy() {
      state.destroyed = true;
      host.removeEventListener("click", onClick);
      host.removeEventListener("submit", onSubmit);
      host.removeEventListener("change", onChange);
      host.removeEventListener("input", onInput);
      host.classList.remove("author-editor", "worldbook-editor");
      delete host.dataset.contextSpace;
      host.replaceChildren();
    },
  };
}
