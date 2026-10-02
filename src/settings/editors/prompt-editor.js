import "./prompt-editor.css";
import { getLocale } from "../../i18n/index.js";
import { escapeHtml } from "../../lib/utils.js";
import { getActiveCharacterId, getCharacter, normalizeCharacter, upsertCharacter } from "../../characters/store.js";
import { getPromptSettings, savePromptSettings, saveAuthorPromptPreset, deleteAuthorPromptPreset } from "../preferences.js";
import { DEFAULT_PROMPT_LAYOUT, normalizePromptLayout, normalizePromptPreset } from "../../prompt/authoring.js";
import { readCharacterPromptFields, characterPromptPatch } from "../../prompt/character-authoring.js";
import { assemblePrompt, buildModelMessages } from "../../prompt/assemble.js";
import { finalizeModelRequest } from "../../prompt/finalize.js";
import { buildRuntimeInstruction } from "../../runtime/protocol.js";
import { getAllRecords } from "../../storage/db.js";
import { searchMemories } from "../../memory/rag.js";
import { searchPalace } from "../../memory/palace/search.js";

const COPY = {
  zh: {
    title: "提示词", close: "返回", character: "角色内容", layout: "拼接顺序", preview: "最终预览", save: "保存", saving: "保存中…", saved: "已保存，下轮对话生效。", loading: "正在读取…", failed: "未能完成", conflict: "角色已在另一处修改。请返回重新打开，当前内容仍保留。",
    system: "角色提示词", developer: "角色补充指令", scene: "场景设定", exampleDialogue: "示例对话", postHistory: "后置指令", greeting: "开场白",
    systemHint: "写下 TA 是谁、如何说话，以及你希望保留的性格。", developerHint: "补充聊天时的小约定；没有特别要求可以留空。", systemPlaceholder: "例如：温柔而坦率，喜欢雨天和旧书，说话简短自然。", developerPlaceholder: "例如：叫我小月；不确定的往事，先问我。", advanced: "高级设置", runtimeNotes: "运行说明", partialSaved: "角色内容已保存，其余设置未完成，请重试。",
    sceneHint: "作为作者设定注入，不视为共同经历。", exampleHint: "只作表达示范，不加入真实聊天记录。", greetingHint: "用于新会话的开场消息；保存不会向已有会话插入消息。",
    innerState: "心里话", innerHint: "控制角色心里话的展示，对所有角色生效。关闭后仍会延续角色的感受；这不是模型的推理过程。", innerOff: "关闭展示", innerNatural: "自然出现", innerExpanded: "更多展示",
    additions: "平台附加规则", additionsHint: "加入默认的陪伴方式、世界背景与回复建议。关闭后，以你写下的角色设定和选中的上下文为主。", runtimeHint: "这项开关只影响提示词；工具权限、计费与聊天记录仍按应用设置执行。",
    layoutScope: "这里的拼接顺序与平台规则开关对所有角色生效。", layoutHint: "按列表顺序注入；深度从历史末尾计算，当前用户消息始终位于最后。", enabled: "启用", role: "消息角色", position: "位置", depth: "历史深度", before_history: "历史前", after_history: "历史后", at_depth: "指定深度", up: "上移", down: "下移",
    presets: "布局预设", presetName: "预设名称", savePreset: "存为预设", choosePreset: "选择预设", loadPreset: "应用预设", deletePreset: "删除预设", import: "导入 JSON", export: "导出 JSON", reset: "恢复默认布局", presetHint: "预设包含拼接布局和平台规则开关；角色内容单独保存。", imported: "预设已载入草稿，保存后生效。", presetSaved: "布局预设已保存。", presetDeleted: "预设已删除。", presetNameRequired: "请填写预设名称。", presetRequired: "请先选择预设。",
    query: "用于预览的消息", queryPlaceholder: "输入一句话以检查本轮的世界书与记忆", generate: "更新预览", previewHint: "预览包含当前角色草稿、已保存会话与回复格式，并按模型长度裁剪，不会发送。临时附件、位置和工具结果仅在发送时加入。", fallbackHint: "本地预览使用默认动作与表情格式。", budgetIntact: "内容未裁剪", budgetTrimmed: "已按模型长度裁剪", empty: "没有可注入内容。", unsaved: "有未保存修改", previewBusy: "正在组装…", previewError: "预览失败", charRequired: "请先选择角色。", importLarge: "文件过大，请选择小于 1 MB 的预设。", invalid: "预设格式无效。",
    blocks: { character: "角色身份", character_scenario: "场景设定", example_dialogue: "示例对话", relationship_context: "关系与当前状态", world_context: "世界背景", relevant_memories: "相关记忆", runtime_context: "当前能力与上下文", branch_summary: "会话摘要", world_context_after: "后置世界书", post_history_contract: "平台回复建议", character_post_history: "角色后置指令" },
  },
  en: {
    title: "Prompt", close: "Back", character: "Character", layout: "Assembly", preview: "Final preview", save: "Save", saving: "Saving…", saved: "Saved. Applies to the next turn.", loading: "Loading…", failed: "Could not complete", conflict: "This character changed elsewhere. Go back and reopen; your draft is retained.",
    system: "Character prompt", developer: "Character instructions", scene: "Scenario", exampleDialogue: "Dialogue examples", postHistory: "Post-history instructions", greeting: "Greeting",
    systemHint: "Describe who they are, how they speak, and the qualities you want to keep.", developerHint: "Add small agreements for your conversations, or leave this blank.", systemPlaceholder: "For example: warm and candid, fond of rain and old books, with a natural, concise voice.", developerPlaceholder: "For example: call me Moon; ask before assuming a shared memory.", advanced: "Advanced settings", runtimeNotes: "How this works", partialSaved: "Character content was saved. The remaining settings could not be completed; please retry.",
    sceneHint: "Injected as authored setup, not shared memories.", exampleHint: "Style reference only; never added to real chat history.", greetingHint: "Used as the opening message in a new conversation. Saving does not insert a message into an existing conversation.",
    innerState: "Inner voice", innerHint: "Controls inner voice for all characters. Hiding it preserves character continuity. This is not model reasoning.", innerOff: "Hidden", innerNatural: "When natural", innerExpanded: "More expressive",
    additions: "Platform additions", additionsHint: "Adds a default companion style, world, and reply guidance. Turn off to focus on your character settings and selected context.", runtimeHint: "This switch affects the prompt only. Tool permissions, billing, and conversation storage still follow the app settings.",
    layoutScope: "This assembly order and platform switch apply to all characters.", layoutHint: "Inject in list order. Depth counts back from the end of history; the current user message stays last.", enabled: "Enabled", role: "Role", position: "Position", depth: "History depth", before_history: "Before history", after_history: "After history", at_depth: "At depth", up: "Move up", down: "Move down",
    presets: "Layout presets", presetName: "Preset name", savePreset: "Save preset", choosePreset: "Choose a preset", loadPreset: "Apply preset", deletePreset: "Delete preset", import: "Import JSON", export: "Export JSON", reset: "Reset layout", presetHint: "Presets contain the layout and platform switch. Character content is saved separately.", imported: "Preset loaded into draft. Save to apply.", presetSaved: "Layout preset saved.", presetDeleted: "Preset deleted.", presetNameRequired: "Enter a preset name.", presetRequired: "Choose a preset first.",
    query: "Preview message", queryPlaceholder: "Enter a message to check worldbook and memory selection", generate: "Refresh preview", previewHint: "Includes this character draft, saved conversation, and reply format, trimmed to the model's limit. Nothing is sent. Temporary attachments, location, and tool results are added only when sending.", fallbackHint: "Local preview uses the default action and expression format.", budgetIntact: "No content trimmed", budgetTrimmed: "Trimmed to the model's limit", empty: "No content to inject.", unsaved: "Unsaved changes", previewBusy: "Assembling…", previewError: "Preview failed", charRequired: "Select a character first.", importLarge: "Choose a preset smaller than 1 MB.", invalid: "Invalid preset format.",
    blocks: { character: "Character identity", character_scenario: "Scenario", example_dialogue: "Dialogue examples", relationship_context: "Relationship and current state", world_context: "World context", relevant_memories: "Relevant memories", runtime_context: "Capabilities and context", branch_summary: "Conversation summary", world_context_after: "Worldbook after history", post_history_contract: "Platform reply guidance", character_post_history: "Character post-history instructions" },
  },
};

/**
 * Reusable App/phone editor. Optional preview receives a draft payload and
 * returns compiled prompt, message array, or { messages }. Nothing is sent.
 * Pass the shared editorController to preserve existing identity drafts.
 */
export function mountPromptEditor(host, options = {}) {
  if (!host) throw new TypeError("prompt_editor_host_required");
  const copy = COPY[getLocale() === "en" ? "en" : "zh"];
  const abort = new AbortController();
  let disposed = false;
  let record = null;
  let draft = null;
  let tab = "character";
  let previewText = "";
  let previewRows = [];
  let previewLedger = null;
  let assemblyBudgetLedger = null;
  let previewSequence = 0;
  let previewBusy = false;
  let busy = false;
  let savedSnapshot = "";
  let leaveCallback = null;
  const settings = () => ({ promptLayout: normalizePromptLayout(draft.promptLayout), platformAdditionsEnabled: draft.platformAdditionsEnabled !== false, innerStateDisplay: draft.innerStateDisplay });
  const snapshot = () => JSON.stringify({ promptFields: draft?.promptFields || {}, ...(draft ? settings() : {}) });
  const hasUnsaved = () => Boolean(draft && savedSnapshot && snapshot() !== savedSnapshot);
  const status = (text, error = false) => {
    const node = host.querySelector("[data-prompt-status]");
    if (node) {
      node.textContent = text;
      node.dataset.state = error ? "error" : "info";
      node.setAttribute("role", error ? "alert" : "status");
      if (error) node.scrollIntoView?.({ block: "nearest" });
    }
  };
  const value = (text) => escapeHtml(String(text ?? ""));
  const button = (action, label, extra = "") => `<button type="button" data-prompt-action="${action}" ${extra}>${value(label)}</button>`;
  const fields = (keys) => keys.map((key) => {
    const hint = copy[`${key}Hint`] || (key === "exampleDialogue" ? copy.exampleHint : "");
    return `<label class="author-field author-field--${key}"><span>${copy[key]}</span><textarea data-prompt-field="${key}" rows="${key === "system" ? 12 : 5}" placeholder="${value(copy[`${key}Placeholder`] || "")}" spellcheck="false">${value(draft.promptFields[key])}</textarea>${hint ? `<small class="author-muted">${hint}</small>` : ""}</label>`;
  }).join("");
  const layoutSummary = (row) => `${copy.advanced} · ${row.role} · ${copy[row.position]}${row.position === "at_depth" ? ` ${row.depth}` : ""}`;
  const layoutRows = () => draft.promptLayout.map((row, index) => `<section class="prompt-layout-row" data-layout-row="${row.id}">
    <div class="prompt-layout-heading"><label class="prompt-enabled"><input type="checkbox" data-layout-enabled="${row.id}" ${row.enabled ? "checked" : ""}><span>${value(copy.blocks[row.id] || row.id)}</span></label><div class="prompt-order-buttons">${button("up", "↑", `data-block="${row.id}" aria-label="${copy.up}: ${value(copy.blocks[row.id])}" ${index === 0 ? "disabled" : ""}`)}${button("down", "↓", `data-block="${row.id}" aria-label="${copy.down}: ${value(copy.blocks[row.id])}" ${index === draft.promptLayout.length - 1 ? "disabled" : ""}`)}</div></div>
    <details class="prompt-layout-options"><summary>${value(layoutSummary(row))}</summary><div class="prompt-layout-controls"><label class="author-field"><span>${copy.role}</span><select data-layout-role="${row.id}">${["system", "developer"].map((role) => `<option ${row.role === role ? "selected" : ""}>${role}</option>`).join("")}</select></label><label class="author-field"><span>${copy.position}</span><select data-layout-position="${row.id}">${["before_history", "after_history", "at_depth"].map((position) => `<option value="${position}" ${row.position === position ? "selected" : ""}>${copy[position]}</option>`).join("")}</select></label><label class="author-field prompt-depth" ${row.position !== "at_depth" ? "hidden" : ""}><span>${copy.depth}</span><input type="number" min="0" max="64" step="1" data-layout-depth="${row.id}" value="${row.depth}"></label></div></details>
  </section>`).join("");
  function render() {
    if (disposed || !draft) return;
    const presets = getPromptSettings().authorPresets;
    host.innerHTML = `<div class="author-editor prompt-author-editor"><div class="author-toolbar">${button("close", copy.close)}<div class="prompt-author-identity"><small class="author-muted">${copy.title}</small><strong data-prompt-character-name>${value(record.name || record.alias || record.id)}</strong></div></div>
      <nav class="prompt-tabs" aria-label="${copy.title}">${["character", "layout", "preview"].map((key) => button("tab", copy[key], `data-tab="${key}" aria-pressed="${key === tab}"`)).join("")}</nav>
      <div class="prompt-meta"><p class="author-status" data-prompt-status role="status" aria-live="polite">${hasUnsaved() ? copy.unsaved : ""}</p>${button("save", busy ? copy.saving : copy.save, `class="prompt-save" ${busy ? "disabled" : ""}`)}</div>
      ${leaveCallback ? `<section class="prompt-leave-confirm" role="alert"><p>${getLocale() === "en" ? "Save your prompt changes before leaving?" : "离开前保存提示词修改吗？"}</p><div class="author-actions">${button("leave-save", copy.save, 'class="author-primary"')}${button("leave-discard", getLocale() === "en" ? "Discard changes" : "放弃修改")}${button("leave-cancel", getLocale() === "en" ? "Keep editing" : "继续编辑")}</div></section>` : ""}
      <div class="author-section prompt-character-pane" ${tab !== "character" ? "hidden" : ""}><div class="prompt-character-stack">${fields(["system", "developer"])}</div><label class="author-field prompt-inner-preference"><span>${copy.innerState}</span><select data-inner-state-display>${[["off", copy.innerOff], ["natural", copy.innerNatural], ["expanded", copy.innerExpanded]].map(([mode, label]) => `<option value="${mode}" ${draft.innerStateDisplay === mode ? "selected" : ""}>${label}</option>`).join("")}</select><small class="author-muted">${copy.innerHint}</small></label><details class="prompt-more-settings"><summary>${getLocale() === "en" ? "More character settings" : "更多角色设定"}</summary>${fields(["scene", "exampleDialogue", "postHistory", "greeting"])}</details></div>
      <div class="author-section" ${tab !== "layout" ? "hidden" : ""}><p class="author-muted" data-prompt-scope>${copy.layoutScope}</p><label class="author-row prompt-platform-switch"><span><strong>${copy.additions}</strong><small class="author-muted">${copy.additionsHint}</small></span><input type="checkbox" data-platform-additions ${draft.platformAdditionsEnabled ? "checked" : ""}></label><details class="prompt-runtime-notes"><summary>${copy.runtimeNotes}</summary><p class="author-muted">${copy.runtimeHint}</p></details><p class="author-muted">${copy.layoutHint}</p><div data-layout-list>${layoutRows()}</div>
      <details class="prompt-presets"><summary>${copy.presets}</summary><p class="author-muted">${copy.presetHint}</p><label class="author-field"><span>${copy.presetName}</span><input data-preset-name maxlength="100" value="${value(draft.presetName)}"></label><div class="author-actions">${button("save-preset", copy.savePreset)}${button("export", copy.export)}</div><label class="author-field"><span>${copy.choosePreset}</span><select data-preset-select><option value="">${copy.choosePreset}</option>${presets.map((p) => `<option value="${value(p.name)}">${value(p.name)}</option>`).join("")}</select></label><div class="author-actions">${button("load-preset", copy.loadPreset)}${button("delete-preset", copy.deletePreset)}</div><div class="author-actions">${button("import", copy.import)}${button("reset", copy.reset)}</div><input type="file" data-prompt-import accept="application/json,.json" hidden></details></div>
      <div class="author-section" ${tab !== "preview" ? "hidden" : ""}><p class="author-muted">${copy.previewHint}</p><label class="author-field"><span>${copy.query}</span><textarea rows="3" data-preview-query placeholder="${copy.queryPlaceholder}">${value(previewText)}</textarea></label>${button("preview", copy.generate, previewBusy ? "disabled" : "")}${!options.preview ? `<p class="author-muted">${copy.fallbackHint}</p>` : ""}<div class="prompt-preview" data-prompt-preview>${renderPreview()}</div></div></div>`;
  }
  function renderPreview() {
    const count = (name) => Math.max(0, Math.floor(Number(previewLedger?.[name]) || 0));
    const shortened = count("trimmedMessages");
    const dropped = count("droppedMessages");
    const reduced = (assemblyBudgetLedger?.blocks || []).filter(row => row.originalTokens > row.tokens);
    const changed = shortened + dropped + reduced.length;
    const detail = getLocale() === "en" ? `${reduced.length} blocks reduced during assembly; ${shortened} shortened, ${dropped} omitted at delivery` : `组装时缩减 ${reduced.length} 块；发送前缩短 ${shortened} 段，省略 ${dropped} 段`;
    const budget = previewLedger ? `<p class="author-muted prompt-budget-summary" data-prompt-budget>${changed ? `${copy.budgetTrimmed}：${detail}` : copy.budgetIntact} · ${count("finalInputTokens")} / ${count("inputLimit")} tokens</p>` : "";
    const omissions = reduced.length ? `<details class="prompt-budget-details"><summary>${getLocale() === "en" ? "Content shortened before assembly" : "组装时缩减的内容"}</summary>${reduced.map(row => `<p class="author-muted">${value(copy.blocks[row.id] || row.id)} · ${row.tokens} / ${row.originalTokens} tokens${row.trimReason ? ` · ${value(row.trimReason)}` : ""}</p>`).join("")}</details>` : "";
    return budget + omissions + previewRows.map((row, index) => `<details ${index === 0 ? "open" : ""}><summary><span>${index + 1}. ${value(row.role)}</span><span class="author-muted">${value(copy.blocks[row.blockId] || row.blockId || row.provenance || "")}</span></summary><pre>${value(typeof row.content === "string" ? row.content : JSON.stringify(row.content, null, 2))}</pre></details>`).join("");
  }
  function draftPayload() {
    const latest = options.editorController?.getState?.().working;
    const base = latest?.id === record.id ? latest : record;
    const patch = characterPromptPatch(base, draft.promptFields);
    return { characterId: record.id, characterRecord: normalizeCharacter({ ...base, ...patch }), promptFields: { ...draft.promptFields }, ...settings(), promptSettingsOverride: settings(), query: previewText, preview: true };
  }
  async function refresh() {
    status(copy.loading);
    const characterId = String(options.characterId || options.characterRecord?.id || getActiveCharacterId() || "");
    if (!characterId) throw new Error(copy.charRequired);
    if (options.editorController && options.editorController.characterId !== characterId) await options.editorController.open(characterId);
    const working = options.editorController?.getState?.().working;
    record = working?.id === characterId ? working
      : options.characterRecord?.id === characterId ? options.characterRecord
      : await getCharacter(characterId);
    if (!record) throw new Error(copy.charRequired);
    const saved = getPromptSettings();
    draft = { promptFields: readCharacterPromptFields(record), promptLayout: normalizePromptLayout(saved.promptLayout), platformAdditionsEnabled: saved.platformAdditionsEnabled !== false, innerStateDisplay: saved.innerStateDisplay, presetName: "" };
    savedSnapshot = snapshot();
    render();
  }
  async function save() {
    if (busy) return;
    busy = true;
    let characterSaved = false;
    const saveButton = host.querySelector('[data-prompt-action="save"]');
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = copy.saving; }
    try {
      const payload = draftPayload();
      const submittedSnapshot = snapshot();
      let result;
      if (options.editorController) {
        const controller = options.editorController;
        // Save only authored fields. Other identity drafts may change while this
        // surface is hidden; their values belong to the shared draft service.
        const patch = characterPromptPatch(payload.characterRecord, payload.promptFields);
        patch.profile = Object.fromEntries(["promptSystem", "promptDeveloper", "scenario", "firstMessage", "postHistoryInstructions"].map((key) => [key, patch.profile[key]]));
        if (typeof controller.saveForCharacter !== "function") throw new Error("character_scoped_save_required");
        result = await controller.saveForCharacter(record.id, patch, { expectedRevision: record.revision, persistDraft: false });
        if (!result?.ok) throw result?.error || new Error(result?.conflict ? "revision_conflict" : copy.failed);
        if ((result.committed || result.working)?.id !== record.id) throw new Error("character_scope_mismatch");
      } else {
        const committed = await upsertCharacter(characterPromptPatch(record, payload.promptFields), { expectedRevision: record.revision });
        result = { ok: true, committed, working: committed };
      }
      record = result.committed || result.working;
      characterSaved = true;
      const baseline = JSON.parse(savedSnapshot);
      // The character and layout use different stores. Keep an accurate dirty
      // baseline if only one write succeeds, and still refresh identity controls.
      savedSnapshot = JSON.stringify({ ...baseline, promptFields: payload.promptFields });
      let settingsError = null;
      try {
        const previousSettings = { promptLayout: baseline.promptLayout, platformAdditionsEnabled: baseline.platformAdditionsEnabled, innerStateDisplay: baseline.innerStateDisplay };
        if (JSON.stringify(previousSettings) !== JSON.stringify(payload.promptSettingsOverride)) savePromptSettings(payload.promptSettingsOverride);
        savedSnapshot = submittedSnapshot;
      } catch (error) { settingsError = error; }
      await options.onSave?.(result);
      if (settingsError) throw settingsError;
      status(hasUnsaved() ? copy.unsaved : copy.saved);
      return !hasUnsaved();
    } catch (error) { status(characterSaved ? copy.partialSaved : error?.code === "revision_conflict" || error?.message === "revision_conflict" ? copy.conflict : `${copy.failed}: ${error.message}`, true); return false; }
    finally {
      busy = false;
      const liveSaveButton = host.querySelector('[data-prompt-action="save"]');
      if (liveSaveButton) { liveSaveButton.disabled = false; liveSaveButton.textContent = copy.save; }
    }
  }
  function invalidatePreview() {
    previewSequence += 1;
    previewBusy = false;
    previewRows = [];
    previewLedger = null;
    assemblyBudgetLedger = null;
    host.querySelector("[data-prompt-preview]")?.replaceChildren();
    const button = host.querySelector('[data-prompt-action="preview"]');
    if (button) button.disabled = false;
    status(hasUnsaved() ? copy.unsaved : "");
  }
  async function preview() {
    const sequence = ++previewSequence;
    previewBusy = true;
    const previewButton = host.querySelector('[data-prompt-action="preview"]');
    if (previewButton) previewButton.disabled = true;
    status(copy.previewBusy);
    try {
      const payload = draftPayload();
      const sessionId = options.sessionId || `dm:${record.id}`;
      const compiled = options.preview ? await options.preview(payload) : await assemblePrompt({
        ...payload,
        sessionId,
        purpose: "debug_preview",
        currentUserMessageId: "preview:unpersisted",
        refreshDailyStatus: async () => ({ injectionEnabled: false }),
        searchMemories, searchPalace, getAllRecords,
        collectExternalContext: () => [],
      });
      let result = compiled;
      if (!options.preview) {
        const messages = await buildModelMessages(compiled, payload.query, sessionId);
        const userIndex = messages.findLastIndex((item) => item.role === "user");
        messages.splice(userIndex < 0 ? messages.length : userIndex, 0, { role: "system", content: buildRuntimeInstruction({}, { innerStateDisplay: draft.innerStateDisplay }), blockId: "runtime_protocol", provenance: "runtime.protocol" });
        const profile = compiled?.contextEnvelope?.request?.profile || {};
        result = finalizeModelRequest(messages, { totalContextTokens: profile.totalInputTokens || 8000, outputReserveTokens: profile.outputReserveTokens || 1800, providerMode: "preview" });
      }
      const rows = Array.isArray(result) ? result : Array.isArray(result?.messages) ? result.messages : await buildModelMessages(result, payload.query, sessionId);
      if (disposed || sequence !== previewSequence) return;
      previewRows = rows;
      previewLedger = result?.ledger || null;
      assemblyBudgetLedger = result?.assemblyBudgetLedger || (compiled?.canonical ? { blocks: compiled.canonical.blocks } : null);
      const previewHost = host.querySelector("[data-prompt-preview]");
      if (previewHost) previewHost.innerHTML = renderPreview();
      status(rows.length ? "" : copy.empty);
    } catch (error) { if (!disposed && sequence === previewSequence) status(`${copy.previewError}: ${error.message}`, true); }
    finally {
      if (sequence === previewSequence) {
        previewBusy = false;
        const livePreviewButton = host.querySelector('[data-prompt-action="preview"]');
        if (livePreviewButton) livePreviewButton.disabled = false;
      }
    }
  }
  function applyPreset(input) {
    const preset = normalizePromptPreset(input);
    draft.promptLayout = preset.promptLayout;
    draft.platformAdditionsEnabled = preset.platformAdditionsEnabled;
    draft.presetName = preset.name;
    invalidatePreview();
    render(); status(copy.imported);
  }
  function presetFromDraft() {
    const name = String(draft.presetName || "").trim();
    if (!name) throw new Error(copy.presetNameRequired);
    return normalizePromptPreset({ ...settings(), name });
  }
  function handleBack() {
    if (leaveCallback) { leaveCallback = null; render(); return true; }
    const presets = host.querySelector(".prompt-presets[open]");
    if (presets) { presets.open = false; return true; }
    const more = host.querySelector(".prompt-more-settings[open]");
    if (more) { more.open = false; return true; }
    const layoutOptions = host.querySelector(".prompt-layout-options[open]");
    if (layoutOptions) { layoutOptions.open = false; return true; }
    if (tab !== "character") { tab = "character"; render(); return true; }
    return false;
  }
  function requestLeave(callback = options.onClose) {
    if (busy) return false;
    if (!hasUnsaved()) { callback?.(); return true; }
    leaveCallback = typeof callback === "function" ? callback : () => {};
    render();
    host.querySelector(".prompt-leave-confirm")?.scrollIntoView?.({ block: "nearest" });
    host.querySelector('[data-prompt-action="leave-cancel"]')?.focus({ preventScroll: true });
    return false;
  }
  host.addEventListener("input", (event) => {
    if (!draft) return;
    const target = event.target;
    if (target.dataset.promptField) draft.promptFields[target.dataset.promptField] = target.value;
    if (target.hasAttribute("data-preview-query")) previewText = target.value;
    if (target.hasAttribute("data-preset-name")) draft.presetName = target.value;
    if (target.dataset.layoutDepth) {
      const row = draft.promptLayout.find((item) => item.id === target.dataset.layoutDepth);
      if (row) {
        row.depth = Math.max(0, Math.min(64, Math.floor(Number(target.value) || 0)));
        target.closest("[data-layout-row]").querySelector(".prompt-layout-options > summary").textContent = layoutSummary(row);
      }
    }
    if (target.dataset.promptField || target.dataset.layoutDepth || target.hasAttribute("data-preview-query")) invalidatePreview();
    if (target.dataset.promptField || target.dataset.layoutDepth) status(copy.unsaved);
  }, { signal: abort.signal });
  host.addEventListener("change", async (event) => {
    if (!draft) return;
    const target = event.target;
    if (target.hasAttribute("data-platform-additions")) draft.platformAdditionsEnabled = target.checked;
    if (target.hasAttribute("data-inner-state-display")) draft.innerStateDisplay = target.value;
    for (const [attr, key] of [["layoutEnabled", "enabled"], ["layoutRole", "role"], ["layoutPosition", "position"]]) {
      if (!target.dataset[attr]) continue;
      const row = draft.promptLayout.find((item) => item.id === target.dataset[attr]);
      if (row) row[key] = key === "enabled" ? target.checked : target.value;
      if (key === "position") target.closest("[data-layout-row]").querySelector(".prompt-depth").hidden = row.position !== "at_depth";
      if (row) target.closest("[data-layout-row]").querySelector(".prompt-layout-options > summary").textContent = layoutSummary(row);
    }
    if (target.hasAttribute("data-prompt-import") && target.files?.[0]) {
      try {
        const file = target.files[0];
        if (file.size > 1024 * 1024) throw new Error(copy.importLarge);
        applyPreset(JSON.parse(await file.text()));
      } catch (error) { status(error.message === copy.importLarge ? error.message : copy.invalid, true); }
      target.value = "";
    } else if (target.hasAttribute("data-inner-state-display") || target.hasAttribute("data-platform-additions") || target.dataset.layoutEnabled || target.dataset.layoutRole || target.dataset.layoutPosition || target.dataset.layoutDepth) {
      invalidatePreview();
      status(hasUnsaved() ? copy.unsaved : "");
    }
  }, { signal: abort.signal });
  host.addEventListener("click", async (event) => {
    const target = event.target.closest?.("[data-prompt-action]");
    if (!target || target.disabled || !draft) return;
    const action = target.dataset.promptAction;
    if (busy && (action === "leave-save" || action === "leave-discard")) return;
    try {
      if (action === "close") { if (!handleBack()) requestLeave(); return; }
      if (action === "leave-cancel") { leaveCallback = null; render(); return; }
      if (action === "leave-save") {
        const callback = leaveCallback;
        if (await save()) { leaveCallback = null; callback?.(); }
        return;
      }
      if (action === "leave-discard") {
        const callback = leaveCallback;
        const saved = JSON.parse(savedSnapshot);
        draft = { ...draft, ...saved };
        invalidatePreview();
        leaveCallback = null;
        render(); callback?.(); return;
      }
      if (action === "tab") { tab = target.dataset.tab; render(); return; }
      if (action === "save") { await save(); return; }
      if (action === "preview") { await preview(); return; }
      if (action === "up" || action === "down") {
        const index = draft.promptLayout.findIndex((item) => item.id === target.dataset.block);
        const next = index + (action === "up" ? -1 : 1);
        if (index >= 0 && next >= 0 && next < draft.promptLayout.length) [draft.promptLayout[index], draft.promptLayout[next]] = [draft.promptLayout[next], draft.promptLayout[index]];
        invalidatePreview();
        host.querySelector("[data-layout-list]").innerHTML = layoutRows(); status(copy.unsaved); return;
      }
      if (action === "save-preset") { saveAuthorPromptPreset(presetFromDraft()); render(); status(copy.presetSaved); }
      if (action === "load-preset" || action === "delete-preset") {
        const name = host.querySelector("[data-preset-select]").value;
        if (!name) throw new Error(copy.presetRequired);
        if (action === "load-preset") applyPreset(getPromptSettings().authorPresets.find((item) => item.name === name));
        else { deleteAuthorPromptPreset(name); render(); status(copy.presetDeleted); }
      }
      if (action === "reset") { draft.promptLayout = normalizePromptLayout(DEFAULT_PROMPT_LAYOUT); invalidatePreview(); render(); status(copy.unsaved); }
      if (action === "import") host.querySelector("[data-prompt-import]").click();
      if (action === "export") {
        const preset = presetFromDraft();
        const url = URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "nyra-prompt-preset.json"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) { status(error.message || copy.failed, true); }
  }, { signal: abort.signal });
  host.innerHTML = `<p class="author-status" data-prompt-status role="status">${copy.loading}</p>`;
  const ready = refresh().catch((error) => { status(error.message, true); });
  return { ready, refresh, handleBack, requestLeave, get hasUnsaved() { return hasUnsaved(); }, getDraft: () => draft ? structuredClone(draft) : null, destroy() { disposed = true; previewSequence += 1; abort.abort(); host.replaceChildren(); } };
}
