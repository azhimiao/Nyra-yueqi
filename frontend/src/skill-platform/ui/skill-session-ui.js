/**
 * Skill session UI — isolated / snapshot modes; instant send + thinking + stream.
 */

import { escapeHtml } from "../../lib/utils.js";
import { safeUserFacingText } from "../../onboarding/errors.js";
import { refreshIcons } from "../../lib/icons.js";
import { getSkillRun } from "../run-store.js";
import { getCatalogEntry } from "../store.js";
import { getAgentProfile } from "../../agents/profile-store.js";
import { createProductionConversationApi } from "../conversation-binding.js";
import { commitSkillTurn, buildHostEnvelope } from "../runtime.js";
import { createSkillBrokerDeps } from "../skill-broker.js";
import { tx } from "./i18n.js";

/**
 * @param {HTMLElement} host
 * @param {{
 *   runId: string,
 *   modelFn?: (messages: object[], envelope: object, turnOpts?: object) => Promise<string|null>,
 *   conversationApi?: object,
 *   onBack?: () => void,
 *   onOpenPrivacy?: () => void,
 *   onToast?: (msg: string) => void,
 *   locale?: string,
 *   embedded?: boolean,
 * }} opts
 */
export function mountSkillSessionUi(host, opts = {}) {
  if (!host) return { open() {}, refresh() {}, destroy() {} };

  let runId = opts.runId || "";
  let busy = false;
  /** @type {"idle"|"thinking"|"streaming"} */
  let uiPhase = "idle";
  let streamDraft = "";

  function run() {
    return runId ? getSkillRun(runId) : null;
  }

  function scrollMessages() {
    const list = host.querySelector("[data-skill-messages]");
    if (list) list.scrollTop = list.scrollHeight;
  }

  function renderMessages() {
    const api = opts.conversationApi || createProductionConversationApi();
    const sessionId = run()?.conversation?.conversationSessionId;
    const sess = sessionId ? api.getSession?.(sessionId) : null;
    const history = sess && api.selectVisibleHistory
      ? api.selectVisibleHistory(sess)
      : [];
    const list = host.querySelector("[data-skill-messages]");
    if (!list) return;

    if (!history.length && uiPhase === "idle") {
      list.innerHTML = `
        <div class="explore-chat-empty">
          <span aria-hidden="true"><i data-lucide="sparkles"></i></span>
          <strong>${escapeHtml(tx("chatEmptyTitle", opts.locale))}</strong>
          <p>${escapeHtml(tx("chatEmptyHint", opts.locale))}</p>
          <div class="explore-suggest">
            <button type="button" class="explore-suggest__chip" data-explore-suggest="${escapeHtml(tx("chipGoalPrompt", opts.locale))}">${escapeHtml(tx("chipGoal", opts.locale))}</button>
            <button type="button" class="explore-suggest__chip" data-explore-suggest="${escapeHtml(tx("chipPlanPrompt", opts.locale))}">${escapeHtml(tx("chipPlan", opts.locale))}</button>
            <button type="button" class="explore-suggest__chip" data-explore-suggest="${escapeHtml(tx("chipPluginPrompt", opts.locale))}">${escapeHtml(tx("chipPlugin", opts.locale))}</button>
          </div>
        </div>`;
      refreshIcons(host);
      return;
    }

    const rows = history.map((row) => {
      const role = row.role === "user" ? "user" : "assistant";
      const text = escapeHtml(String(row.content ?? row.text ?? ""));
      return `<div class="explore-msg explore-msg--${role}"><p>${text}</p></div>`;
    });

    if (uiPhase === "thinking") {
      rows.push(`
        <div class="explore-msg explore-msg--assistant explore-msg--thinking" aria-live="polite">
          <div class="explore-thinking">
            <span class="explore-thinking__label">${escapeHtml(tx("thinking", opts.locale))}</span>
            <span class="explore-thinking__dots" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
        </div>
      `);
    } else if (uiPhase === "streaming") {
      const text = escapeHtml(streamDraft || "…");
      rows.push(`
        <div class="explore-msg explore-msg--assistant explore-msg--stream" aria-live="polite">
          <p>${text}<span class="explore-stream-caret" aria-hidden="true"></span></p>
        </div>
      `);
    }

    list.innerHTML = rows.join("");
    scrollMessages();
  }

  function setComposerBusy(isBusy) {
    const input = host.querySelector("[data-skill-input]");
    const send = host.querySelector("[data-skill-form] button[type='submit']");
    if (input) input.disabled = Boolean(isBusy);
    if (send) send.disabled = Boolean(isBusy);
  }

  function render() {
    const r = run();
    const catalog = r ? getCatalogEntry(r.skillId) : null;
    const agent = r?.agentId ? getAgentProfile(r.agentId) : null;
    const hasModel = typeof opts.modelFn === "function";
    const loc = opts.locale;
    const embedded = Boolean(opts.embedded);

    host.innerHTML = `
      <div class="explore-session${embedded ? " explore-session--embedded" : ""}">
        ${embedded ? "" : `
          <header class="explore-session__head">
            <button type="button" class="explore-icon-btn" data-session-back aria-label="${escapeHtml(tx("back", loc))}"><i data-lucide="chevron-left"></i></button>
            <div class="explore-session__head-title">
              <strong>${escapeHtml(agent?.name || catalog?.name || "Agent")}</strong>
              <span>${escapeHtml(tx("modeIsolated", loc))}</span>
            </div>
            <span class="explore-session__head-spacer" aria-hidden="true"></span>
          </header>
        `}
        ${!hasModel ? `
          <div class="explore-empty explore-empty--model">
            <strong>${escapeHtml(tx("noModel", loc))}</strong>
            <p>${escapeHtml(tx("noModelHint", loc))}</p>
          </div>
        ` : ""}
        <div class="explore-session__messages explore-app-scroll" data-skill-messages></div>
        <form class="explore-session__composer" data-skill-form>
          <div class="explore-session__composer-box">
            <input type="text" maxlength="2000" data-skill-input placeholder="${escapeHtml(tx("chatPlaceholder", loc))}" autocomplete="off" spellcheck="false" enterkeyhint="send" />
            <button type="submit" class="explore-icon-btn explore-icon-btn--send" aria-label="${escapeHtml(tx("send", loc))}"><i data-lucide="arrow-up"></i></button>
          </div>
        </form>
      </div>
    `;
    refreshIcons(host);
    setComposerBusy(busy);
    renderMessages();
  }

  async function handleSend(text) {
    const r = run();
    if (!r || busy) return;
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    if (typeof opts.modelFn !== "function") {
      opts.onToast?.(tx("noModelHint", opts.locale));
      return;
    }

    busy = true;
    setComposerBusy(true);
    const api = opts.conversationApi || createProductionConversationApi();
    const sessionId = r.conversation?.conversationSessionId;
    if (!sessionId) {
      busy = false;
      setComposerBusy(false);
      return;
    }

    // Instant: user bubble lands before any network wait
    api.sendUser?.(sessionId, trimmed, { origin: "user", skillRunId: r.id });
    uiPhase = "thinking";
    streamDraft = "";
    renderMessages();

    try {
      const envelope = await buildHostEnvelope({
        runId: r.id,
        userText: trimmed,
        deps: { ...createSkillBrokerDeps(), ...opts },
      });
      if (!envelope.ok) {
        uiPhase = "idle";
        streamDraft = "";
        opts.onToast?.(tx("sendFail", opts.locale));
        return;
      }

      const expectedRevision = r.stateRevision;
      const modelJson = await opts.modelFn([], envelope.value, {
        stream: true,
        onDelta: (visible) => {
          const next = String(visible || "");
          if (!next && uiPhase === "thinking") return;
          streamDraft = next || streamDraft;
          uiPhase = "streaming";
          renderMessages();
        },
      });

      if (!modelJson) {
        uiPhase = "idle";
        streamDraft = "";
        return;
      }

      commitSkillTurn({
        runId: r.id,
        modelResponseJson: modelJson,
        expectedRevision,
        deps: { conversationApi: api },
      });
    } catch (err) {
      opts.onToast?.(safeUserFacingText(err?.message || err, 120) || tx("sendFail", opts.locale));
    } finally {
      uiPhase = "idle";
      streamDraft = "";
      busy = false;
      setComposerBusy(false);
      renderMessages();
      host.querySelector("[data-skill-input]")?.focus?.();
    }
  }

  function onClick(event) {
    if (event.target.closest("[data-session-back]")) {
      opts.onBack?.();
      return;
    }
    if (event.target.closest("[data-session-privacy]")) {
      opts.onOpenPrivacy?.();
      return;
    }
    const chip = event.target.closest("[data-explore-suggest]");
    if (chip) {
      const prompt = chip.getAttribute("data-explore-suggest") || "";
      const input = host.querySelector("[data-skill-input]");
      if (!prompt || !input || input.disabled) return;
      input.value = prompt;
      host.querySelector("[data-skill-form]")?.requestSubmit();
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    const input = host.querySelector("[data-skill-input]");
    const text = input?.value || "";
    if (input) input.value = "";
    // Fire without awaiting so the input clears / UI can breathe
    void handleSend(text);
  }

  host.addEventListener("click", onClick);
  host.addEventListener("submit", onSubmit);

  return {
    open(nextRunId) {
      runId = nextRunId || runId;
      uiPhase = "idle";
      streamDraft = "";
      busy = false;
      render();
    },
    refresh: render,
    /** Start the skill scene immediately (e.g. user tapped Play). Skips if history exists. */
    kickoff(text) {
      const api = opts.conversationApi || createProductionConversationApi();
      const sessionId = run()?.conversation?.conversationSessionId;
      if (!sessionId) return;
      const sess = api.getSession?.(sessionId);
      const history = sess && api.selectVisibleHistory ? api.selectVisibleHistory(sess) : [];
      if (history.length > 0) return;
      const word = String(text || tx("kickoffWord", opts.locale) || "").trim() || tx("kickoffWord", opts.locale);
      void handleSend(word);
    },
    destroy() {
      host.removeEventListener("click", onClick);
      host.removeEventListener("submit", onSubmit);
      host.innerHTML = "";
    },
  };
}
