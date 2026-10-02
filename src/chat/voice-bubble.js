import { t } from "../i18n/index.js";

export function formatVoiceDuration(ms = 0) {
  const total = Math.max(1, Math.round(Number(ms) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}"`;
}

export function createVoiceBubble({
  text = "",
  durationMs = 0,
  role = "ai",
  speakable = true,
} = {}) {
  const article = document.createElement("article");
  article.className = `message ${role} voice-message`;
  article.dataset.voiceText = text;
  article.dataset.voiceDuration = String(durationMs || 0);

  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = "voice-bar";
  bar.dataset.voiceBar = "true";
  bar.disabled = !speakable;
  bar.setAttribute("aria-label", t("shared.voice.playAria"));
  bar.innerHTML = `
    <span class="voice-bar-wave" aria-hidden="true"></span>
    <span class="voice-bar-meta">
      <strong>${role === "user" ? t("shared.voice.message") : t("shared.voice.reply")}</strong>
      <em>${formatVoiceDuration(durationMs)}</em>
    </span>
  `;

  const transcript = document.createElement("p");
  transcript.className = "voice-transcript";
  transcript.textContent = text;

  article.append(bar, transcript);
  return article;
}
