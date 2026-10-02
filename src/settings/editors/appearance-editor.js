import { getLocale } from "../../i18n/index.js";
import { escapeHtml } from "../../lib/utils.js";
import { THEMES, getThemeId } from "../../ui/theme.js";
import { DEFAULT_WIDGET_ORDER } from "../../phone-shell/os-prefs.js";
import { DEFAULT_APPEARANCE, getAppearanceSettings, getPhoneAppearanceSettings, saveAppearanceSettings, normalizeAppearance, colorInk, defaultWidgetSettings } from "../appearance.js";
import { confirmAuthoringLeave } from "./surface.js";

export function mountAppearanceEditor(host) {
  const zh = !getLocale().startsWith("en");
  const tr = (cn, en) => zh ? cn : en;
  const prefs = getPhoneAppearanceSettings();
  let draft = { ...getAppearanceSettings(), themeId: getThemeId(), widgets: { ...prefs.widgets }, widgetOrder: [...new Set([...prefs.widgetOrder, ...DEFAULT_WIDGET_ORDER])] };
  let saved = JSON.stringify(draft);
  let destroyed = false;
  let busy = false;
  const names = {
    clock: tr("时钟与问候", "Clock & greeting"),
    today: tr("今日陪伴", "Today"),
    listen: tr("一起听", "Listen together"),
    calendar: tr("日历", "Calendar"),
    ...(Object.fromEntries((prefs.customWidgets || []).map((item) => [item.id, item.title || item.id]))),
  };
  const themeColors = { yueqi: ["#f5f9fc", "#edf1f4", "#071b2e"], mist: ["#f1f6f9", "#e4edf3", "#12445f"], pine: ["#f3f6f5", "#e6efea", "#14464f"], ink: ["#182438", "#1d2a40", "#b9d8ff"] };
  host.innerHTML = `<div class="author-editor appearance-editor">
    <header class="author-heading"><h2>${tr("让这里更像你", "Make it yours")}</h2><p class="author-muted">${tr("先看效果，再保存。两种界面使用同一份外观设置。", "Preview first, then save. Both interfaces share these settings.")}</p></header>
    <div class="author-savebar"><p class="author-status" role="status" aria-live="polite">${tr("留一点你喜欢的色彩。", "A little color, just for you.")}</p><button type="button" data-appearance-save class="author-primary">${tr("保存外观", "Save appearance")}</button></div>
    <div class="appearance-preview" aria-label="${tr("外观预览", "Appearance preview")}">
      <div class="appearance-preview-label">${tr("效果预览", "PREVIEW")}</div>
      <div class="appearance-preview-chat"><p class="appearance-preview-bubble is-user">${tr("今天想慢一点。", "Let's take it slowly today.")}</p><p class="appearance-preview-bubble is-ai">${tr("好呀，我陪你。", "Of course. I'm here with you.")}</p></div>
      <div class="appearance-preview-card"><span>09:41</span><strong>${tr("属于我们的片刻", "A moment for us")}</strong><small>${tr("今天，也在你身边。", "Here with you, today too.")}</small></div>
    </div>
    <section class="author-section"><h3>${tr("色彩", "Colors")}</h3><div class="appearance-themes">${THEMES.map((theme) => `<button type="button" data-appearance-theme="${theme.id}" aria-pressed="${theme.id === draft.themeId}"><span class="appearance-swatch" style="background:${themeColors[theme.id][0]};border-color:${themeColors[theme.id][1]}"><i style="background:${themeColors[theme.id][2]}"></i></span>${escapeHtml(theme.label)}</button>`).join("")}</div></section>
    <details class="author-section" open><summary>${tr("聊天气泡", "Chat bubbles")}</summary>
      <label class="author-field"><span>${tr("文字大小", "Text size")} <output data-value="fontSize"></output></span><input type="range" name="fontSize" aria-label="${tr("文字大小", "Text size")}" min="14" max="20" step="1" value="${draft.fontSize}" /></label>
      <label class="author-field"><span>${tr("圆角", "Corners")} <output data-value="bubbleRadius"></output></span><input type="range" name="bubbleRadius" aria-label="${tr("气泡圆角", "Bubble corners")}" min="4" max="28" step="2" value="${draft.bubbleRadius}" /></label>
      <label class="author-field"><span>${tr("对话间距", "Spacing")}</span><select name="density"><option value="comfortable">${tr("舒展", "Comfortable")}</option><option value="compact">${tr("紧凑", "Compact")}</option></select></label>
      <label class="author-row"><span>${tr("自定义气泡颜色", "Custom bubble colors")}</span><input type="checkbox" name="customColors" ${draft.customColors ? "checked" : ""} /></label>
      <div class="appearance-color-fields" ${draft.customColors ? "" : "hidden"}><label class="author-row"><span>${tr("我的气泡", "My bubbles")}</span><input type="color" name="userColor" value="${draft.userColor}" /></label><label class="author-row"><span>${tr("角色气泡", "Companion bubbles")}</span><input type="color" name="assistantColor" value="${draft.assistantColor}" /></label></div>
    </details>
    <details class="author-section"><summary>${tr("组件卡片", "Widget cards")}</summary><p class="author-muted">${tr("调整小手机桌面和 App 陪伴卡片的外观。", "Style phone widgets and App companion cards.")}</p>
      <label class="author-field"><span>${tr("卡片质感", "Card style")}</span><select name="cardStyle"><option value="system">${tr("跟随主题", "Follow theme")}</option><option value="soft">${tr("柔和", "Soft")}</option><option value="outline">${tr("轻描边", "Outline")}</option><option value="glass">${tr("半透明", "Translucent")}</option></select></label>
      <label class="author-field"><span>${tr("卡片圆角", "Card corners")} <output data-value="cardRadius"></output></span><input type="range" name="cardRadius" aria-label="${tr("卡片圆角", "Card corners")}" min="8" max="28" step="2" value="${draft.cardRadius}" /></label>
    </details>
    <details class="author-section"><summary>${tr("小手机桌面组件", "Phone home widgets")}</summary><p class="author-muted">${tr("开关控制显示，上下移动调整顺序。关闭组件后，相应应用仍可从桌面打开。", "Choose what appears and reorder it. Apps remain accessible when their widgets are hidden.")}</p><div data-appearance-widgets></div></details>
    <div class="author-actions"><button type="button" data-appearance-reset class="author-quiet">${tr("恢复默认", "Restore defaults")}</button></div>
  </div>`;
  host.querySelector('[name="density"]').value = draft.density;
  host.querySelector('[name="cardStyle"]').value = draft.cardStyle;
  const status = host.querySelector(".author-status");
  const preview = host.querySelector(".appearance-preview");
  function paintWidgets() {
    host.querySelector("[data-appearance-widgets]").innerHTML = draft.widgetOrder.map((id, index) => {
      const label = names[id] || id;
      return `<div class="author-row appearance-widget-row"><label><input type="checkbox" data-widget-choice="${escapeHtml(id)}" ${draft.widgets[id] !== false ? "checked" : ""} /> <span>${escapeHtml(label)}</span></label><div><button type="button" data-widget-up="${escapeHtml(id)}" ${index === 0 ? "disabled" : ""} aria-label="${tr("上移", "Move up")} ${escapeHtml(label)}">↑</button><button type="button" data-widget-down="${escapeHtml(id)}" ${index === draft.widgetOrder.length - 1 ? "disabled" : ""} aria-label="${tr("下移", "Move down")} ${escapeHtml(label)}">↓</button></div></div>`;
    }).join("");
  }
  function paintPreview() {
    const palette = themeColors[draft.themeId];
    preview.style.cssText = `--preview-bg:${palette[0]};--preview-soft:${palette[1]};--preview-ink:${draft.themeId === "ink" ? "#edf2f6" : "#182b3b"};--preview-user:${draft.customColors ? draft.userColor : palette[1]};--preview-ai:${draft.customColors ? draft.assistantColor : draft.themeId === "ink" ? palette[0] : "#ffffff"};--preview-user-ink:${draft.customColors ? colorInk(draft.userColor) : draft.themeId === "ink" ? "#edf2f6" : "#182b3b"};--preview-ai-ink:${draft.customColors ? colorInk(draft.assistantColor) : draft.themeId === "ink" ? "#edf2f6" : "#182b3b"};--preview-radius:${draft.bubbleRadius}px;--preview-card-radius:${draft.cardRadius}px;--preview-size:${draft.fontSize}px;--preview-gap:${draft.density === "compact" ? "7px" : "12px"}`;
    preview.dataset.cardStyle = draft.cardStyle;
    host.querySelectorAll("[data-value]").forEach((el) => { el.textContent = `${draft[el.dataset.value]}px`; });
    host.querySelectorAll("[data-appearance-theme]").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.appearanceTheme === draft.themeId)));
    host.querySelector(".appearance-color-fields").hidden = !draft.customColors;
  }
  function changed() { draft.customized = true; status.setAttribute("role", "status"); status.textContent = tr("预览中 · 尚未保存", "Previewing · Unsaved"); paintPreview(); }
  function onInput(event) {
    const target = event.target;
    if (target.dataset.widgetChoice) { draft.widgets[target.dataset.widgetChoice] = target.checked; changed(); return; }
    if (!Object.hasOwn(DEFAULT_APPEARANCE, target.name)) return;
    draft[target.name] = target.type === "checkbox" ? target.checked : target.type === "range" ? Number(target.value) : target.value;
    changed();
  }
  async function onClick(event) {
    const button = event.target.closest("button");
    if (!button || busy) return;
    if (button.dataset.appearanceTheme) { draft.themeId = button.dataset.appearanceTheme; changed(); }
    const moveId = button.dataset.widgetUp || button.dataset.widgetDown;
    if (moveId) { const from = draft.widgetOrder.indexOf(moveId); const to = from + (button.dataset.widgetUp ? -1 : 1); if (to >= 0 && to < draft.widgetOrder.length) { [draft.widgetOrder[from], draft.widgetOrder[to]] = [draft.widgetOrder[to], draft.widgetOrder[from]]; paintWidgets(); changed(); host.querySelector(`[data-widget-${button.dataset.widgetUp ? "up" : "down"}="${moveId}"]`)?.focus(); } }
    if (button.hasAttribute("data-appearance-reset")) {
      draft = { ...DEFAULT_APPEARANCE, themeId: "yueqi", ...defaultWidgetSettings() };
      host.querySelectorAll("[name]").forEach((el) => { if (el.type === "checkbox") el.checked = Boolean(draft[el.name]); else el.value = draft[el.name]; });
      status.textContent = tr("默认效果已预览，保存后生效。", "Defaults previewed. Save to apply."); paintWidgets(); paintPreview();
      status.setAttribute("role", "status");
    }
    if (button.hasAttribute("data-appearance-save")) {
      busy = true;
      button.textContent = tr("保存中…", "Saving…");
      const controls = [...host.querySelectorAll("button, input, select")].map((control) => [control, control.disabled]);
      controls.forEach(([control]) => { control.disabled = true; });
      try {
        await saveAppearanceSettings({ appearance: normalizeAppearance(draft), themeId: draft.themeId, widgets: draft.widgets, widgetOrder: draft.widgetOrder });
        saved = JSON.stringify(draft); status.textContent = tr("已保存，两种界面均已更新。", "Saved. Both interfaces are updated.");
        status.setAttribute("role", "status");
      } catch (error) {
        status.textContent = error?.code === "widget_placement_full"
          ? tr(`桌面已满，请先腾出一个图标位置再关闭「${error.widgetIds.map((id) => names[id] || id).join("、")}」组件。`, `Your home screen is full. Free an icon slot before hiding ${error.widgetIds.map((id) => names[id] || id).join(", ")}.`)
          : tr("保存失败，请检查本机存储空间后重试。", "Could not save. Check local storage and retry.");
        status.setAttribute("role", "alert");
      } finally {
        busy = false;
        button.textContent = tr("保存外观", "Save appearance");
        controls.forEach(([control, disabled]) => { control.disabled = disabled; });
      }
    }
  }
  host.addEventListener("input", onInput);
  host.addEventListener("click", onClick);
  paintWidgets(); paintPreview();
  return {
    get hasUnsaved() { return !destroyed && (busy || JSON.stringify(draft) !== saved); },
    requestLeave(callback) { if (!busy) confirmAuthoringLeave(callback); },
    destroy() { destroyed = true; host.removeEventListener("input", onInput); host.removeEventListener("click", onClick); },
  };
}
