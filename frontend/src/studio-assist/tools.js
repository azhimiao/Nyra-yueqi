/** Yueqi assistant tool gateway: typed catalog, approvals, audit and rollback. */

import {
  deleteRegexRule,
  listRegexRules,
  upsertRegexRule,
} from "../regex/store.js";
import { compileRegexRule } from "../regex/schema.js";
import {
  deletePreset,
  duplicatePreset,
  getActivePresetId,
  listPresets,
  setActivePresetId,
  upsertPreset,
} from "../presets/store.js";
import {
  createCharacter,
  deleteCharacter,
  getActiveCharacterId,
  getCharacter,
  listCharacters,
  setActiveCharacterId,
  upsertCharacter,
} from "../characters/store.js";
import {
  deleteWorldbookEntry,
  getWorldbookEntry,
  listWorldbookEntries,
  upsertWorldbookEntry,
} from "../worldbook/store.js";
import {
  addEvent,
  createPhotoGroup,
  deletePhotoGroup,
  getAppMode,
  listBooks,
  listPhotoGroups,
  listTracks,
  listUpcomingEvents,
  readLibrary,
  readProvider,
  removeEvent,
  renamePhotoGroup,
  setAppModePref,
  updateBookProgress,
  writeLibrary,
} from "../phone-shell/phone-data.js";
import { deleteMemory, searchMemories, updateMemory } from "../memory/rag.js";
import { rowMatchesCompanionScope } from "../memory/companion-scope.js";
import { loadProactiveWakePrefs, saveProactiveWakePrefs } from "../proactive/config.js";
import { THEMES, applyTheme, getThemeId } from "../ui/theme.js";
import {
  getVoiceSettings,
  isSttConfigured,
  isVoiceConfigured,
  saveVoiceSettings,
} from "../settings/voice-preferences.js";
import { listScripts, listRuns } from "../scenario/store.js";
import { loadMoments } from "../moments/store.js";
import { listTasks } from "../agent/task-store.js";
import { getAllRecords, storeRecord } from "../storage/db.js";
import {
  ASSIST_CAPABILITY_PACKS,
  capabilitySummary,
  getAssistTool,
  getCapabilityPack,
  listCapabilityPacks,
} from "./registry.js";
import {
  appendAssistAudit,
  getLatestUndoableAudit,
  listAssistAudit,
  markAssistAuditUndone,
} from "./audit-store.js";
import { assistT, normalizeAssistLocale } from "./i18n.js";

export const ASSIST_PACKS = Object.freeze(Object.fromEntries(
  ASSIST_CAPABILITY_PACKS.map((pack) => [pack.label, {
    id: pack.id,
    tools: pack.tools.map((tool) => tool.id),
    route: pack.route || "",
    app: pack.app || "",
  }]),
));

const TOOL_ALIASES = Object.freeze({
  list_rules: "regex.list",
  upsert_rule: "regex.upsert",
  toggle_rule: "regex.toggle",
  delete_rule: "regex.delete",
  list_presets: "presets.list",
  set_active: "presets.activate",
  update_preset_text: "presets.update",
  open_settings: "navigation.open_settings",
});

function emit(name, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* optional in tests */
  }
}

function trimText(value, max = 800) {
  return String(value ?? "").trim().slice(0, max);
}

function safeRows(rows, limit = 30) {
  return (Array.isArray(rows) ? rows : []).slice(0, limit);
}

function resolveToolName(name) {
  const raw = String(name || "").trim();
  return TOOL_ALIASES[raw] || raw;
}

function approvalCard(tool, args, locale) {
  return {
    ok: false,
    needConfirm: true,
    summary: tool.risk === "destructive"
      ? assistT("approvalDelete", { label: tool.label }, locale)
      : assistT("approvalWrite", { label: tool.label }, locale),
    pendingAction: { name: tool.id, args: { ...args } },
    risk: tool.risk,
  };
}

export function expandPackGuide(packName, locale) {
  const id = normalizeAssistLocale(locale);
  const pack = getCapabilityPack(packName, id);
  if (!pack) {
    return {
      ok: false,
      text: assistT("packMissing", {
        name: trimText(packName, 80),
        packs: listCapabilityPacks(id).map((item) => item.label).join(id === "en" ? ", " : "、"),
      }, id),
    };
  }
  const riskKeys = {
    read: "riskGuideRead",
    action: "riskGuideAction",
    write: "riskGuideWrite",
    destructive: "riskGuideDestructive",
  };
  const lines = pack.tools.map((tool) => (
    `- ${tool.id}${id === "en" ? ": " : "："}${tool.label} (${assistT(riskKeys[tool.risk], {}, id)})`
  ));
  return {
    ok: true,
    text: `${pack.label}${id === "en" ? ": " : "："}${pack.description}\n${lines.join("\n")}`,
    data: { id: pack.id, label: pack.label, tools: pack.tools.map((tool) => ({ ...tool })) },
  };
}

async function undoDescriptor(descriptor = {}) {
  const kind = String(descriptor.kind || "");
  switch (kind) {
    case "regex.restore":
      if (descriptor.value) upsertRegexRule(descriptor.value);
      else if (descriptor.id) deleteRegexRule(descriptor.id);
      emit("yueqi.assist.regex-changed", { id: descriptor.id || descriptor.value?.id });
      return true;
    case "preset.restore":
      if (descriptor.value) upsertPreset(descriptor.value);
      else if (descriptor.id) deletePreset(descriptor.id);
      if (descriptor.activeId) setActivePresetId(descriptor.activeId);
      emit("yueqi.assist.presets-changed", {});
      return true;
    case "preset.activate":
      setActivePresetId(descriptor.id);
      emit("yueqi.assist.presets-changed", { id: descriptor.id });
      return true;
    case "character.restore":
      if (descriptor.value) await upsertCharacter(descriptor.value);
      else if (descriptor.id) await deleteCharacter(descriptor.id);
      if (descriptor.activeId) setActiveCharacterId(descriptor.activeId);
      return true;
    case "worldbook.restore":
      if (descriptor.value) await upsertWorldbookEntry(descriptor.value);
      else if (descriptor.id) await deleteWorldbookEntry(descriptor.id);
      return true;
    case "calendar.restore":
      writeLibrary({ events: descriptor.events || [] });
      return true;
    case "library.restore":
      writeLibrary(descriptor.patch || {});
      return true;
    case "proactive.restore":
      saveProactiveWakePrefs(descriptor.value || {});
      return true;
    case "theme.restore":
      applyTheme(descriptor.id);
      return true;
    case "mode.restore":
      setAppModePref(descriptor.mode);
      emit("yueqi.assist.switch-mode", { mode: descriptor.mode });
      return true;
    case "voice.restore":
      saveVoiceSettings(descriptor.value || {});
      return true;
    case "memory.restore":
      if (descriptor.value?.id) await storeRecord("memories", descriptor.value);
      return true;
    default:
      return false;
  }
}

async function executeCore(toolId, args = {}, opts = {}) {
  switch (toolId) {
    case "system.capabilities": {
      const summary = capabilitySummary();
      return {
        ok: true,
        summary: `当前覆盖 ${summary.packs} 个领域、${summary.tools} 项能力；写操作默认先确认。`,
        data: { summary, packs: listCapabilityPacks(opts.locale).map((pack) => ({
          id: pack.id,
          label: pack.label,
          description: pack.description,
          toolCount: pack.tools.length,
          route: pack.route || "",
          app: pack.app || "",
        })) },
      };
    }
    case "system.explain": {
      const topic = trimText(args.topic || args.name || args.pack, 100).toLowerCase();
      const pack = getCapabilityPack(topic, opts.locale) || ASSIST_CAPABILITY_PACKS.find((item) => (
        item.label.toLowerCase().includes(topic) || topic.includes(item.label.toLowerCase())
      ));
      const tool = getAssistTool(args.tool || topic, opts.locale);
      if (tool) {
        return { ok: true, summary: `${tool.label}：属于${tool.packLabel}；风险级别 ${tool.risk}。${tool.requiresConfirmation ? "执行前会要求确认。" : "可直接执行。"}`, data: tool };
      }
      if (pack) return { ok: true, summary: `${pack.label}：${pack.description}`, data: pack };
      return { ok: false, summary: `暂时没找到「${topic || "这个功能"}」，可以先调用 system.capabilities 查看完整目录。` };
    }
    case "system.context":
      return { ok: true, summary: `当前上下文：${trimText(opts.context || args.context || "栖机助手", 120)}`, data: { context: opts.context || args.context || "assist" } };
    case "navigation.open_settings": {
      const view = trimText(args.view || args.viewId || "assist", 40) || "assist";
      emit("yueqi.assist.navigate", { view });
      return { ok: true, summary: `已打开设置：${view}` };
    }
    case "navigation.open_app": {
      const app = trimText(args.app || args.appId || "settings", 48) || "settings";
      emit("yueqi.assist.open-app", { app });
      return { ok: true, summary: `已打开小手机应用：${app}` };
    }
    case "navigation.open_panel": {
      const panel = trimText(args.panel || args.panelId, 32);
      const allowed = new Set(["chat", "companion", "world", "life", "calendar", "me", "api"]);
      if (!allowed.has(panel)) return { ok: false, summary: "没有这个 App 主页面。" };
      emit("yueqi.assist.open-panel", { panel });
      return { ok: true, summary: `已打开 App 页面：${panel}` };
    }
    case "character.list": {
      const activeId = getActiveCharacterId();
      const rows = await listCharacters();
      return { ok: true, summary: `共 ${rows.length} 位角色。`, data: rows.map((item) => ({ id: item.id, name: item.name, alias: item.alias, active: item.id === activeId, source: item.source })) };
    }
    case "character.read": {
      const id = trimText(args.id || getActiveCharacterId(), 80);
      const item = await getCharacter(id);
      if (!item) return { ok: false, summary: `找不到角色 ${id}` };
      return { ok: true, summary: `已读取「${item.name}」的人设。`, data: { id: item.id, name: item.name, alias: item.alias, profile: item.profile, loreEntryIds: item.loreEntryIds || [], petId: item.petId } };
    }
    case "character.create": {
      const created = await createCharacter({ name: trimText(args.name || "新角色", 40), copyFromId: trimText(args.copyFromId, 80) || undefined, petId: trimText(args.petId, 80) || undefined });
      return { ok: true, summary: `已创建角色「${created.name}」。`, data: { id: created.id, name: created.name }, undo: { kind: "character.restore", id: created.id, activeId: getActiveCharacterId() } };
    }
    case "character.update": {
      const id = trimText(args.id || getActiveCharacterId(), 80);
      const existing = await getCharacter(id);
      if (!existing) return { ok: false, summary: `找不到角色 ${id}` };
      const fields = [...(existing.profile?.fields || [])];
      const patch = args.patch && typeof args.patch === "object" ? args.patch : args;
      if (patch.name != null) fields[0] = trimText(patch.name, 40);
      if (patch.alias != null) fields[1] = trimText(patch.alias, 40);
      if (patch.identity != null) fields[2] = trimText(patch.identity, 1200);
      if (patch.model != null) fields[3] = trimText(patch.model, 1200);
      if (patch.base != null || patch.persona != null) fields[4] = trimText(patch.base ?? patch.persona, 5000);
      const next = await upsertCharacter({
        id,
        name: fields[0] || existing.name,
        alias: fields[1] || existing.alias,
        profile: {
          ...(existing.profile || {}),
          fields,
          ranges: Array.isArray(patch.ranges) ? patch.ranges.slice(0, 8).map(Number) : existing.profile?.ranges,
          tokens: Array.isArray(patch.tokens) ? patch.tokens.slice(0, 50).map((item) => trimText(item, 80)) : existing.profile?.tokens,
        },
      });
      return { ok: true, summary: `已更新「${next.name}」的人设。`, data: { id: next.id, name: next.name }, undo: { kind: "character.restore", value: existing, activeId: getActiveCharacterId() } };
    }
    case "character.activate": {
      const previous = getActiveCharacterId();
      const id = trimText(args.id, 80);
      const item = await getCharacter(id);
      if (!item) return { ok: false, summary: `找不到角色 ${id}` };
      setActiveCharacterId(id);
      return { ok: true, summary: `已切换到「${item.name}」。`, undo: { kind: "character.restore", value: null, activeId: previous } };
    }
    case "worldbook.list": {
      const rows = await listWorldbookEntries();
      return { ok: true, summary: `共 ${rows.length} 条世界设定。`, data: rows.map((item) => ({ id: item.id, title: item.title, category: item.category, enabled: item.enabled !== false, triggers: item.triggers })) };
    }
    case "worldbook.read": {
      const item = await getWorldbookEntry(trimText(args.id, 100));
      return item ? { ok: true, summary: `已读取「${item.title}」。`, data: item } : { ok: false, summary: "找不到这个世界书条目。" };
    }
    case "worldbook.upsert": {
      const id = trimText(args.id, 100) || `wb-assist-${Date.now().toString(36)}`;
      const previous = await getWorldbookEntry(id);
      const saved = await upsertWorldbookEntry({
        ...(previous || {}),
        id,
        title: trimText(args.title || previous?.title || "新设定", 100),
        category: trimText(args.category || previous?.category || "氛围", 40),
        triggers: Array.isArray(args.triggers) ? args.triggers.slice(0, 30).map((item) => trimText(item, 60)) : previous?.triggers,
        content: trimText(args.content ?? previous?.content, 10000),
        enabled: args.enabled == null ? previous?.enabled !== false : Boolean(args.enabled),
        priority: Number.isFinite(Number(args.priority)) ? Number(args.priority) : previous?.priority,
        injectSlot: trimText(args.injectSlot || previous?.injectSlot || "system", 40),
      });
      return { ok: true, summary: `已保存世界设定「${saved.title}」。`, data: { id: saved.id, title: saved.title }, undo: { kind: "worldbook.restore", value: previous, id } };
    }
    case "worldbook.toggle": {
      const id = trimText(args.id, 100);
      const previous = await getWorldbookEntry(id);
      if (!previous) return { ok: false, summary: "找不到这个世界书条目。" };
      const saved = await upsertWorldbookEntry({ ...previous, enabled: args.enabled == null ? previous.enabled === false : Boolean(args.enabled) });
      return { ok: true, summary: `已${saved.enabled ? "启用" : "停用"}「${saved.title}」。`, undo: { kind: "worldbook.restore", value: previous } };
    }
    case "worldbook.delete": {
      const id = trimText(args.id, 100);
      const previous = await getWorldbookEntry(id);
      if (!previous) return { ok: false, summary: "找不到这个世界书条目。" };
      await deleteWorldbookEntry(id);
      return { ok: true, summary: `已删除世界设定「${previous.title}」。`, undo: { kind: "worldbook.restore", value: previous } };
    }
    case "presets.list": {
      const activeId = getActivePresetId();
      const rows = listPresets();
      return { ok: true, summary: `共 ${rows.length} 个回复预设。`, data: rows.map((item) => ({ id: item.id, name: item.name, description: item.description, active: item.id === activeId, builtin: Boolean(item.builtin) })) };
    }
    case "presets.activate": {
      const previous = getActivePresetId();
      let id = trimText(args.id || args.presetId, 100);
      const hint = trimText(args.name, 100);
      if (!id && hint) id = listPresets().find((item) => item.name.includes(hint) || hint.includes(item.name))?.id || "";
      if (!id || !listPresets().some((item) => item.id === id)) return { ok: false, summary: "找不到要切换的回复预设。" };
      setActivePresetId(id);
      const item = listPresets().find((preset) => preset.id === id);
      emit("yueqi.assist.presets-changed", { id });
      return { ok: true, summary: `已切换到「${item?.name || id}」。`, undo: { kind: "preset.activate", id: previous } };
    }
    case "presets.duplicate": {
      const sourceId = trimText(args.id, 100);
      const copy = duplicatePreset(sourceId);
      if (!copy) return { ok: false, summary: "找不到要复制的预设。" };
      if (args.name) copy.name = trimText(args.name, 80);
      const saved = upsertPreset(copy);
      emit("yueqi.assist.presets-changed", { id: saved.id });
      return { ok: true, summary: `已创建预设副本「${saved.name}」。`, data: { id: saved.id, name: saved.name }, undo: { kind: "preset.restore", id: saved.id, activeId: getActivePresetId() } };
    }
    case "presets.update": {
      const id = trimText(args.id, 100);
      const previous = listPresets().find((item) => item.id === id);
      if (!previous) return { ok: false, summary: "找不到这个预设。" };
      const saved = upsertPreset({
        ...previous,
        name: args.name == null ? previous.name : trimText(args.name, 80),
        description: args.description == null ? previous.description : trimText(args.description, 500),
        promptSystemPrefix: args.promptSystemPrefix == null ? previous.promptSystemPrefix : trimText(args.promptSystemPrefix, 8000),
        promptDeveloperAppend: args.promptDeveloperAppend == null ? previous.promptDeveloperAppend : trimText(args.promptDeveloperAppend, 8000),
        toneHints: Array.isArray(args.toneHints) ? args.toneHints.slice(0, 30).map((item) => trimText(item, 80)) : previous.toneHints,
      });
      emit("yueqi.assist.presets-changed", { id });
      return { ok: true, summary: `已更新预设「${saved.name}」。`, undo: { kind: "preset.restore", value: previous, activeId: getActivePresetId() } };
    }
    case "presets.delete": {
      const id = trimText(args.id, 100);
      const previous = listPresets().find((item) => item.id === id);
      if (!previous) return { ok: false, summary: "找不到这个预设。" };
      if (previous.builtin) return { ok: false, summary: "内置预设不能删除，可以复制后修改。" };
      const activeId = getActivePresetId();
      const ok = deletePreset(id);
      emit("yueqi.assist.presets-changed", { id });
      return { ok, summary: ok ? `已删除「${previous.name}」。` : "删除失败。", undo: ok ? { kind: "preset.restore", value: previous, activeId } : null };
    }
    case "regex.list": {
      const direction = args.direction === "inbound" || args.direction === "outbound" ? args.direction : undefined;
      const rows = listRegexRules(direction);
      return { ok: true, summary: `共 ${rows.length} 条过滤规则。`, data: rows.map((item) => ({ id: item.id, name: item.name, direction: item.direction, enabled: item.enabled !== false, builtin: Boolean(item.builtin), pattern: item.pattern, replacement: item.replacement, broken: Boolean(item.broken) })) };
    }
    case "regex.upsert": {
      const id = trimText(args.id, 100) || `regex-${Date.now().toString(36)}`;
      const previous = listRegexRules().find((item) => item.id === id) || null;
      const draft = {
        ...(previous || {}),
        id,
        name: trimText(args.name || previous?.name || "助手规则", 80),
        direction: args.direction === "inbound" ? "inbound" : "outbound",
        pattern: String(args.pattern ?? previous?.pattern ?? "").slice(0, 2000),
        replacement: String(args.replacement ?? previous?.replacement ?? "").slice(0, 4000),
        flags: trimText(args.flags || previous?.flags || "g", 12),
        enabled: args.enabled == null ? previous?.enabled !== false : Boolean(args.enabled),
        order: Number.isFinite(Number(args.order)) ? Number(args.order) : Number(previous?.order) || 100,
        builtin: false,
      };
      const compiled = compileRegexRule(draft);
      if (!compiled.ok) return { ok: false, summary: `规则无效：${compiled.error}` };
      const saved = upsertRegexRule(draft);
      emit("yueqi.assist.regex-changed", { id: saved.id });
      return { ok: true, summary: `已保存过滤规则「${saved.name}」。`, data: { id: saved.id, name: saved.name }, undo: { kind: "regex.restore", value: previous, id: saved.id } };
    }
    case "regex.toggle": {
      const id = trimText(args.id, 100);
      const previous = listRegexRules().find((item) => item.id === id);
      if (!previous) return { ok: false, summary: "找不到这个过滤规则。" };
      const enabled = args.enabled == null ? previous.enabled === false : Boolean(args.enabled);
      upsertRegexRule({ ...previous, enabled });
      emit("yueqi.assist.regex-changed", { id });
      return { ok: true, summary: `已${enabled ? "启用" : "停用"}「${previous.name}」。`, undo: { kind: "regex.restore", value: previous } };
    }
    case "regex.delete": {
      const id = trimText(args.id, 100);
      const previous = listRegexRules().find((item) => item.id === id);
      if (!previous) return { ok: false, summary: "找不到这个过滤规则。" };
      if (previous.builtin) return { ok: false, summary: "内置规则不能删除，只能停用。" };
      const ok = deleteRegexRule(id);
      emit("yueqi.assist.regex-changed", { id });
      return { ok, summary: ok ? `已删除「${previous.name}」。` : "删除失败。", undo: ok ? { kind: "regex.restore", value: previous } : null };
    }
    case "calendar.list": {
      const rows = listUpcomingEvents(Number(args.limit) || 12);
      return { ok: true, summary: `找到 ${rows.length} 条近期约定。`, data: rows };
    }
    case "calendar.create": {
      const previous = readLibrary().events || [];
      const event = addEvent({ title: trimText(args.title || "新约定", 120), date: trimText(args.date, 10), time: trimText(args.time || "21:00", 5), prompt: trimText(args.prompt, 500), mode: trimText(args.mode, 80) });
      return { ok: true, summary: `已创建约定「${event.title}」。`, data: event, undo: { kind: "calendar.restore", events: previous } };
    }
    case "calendar.delete": {
      const previous = readLibrary().events || [];
      const id = trimText(args.id, 100);
      const target = previous.find((item) => item.id === id);
      if (!target) return { ok: false, summary: "找不到这个约定。" };
      removeEvent(id);
      return { ok: true, summary: `已删除约定「${target.title}」。`, undo: { kind: "calendar.restore", events: previous } };
    }
    case "memory.search": {
      const companionId = String(
        opts.companionId || opts.initiatingCompanionId || opts.characterId || getActiveCharacterId() || "",
      ).trim();
      if (!companionId) {
        return { ok: false, summary: "需要指定角色范围才能搜索记忆。" };
      }
      const rows = await searchMemories(trimText(args.query, 300), {
        topK: Math.max(1, Math.min(20, Number(args.limit) || 8)),
        companionId,
        characterId: companionId,
      });
      const scoped = rows.filter((item) => rowMatchesCompanionScope(item, {
        companionId,
        userId: "local",
        allowGlobal: false,
      }));
      return {
        ok: true,
        summary: `找到 ${scoped.length} 条相关记忆。`,
        data: scoped.map((item) => ({
          id: item.id || item.drawerId,
          title: item.title || item.room || "记忆",
          text: trimText(item.rawText || item.text || item.content || item.snippet, 1000),
          createdAt: item.createdAt || "",
        })),
      };
    }
    case "memory.update": {
      const companionId = String(
        opts.companionId || opts.initiatingCompanionId || opts.characterId || getActiveCharacterId() || "",
      ).trim();
      if (!companionId) {
        return { ok: false, summary: "需要指定角色范围才能修改记忆。" };
      }
      const id = trimText(args.id, 120);
      const records = await getAllRecords("memories");
      const previous = records.find((item) => item.id === id);
      if (!previous) return { ok: false, summary: "找不到这条记忆。" };
      if (!rowMatchesCompanionScope(previous, { companionId, userId: "local", allowGlobal: false })) {
        return { ok: false, summary: "这条记忆不属于当前角色范围，无法修改。" };
      }
      await updateMemory(id, { rawText: trimText(args.text ?? args.rawText ?? previous.rawText, 8000), title: args.title == null ? previous.title : trimText(args.title, 160), pinned: args.pinned == null ? previous.pinned : Boolean(args.pinned) });
      return { ok: true, summary: "已修正这条记忆。", undo: { kind: "memory.restore", value: previous } };
    }
    case "memory.delete": {
      const companionId = String(
        opts.companionId || opts.initiatingCompanionId || opts.characterId || getActiveCharacterId() || "",
      ).trim();
      if (!companionId) {
        return { ok: false, summary: "需要指定角色范围才能删除记忆。" };
      }
      const id = trimText(args.id, 120);
      const records = await getAllRecords("memories");
      const previous = records.find((item) => item.id === id);
      if (!previous) return { ok: false, summary: "找不到这条记忆。" };
      if (!rowMatchesCompanionScope(previous, { companionId, userId: "local", allowGlobal: false })) {
        return { ok: false, summary: "这条记忆不属于当前角色范围，无法删除。" };
      }
      await deleteMemory(id);
      return { ok: true, summary: "已删除这条记忆。", undo: { kind: "memory.restore", value: previous } };
    }
    case "library.status": {
      const books = listBooks();
      const tracks = listTracks();
      return { ok: true, summary: `资料库里有 ${books.length} 本书、${tracks.length} 首音乐。`, data: { books: safeRows(books, 30), tracks: safeRows(tracks, 30) } };
    }
    case "library.update_book": {
      const previous = readLibrary().books || [];
      const rows = updateBookProgress(trimText(args.id || args.title, 160), { scrollRatio: Number(args.scrollRatio), progress: trimText(args.progress, 80), chapter: trimText(args.chapter, 160), excerpt: trimText(args.excerpt, 480) });
      return { ok: true, summary: "已更新阅读进度。", data: safeRows(rows, 20), undo: { kind: "library.restore", patch: { books: previous } } };
    }
    case "gallery.list_groups": {
      const rows = listPhotoGroups();
      return { ok: true, summary: `共 ${rows.length} 个相册分组。`, data: rows };
    }
    case "gallery.create_group": {
      const previous = readLibrary();
      const group = createPhotoGroup(trimText(args.name || "新分组", 24));
      return { ok: true, summary: `已创建相册分组「${group.name}」。`, data: group, undo: { kind: "library.restore", patch: { photoGroups: previous.photoGroups, photos: previous.photos } } };
    }
    case "gallery.rename_group": {
      const previous = readLibrary();
      const group = renamePhotoGroup(trimText(args.id, 100), trimText(args.name, 24));
      if (!group) return { ok: false, summary: "没有找到相册分组，或名称为空。" };
      return { ok: true, summary: `已重命名为「${group.name}」。`, data: group, undo: { kind: "library.restore", patch: { photoGroups: previous.photoGroups, photos: previous.photos } } };
    }
    case "gallery.delete_group": {
      const previous = readLibrary();
      const id = trimText(args.id, 100);
      if (!previous.photoGroups?.some((item) => item.id === id)) return { ok: false, summary: "找不到这个相册分组。" };
      deletePhotoGroup(id);
      return { ok: true, summary: "已删除相册分组；其中照片没有被删除，只是移出分组。", undo: { kind: "library.restore", patch: { photoGroups: previous.photoGroups, photos: previous.photos } } };
    }
    case "proactive.read": {
      const value = loadProactiveWakePrefs();
      return { ok: true, summary: `主动概率 ${value.probability}%，静默窗口 ${value.silenceMinMin}-${value.silenceMaxMin} 分钟。`, data: value };
    }
    case "proactive.update": {
      const previous = loadProactiveWakePrefs();
      const saved = saveProactiveWakePrefs({ probability: args.probability, silenceMinMin: args.silenceMinMin, silenceMaxMin: args.silenceMaxMin, checkEveryMin: args.checkEveryMin });
      return { ok: true, summary: `已更新主动陪伴：概率 ${saved.probability}%。`, data: saved, undo: { kind: "proactive.restore", value: previous } };
    }
    case "appearance.themes":
      return { ok: true, summary: `可用 ${THEMES.length} 套主题。`, data: THEMES.map((item) => ({ ...item, active: item.id === getThemeId() })) };
    case "appearance.apply_theme": {
      const previous = getThemeId();
      const id = trimText(args.id, 30);
      if (!THEMES.some((item) => item.id === id)) return { ok: false, summary: "没有这个主题。" };
      applyTheme(id);
      return { ok: true, summary: `已应用主题「${THEMES.find((item) => item.id === id)?.label || id}」。`, undo: { kind: "theme.restore", id: previous } };
    }
    case "appearance.interface":
      return { ok: true, summary: `当前界面模式：${getAppMode() === "phone" ? "小手机" : "App"}。`, data: { mode: getAppMode() } };
    case "appearance.switch_mode": {
      const previous = getAppMode();
      const mode = args.mode === "phone" ? "phone" : "app";
      setAppModePref(mode);
      emit("yueqi.assist.switch-mode", { mode });
      return { ok: true, summary: `已切换到${mode === "phone" ? "小手机" : "App"}模式。`, undo: { kind: "mode.restore", mode: previous } };
    }
    case "voice.status": {
      const value = getVoiceSettings();
      return { ok: true, summary: `语音合成${isVoiceConfigured(value) ? "已配置" : "未配置"}，语音识别${isSttConfigured(value) ? "已配置" : "未配置"}。`, data: { ttsProvider: value.ttsProvider, voiceId: value.voiceId, ttsModel: value.ttsModel, openaiVoice: value.openaiVoice, sttProvider: value.sttProvider, sttModel: value.sttModel, autoSpeak: Boolean(value.autoSpeak), ttsConfigured: isVoiceConfigured(value), sttConfigured: isSttConfigured(value) } };
    }
    case "voice.update": {
      const current = getVoiceSettings();
      const previous = { ttsProvider: current.ttsProvider, voiceId: current.voiceId, ttsModel: current.ttsModel, openaiVoice: current.openaiVoice, sttProvider: current.sttProvider, sttModel: current.sttModel, autoSpeak: current.autoSpeak };
      const allowed = {};
      for (const key of ["ttsProvider", "voiceId", "ttsModel", "openaiVoice", "sttProvider", "sttModel", "autoSpeak"]) {
        if (args[key] != null) allowed[key] = key === "autoSpeak" ? Boolean(args[key]) : trimText(args[key], 120);
      }
      const saved = saveVoiceSettings(allowed);
      return { ok: true, summary: "已更新语音偏好；密钥没有经过助手。", data: { autoSpeak: saved.autoSpeak, ttsProvider: saved.ttsProvider, sttProvider: saved.sttProvider }, undo: { kind: "voice.restore", value: previous } };
    }
    case "scenario.list": {
      const scripts = listScripts();
      const runs = listRuns();
      return { ok: true, summary: `有 ${scripts.length} 个情景，${runs.filter((item) => item.status === "active" || item.status === "paused").length} 个未完旅程。`, data: { scripts: scripts.map((item) => ({ id: item.id, title: item.title, premise: trimText(item.premise, 300) })), runs: safeRows(runs, 20).map((item) => ({ id: item.id, scriptId: item.scriptId, status: item.status, updatedAt: item.updatedAt })) } };
    }
    case "scenario.open":
      emit("yueqi.assist.open-app", { app: "scenario" });
      return { ok: true, summary: "已打开栖境。" };
    case "moments.list": {
      const rows = loadMoments();
      return { ok: true, summary: `最近有 ${rows.length} 条动态。`, data: safeRows(rows, 10).map((item) => ({ id: item.id, author: item.author, content: item.content, time: item.time, likes: item.likes?.length || 0, comments: item.comments?.length || 0 })) };
    }
    case "moments.open":
      emit("yueqi.assist.open-app", { app: "moments" });
      return { ok: true, summary: "已打开朋友圈。" };
    case "tasks.list": {
      const rows = listTasks({ limit: Math.max(1, Math.min(30, Number(args.limit) || 12)) });
      return { ok: true, summary: `找到 ${rows.length} 个任务。`, data: rows.map((item) => ({ id: item.id, state: item.state, title: item.intent?.title || item.intent?.kind || "任务", updatedAt: item.updatedAt, requiresApproval: item.state === "awaiting_approval" })) };
    }
    case "privacy.provider_status": {
      const provider = readProvider();
      return { ok: true, summary: `模型接口${provider.baseUrl && provider.model ? "已填写" : "未完成配置"}；密钥不会显示给助手。`, data: { kind: provider.kind, baseUrlConfigured: Boolean(provider.baseUrl), model: provider.model || "", keyExposed: false } };
    }
    case "privacy.audit": {
      const rows = listAssistAudit(Number(args.limit) || 30);
      return { ok: true, summary: `最近有 ${rows.length} 条助手操作记录。`, data: rows.map((item) => ({ id: item.id, at: item.at, tool: item.tool, risk: item.risk, status: item.status, summary: item.summary, undoable: Boolean(item.undo && !item.undoneAt) })) };
    }
    case "privacy.undo": {
      const latest = getLatestUndoableAudit();
      if (!latest) return { ok: false, summary: "没有可以撤销的助手写入。" };
      const ok = await undoDescriptor(latest.undo);
      if (!ok) return { ok: false, summary: "这次写入暂不支持自动撤销。" };
      markAssistAuditUndone(latest.id);
      return { ok: true, summary: `已撤销：${latest.summary}` };
    }
    default:
      return { ok: false, summary: `未知工具「${toolId}」。` };
  }
}

function localizeToolResult(tool, result, locale) {
  const id = normalizeAssistLocale(locale);
  if (id !== "en") return result;
  if (!result.ok) return { ...result, summary: assistT("toolFailure", { label: tool.label }, id) };
  if (tool.id === "system.capabilities") {
    return { ...result, summary: assistT("capabilitiesResult", {
      packs: result.data?.summary?.packs ?? capabilitySummary().packs,
      tools: result.data?.summary?.tools ?? capabilitySummary().tools,
    }, id) };
  }
  if (tool.id === "system.context") {
    return { ...result, summary: assistT("contextResult", { context: result.data?.context || "assistant" }, id) };
  }
  if (tool.id === "privacy.audit") {
    return { ...result, summary: assistT("auditResult", { count: result.data?.length || 0 }, id) };
  }
  if (tool.id === "privacy.provider_status") {
    return { ...result, summary: assistT(result.data?.baseUrlConfigured ? "providerReady" : "providerMissing", {}, id) };
  }
  if (tool.id === "privacy.undo") return { ...result, summary: assistT("undoDone", {}, id) };
  const key = tool.risk === "read"
    ? "toolReadSuccess"
    : tool.risk === "action"
      ? "toolActionSuccess"
      : "toolWriteSuccess";
  return { ...result, summary: assistT(key, { label: tool.label }, id) };
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {{ confirmed?: boolean, context?: string, skipAudit?: boolean }} [opts]
 */
export async function executeAssistTool(name, args = {}, opts = {}) {
  const locale = normalizeAssistLocale(opts.locale);
  const toolId = resolveToolName(name);
  const tool = getAssistTool(toolId, locale);
  if (!tool) return { ok: false, summary: locale === "en" ? `Unknown tool: ${trimText(name, 120)}.` : `未知工具「${trimText(name, 120)}」。` };
  if (tool.requiresConfirmation && !opts.confirmed) return approvalCard(tool, args, locale);

  let result;
  try {
    result = await executeCore(toolId, args, { ...opts, locale });
  } catch (error) {
    result = { ok: false, summary: locale === "en" ? "Tool execution failed." : String(error?.message || error || "工具执行失败") };
  }
  result = localizeToolResult(tool, result, locale);

  if (!opts.skipAudit && toolId !== "privacy.audit") {
    appendAssistAudit({
      tool: toolId,
      risk: tool.risk,
      status: result.ok ? "completed" : "failed",
      summary: result.summary || "",
      args,
      undo: result.ok ? result.undo : null,
    });
  }
  return { ...result, tool: toolId, risk: tool.risk };
}

export function getAssistRegistrySummary() {
  return capabilitySummary();
}
