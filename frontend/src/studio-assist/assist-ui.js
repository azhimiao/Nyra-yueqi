/** Enterprise system-assistant UI with locale-aware copy and explicit approvals. */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { getLocale } from "../i18n/index.js";
import { isFeatureEnabled } from "../features/flags.js";
import { ensurePermission } from "../platform/permissions.js";
import { isRecording, startRecording, stopRecording } from "../voice/record.js";
import { isSttConfigured, transcribeAudio } from "../voice/stt.js";
import { createAssistChatStore } from "./chat-store.js";
import {
  assistContextLabel,
  assistT,
  normalizeAssistLocale,
} from "./i18n.js";

export function mountStudioAssist(root, deps = {}) {
  if (!root) return { open() {}, refresh() {}, destroy() {} };

  let locale = normalizeAssistLocale(getLocale());
  const store = createAssistChatStore({
    collectProviderConfig: deps.collectProviderConfig,
    context: "assist",
    locale,
  });
  let logEl = null;
  let form = null;
  let input = null;
  let contextEl = null;
  let micState = "idle";

  function riskLabel(risk) {
    const keys = {
      read: "riskRead",
      action: "riskAction",
      write: "riskWrite",
      destructive: "riskDestructive",
    };
    return assistT(keys[risk] || "pending", {}, locale);
  }

  function renderDiff(diff) {
    if (!diff?.fields?.length) return "";
    const rows = diff.fields
      .filter((f) => f.changed)
      .map((f) => `
        <tr>
          <th>${escapeHtml(f.field)}</th>
          <td><code>${escapeHtml(f.before == null ? "—" : String(f.before))}</code></td>
          <td><code>${escapeHtml(f.after == null ? "—" : String(f.after))}</code></td>
        </tr>
      `)
      .join("");
    if (!rows) return "";
    return `
      <div class="assist-diff" data-assist-diff>
        <p class="assist-diff__meta">将创建新角色 · 不覆盖现有 · ${diff.reversible ? "可撤销（删除新角色）" : "不可撤销"}</p>
        <table>
          <thead><tr><th>字段</th><th>原值</th><th>候选</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderAgentTaskCard(card) {
    const pending = Boolean(card.needConfirm && card.pendingAction);
    const state = card.status || (pending ? "pending" : card.ok ? "completed" : "failed");
    const resources = (card.authorizedResources || [])
      .map((r) => `${r.type}:${r.resourceId}`)
      .join("、");
    return `
      <section class="assist-card assist-card--agent is-${escapeHtml(state)}" data-assist-card="${escapeHtml(card.id || "")}" data-assist-task="${escapeHtml(card.taskId || "")}">
        <div class="assist-card__head">
          <strong>${escapeHtml(card.name || "本地任务")}</strong>
          <span>${escapeHtml(card.taskStatus || state)}</span>
        </div>
        <p>${escapeHtml(card.stepSummary || card.summary || "")}</p>
        ${resources ? `<p class="assist-card__meta">已授权资源：${escapeHtml(resources)}</p>` : ""}
        ${card.artifactIds?.length ? `<p class="assist-card__meta">产物：${escapeHtml(card.artifactIds.join(", "))}</p>` : ""}
        ${renderDiff(card.diff)}
        ${card.failureMessage ? `<p class="assist-card__error">${escapeHtml(card.failureMessage)}</p>` : ""}
        ${pending ? `
          <div class="assist-card__actions">
            <button type="button" data-assist-cancel="${escapeHtml(card.id)}">拒绝</button>
            <button type="button" class="is-primary" data-assist-confirm="${escapeHtml(card.id)}">批准导入为新角色</button>
          </div>
        ` : ""}
        ${state === "paused" && card.taskId ? `
          <div class="assist-card__actions">
            <button type="button" class="is-primary" data-assist-resume-task="${escapeHtml(card.taskId)}">继续任务</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderCard(card) {
    if (card.type === "agent-task") return renderAgentTaskCard(card);
    const pending = Boolean(card.needConfirm && card.pendingAction);
    const risk = card.risk || "read";
    const state = card.status || (pending ? "pending" : card.ok ? "completed" : "failed");
    const title = card.type === "pack"
      ? assistT("packTitle", { name: card.name }, locale)
      : card.name;
    const stateLabel = pending
      ? riskLabel(risk)
      : state === "cancelled"
        ? assistT("cancelled", {}, locale)
        : card.ok
          ? assistT("completed", {}, locale)
          : assistT("incomplete", {}, locale);
    return `
      <section class="assist-card is-${escapeHtml(state)}" data-assist-card="${escapeHtml(card.id || "")}">
        <div class="assist-card__head">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(stateLabel)}</span>
        </div>
        <p>${escapeHtml(card.summary || "")}</p>
        ${pending ? `
          <div class="assist-card__actions">
            <button type="button" data-assist-cancel="${escapeHtml(card.id)}">${escapeHtml(assistT("cancel", {}, locale))}</button>
            <button type="button" class="is-primary ${risk === "destructive" ? "is-danger" : ""}" data-assist-confirm="${escapeHtml(card.id)}">${escapeHtml(assistT(risk === "destructive" ? "confirmDelete" : "confirmExecute", {}, locale))}</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderChips(chips = []) {
    if (!chips.length) return "";
    return `
      <div class="assist-chips assist-chips--inline" data-assist-route-chips>
        ${chips.map((chip) => `
          <button type="button" data-assist-route-chip="${escapeHtml(chip.skillId || "")}" data-assist-route-label="${escapeHtml(chip.label || "")}">
            ${escapeHtml(chip.label || chip.skillId || "")}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderLog() {
    if (!logEl) return;
    const messages = store.list();
    const shell = root.querySelector("[data-assist-shell]");
    const welcome = root.querySelector("[data-assist-welcome]");
    const hasUser = messages.some((message) => message.role === "user");
    shell?.classList.toggle("is-empty", !hasUser);
    if (welcome) welcome.hidden = hasUser;
    const visible = hasUser
      ? messages
      : messages.filter((message) => message.role === "user");

    logEl.innerHTML = visible.map((message) => `
      <article class="assist-bubble assist-bubble--${escapeHtml(message.role)}">
        <div class="assist-bubble__body">
          <p>${escapeHtml(message.content)}</p>
          ${renderChips(message.chips || [])}
          ${(message.cards || []).map(renderCard).join("")}
        </div>
      </article>
    `).join("");
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderContext() {
    if (!contextEl) return;
    contextEl.textContent = assistContextLabel(store.getContext(), locale);
  }

  async function submit(text) {
    const value = String(text || input?.value || "").trim();
    if (!value || store.isBusy()) return;
    if (input) {
      input.value = "";
      input.dispatchEvent(new Event("input"));
    }
    syncComposerState();
    const pending = document.createElement("article");
    pending.className = "assist-bubble assist-bubble--assistant is-pending";
    pending.innerHTML = `<div class="assist-bubble__body"><p>${escapeHtml(assistT("checking", {}, locale))}</p></div>`;
    logEl?.append(pending);
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
    syncComposerState();
    await store.send(value, {
      onProgress: (event) => {
        const body = pending.querySelector("p");
        if (!body) return;
        if (event?.type === "step_updated" && event.summary) {
          body.textContent = event.summary;
        } else if (event?.type === "tool_started" && event.toolName) {
          body.textContent = `${assistT("sending", {}, locale)} ${event.toolName}`;
        } else if (event?.type === "tool_finished" && event.toolName) {
          body.textContent = `${event.toolName} done`;
        } else if (event?.type === "task_failed" && event.message) {
          body.textContent = event.message;
        }
        if (logEl) logEl.scrollTop = logEl.scrollHeight;
      },
    });
    renderLog();
    syncComposerState();
    refreshIcons();
  }

  /** Grow with the text like a normal mobile composer, then stop and scroll. */
  function autoGrowInput() {
    if (!input) return;
    input.style.setProperty("--assist-input-height", "auto");
    const style = getComputedStyle(input);
    const max = Number.parseFloat(style.maxHeight) || 112;
    const min = Number.parseFloat(style.minHeight) || 44;
    const next = Math.min(Math.max(input.scrollHeight, min), max);
    input.style.setProperty("--assist-input-height", `${next}px`);
    input.style.overflowY = input.scrollHeight > max ? "auto" : "hidden";
  }

  function syncComposerState() {
    if (!form) return;
    const sendButton = form.querySelector("[data-assist-send]");
    const counter = form.querySelector("[data-assist-counter]");
    const value = String(input?.value || "");
    const busy = store.isBusy();
    const dictating = micState !== "idle";

    autoGrowInput();
    if (input) input.disabled = micState === "transcribing";

    if (sendButton) {
      const ready = Boolean(value.trim()) && !busy && !dictating;
      sendButton.disabled = !ready;
      sendButton.classList.toggle("is-active", ready);
      sendButton.classList.toggle("is-busy", busy);
      const label = assistT(busy ? "sending" : "send", {}, locale);
      sendButton.setAttribute("aria-label", label);
      sendButton.title = label;
    }

    if (counter) {
      const max = Number(input?.getAttribute("maxlength")) || 1200;
      const near = value.length >= max - 120;
      counter.hidden = !near;
      counter.textContent = near ? `${value.length}/${max}` : "";
    }
  }

  function setMicState(next) {
    micState = next;
    const micButton = form?.querySelector("[data-assist-mic]");
    if (micButton) {
      micButton.classList.toggle("is-recording", next === "recording");
      micButton.classList.toggle("is-transcribing", next === "transcribing");
      micButton.disabled = next === "transcribing";
      const key = next === "recording"
        ? "voiceRecording"
        : next === "transcribing" ? "voiceTranscribing" : "voiceInput";
      const label = assistT(key, {}, locale);
      micButton.setAttribute("aria-label", label);
      micButton.title = label;
      micButton.setAttribute("aria-pressed", next === "recording" ? "true" : "false");
    }
    syncComposerState();
    refreshIcons();
  }

  /**
   * Dictation fills the field instead of sending: the assistant can execute
   * changes, so the user must still read the transcript before submitting.
   */
  async function toggleDictation() {
    if (micState === "transcribing") return;
    if (micState === "idle") {
      try {
        const permission = await ensurePermission("microphone");
        if (!permission.ok) {
          deps.onToast?.(permission.message || assistT("voiceInput", {}, locale));
          return;
        }
        await startRecording();
        setMicState("recording");
      } catch (error) {
        deps.onToast?.(String(error?.message || error));
      }
      return;
    }
    setMicState("transcribing");
    try {
      const result = await stopRecording();
      if (!result?.blob || result.durationMs <= 400) return;
      if (!isSttConfigured()) {
        deps.onToast?.(assistT("voiceNeedKey", {}, locale));
        return;
      }
      const { text } = await transcribeAudio(result.blob);
      if (input && text) {
        const current = input.value.trim();
        input.value = current ? `${current} ${text}` : text;
        input.focus();
      }
    } catch (error) {
      deps.onToast?.(assistT("voiceFailed", { error: String(error?.message || error) }, locale));
    } finally {
      setMicState("idle");
    }
  }

  function bindComposer() {
    syncComposerState();
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      submit().catch((error) => {
        deps.onToast?.(String(error?.message || error));
        renderLog();
      });
    });
    input?.addEventListener("input", syncComposerState);
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form?.requestSubmit();
      }
    });
  }

  function renderFrame() {
    const chipDefs = [
      ["chipCheckSettings", "chipCheckSettingsPrompt", "sliders-horizontal"],
      ["chipCheckCharacter", "chipCheckCharacterPrompt", "user-round"],
      ["chipCreatePlan", "chipCreatePlanPrompt", "list-todo"],
    ];
    const directCopy = locale === "en"
      ? {
          kicker: "NYRA ASSISTANT",
          title: "What would you like to do?",
          intro: "Ask, organize, or carry out a change. Important writes always wait for your confirmation.",
          suggestions: "Try one of these",
          placeholder: "Message Nyra Assistant",
          inputLabel: "Message Nyra Assistant",
          confirmation: "Important changes require your confirmation",
        }
      : {
          kicker: "栖机助手",
          title: "今天想做什么？",
          intro: "问设置、整理角色，或让我帮你执行。重要修改会先请你确认。",
          suggestions: "可以这样开始",
          placeholder: "给栖机助手发消息",
          inputLabel: "给栖机助手发消息",
          confirmation: "重要修改会先征求你的确认",
        };
    // Dictation only appears when the voice feature is actually on: an
    // always-visible mic that cannot record would be a fake affordance.
    const voiceOn = isFeatureEnabled("voice");
    const embedded = Boolean(root.closest?.(".mini-assist, [data-assist-phone-mount]"));
    const inSettings = Boolean(root.closest?.(".assist-editor, [data-settings-view=\"assist\"]"));
    const shellMods = [
      embedded ? "assist-shell--embedded" : "",
      inSettings ? "assist-shell--console" : "",
    ].filter(Boolean).join(" ");
    root.innerHTML = `
      <div class="assist-shell ${shellMods} is-empty" data-assist-shell data-assist-locale="${escapeHtml(locale)}">
        <header class="assist-topbar">
          <div class="assist-topbar__copy">
            <strong>${escapeHtml(assistT("name", {}, locale))}</strong>
            <span class="assist-topbar__context" data-assist-context></span>
          </div>
          <button type="button" class="assist-icon-button" data-assist-reset aria-label="${escapeHtml(assistT("newConversation", {}, locale))}" title="${escapeHtml(assistT("newConversation", {}, locale))}"><i data-lucide="plus"></i></button>
        </header>

        <div class="assist-stage">
          <div class="assist-welcome" data-assist-welcome>
            <span class="assist-welcome__mark" aria-hidden="true"><i data-lucide="bot"></i></span>
            <p class="assist-welcome__kicker">${escapeHtml(directCopy.kicker)}</p>
            <h2>${escapeHtml(directCopy.title)}</h2>
            <p class="assist-welcome__lead">${escapeHtml(directCopy.intro)}</p>
            <p class="assist-suggest__label">${escapeHtml(directCopy.suggestions)}</p>
            <div class="assist-suggest" data-assist-chips aria-label="${escapeHtml(directCopy.suggestions)}">
              ${chipDefs.map(([labelKey, promptKey, icon]) => `
                <button type="button" class="assist-suggest__chip" data-assist-chip="${escapeHtml(assistT(promptKey, {}, locale))}">
                  <span class="assist-suggest__icon" aria-hidden="true"><i data-lucide="${escapeHtml(icon)}"></i></span>
                  <span class="assist-suggest__text">${escapeHtml(assistT(labelKey, {}, locale))}</span>
                  <i data-lucide="arrow-up-right" aria-hidden="true"></i>
                </button>
              `).join("")}
            </div>
          </div>
          <div class="assist-log" data-assist-log aria-live="polite"></div>
        </div>

        <form class="assist-composer" data-assist-form>
          <div class="assist-composer__row">
            ${voiceOn ? `
              <button type="button" class="assist-composer__tool" data-assist-mic aria-label="${escapeHtml(assistT("voiceInput", {}, locale))}" title="${escapeHtml(assistT("voiceInput", {}, locale))}" aria-pressed="false">
                <i data-lucide="mic"></i>
              </button>
            ` : ""}
            <div class="assist-composer__box">
              <textarea rows="1" maxlength="1200" placeholder="${escapeHtml(directCopy.placeholder)}" data-assist-input data-composer-text aria-label="${escapeHtml(directCopy.inputLabel)}" autocomplete="off"></textarea>
              <span class="assist-composer__counter" data-assist-counter aria-hidden="true" hidden></span>
            </div>
            <button type="submit" class="assist-send" data-assist-send aria-label="${escapeHtml(assistT("send", {}, locale))}" title="${escapeHtml(assistT("send", {}, locale))}"><i data-lucide="arrow-up"></i></button>
          </div>
          <p class="assist-composer__hint">${escapeHtml(directCopy.confirmation)}</p>
        </form>
      </div>
    `;
    logEl = root.querySelector("[data-assist-log]");
    form = root.querySelector("[data-assist-form]");
    input = root.querySelector("[data-assist-input]");
    contextEl = root.querySelector("[data-assist-context]");
    micState = isRecording() ? "recording" : "idle";
    bindComposer();
    renderLog();
    renderContext();
    refreshIcons();
  }

  const onRootClick = async (event) => {
    if (event.target.closest("[data-assist-mic]")) {
      await toggleDictation();
      return;
    }
    if (event.target.closest("[data-assist-reset]")) {
      store.reset(store.getContext(), locale);
      renderLog();
      refreshIcons();
      return;
    }
    const chip = event.target.closest("[data-assist-chip]")?.getAttribute("data-assist-chip");
    if (chip) {
      await submit(chip);
      return;
    }
    const routeChip = event.target.closest("[data-assist-route-chip]");
    if (routeChip) {
      const label = routeChip.getAttribute("data-assist-route-label") || routeChip.textContent || "";
      await submit(`用${label}帮我`);
      return;
    }
    const packButton = event.target.closest("[data-assist-pack]");
    if (packButton && input) {
      input.value = assistT("packPrompt", {
        label: packButton.getAttribute("data-assist-pack-label") || assistContextLabel("assist", locale),
      }, locale);
      syncComposerState();
      input.focus();
      return;
    }
    const confirmButton = event.target.closest("[data-assist-confirm]");
    if (confirmButton) {
      confirmButton.disabled = true;
      await store.confirm(confirmButton.getAttribute("data-assist-confirm"));
      renderLog();
      refreshIcons();
      return;
    }
    const cancelButton = event.target.closest("[data-assist-cancel]");
    if (cancelButton) {
      store.cancel(cancelButton.getAttribute("data-assist-cancel"));
      renderLog();
      return;
    }
    const resumeButton = event.target.closest("[data-assist-resume-task]");
    if (resumeButton) {
      resumeButton.disabled = true;
      await store.onAppForeground?.();
      renderLog();
    }
  };

  const onNavigate = (event) => {
    const view = event.detail?.view;
    if (view) deps.onNavigateSettings?.(view);
  };
  const onLocaleChanged = (event) => {
    locale = normalizeAssistLocale(event.detail?.locale || getLocale());
    store.setLocale(locale);
    store.reset(store.getContext(), locale);
    renderFrame();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      store.onAppBackground?.();
    } else if (document.visibilityState === "visible") {
      store.onAppForeground?.().then(() => renderLog()).catch(() => {});
    }
  };
  root.addEventListener("click", onRootClick);
  window.addEventListener("yueqi.assist.navigate", onNavigate);
  window.addEventListener("yueqi:locale-changed", onLocaleChanged);
  document.addEventListener("visibilitychange", onVisibility);

  renderFrame();

  return {
    open(opts = {}) {
      locale = normalizeAssistLocale(getLocale());
      const nextContext = String(opts.context || store.getContext() || "assist");
      store.setLocale(locale);
      store.reset(nextContext, locale);
      renderFrame();
      if (opts.seed && input) input.value = String(opts.seed);
      syncComposerState();
      input?.focus?.();
    },
    refresh() {
      renderLog();
      syncComposerState();
    },
    destroy() {
      root.removeEventListener("click", onRootClick);
      window.removeEventListener("yueqi.assist.navigate", onNavigate);
      window.removeEventListener("yueqi:locale-changed", onLocaleChanged);
      document.removeEventListener("visibilitychange", onVisibility);
      if (micState === "recording") stopRecording().catch(() => {});
      micState = "idle";
      store.cancelActiveAgent?.();
      root.innerHTML = "";
    },
  };
}
