/**
 * First Light overlay UI — one focus per screen, restrained motion.
 */

import { getFirstLightCopy, firstLightTrackLabels } from "./copy.js";
import { buildReviewSections } from "./presets.js";
import {
  adjustPreviewTone,
  advanceFrom,
  backToAdjust,
  canConfirmEntryMode,
  canConfirmRelationshipType,
  canConfirmStyle,
  confirmEntryMode,
  confirmAndCommit,
  confirmAppearance,
  confirmBoundariesCore,
  confirmPurposes,
  confirmRelationshipStart,
  confirmRelationshipType,
  confirmSharedHistory,
  confirmStyle,
  CUSTOM_RELATIONSHIP_MAX,
  enterLivePreview,
  ensureLivePreviewLocale,
  refreshLivePreviewLocale,
  goBack,
  openAdvancedBoundaries,
  pauseSession,
  purposeConfirmCopy,
  purposeCountHint,
  resumeOrRestart,
  selectEntryMode,
  selectRelationshipStart,
  selectRelationshipType,
  selectStyle,
  setAppearance,
  setBoundary,
  setCustomRelationshipText,
  setSharedHistory,
  STYLE_FIELD_BY_STAGE,
  togglePurpose,
} from "./controller.js";
import { applyMotionTokens, prefersReducedMotion } from "./motion-tokens.js";
import {
  FL_TRACK,
  hasFirstLightDone,
  loadFirstLightState,
  trackIndexForStage,
} from "./state.js";
import { getBrandName, getLocale, setLocale } from "../i18n/index.js";
import { saveLanguagePrefs, toSupportedLocale } from "../i18n/language-prefs.js";

const REL_ICONS = {
  lover: "♡",
  friend: "○",
  family: "⌂",
  partner: "◇",
  roleplay: "▣",
  undefined: "·",
  custom: "✎",
};

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (v === false || v == null) continue;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  return node;
}

function bindTap(node, handler) {
  if (!node) return;
  let suppressClickUntil = 0;
  const fire = (event) => {
    if (event?.type === "click" && Date.now() < suppressClickUntil) return;
    if (event?.type === "pointerup") {
      suppressClickUntil = Date.now() + 450;
      event.preventDefault?.();
    }
    handler(event);
  };
  node.addEventListener("pointerup", fire, { passive: false });
  node.addEventListener("click", fire);
}

function haptic(kind = "light") {
  try {
    if (localStorage.getItem("yueqi.haptics.off") === "1") return;
    const n = navigator?.vibrate;
    if (typeof n !== "function") return;
    if (kind === "medium") n.call(navigator, 18);
    else if (kind === "double") n.call(navigator, [12, 40, 12]);
    else if (kind === "error") n.call(navigator, 30);
    else n.call(navigator, 8);
  } catch {
    /* ignore */
  }
}

function optionButton({
  label,
  hint,
  icon,
  primary,
  light,
  selected,
  radio,
  compact,
  onClick,
  attrs = {},
}) {
  const btn = el("button", [
    "fl-option",
    compact ? "is-compact" : "",
    primary ? "is-primary" : "",
    light ? "is-light" : "",
    selected ? "is-selected" : "",
    radio ? "is-radio" : "",
  ].filter(Boolean).join(" "), {
    type: "button",
    "aria-pressed": selected ? "true" : "false",
    ...attrs,
  });
  if (radio) {
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", selected ? "true" : "false");
  }
  if (icon) btn.append(el("span", "fl-option-icon", { "aria-hidden": "true", text: icon }));
  const copy = el("span", "fl-option-copy");
  copy.append(el("span", "fl-option-label", { text: label }));
  if (hint) copy.append(el("span", "fl-option-hint", { text: hint }));
  btn.append(copy);
  btn.append(el("span", "fl-option-mark", { "aria-hidden": "true" }));
  let armed = false;
  const fire = (event) => {
    if (armed) return;
    armed = true;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    btn.classList.add("is-pressed");
    haptic("light");
    try {
      onClick?.();
    } finally {
      window.setTimeout(() => { armed = false; }, 320);
    }
  };
  btn.addEventListener("pointerup", fire);
  btn.addEventListener("click", (event) => {
    if (event.pointerType) return;
    fire(event);
  });
  return btn;
}

function primaryButton(label, { disabled, onClick, attrs = {} } = {}) {
  const btn = el("button", "first-run-cta fl-cta", {
    type: "button",
    "data-fl-cta": "",
    text: label,
    ...attrs,
  });
  btn.disabled = Boolean(disabled);
  bindTap(btn, () => {
    if (btn.disabled) return;
    haptic("medium");
    onClick?.();
  });
  return btn;
}

/**
 * Soft in-place update for LIVE_PREVIEW tone picks — no full DOM rebuild.
 */
function softApplyPreviewTone(scene, toneId) {
  const next = adjustPreviewTone(toneId);
  const lines = Array.isArray(next.previewLines) ? next.previewLines : [];
  const tone = String(next.draft?.previewTone || toneId);
  const feedbackText = String(next.draft?.previewFeedback || "").trim();
  const reduced = prefersReducedMotion();

  const bubble = scene.querySelector(".fl-preview");
  const paintBubble = () => {
    if (!bubble) return;
    bubble.dataset.tone = tone;
    bubble.replaceChildren();
    lines.forEach((line) => bubble.append(el("p", "", { text: line })));
  };

  if (bubble && !reduced) {
    bubble.classList.add("is-fading");
    window.setTimeout(() => {
      paintBubble();
      bubble.classList.remove("is-fading");
      bubble.classList.add("is-revealing");
      window.setTimeout(() => bubble.classList.remove("is-revealing"), 420);
    }, 160);
  } else {
    paintBubble();
  }

  scene.querySelectorAll(".fl-options--preview [data-fl-tone]").forEach((btn) => {
    const id = btn.getAttribute("data-fl-tone");
    btn.classList.toggle("is-selected", id === tone);
    btn.setAttribute("aria-pressed", id === tone ? "true" : "false");
    btn.classList.remove("is-pressed");
  });

  const feedback = scene.querySelector(".fl-feedback");
  if (feedback && feedbackText) {
    feedback.hidden = false;
    feedback.textContent = feedbackText;
    if (!reduced) {
      feedback.classList.remove("is-shown");
      void feedback.offsetWidth;
      feedback.classList.add("is-shown");
    } else {
      feedback.classList.add("is-shown");
    }
  }
}

function renderTrack(stage) {
  const idx = trackIndexForStage(stage);
  const track = firstLightTrackLabels(getLocale());
  const nav = el("nav", "fl-track", { "aria-label": "First Light" });
  track.forEach((t, i) => {
    const span = el("span", `fl-track-item${i === idx ? " is-current" : ""}${i < idx ? " is-done" : ""}`, {
      text: t.label,
    });
    nav.append(span);
    if (i < track.length - 1) nav.append(el("span", "fl-track-dot", { "aria-hidden": "true", text: "·" }));
  });
  return nav;
}

function renderProgress(stage) {
  const idx = trackIndexForStage(stage);
  const total = FL_TRACK.length;
  const wrap = el("div", "first-run-progress", {
    "data-fl-progress": `${idx + 1}/${total}`,
    "aria-live": "polite",
  });
  wrap.append(el("span", "first-run-progress-label", { text: `${idx + 1}/${total}` }));
  wrap.append(renderTrack(stage));
  return wrap;
}

function renderLangSwitch(ctx) {
  const copy = getFirstLightCopy();
  const row = el("div", "fl-lang-switch", { "aria-label": "Language" });
  const locale = getLocale();
  [
    { id: "zh-CN", label: copy.chrome.languageZh },
    { id: "en", label: copy.chrome.languageEn },
  ].forEach((opt) => {
    const active = opt.id === "en" ? locale === "en" : locale === "zh-CN";
    const btn = el("button", `fl-lang-btn${active ? " is-active" : ""}`, {
      type: "button",
      text: opt.label,
      "aria-pressed": active ? "true" : "false",
    });
    bindTap(btn, () => {
      setLocale(opt.id, { chosen: true });
      saveLanguagePrefs({
        appLocale: toSupportedLocale(opt.id),
        conversationLanguage: toSupportedLocale(opt.id),
      });
      refreshLivePreviewLocale(opt.id === "en" ? "en" : "zh-CN");
      ctx.rerender();
    });
    row.append(btn);
  });
  return row;
}

function showToast(host, text) {
  const toast = host.querySelector("[data-fl-toast]");
  if (!toast) return;
  toast.hidden = false;
  toast.textContent = text;
  toast.classList.add("is-shown");
}

function appendRadioOptions(target, options, {
  selectedId,
  onSelect,
  icons,
  compact,
} = {}) {
  const group = el("div", `fl-options${compact ? " fl-options--grid" : " fl-options--list"}`, {
    role: "radiogroup",
  });
  options.forEach((opt) => {
    group.append(optionButton({
      label: opt.label,
      hint: opt.hint,
      icon: icons?.[opt.id],
      selected: selectedId === opt.id,
      radio: true,
      compact,
      attrs: { "data-fl-option": opt.id },
      onClick: () => onSelect?.(opt.id),
    }));
  });
  target.append(group);
  return group;
}

/**
 * @param {HTMLElement} host
 * @param {object} state
 * @param {{ onComplete?: Function, polishDeps?: object, rerender: Function, close?: Function }} ctx
 */
function renderStage(host, state, ctx) {
  const stage = state.stage;
  const draft = state.draft || {};
  const copy = getFirstLightCopy();
  host.replaceChildren();
  host.dataset.flStage = stage;

  const shell = el("div", "fl-shell first-run-shell");
  const nav = el("header", "first-run-nav");
  const showBack = !["WELCOME", "BOOT", "COMMITTING", "COMPLETED", "FIRST_REAL_MESSAGE", "PAUSED"].includes(stage);
  if (showBack) {
    const back = el("button", "first-run-back fl-back", {
      type: "button",
      "data-fl-back": "",
      "aria-label": copy.chrome.back,
      text: "←",
    });
    bindTap(back, () => {
      goBack();
      ctx.rerender();
    });
    nav.append(back);
  } else {
    nav.append(el("span", "first-run-back-spacer", { "aria-hidden": "true" }));
  }
  if (!["WELCOME", "BOOT", "COMPLETED", "PAUSED"].includes(stage)) {
    nav.append(renderProgress(stage));
  } else {
    nav.append(el("div", "first-run-progress"));
  }
  nav.append(renderLangSwitch(ctx));
  shell.append(nav);

  const header = el("header", "first-run-header");
  const main = el("section", "fl-scene first-run-main", {
    "aria-live": "polite",
    "data-fl-scroll": "",
  });
  const footer = el("footer", "first-run-footer fl-footer");
  const toast = el("p", "fl-toast", {
    role: "status",
    "aria-live": "polite",
    "data-fl-toast": "",
    hidden: "",
  });

  const pause = el("button", "first-run-text-action fl-pause", {
    type: "button",
    "data-fl-pause": "",
    text: copy.chrome.pause,
  });
  bindTap(pause, () => {
    pauseSession();
    ctx.close?.();
  });
  const showPause = !["WELCOME", "BOOT", "COMMITTING", "COMPLETED", "FIRST_REAL_MESSAGE", "PAUSED"].includes(stage);

  if (state.paused && stage === "PAUSED") {
    header.append(el("h1", "fl-title", { text: copy.resume.title }));
    footer.append(primaryButton(copy.resume.continue, {
      onClick: () => { resumeOrRestart("continue"); ctx.rerender(); },
    }));
    footer.append(optionButton({
      label: copy.resume.restart,
      light: true,
      onClick: () => { resumeOrRestart("restart"); ctx.rerender(); },
    }));
  } else if (stage === "WELCOME" || stage === "BOOT") {
    copy.welcomeLines.forEach((line, i) => {
      header.append(el(i === 0 ? "h1" : "p", i === 0 ? "fl-title" : "fl-body", { text: line }));
    });
    footer.append(primaryButton(copy.chrome.continue, {
      onClick: () => {
        advanceFrom(loadFirstLightState());
        ctx.rerender();
      },
    }));
  } else if (stage === "ENTRY_MODE") {
    header.append(el("h1", "fl-title", { text: copy.entry.title }));
    appendRadioOptions(main, [
      { id: "careful", label: copy.entry.careful, hint: copy.entry.carefulHint },
      { id: "quick", label: copy.entry.quick, hint: copy.entry.quickHint },
      { id: "import", label: copy.entry.import },
      { id: "skip", label: copy.entry.skip },
    ], {
      selectedId: draft.entryMode,
      compact: true,
      onSelect: (id) => {
        selectEntryMode(id);
        ctx.rerender();
      },
    });
    footer.append(primaryButton(copy.chrome.continue, {
      disabled: !canConfirmEntryMode(draft),
      onClick: () => {
        confirmEntryMode();
        ctx.rerender();
      },
    }));
    if (showPause) footer.append(pause);
  } else if (stage === "PURPOSE") {
    header.append(el("h1", "fl-title", { text: copy.purpose.title }));
    header.append(el("p", "fl-hint", {
      "data-fl-purpose-count": String((draft.purposes || []).length),
      text: purposeCountHint(draft.purposes),
    }));
    const grid = el("div", "fl-options fl-options--grid", { role: "group" });
    copy.purpose.options.forEach((opt) => {
      grid.append(optionButton({
        label: opt.label,
        selected: (draft.purposes || []).includes(opt.id),
        compact: true,
        attrs: { "data-fl-option": opt.id },
        onClick: () => {
          const next = togglePurpose(opt.id);
          ctx.rerender();
          if (next.purposeToggleResult === "limit_reached") {
            showToast(host, copy.purpose.limitToast || "最多选择三项");
          }
        },
      }));
    });
    main.append(grid);
    const echo = purposeConfirmCopy(draft.purposes);
    if (echo) main.append(el("p", "fl-echo", { text: echo }));
    footer.append(primaryButton(copy.chrome.continue, {
      disabled: !(draft.purposes || []).length,
      onClick: () => {
        confirmPurposes();
        ctx.rerender();
      },
    }));
    if (showPause) footer.append(pause);
  } else if (stage === "RELATIONSHIP_TYPE") {
    header.append(el("h1", "fl-title", { text: copy.relationship.title }));
    appendRadioOptions(main, copy.relationship.options, {
      selectedId: draft.relationshipType,
      icons: REL_ICONS,
      compact: true,
      onSelect: (id) => {
        selectRelationshipType(id);
        ctx.rerender();
      },
    });
    if (draft.relationshipType === "custom") {
      const field = el("label", "fl-custom-field");
      field.append(el("span", "fl-hint", { text: copy.relationship.customHint || copy.relationship.customPlaceholder }));
      const input = el("textarea", "fl-textarea fl-custom-input", {
        rows: "2",
        maxlength: String(CUSTOM_RELATIONSHIP_MAX),
        placeholder: copy.relationship.customPlaceholder || "",
        "data-fl-custom-input": "",
        "aria-label": copy.relationship.customPlaceholder || copy.relationship.options.find((o) => o.id === "custom")?.label || "",
      });
      input.value = draft.customRelationshipText || "";
      input.addEventListener("input", () => {
        setCustomRelationshipText(input.value);
        const cta = host.querySelector("[data-fl-cta]");
        if (cta) cta.disabled = !String(input.value || "").trim();
      });
      field.append(input);
      main.append(field);
      window.requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
    footer.append(primaryButton(copy.chrome.continue, {
      disabled: !canConfirmRelationshipType(draft),
      onClick: () => {
        confirmRelationshipType();
        ctx.rerender();
      },
    }));
    if (showPause) footer.append(pause);
  } else if (stage === "RELATIONSHIP_START") {
    header.append(el("h1", "fl-title", { text: copy.loverStart.title }));
    appendRadioOptions(main, copy.loverStart.options, {
      selectedId: draft.relationshipStart,
      compact: true,
      onSelect: (id) => {
        selectRelationshipStart(id);
        ctx.rerender();
      },
    });
    footer.append(primaryButton(copy.chrome.continue, {
      disabled: !draft.relationshipStart,
      onClick: () => {
        confirmRelationshipStart();
        ctx.rerender();
      },
    }));
    if (showPause) footer.append(pause);
  } else if (stage === "SHARED_HISTORY") {
    header.append(el("h1", "fl-title", { text: copy.sharedHistory.title }));
    header.append(el("p", "fl-hint", { text: copy.sharedHistory.hint }));
    const ta = el("textarea", "fl-textarea", {
      rows: "3",
      placeholder: copy.sharedHistory.placeholder,
      maxlength: "280",
    });
    ta.value = draft.sharedHistory || "";
    ta.addEventListener("input", () => setSharedHistory(ta.value));
    main.append(ta);
    footer.append(primaryButton(copy.sharedHistory.next, {
      onClick: () => {
        setSharedHistory(ta.value);
        confirmSharedHistory();
        ctx.rerender();
      },
    }));
    footer.append(el("button", "first-run-text-action", {
      type: "button",
      text: copy.sharedHistory.skip,
    }));
    bindTap(footer.lastChild, () => {
      setSharedHistory("");
      confirmSharedHistory();
      ctx.rerender();
    });
    if (showPause) footer.append(pause);
  } else if (STYLE_FIELD_BY_STAGE[stage]) {
    const field = STYLE_FIELD_BY_STAGE[stage];
    const pack = stage === "STYLE_SUPPORT" ? copy.support
      : stage === "STYLE_INITIATIVE" ? copy.initiative
        : stage === "STYLE_CONFLICT" ? copy.conflict
          : stage === "STYLE_INTIMACY" ? copy.intimacy
            : copy.autonomy;
    if (stage === "STYLE_SUPPORT" && draft.relationshipType === "lover" && draft.relationshipStart === "now") {
      header.append(el("p", "fl-echo", { text: copy.loverStart.afterNow }));
    }
    header.append(el("h1", "fl-title", { text: pack.title }));
    appendRadioOptions(main, pack.options, {
      selectedId: draft[field],
      compact: true,
      onSelect: (id) => {
        selectStyle(field, id);
        ctx.rerender();
      },
    });
    footer.append(primaryButton(copy.chrome.continue, {
      disabled: !canConfirmStyle(stage, draft),
      onClick: async () => {
        if (stage === "STYLE_AUTONOMY") {
          await enterLivePreview(ctx.polishDeps || {});
        } else {
          confirmStyle();
        }
        ctx.rerender();
      },
    }));
    if (showPause) footer.append(pause);
  } else if (stage === "LIVE_PREVIEW") {
    const previewState = ensureLivePreviewLocale();
    const previewDraft = previewState.draft || {};
    header.append(el("h1", "fl-title", { text: copy.preview.lead }));
    header.append(el("p", "fl-hint fl-preview-hint", {
      text: copy.preview.hint || "下面是ta说话的样子。点选项试不同语气；满意后选「这样就好」。",
    }));
    const currentTone = String(previewDraft.previewTone || "balanced");
    const bubble = el("blockquote", "fl-preview is-live", { "data-tone": currentTone });
    (previewState.previewLines || []).forEach((line) => bubble.append(el("p", "", { text: line })));
    main.append(bubble);
    const feedback = String(previewDraft.previewFeedback || "").trim();
    const feedbackEl = el("p", `fl-feedback${feedback ? " is-shown" : ""}`, {
      role: "status",
      "aria-live": "polite",
      text: feedback || "",
    });
    if (!feedback) feedbackEl.hidden = true;
    main.append(feedbackEl);
    if (previewState.errorMessage) main.append(el("p", "fl-hint", { text: previewState.errorMessage }));
    const toneIds = ["softer", "direct", "proactive", "lessComfort"];
    const adj = el("div", "fl-options fl-options--preview", {
      role: "group",
      "aria-label": copy.preview.adjustGroup || "调整语气",
    });
    toneIds.forEach((id) => {
      const label = copy.preview.adjust[id];
      if (!label) return;
      adj.append(optionButton({
        label,
        selected: id === currentTone,
        attrs: { "data-fl-tone": id },
        onClick: () => softApplyPreviewTone(main, id),
      }));
    });
    main.append(adj);
    footer.append(primaryButton(copy.preview.adjust.good || "这样就好，继续", {
      attrs: { "data-fl-tone": "good" },
      onClick: () => {
        const leave = () => {
          adjustPreviewTone("good");
          ctx.rerender();
        };
        if (prefersReducedMotion()) {
          leave();
          return;
        }
        main.classList.add("is-leaving");
        window.setTimeout(leave, 220);
      },
    }));
    if (showPause) footer.append(pause);
  } else if (stage === "BOUNDARIES_CORE") {
    header.append(el("h1", "fl-title", { text: copy.boundaries.title }));
    header.append(el("p", "fl-body", { text: copy.boundaries.body }));
    [
      ["allowJealousy", copy.boundaries.allowJealousy],
      ["allowNudge", copy.boundaries.allowNudge],
    ].forEach(([key, label]) => {
      const row = el("label", "fl-toggle");
      const input = el("input", "", { type: "checkbox" });
      input.checked = Boolean(draft[key]);
      input.addEventListener("change", () => setBoundary(key, input.checked));
      row.append(input, el("span", "", { text: label }));
      main.append(row);
    });
    footer.append(primaryButton(copy.chrome.continue, {
      onClick: () => { confirmBoundariesCore(); ctx.rerender(); },
    }));
    footer.append(el("button", "first-run-text-action", {
      type: "button",
      text: copy.boundaries.more,
    }));
    bindTap(footer.lastChild, () => { openAdvancedBoundaries(); ctx.rerender(); });
    if (showPause) footer.append(pause);
  } else if (stage === "BOUNDARIES_ADVANCED") {
    header.append(el("h1", "fl-title", { text: copy.boundaries.more }));
    [
      ["quietNight", copy.boundaries.quietNight],
      ["autoDiary", copy.boundaries.autoDiary],
      ["autoMoments", copy.boundaries.autoMoments],
    ].forEach(([key, label]) => {
      const row = el("label", "fl-toggle");
      const input = el("input", "", { type: "checkbox" });
      input.checked = Boolean(draft[key]);
      input.addEventListener("change", () => setBoundary(key, input.checked));
      row.append(input, el("span", "", { text: label }));
      main.append(row);
    });
    footer.append(primaryButton(copy.chrome.continue, {
      onClick: () => { confirmBoundariesCore(); ctx.rerender(); },
    }));
    if (showPause) footer.append(pause);
  } else if (stage === "APPEARANCE_OPTIONAL") {
    header.append(el("h1", "fl-title", { text: copy.appearance.title }));
    header.append(el("p", "fl-hint", { text: copy.appearance.nameLabel }));
    const name = el("input", "fl-input", {
      type: "text",
      placeholder: copy.appearance.namePlaceholder,
      "aria-label": copy.appearance.nameLabel,
      maxlength: "40",
    });
    name.value = draft.name || "";
    name.addEventListener("input", () => setAppearance({ name: name.value, deferred: false }));
    main.append(name);
    footer.append(primaryButton(copy.appearance.later, {
      onClick: () => {
        setAppearance({ deferred: true });
        confirmAppearance();
        ctx.rerender();
      },
    }));
    footer.append(el("button", "first-run-text-action", { type: "button", text: copy.appearance.now }));
    bindTap(footer.lastChild, () => {
      setAppearance({ name: String(name.value || "").trim(), deferred: false });
      confirmAppearance();
      ctx.rerender();
    });
    if (showPause) footer.append(pause);
  } else if (stage === "DRAFT_REVIEW" || stage === "ERROR_RECOVERABLE") {
    header.append(el("h1", "fl-title", { text: copy.review.title }));
    if (state.errorMessage) main.append(el("p", "fl-error", { text: state.errorMessage }));
    const sections = buildReviewSections(draft);
    Object.entries(copy.review.sections).forEach(([key, title]) => {
      const block = el("article", "fl-review-block");
      block.append(el("h2", "fl-review-h", { text: title }));
      block.append(el("p", "fl-review-p", { text: sections[key] || "" }));
      main.append(block);
    });
    footer.append(primaryButton(copy.review.start, {
      onClick: async () => {
        if (host.dataset.flCommitLock === "1" || host.classList.contains("is-committing")) return;
        host.dataset.flCommitLock = "1";
        haptic("double");
        host.classList.add("is-committing");
        try {
          const result = await confirmAndCommit({
            onCommitted: (r) => ctx.onComplete?.(r),
            onError: () => haptic("error"),
          });
          if (result.ok) {
            ctx.close?.(result);
          } else {
            host.dataset.flCommitLock = "0";
            host.classList.remove("is-committing");
            ctx.rerender();
          }
        } catch {
          host.dataset.flCommitLock = "0";
          host.classList.remove("is-committing");
          haptic("error");
          ctx.rerender();
        }
      },
    }));
    footer.append(el("button", "first-run-text-action", { type: "button", text: copy.review.adjust }));
    bindTap(footer.lastChild, () => { backToAdjust(); ctx.rerender(); });
  } else if (stage === "COMMITTING") {
    header.append(el("p", "fl-body", { text: copy.chrome.committing }));
  }

  shell.append(header);
  shell.append(main);
  shell.append(toast);
  if (footer.childNodes.length) shell.append(footer);
  host.append(shell);

  const tone = draft.intimacyStyle === "intense"
    ? "warm"
    : draft.intimacyStyle === "mature"
      ? "cool"
      : "neutral";
  host.dataset.flTone = tone;
}

/** @type {ReturnType<typeof mountFirstLight>|null} */
let singletonApi = null;

/**
 * @param {{
 *   root?: HTMLElement,
 *   onComplete?: (result: object) => void,
 *   polishDeps?: object,
 * }} [options]
 */
export function mountFirstLight(options = {}) {
  if (hasFirstLightDone()) return { open: () => false, close: () => {}, destroy: () => {} };

  if (singletonApi?.el && document.contains(singletonApi.el)) {
    if (typeof options.onComplete === "function") {
      singletonApi.setOnComplete?.(options.onComplete);
    }
    return singletonApi;
  }

  let host = document.querySelector("[data-first-light]");
  if (!host) {
    host = el("div", "first-light", {
      "data-first-light": "",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": getBrandName(getLocale()),
      hidden: "",
    });
    (options.root || document.body).append(host);
  }
  applyMotionTokens(host);
  if (prefersReducedMotion()) host.classList.add("is-reduced-motion");

  let onCompleteHandler = options.onComplete;

  const ctx = {
    polishDeps: options.polishDeps || {},
    get onComplete() {
      return onCompleteHandler;
    },
    rerender: () => {
      const state = loadFirstLightState();
      if (state.done) {
        close();
        return;
      }
      renderStage(host, state, ctx);
    },
    close: (result) => {
      close();
      onCompleteHandler?.(result);
    },
  };

  function open() {
    if (hasFirstLightDone()) return false;
    host.hidden = false;
    host.setAttribute("aria-hidden", "false");
    host.classList.add("is-open");
    document.documentElement.classList.add("first-light-active");
    ctx.rerender();
    return true;
  }

  function close() {
    host.hidden = true;
    host.setAttribute("aria-hidden", "true");
    host.classList.remove("is-open");
    document.documentElement.classList.remove("first-light-active");
  }

  function destroy() {
    close();
    host.remove();
    if (singletonApi?.el === host) singletonApi = null;
  }

  singletonApi = {
    open,
    close,
    destroy,
    rerender: ctx.rerender,
    el: host,
    setOnComplete: (fn) => {
      onCompleteHandler = fn;
    },
  };
  return singletonApi;
}

/**
 * Boot helper after . Migrates legacy users; opens overlay when needed.
 */
export async function startFirstLightIfNeeded(options = {}) {
  const { startFirstLightV2IfNeeded } = await import("./production-v2.js");
  return startFirstLightV2IfNeeded(options);
}
