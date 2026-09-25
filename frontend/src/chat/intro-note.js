/**
 * Welcome letter at the top of the chat transcript.
 * It stays in history so later turns scroll it up; it can fold, but does not vanish.
 */

import {
  openingIntroFoldCopy,
  openingIntroLetterCopy,
  openingIntroSetupCta,
  setChatIntroNoteCollapsed,
} from "./opening-intro.js";

export {
  characterSkipsOpeningIntro,
  isChatIntroNoteCollapsed,
  isOpeningIntroMessage,
  isPlatformPlaceholderGreeting,
  openingIntroSetupCta,
  setChatIntroNoteCollapsed,
  shouldPinChatIntroNote,
  transcriptHasLivedChat,
} from "./opening-intro.js";

export const CHAT_INTRO_DESTINATIONS = Object.freeze({
  brain: Object.freeze({ app: ["panel", "api"], phone: ["phone-app", "lab"] }),
  permissions: Object.freeze({ app: ["settings", "external"], phone: ["phone-app", "settings"] }),
  customize: Object.freeze({ app: ["settings", "identity"], phone: ["phone-app", "profile"] }),
  interface: Object.freeze({ app: ["settings", "interface"], phone: ["phone-app", "beautify"] }),
  botden: Object.freeze({ app: ["panel", "world"], phone: ["phone-app", "world"] }),
  market: Object.freeze({ app: ["phone-app", "qishi"], phone: ["phone-app", "qishi"] }),
  games: Object.freeze({ app: ["phone-app", "games"], phone: ["phone-app", "games"] }),
  explore: Object.freeze({ app: ["phone-app", "explore"], phone: ["phone-app", "explore"] }),
  assist: Object.freeze({ app: ["assist", "assist"], phone: ["phone-app", "assist"] }),
  contact: Object.freeze({ app: ["phone-app", "beautify"], phone: ["phone-app", "beautify"] }),
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkHtml({ action, label }) {
  return `<button type="button" class="chat-intro-note__link" data-chat-intro-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function noteHtml({ icon, title, body, links }) {
  const trail = (links || []).map(linkHtml).join("<span aria-hidden=\"true\"> · </span>");
  return `<li class="chat-intro-note__note">
      <i class="chat-intro-note__mark" data-lucide="${escapeHtml(icon)}" aria-hidden="true"></i>
      <p><strong>${escapeHtml(title)}</strong>${escapeHtml(body)}${trail ? ` <span class="chat-intro-note__links">${trail}</span>` : ""}</p>
    </li>`;
}

function signHtml(segments) {
  return segments
    .map((segment) => (segment.action ? linkHtml(segment) : escapeHtml(segment.text)))
    .join("");
}

export function renderOpeningSetupCtaHtml(locale = "zh-CN") {
  const cta = openingIntroSetupCta(locale);
  return `<button type="button" class="opening-setup-cta" data-chat-intro-action="${escapeHtml(cta.action)}">${escapeHtml(cta.label)}</button>`;
}

export function createOpeningSetupCtaButton(locale = "zh-CN") {
  const host = document.createElement("div");
  host.innerHTML = renderOpeningSetupCtaHtml(locale);
  return host.firstElementChild;
}

/**
 * @param {{
 *   locale?: string,
 *   surface?: "app" | "phone",
 *   characterId?: string,
 *   characterName?: string,
 *   callUserAs?: string,
 *   callCharacterAs?: string,
 *   relationshipType?: string,
 *   collapsed?: boolean,
 * }} [options]
 */
export function renderChatIntroNote(options = {}) {
  const copy = openingIntroLetterCopy({
    characterName: options.characterName,
    callUserAs: options.callUserAs,
    callCharacterAs: options.callCharacterAs,
    relationshipType: options.relationshipType,
  }, options.locale);
  const surface = options.surface === "phone" ? "phone" : "app";
  const collapsed = options.collapsed === true;
  const characterId = String(options.characterId || "").trim();
  const fold = openingIntroFoldCopy(options.locale);
  const titleId = `chat-intro-note-title-${surface}`;
  const bodyId = `chat-intro-note-body-${surface}`;
  const notes = Array.isArray(copy.notes) && copy.notes.length
    ? `<ul class="chat-intro-note__notes">
      ${copy.notes.map(noteHtml).join("\n      ")}
    </ul>`
    : "";
  return `<section class="chat-intro-note is-${surface}${collapsed ? " is-collapsed" : ""}" data-chat-intro-note data-character-id="${escapeHtml(characterId)}" aria-labelledby="${titleId}">
    <header class="chat-intro-note__head">
      <div class="chat-intro-note__identity">
        <span class="chat-intro-note__from">${escapeHtml(copy.from)}</span>
        <h2 id="${titleId}">${escapeHtml(copy.title)}</h2>
      </div>
      <button type="button" class="chat-intro-note__toggle" data-chat-intro-toggle data-label-collapse="${escapeHtml(fold.collapse)}" data-label-expand="${escapeHtml(fold.expand)}" aria-expanded="${collapsed ? "false" : "true"}" aria-controls="${bodyId}">${escapeHtml(collapsed ? fold.expand : fold.collapse)}</button>
    </header>
    <div class="chat-intro-note__body" id="${bodyId}" data-chat-intro-body${collapsed ? " hidden" : ""}>
      <p class="chat-intro-note__lead">${escapeHtml(copy.lead)}</p>
      ${notes}
      <p class="chat-intro-note__setup">${renderOpeningSetupCtaHtml(options.locale)}</p>
      <p class="chat-intro-note__sign">${signHtml(copy.sign)}</p>
    </div>
  </section>`;
}

export function applyChatIntroNoteCollapsed(note, collapsed) {
  if (!note?.classList) return;
  const next = collapsed === true;
  note.classList.toggle("is-collapsed", next);
  const toggle = note.querySelector("[data-chat-intro-toggle]");
  const body = note.querySelector("[data-chat-intro-body]");
  if (toggle) {
    toggle.setAttribute("aria-expanded", next ? "false" : "true");
    const collapseLabel = toggle.getAttribute("data-label-collapse") || "";
    const expandLabel = toggle.getAttribute("data-label-expand") || "";
    toggle.textContent = next ? expandLabel : collapseLabel;
  }
  if (body) body.hidden = next;
}

export function toggleChatIntroNote(note) {
  if (!note) return false;
  const next = !note.classList.contains("is-collapsed");
  setChatIntroNoteCollapsed(note.dataset.characterId, next);
  applyChatIntroNoteCollapsed(note, next);
  return next;
}

/**
 * Resolve one note link to a mature product destination.
 * The caller owns the actual shell navigation.
 */
export function resolveChatIntroDestination(action, surface = "app") {
  const destination = CHAT_INTRO_DESTINATIONS[String(action || "")];
  if (!destination) return null;
  const [kind, value] = destination[surface === "phone" ? "phone" : "app"];
  return { kind, value };
}
