/**
 * Message-filter (regex) settings UI — plain-language first.
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";
import { compileRegexRule } from "./schema.js";
import {
  deleteRegexRule,
  listRegexRules,
  upsertRegexRule,
} from "./store.js";

/** @type {Record<string, string>} */
const BUILTIN_REGEX_KEY = {
  "builtin-out-strip-think": "stripThink",
  "builtin-in-trim-spaces": "trimSpaces",
};

function regexBuiltinKey(rule) {
  return rule?.builtin ? BUILTIN_REGEX_KEY[rule.id] : "";
}

function regexDisplayName(rule) {
  const key = regexBuiltinKey(rule);
  if (key) return t(`mePanels.regex.builtin.${key}.name`);
  return rule.name;
}

function regexDisplayDescription(rule) {
  const key = regexBuiltinKey(rule);
  if (key) return t(`mePanels.regex.builtin.${key}.description`);
  return rule.description || "";
}

function ruleBlurb(rule) {
  const desc = regexDisplayDescription(rule);
  if (desc) return desc;
  if (!rule.pattern) return t("mePanels.regex.blurbNotSet");
  if (!String(rule.replacement || "").length) {
    return t("mePanels.regex.blurbDelete");
  }
  return t("mePanels.regex.blurbReplace", {
    replacement: String(rule.replacement).slice(0, 24),
  });
}

function effectLabel(rule) {
  if (!String(rule.replacement || "").length) return t("mePanels.regex.effectDelete");
  return t("mePanels.regex.effectReplace", {
    replacement: String(rule.replacement).slice(0, 18),
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ onToast?: (msg: string) => void, onOpenAssist?: (ctx?: object) => void }} [deps]
 */
export function mountRegexManager(root, deps = {}) {
  if (!root) return { refresh() {}, destroy() {} };
  let tab = "outbound";
  /** @type {Set<string>} */
  const openEditors = new Set();

  function render() {
    const rules = listRegexRules(tab).sort((a, b) => (a.order || 0) - (b.order || 0));
    root.innerHTML = `
      <p class="me-foot-hint">${escapeHtml(t("mePanels.regex.footHint"))}</p>
      <div class="regex-toolbar">
        <button type="button" class="me-toolbar__btn" data-regex-ask-assist>
          <i data-lucide="bot"></i><span>${escapeHtml(t("mePanels.regex.askAssist"))}</span>
        </button>
        <button type="button" class="me-toolbar__btn" data-regex-add>
          <i data-lucide="plus"></i><span>${escapeHtml(t("mePanels.regex.add"))}</span>
        </button>
      </div>
      <nav class="me-segment regex-tabs" role="tablist" aria-label="${escapeHtml(t("mePanels.regex.tabsAria"))}">
        <button type="button" class="${tab === "inbound" ? "is-active" : ""}" data-regex-tab="inbound" aria-pressed="${tab === "inbound"}">${escapeHtml(t("mePanels.regex.tabInbound"))}</button>
        <button type="button" class="${tab === "outbound" ? "is-active" : ""}" data-regex-tab="outbound" aria-pressed="${tab === "outbound"}">${escapeHtml(t("mePanels.regex.tabOutbound"))}</button>
      </nav>
      <p class="me-foot-hint regex-tab-hint">${
        escapeHtml(tab === "inbound" ? t("mePanels.regex.tabHintInbound") : t("mePanels.regex.tabHintOutbound"))
      }</p>
      <div class="regex-list" data-regex-list>
        ${
          rules.length
            ? rules
                .map((rule) => {
                  const compiled = compileRegexRule(rule);
                  const broken = !compiled.ok || rule.broken;
                  const enabled = rule.enabled !== false;
                  const blurb = ruleBlurb(rule);
                  const displayName = regexDisplayName(rule);
                  return `
            <article class="regex-card${enabled ? " is-on" : ""}" data-regex-id="${escapeHtml(rule.id)}">
              <div class="regex-card__row">
                <div class="regex-card__copy">
                  <strong>${escapeHtml(displayName)}</strong>
                  <p class="regex-card__blurb">${escapeHtml(blurb)}</p>
                  <div class="regex-card__meta">
                    ${rule.builtin ? `<span class="preset-pill">${escapeHtml(t("mePanels.regex.pillRecommended"))}</span>` : `<span class="preset-pill">${escapeHtml(t("mePanels.regex.pillCustom"))}</span>`}
                    <span>${escapeHtml(effectLabel(rule))}</span>
                    ${broken ? `<span class="regex-warn">${escapeHtml(t("mePanels.regex.ruleBroken"))}</span>` : ""}
                  </div>
                </div>
                <label class="regex-switch">
                  <input type="checkbox" data-regex-enabled ${enabled ? "checked" : ""} aria-label="${escapeHtml(t("mePanels.regex.enableAria", { name: displayName }))}" />
                </label>
              </div>
              <details class="regex-edit"${openEditors.has(rule.id) ? " open" : ""}>
                <summary>${escapeHtml(rule.builtin ? t("mePanels.regex.viewDetails") : t("mePanels.regex.edit"))}</summary>
                <div class="regex-edit__body">
                  ${
                    rule.builtin
                      ? `<p class="regex-edit__plain">${escapeHtml(blurb)}<br/>${escapeHtml(t("mePanels.regex.builtinPlain"))}</p>
                  <details class="regex-edit__tech">
                    <summary>${escapeHtml(t("mePanels.regex.techDetails"))}</summary>
                    <p class="regex-edit__code"><span>${escapeHtml(t("mePanels.regex.match"))}</span><code>${escapeHtml(rule.pattern)}</code></p>
                    <p class="regex-edit__code"><span>${escapeHtml(t("mePanels.regex.replace"))}</span><code>${escapeHtml(rule.replacement || t("mePanels.regex.deleteReplacement"))}</code></p>
                  </details>`
                      : `<label class="edit-field"><span>${escapeHtml(t("mePanels.regex.fieldName"))}</span><input type="text" data-r-name value="${escapeHtml(rule.name)}" autocomplete="off" /></label>
                  <label class="edit-field"><span>${escapeHtml(t("mePanels.regex.fieldDescription"))}</span><input type="text" data-r-desc value="${escapeHtml(rule.description || "")}" placeholder="${escapeHtml(t("mePanels.regex.fieldDescriptionPlaceholder"))}" autocomplete="off" /></label>
                  <label class="edit-field"><span>${escapeHtml(t("mePanels.regex.fieldFind"))}</span><input type="text" data-r-pattern value="${escapeHtml(rule.pattern)}" placeholder="${escapeHtml(t("mePanels.regex.fieldFindPlaceholder"))}" autocomplete="off" spellcheck="false" /></label>
                  <label class="edit-field"><span>${escapeHtml(t("mePanels.regex.fieldReplaceWith"))}</span><input type="text" data-r-repl value="${escapeHtml(rule.replacement)}" placeholder="${escapeHtml(t("mePanels.regex.fieldReplacePlaceholder"))}" autocomplete="off" spellcheck="false" /></label>
                  <details class="regex-edit__tech">
                    <summary>${escapeHtml(t("mePanels.regex.moreOptions"))}</summary>
                    <label class="edit-field"><span>flags</span><input type="text" data-r-flags value="${escapeHtml(rule.flags || "g")}" autocomplete="off" spellcheck="false" /></label>
                    <label class="edit-field"><span>${escapeHtml(t("mePanels.regex.fieldOrder"))}</span><input type="number" data-r-order value="${escapeHtml(String(rule.order))}" /></label>
                  </details>
                  <div class="regex-edit__actions">
                    <button type="button" class="me-auth-primary" data-regex-save>${escapeHtml(t("mePanels.regex.save"))}</button>
                    <button type="button" class="me-auth-secondary" data-regex-del>${escapeHtml(t("mePanels.regex.delete"))}</button>
                  </div>`
                  }
                </div>
              </details>
            </article>`;
                })
                .join("")
            : `<p class="me-foot-status">${escapeHtml(t("mePanels.regex.emptyState"))}</p>`
        }
      </div>
    `;
    refreshIcons();
  }

  const onRegexChanged = () => render();
  const onLocaleChanged = () => render();
  window.addEventListener("yueqi.assist.regex-changed", onRegexChanged);
  window.addEventListener("yueqi:locale-changed", onLocaleChanged);

  root.addEventListener("toggle", (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.classList.contains("regex-edit")) return;
    const id = details.closest("[data-regex-id]")?.getAttribute("data-regex-id");
    if (!id) return;
    if (details.open) openEditors.add(id);
    else openEditors.delete(id);
  }, true);

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-regex-ask-assist]")) {
      deps.onOpenAssist?.({
        context: "regex",
        seed: t("mePanels.regex.assistSeed"),
      });
      return;
    }
    const tabBtn = event.target.closest("[data-regex-tab]");
    if (tabBtn && root.contains(tabBtn)) {
      tab = tabBtn.getAttribute("data-regex-tab") === "inbound" ? "inbound" : "outbound";
      render();
      return;
    }
    if (event.target.closest("[data-regex-add]")) {
      const id = `regex-${Date.now().toString(36)}`;
      upsertRegexRule({
        id,
        name: tab === "inbound" ? t("mePanels.regex.newRuleInbound") : t("mePanels.regex.newRuleOutbound"),
        description: t("mePanels.regex.newRuleDescription"),
        direction: tab,
        pattern: "",
        replacement: "",
        flags: "g",
        enabled: true,
        order: 100,
        builtin: false,
      });
      openEditors.add(id);
      deps.onToast?.(t("mePanels.regex.toastAdded"));
      render();
      return;
    }
    const card = event.target.closest("[data-regex-id]");
    if (!card || !root.contains(card)) return;
    const id = card.getAttribute("data-regex-id");
    if (event.target.closest("[data-regex-save]")) {
      const existing = listRegexRules(tab).find((r) => r.id === id);
      upsertRegexRule({
        id,
        direction: tab,
        name: card.querySelector("[data-r-name]")?.value || existing?.name,
        description: card.querySelector("[data-r-desc]")?.value || existing?.description || "",
        pattern: card.querySelector("[data-r-pattern]")?.value ?? existing?.pattern,
        replacement: card.querySelector("[data-r-repl]")?.value ?? existing?.replacement,
        flags: card.querySelector("[data-r-flags]")?.value || existing?.flags || "g",
        order: Number(card.querySelector("[data-r-order]")?.value || existing?.order || 100),
        enabled: card.querySelector("[data-regex-enabled]")?.checked !== false,
        builtin: false,
      });
      deps.onToast?.(t("mePanels.regex.toastSaved"));
      render();
      return;
    }
    if (event.target.closest("[data-regex-del]")) {
      openEditors.delete(id);
      deleteRegexRule(id);
      deps.onToast?.(t("mePanels.regex.toastDeleted"));
      render();
    }
  });

  root.addEventListener("change", (event) => {
    const card = event.target.closest("[data-regex-id]");
    if (!card || !event.target.matches("[data-regex-enabled]")) return;
    const id = card.getAttribute("data-regex-id");
    const existing = listRegexRules(tab).find((r) => r.id === id);
    if (!existing) return;
    upsertRegexRule({
      ...existing,
      enabled: event.target.checked,
    });
    card.classList.toggle("is-on", event.target.checked);
  });

  render();
  return {
    refresh: render,
    destroy() {
      window.removeEventListener("yueqi.assist.regex-changed", onRegexChanged);
      window.removeEventListener("yueqi:locale-changed", onLocaleChanged);
      root.innerHTML = "";
    },
  };
}
