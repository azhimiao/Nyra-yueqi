import { getLocale } from "../../i18n/index.js";

const loaders = {
  prompt: () => import("./prompt-editor.js").then((m) => m.mountPromptEditor),
  worldbook: () => import("./worldbook-editor.js").then((m) => m.mountWorldbookEditor),
  memory: () => import("./memory-editor.js").then((m) => m.mountMemoryEditor),
  appearance: () => import("./appearance-editor.js").then((m) => m.mountAppearanceEditor),
};
let foreground = null;
let wired = false;

export function allowAuthoringNavigation(retry) {
  const surface = foreground;
  if (!surface?.isVisible() || !surface.hasUnsaved) return true;
  surface.requestLeave(() => {
    surface.deactivate();
    retry();
    // Another editor's leave guard may decline the outer navigation.
    if (surface.isVisible()) void surface.activate();
  });
  return false;
}

export function confirmAuthoringLeave(onLeave) {
  const existing = document.querySelector(".author-leave-dialog");
  if (existing) return;
  const previous = document.activeElement;
  const zh = !getLocale().startsWith("en");
  const overlay = document.createElement("div");
  overlay.className = "author-leave-dialog";
  overlay.innerHTML = `<div role="alertdialog" aria-modal="true" aria-labelledby="author-leave-title" aria-describedby="author-leave-description"><h3 id="author-leave-title">${zh ? "有未保存的修改" : "Unsaved changes"}</h3><p id="author-leave-description">${zh ? "离开会放弃当前编辑。可以返回继续修改并保存。" : "Leaving discards these edits. Return to continue and save."}</p><div class="author-actions"><button type="button" data-leave>${zh ? "放弃并离开" : "Discard & leave"}</button><button type="button" class="author-primary" data-stay>${zh ? "继续编辑" : "Keep editing"}</button></div></div>`;
  document.body.append(overlay);
  const close = () => { overlay.remove(); previous?.focus?.(); };
  overlay.querySelector("[data-stay]").onclick = close;
  overlay.querySelector("[data-leave]").onclick = () => { close(); onLeave(); };
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") { event.preventDefault(); const next = document.activeElement === overlay.querySelector("[data-stay]") ? overlay.querySelector("[data-leave]") : overlay.querySelector("[data-stay]"); next.focus(); }
  });
  overlay.querySelector("[data-stay]").focus();
}

function wireNavigationGuard() {
  if (wired) return;
  wired = true;
  window.addEventListener("beforeunload", (event) => {
    if (!foreground?.hasUnsaved) return;
    event.preventDefault(); event.returnValue = "";
  });
}

/** Keeps legacy controls in place for their existing listeners and storage paths. */
export function createAuthoringSurface(panel, kind, { phone = false, advancedLabel = "", getOptions = () => ({}) } = {}) {
  if (!panel || !loaders[kind]) return null;
  wireNavigationGuard();
  panel.classList.add("author-route");
  if (kind === "worldbook" || kind === "memory") panel.dataset.readingSpace = kind;
  const wrapper = document.createElement("div");
  wrapper.dataset.authorLegacy = kind;
  // Phone sheets (summarization, wallpaper, archives) keep their original layering.
  const children = Array.from(panel.children).filter((node) => !phone || (!node.matches(".mini-appbar,.mini-pop-sheet,.mini-wallpaper-sheet,[data-wallpaper-sheet]")));
  children.forEach((node) => wrapper.append(node));
  const mount = document.createElement("div");
  mount.className = phone ? "author-mount mini-app-scroll" : "author-mount";
  mount.dataset.authoringSurface = kind;
  const host = document.createElement("div");
  mount.append(host);
  if (advancedLabel) {
    const details = document.createElement("details");
    details.className = "author-advanced";
    const summary = document.createElement("summary"); summary.textContent = advancedLabel;
    details.append(summary, wrapper); mount.append(details);
  } else { wrapper.hidden = true; panel.append(wrapper); }
  const header = phone ? panel.querySelector(".mini-appbar") : null;
  if (header) header.after(mount); else panel.prepend(mount);
  let instance = null;
  let generation = 0;
  let pending = null;
  let overrides = {};
  const api = {
    get hasUnsaved() { return Boolean(instance?.hasUnsaved); },
    isVisible() { return panel.getClientRects().length > 0; },
    async activate(options = {}) {
      foreground = api;
      if (instance && options.characterId && options.characterId !== overrides.characterId) api.deactivate();
      foreground = api;
      if (instance) return instance;
      if (pending) return pending;
      overrides = options;
      const token = ++generation;
      host.innerHTML = `<p class="author-muted" role="status">${getLocale().startsWith("en") ? "Loading…" : "正在读取…"}</p>`;
      pending = (async () => {
        try {
          const [mountEditor, base] = await Promise.all([loaders[kind](), getOptions(options)]);
          if (token !== generation) return null;
          instance = mountEditor(host, { ...base, ...options });
          await instance?.ready;
          if (token !== generation) return null;
          return instance;
        } catch (error) {
          if (token !== generation) return null;
          instance?.destroy?.(); instance = null;
          host.replaceChildren();
          const message = document.createElement("p"); message.className = "author-load-error";
          message.textContent = getLocale().startsWith("en") ? "Could not open the editor. Try again." : "编辑器未能打开，请重试。";
          const retry = document.createElement("button"); retry.type = "button"; retry.textContent = getLocale().startsWith("en") ? "Retry" : "重试";
          retry.onclick = () => api.activate(options); host.append(message, retry);
          console.error(`[authoring:${kind}]`, error);
          return null;
        } finally { if (token === generation) pending = null; }
      })();
      return pending;
    },
    handleBack() { return Boolean(instance?.handleBack?.()); },
    requestLeave(callback) {
      if (!api.hasUnsaved) { callback(); return; }
      if (typeof instance?.requestLeave === "function") instance.requestLeave(callback);
      else confirmAuthoringLeave(callback);
    },
    deactivate() {
      generation += 1; pending = null; instance?.destroy?.(); instance = null;
      host.replaceChildren(); if (foreground === api) foreground = null;
    },
    refresh() { return instance?.refresh?.(); },
  };
  return api;
}
