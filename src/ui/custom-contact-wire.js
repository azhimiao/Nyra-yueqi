import { getCustomContactCopy, hasCustomContact } from "../commerce/custom-contact.js";
import { getLocale, t } from "../i18n/index.js";

async function copyText(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Wire Phase 5 custom-contact block on the character page.
 */
export function wireCustomContact(root = document) {
  const panels = [...root.querySelectorAll("[data-custom-contact]")];
  if (!panels.length) return { refresh: () => {} };

  const channels = [
    ["discord", "discord", "discordCopied"],
    ["wechat", "wechat", "wechatCopied"],
    ["qqGroup", "qq-group", "qqGroupCopied"],
    ["email", "email", "emailCopied"],
    ["qq", "qq", "qqCopied"],
  ];

  function refresh(locale = getLocale()) {
    const contact = getCustomContactCopy(locale);
    panels.forEach((panel) => {
      const titleEl = panel.querySelector("[data-custom-contact-title]");
      const blurbEl = panel.querySelector("[data-custom-contact-blurb]");
      const noteEl = panel.querySelector("[data-custom-contact-note]");
      if (titleEl) titleEl.textContent = contact.title || t("pages.companionChrome.customContact.title", locale);
      if (blurbEl) blurbEl.textContent = contact.blurb || "";
      if (noteEl) {
        noteEl.textContent = contact.note || "";
        const noteRow = noteEl.closest("[data-custom-contact-note-row], .pet-custom-notice__row--note");
        if (noteRow) noteRow.hidden = !contact.note;
        else noteEl.hidden = !contact.note;
      }
      const github = String(contact.github || "").trim();
      const githubLink = panel.querySelector("[data-custom-contact-github]");
      const githubRow = githubLink?.closest("[data-custom-contact-github-row], .pet-custom-notice__row");
      if (githubLink) {
        githubLink.textContent = github.replace(/^https?:\/\//i, "");
        githubLink.setAttribute("href", github || "#");
        githubLink.setAttribute("aria-label", t("pages.companionChrome.customContact.openGithub", locale));
      }
      panel.querySelectorAll("[data-custom-contact-github-action]").forEach((link) => {
        link.setAttribute("href", github || "#");
      });
      if (githubRow) githubRow.hidden = !github;
      channels.forEach(([key, attr]) => {
        const value = String(contact[key] || "").trim();
        const valueEl = panel.querySelector(`[data-custom-contact-${attr}]`);
        const row = valueEl?.closest(`[data-custom-contact-${attr}-row], .pet-custom-notice__row`);
        const copyButton = panel.querySelector(`[data-custom-contact-copy-${attr}]`);
        if (valueEl) valueEl.textContent = value;
        if (row) row.hidden = !value;
        if (copyButton) copyButton.disabled = !value;
      });
      panel.dataset.ready = String(hasCustomContact(contact));
      // Pet hub and settings router own their view visibility.
      if (!panel.closest("[data-pet-hub]") && !panel.matches("[data-settings-view]")) {
        panel.hidden = false;
      }
    });
  }

  async function flash(panel, ok, message) {
    const statusEl = panel.querySelector("[data-custom-contact-status]");
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.kind = ok ? "ok" : "error";
    window.setTimeout(() => {
      if (statusEl.textContent === message) statusEl.textContent = "";
    }, 2200);
  }

  panels.forEach((panel) => {
    channels.forEach(([key, attr, copiedKey]) => {
      panel.querySelector(`[data-custom-contact-copy-${attr}]`)?.addEventListener("click", async () => {
        const locale = getLocale();
        const value = String(getCustomContactCopy(locale)[key] || "").trim();
        const ok = await copyText(value);
        flash(
          panel,
          ok,
          ok
            ? t(`pages.companionChrome.customContact.${copiedKey}`, locale)
            : t("pages.companionChrome.customContact.copyFailed", locale),
        );
      });
    });
  });

  window.addEventListener("yueqi:locale-changed", () => refresh());
  refresh();
  return { refresh };
}
