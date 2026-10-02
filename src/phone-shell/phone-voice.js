/**
 * Pop TTS / STT glue (F6 / G2 · G3).
 *
 * Mic toggles keyboard ↔「按住 说话」mode (via bindComposerChrome).
 * Hold pill owns press-to-record / release-to-transcribe.
 */

import { refreshIcons } from "../lib/icons.js";
import {
  getVoiceSettings,
  isSttConfigured as prefsIsSttConfigured,
  isVoiceConfigured,
  resolveHostedVoiceType,
  saveVoiceSettings,
} from "../settings/voice-preferences.js";
import {
  canSpeak,
  shouldAutoSpeak,
  speakMessageText,
  speakSegmentedText,
  speechRoute,
  stopSpeech,
  isSpeaking,
} from "../voice/tts.js";
import { needsHostedVoiceSetup } from "../voice/hosted-voice-ui.js";
import { SPEECH_ROUTE } from "../voice/speech-routing.js";
import { isLiveCallActive } from "../call/live-state.js";
import { getActiveCharacterId } from "../characters/store.js";
import {
  beginDictation,
  canTranscribe,
  cancelDictation,
  transcribeRecording,
} from "../voice/stt.js";
import { cancelRecording, isRecording, startRecording, stopRecording } from "../voice/record.js";
import { ensurePermission } from "../platform/permissions.js";
import { pt } from "./i18n.js";
import { escapeHtml } from "../lib/utils.js";

async function ensureMicrophonePermission() {
  const result = await ensurePermission("microphone");
  return Boolean(result?.ok);
}

/**
 * Whether Pop should show voice controls (pref + feature).
 */
export function isPhoneVoiceEnabled(settings = getVoiceSettings()) {
  return settings.phoneVoiceEnabled !== false;
}

function phoneSpeakTitle() {
  if (!canSpeak()) return pt("voice.speakNeedConfig");
  if (speechRoute() === SPEECH_ROUTE.HOSTED && !resolveHostedVoiceType(getActiveCharacterId())) {
    return pt("voice.speakNeedHostedVoice");
  }
  return pt("voice.speak");
}

/**
 * Enrich assistant message HTML with speak button.
 * @param {string} articleHtml
 * @param {{ role: string, content: string }} message
 */
export function withSpeakButton(articleHtml, message) {
  if (message.role === "user" || !String(message.content || "").trim()) return articleHtml;
  if (!isPhoneVoiceEnabled()) return articleHtml;
  // Left tappable without a key so the tap can explain what is missing.
  const title = phoneSpeakTitle();
  const btn = `<button type="button" class="mini-icon-button mini-speak-btn" data-phone-speak aria-label="${escapeHtml(pt("voice.speak"))}" title="${escapeHtml(title)}"><i data-lucide="volume-2"></i></button>`;
  if (articleHtml.includes("</footer>")) {
    return articleHtml.replace("</footer>", `${btn}</footer>`);
  }
  return articleHtml.replace(/<\/article>\s*$/, `${btn}</article>`);
}

/**
 * @param {HTMLElement} root — phone shell root
 * @param {{
 *   onToast?: (msg: string) => void,
 *   getInput?: () => HTMLInputElement | null,
 *   onTranscribed?: (text: string) => void,
 *   isAudioMode?: () => boolean,
 * }} [deps]
 */
export function mountPhoneVoice(root, deps = {}) {
  if (!root) return { destroy() {}, syncMic() {}, onAssistantReply() {}, refreshSpeakButtons() {} };

  const micState = { active: false };
  let destroyed = false;

  function hint(msg) {
    let node = root.querySelector("[data-phone-voice-hint]");
    if (!node) {
      const stack = root.querySelector("[data-mini-composer-stack]");
      const form = root.querySelector("[data-phone-chat-form]");
      if (!form && !stack) {
        deps.onToast?.(msg);
        return;
      }
      node = document.createElement("p");
      node.className = "mini-voice-hint";
      node.setAttribute("data-phone-voice-hint", "");
      node.setAttribute("aria-live", "polite");
      (stack || form).before(node);
    }
    node.textContent = msg || "";
    node.hidden = !msg;
  }

  function syncMic() {
    const form = root.querySelector("[data-phone-chat-form]");
    if (!form) return;
    let mic = form.querySelector("[data-phone-mic]");
    const hold = form.querySelector("[data-phone-hold]");
    const plusVoice = root.querySelector('[data-phone-plus-action="voice"]');
    const enabled = isPhoneVoiceEnabled();
    const configured = canTranscribe() || prefsIsSttConfigured();

    if (!enabled) {
      if (mic) mic.hidden = true;
      if (hold) hold.hidden = true;
      if (plusVoice) plusVoice.hidden = true;
      return;
    }

    if (!mic) {
      mic = document.createElement("button");
      mic.type = "button";
      mic.className = "mini-icon-button mini-composer-tool mini-mic-btn";
      mic.setAttribute("data-phone-mic", "");
      mic.setAttribute("aria-label", pt("voice.voiceInput"));
      const send = form.querySelector(".mini-send") || form.querySelector("[type=submit]");
      if (send) form.insertBefore(mic, send);
      else form.append(mic);
      mic.innerHTML = '<i data-lucide="mic"></i>';
    }

    if (!configured) {
      mic.disabled = true;
      mic.title = pt("voice.sttNeedConfig");
      mic.setAttribute("aria-disabled", "true");
      mic.classList.add("is-disabled");
      if (hold) {
        hold.disabled = true;
        hold.title = pt("voice.sttNeedConfig");
      }
      if (plusVoice) plusVoice.disabled = true;
    } else {
      mic.disabled = false;
      mic.title = pt("voice.voiceInput");
      mic.removeAttribute("aria-disabled");
      mic.classList.remove("is-disabled");
      if (hold) {
        hold.disabled = false;
        hold.title = pt("voice.holdToTalk");
      }
      if (plusVoice) plusVoice.disabled = false;
    }
    mic.hidden = false;
    if (plusVoice) plusVoice.hidden = false;
    bindHold(hold);
    refreshIcons();
  }

  function bindHold(hold) {
    if (!hold || hold.dataset.bound === "1") return;
    hold.dataset.bound = "1";

    hold.addEventListener("pointerdown", async (event) => {
      event.preventDefault();
      if (hold.disabled || micState.active || isRecording()) return;
      if (!canTranscribe()) {
        hint(pt("voice.sttNeedConfig"));
        return;
      }
      const ok = await ensureMicrophonePermission();
      if (!ok) {
        hint(pt("voice.micRequired"));
        return;
      }
      try {
        await startRecording();
        beginDictation();
        micState.active = true;
        hold.classList.add("is-recording");
        root.querySelector("[data-phone-mic]")?.classList.add("is-recording");
        hint("");
      } catch (error) {
        hint(String(error.message || pt("voice.recordFail")).slice(0, 80));
      }
    });

    const finish = () => {
      finishRecording(hold).catch(() => {});
    };
    hold.addEventListener("pointerup", finish);
    hold.addEventListener("pointerleave", () => {
      if (micState.active) finish();
    });
    hold.addEventListener("pointercancel", async () => {
      if (!micState.active) return;
      micState.active = false;
      hold.classList.remove("is-recording");
      root.querySelector("[data-phone-mic]")?.classList.remove("is-recording");
      cancelDictation();
      await cancelRecording().catch(() => {});
    });
  }

  async function finishRecording(hold) {
    if (!micState.active) return;
    micState.active = false;
    hold?.classList.remove("is-recording");
    root.querySelector("[data-phone-mic]")?.classList.remove("is-recording");
    const input = deps.getInput?.() || root.querySelector("[data-phone-chat-input]");
    const prevPlaceholder = input?.placeholder || pt("voice.sendMessage");
    if (input) input.placeholder = pt("voice.transcribing");
    try {
      const { blob } = await stopRecording();
      if (!blob) {
        hint(pt("voice.noText"));
        return;
      }
      const { text } = await transcribeRecording(blob);
      if (!text) {
        hint(pt("voice.noText"));
        return;
      }
      hint("");
      if (input) {
        input.value = text;
        input.hidden = false;
      }
      deps.onTranscribed?.(text);
    } catch (error) {
      hint(String(error.message || pt("voice.noText")).slice(0, 80) || pt("voice.noText"));
    } finally {
      if (input) input.placeholder = prevPlaceholder;
    }
  }

  async function onSpeakClick(event) {
    const button = event.target.closest("[data-phone-speak]");
    if (!button || destroyed) return;
    const article = button.closest(".mini-message, article");
    const text = article?.querySelector("p")?.textContent?.trim();
    if (!text) return;
    if (!canSpeak()) {
      hint(pt("voice.speakNeedConfig"));
      return;
    }
    if (speechRoute() === SPEECH_ROUTE.HOSTED && !resolveHostedVoiceType(getActiveCharacterId())) {
      hint(pt("voice.speakNeedHostedVoice"));
      return;
    }
    try {
      if (button.classList.contains("is-speaking") || isSpeaking()) {
        stopSpeech();
        return;
      }
      await speakMessageText(text, button);
    } catch (error) {
      hint(String(error.message || pt("voice.speakFail")).slice(0, 80));
      button.classList.remove("is-speaking");
      button.disabled = !canSpeak();
    } finally {
      refreshIcons();
    }
  }

  /**
   * Call when a new assistant reply arrives.
   * @param {string} text
   */
  function onAssistantReply(text) {
    if (!text) return;
    const inCall = isLiveCallActive();
    if (!inCall && !shouldAutoSpeak()) return;
    speakSegmentedText(text, { force: inCall }).catch(() => {});
  }

  function refreshSpeakButtons() {
    root.querySelectorAll("[data-phone-speak]").forEach((btn) => {
      btn.disabled = false;
      btn.title = phoneSpeakTitle();
      btn.hidden = !isPhoneVoiceEnabled();
      btn.classList.toggle("is-needs-voice-setup", needsHostedVoiceSetup());
    });
  }

  root.addEventListener("click", onSpeakClick);
  syncMic();

  return {
    syncMic,
    onAssistantReply,
    refreshSpeakButtons,
    withSpeakButton,
    destroy() {
      destroyed = true;
      root.removeEventListener("click", onSpeakClick);
      if (micState.active) cancelRecording().catch(() => {});
      stopSpeech();
    },
  };
}

/**
 * Wire lab page test TTS / STT buttons.
 * @param {HTMLElement} root
 */
export function wireLabVoiceTests(root) {
  const status = () => root.querySelector("[data-lab-voice-status]");

  root.querySelector("[data-lab-test-tts]")?.addEventListener("click", async () => {
    const node = status();
    try {
      if (!isVoiceConfigured()) throw new Error(pt("voice.ttsNeedKey"));
      await speakMessageText(pt("voice.ttsSample"));
      if (node) {
        node.textContent = pt("voice.ttsSuccess");
        node.classList.remove("is-error");
      }
    } catch (error) {
      if (node) {
        node.textContent = String(error.message || pt("voice.speakFail")).slice(0, 120);
        node.classList.add("is-error");
      }
    }
  });

  root.querySelector("[data-lab-test-stt]")?.addEventListener("click", async () => {
    const node = status();
    if (!canTranscribe()) {
      if (node) {
        node.textContent = pt("voice.sttNeedKey");
        node.classList.add("is-error");
      }
      return;
    }
    if (node) {
      node.textContent = pt("voice.sttTestHint");
      node.classList.remove("is-error");
    }
  });
}

export { saveVoiceSettings, getVoiceSettings, canSpeak, canTranscribe };
