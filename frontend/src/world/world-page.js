import { refreshIcons } from "../lib/icons.js";
import { escapeHtml } from "../lib/utils.js";
import { t } from "../i18n/index.js";
import { loadMoments, saveMoments } from "../moments/store.js";
import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import { postMomentForCharacter } from "../moments/auto-post.js";

const feed = document.querySelector("[data-moments-feed]");
const compose = document.querySelector("[data-moments-compose]");
const composeInput = document.querySelector("[data-moments-input]");
const composeSubmit = document.querySelector("[data-moments-invite-submit]");
const statusLine = document.querySelector("[data-moments-invite-status]");

let moments = [];
let wired = false;
let inviting = false;

function momentAvatarHtml(moment) {
  const avatar = String(moment.authorAvatar || "").trim();
  const banned = /\/assets\/(avatars\/xingli|characters|pet-poses)\//i.test(avatar);
  if (avatar && !banned) {
    return `<img src="${escapeHtml(avatar)}" alt="" />`;
  }
  const initial = escapeHtml(String(moment.author || t("character.fallbackName")).trim().slice(0, 1) || t("character.fallbackName").slice(0, 1));
  return `<span class="app-moment__avatar-fallback" aria-hidden="true">${initial}</span>`;
}

function selfMomentAuthor() {
  return t("pages.worldChrome.selfAuthor");
}

function setInviteStatus(text) {
  if (statusLine) statusLine.textContent = text || "";
}

function momentCardHtml(moment) {
  const selfAuthor = selfMomentAuthor();
  const shared = moment.shareWithCompanion || moment.privacy === "companion_shared";
  const privacyLabel = shared
    ? t("pages.worldChrome.privacyShared")
    : t("pages.worldChrome.privacyPrivate");
  const privacyIcon = shared ? "users" : "lock";
  const liked = moment.likes.includes(selfAuthor) || moment.likes.includes("你");
  return `
    <article class="app-moment" data-moment-id="${escapeHtml(moment.id)}">
      <span class="app-moment__avatar">${momentAvatarHtml(moment)}</span>
      <div class="app-moment__body">
        <header>
          <strong>${escapeHtml(moment.author)}</strong>
          <time>${escapeHtml(moment.time)}</time>
          <span class="app-moment__privacy" title="${escapeHtml(privacyLabel)}">
            <i data-lucide="${privacyIcon}"></i>${escapeHtml(privacyLabel)}
          </span>
        </header>
        <p>${escapeHtml(moment.content)}</p>
        ${moment.image ? `<figure><img src="${escapeHtml(moment.image)}" alt="${escapeHtml(t("pages.worldChrome.momentImageAlt"))}" /></figure>` : ""}
        <div class="app-moment__actions">
          <button type="button" data-moment-like class="${liked ? "is-active" : ""}"><i data-lucide="heart"></i><span>${moment.likes.length ? moment.likes.length : escapeHtml(t("pages.worldChrome.like"))}</span></button>
          <button type="button" data-moment-comment-toggle><i data-lucide="message-circle"></i><span>${escapeHtml(t("pages.worldChrome.comment"))}</span></button>
        </div>
        ${moment.likes.length ? `<div class="app-moment__likes"><i data-lucide="heart"></i><span>${moment.likes.map(escapeHtml).join("、")}</span></div>` : ""}
        ${moment.comments.length ? `<div class="app-moment__comments">${moment.comments.map((comment) => `<p><strong>${escapeHtml(comment.author)}：</strong>${escapeHtml(comment.text)}</p>`).join("")}</div>` : ""}
        <form class="app-moment__comment-form" data-moment-comment-form hidden>
          <input type="text" maxlength="120" placeholder="${escapeHtml(t("pages.worldChrome.commentPlaceholder"))}" aria-label="${escapeHtml(t("pages.worldChrome.commentAria"))}" />
          <button type="submit" aria-label="${escapeHtml(t("pages.worldChrome.commentSend"))}"><i data-lucide="send"></i></button>
        </form>
      </div>
    </article>
  `;
}

function render() {
  if (!feed) return;
  feed.innerHTML = moments.length
    ? moments.map(momentCardHtml).join("")
    : `
      <section class="social-empty-state" aria-live="polite">
        <span class="social-empty-state__icon" aria-hidden="true"><i data-lucide="message-circle-heart"></i></span>
        <strong>${escapeHtml(t("pages.worldChrome.momentsEmptyTitle"))}</strong>
        <p>${escapeHtml(t("pages.worldChrome.momentsEmptyHint"))}</p>
      </section>
    `;
  refreshIcons();
}

function persist(reason) {
  moments = saveMoments(moments, reason);
  render();
}

function resolveActiveCharacter() {
  const id = getActiveCharacterId();
  const character = id ? getCharacterSync(id) : null;
  if (character) return character;
  const name = document.querySelector("[data-role-name]")?.textContent?.trim();
  if (!name) return null;
  return { id: id || "active", name };
}

async function inviteCharacterToPost() {
  if (inviting) return;
  const character = resolveActiveCharacter();
  if (!character) {
    setInviteStatus(t("pages.worldChrome.inviteNeedCharacter"));
    return;
  }
  inviting = true;
  if (composeSubmit) composeSubmit.disabled = true;
  setInviteStatus(t("pages.worldChrome.inviteGenerating"));
  try {
    const hint = composeInput?.value?.trim() || "";
    const posted = await postMomentForCharacter(character, { hint, shareWithCompanion: true });
    if (!posted) {
      setInviteStatus(t("pages.worldChrome.inviteFailed"));
      return;
    }
    if (composeInput) composeInput.value = "";
    moments = loadMoments();
    render();
    setInviteStatus(t("pages.worldChrome.inviteDone"));
  } catch (error) {
    setInviteStatus(error?.message || t("pages.worldChrome.inviteFailed"));
  } finally {
    inviting = false;
    if (composeSubmit) composeSubmit.disabled = false;
    refreshIcons();
  }
}

function wireEvents() {
  if (wired) return;
  wired = true;

  compose?.addEventListener("submit", (event) => {
    event.preventDefault();
    void inviteCharacterToPost();
  });

  feed?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-moment-id]");
    if (!card) return;
    const moment = moments.find((item) => item.id === card.dataset.momentId);
    if (!moment) return;
    if (event.target.closest("[data-moment-like]")) {
      const selfAuthor = selfMomentAuthor();
      const index = moment.likes.findIndex((name) => name === selfAuthor || name === "你");
      if (index >= 0) moment.likes.splice(index, 1);
      else moment.likes.push(selfAuthor);
      persist("like");
      return;
    }
    if (event.target.closest("[data-moment-comment-toggle]")) {
      const form = card.querySelector("[data-moment-comment-form]");
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector("input")?.focus();
    }
  });

  feed?.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-moment-comment-form]");
    if (!form) return;
    event.preventDefault();
    const card = form.closest("[data-moment-id]");
    const moment = moments.find((item) => item.id === card?.dataset.momentId);
    const input = form.querySelector("input");
    const text = input?.value.trim().slice(0, 120);
    if (!moment || !text) return;
    moment.comments.push({ author: selfMomentAuthor(), text });
    persist("comment");
  });

  document.addEventListener("yueqi:moments-changed", (event) => {
    moments = Array.isArray(event.detail?.moments) ? event.detail.moments : loadMoments();
    render();
  });

  document.addEventListener("yueqi:locale-changed", () => {
    render();
  });

  document.addEventListener("yueqi:runtime", () => {
    /* status line removed from chrome; keep listener for future hooks */
  });
}

export async function initWorldPage() {
  if (!feed) return;
  moments = loadMoments();
  // Always show invite compose (hint → character posts)
  if (compose) compose.hidden = false;
  wireEvents();
  render();
  try {
    const { initWorldFeedUi } = await import("./world-feed.js");
    await initWorldFeedUi();
  } catch (error) {
    console.warn("[world] character feed init skipped", error);
  }
}
