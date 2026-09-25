import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";
import { stopSpeech, synthesizeSpeech, getSpeechConfig } from "./tts.js";
import {
  ELEVENLABS_TTS_MODELS,
  OPENAI_STT_MODELS,
  OPENAI_TTS_MODELS,
  curatedOpenAiVoices,
  curatedVolcVoices,
  fetchElevenLabsVoices,
  findCatalogVoice,
  recalledVoiceCatalog,
  resolveVoiceDisplayName,
  voiceMetaLine,
} from "./catalog.js";

let previewAudio = null;
let previewUrlObject = "";
let stopPreviewWait = null;

function stopPreview() {
  stopPreviewWait?.();
  stopPreviewWait = null;
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.src = "";
    previewAudio = null;
  }
  if (previewUrlObject) {
    URL.revokeObjectURL(previewUrlObject);
    previewUrlObject = "";
  }
}

function waitUntilEnded(audio) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      stopPreviewWait = null;
      if (error) reject(error);
      else resolve();
    };
    const onEnded = () => finish();
    const onError = () => finish(new Error(t("voicePanel.previewFailed")));
    stopPreviewWait = () => finish();
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
  });
}

function playBlob(blob) {
  stopPreview();
  stopSpeech();
  previewUrlObject = URL.createObjectURL(blob);
  previewAudio = new Audio(previewUrlObject);
  const play = previewAudio.play();
  return play.then(() => waitUntilEnded(previewAudio));
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function genderLabels() {
  return {
    female: t("voicePanel.female"),
    male: t("voicePanel.male"),
  };
}

function fillSelect(select, models, current) {
  if (!select) return;
  const value = String(current || select.value || "").trim();
  const ids = new Set(models.map((item) => item.id));
  select.innerHTML = models.map((item) => (
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label || item.id)}</option>`
  )).join("");
  if (value && !ids.has(value)) {
    const extra = document.createElement("option");
    extra.value = value;
    extra.textContent = value;
    select.append(extra);
  }
  if (value) select.value = value;
}

export function mountVoicePicker({
  root = document,
  getSettings,
  persist,
  onCatalog,
} = {}) {
  const picker = root.querySelector("[data-voice-picker]");
  if (!picker) return { refresh() {}, destroy() {} };

  const selectedName = picker.querySelector("[data-voice-picker-name]");
  const selectedMeta = picker.querySelector("[data-voice-picker-meta]");
  const listHost = picker.querySelector("[data-voice-picker-list]");
  const statusNode = picker.querySelector("[data-voice-picker-status]");
  const queryInput = picker.querySelector("[data-voice-picker-query]");
  const fetchBtn = picker.querySelector("[data-voice-picker-fetch]");
  const previewSelectedBtn = picker.querySelector("[data-voice-picker-preview]");
  const voiceIdInput = root.querySelector("[data-voice-id]");
  const openaiVoiceInput = root.querySelector("[data-voice-openai-voice]");
  const volcVoiceInput = root.querySelector("[data-voice-volc-voice-type]");
  const ttsModelSelect = root.querySelector("[data-voice-tts-model]");
  const sttModelSelect = root.querySelector("[data-voice-stt-model]");

  let voices = [];
  let loading = false;

  function settings() {
    return getSettings?.() || {};
  }

  function selectedId(cfg = settings()) {
    if (cfg.ttsProvider === "OpenAI") return String(cfg.openaiVoice || "").trim();
    if (cfg.ttsProvider === "Volcengine") {
      return String(cfg.volcSpeechVoiceType || cfg.voiceId || "").trim();
    }
    return String(cfg.voiceId || "").trim();
  }

  function setStatus(text, tone = "") {
    if (!statusNode) return;
    statusNode.textContent = text || "";
    statusNode.hidden = !text;
    statusNode.dataset.tone = tone || "";
  }

  function paintSelected(cfg = settings(), voice = null) {
    const id = selectedId(cfg);
    const resolved = voice || findCatalogVoice(voices, id);
    const name = resolved?.name || resolveVoiceDisplayName(cfg, voices);
    if (selectedName) {
      selectedName.textContent = name || (id ? t("voicePanel.unnamed") : t("voicePanel.none"));
    }
    if (selectedMeta) {
      const meta = resolved ? voiceMetaLine(resolved, genderLabels()) : "";
      selectedMeta.textContent = meta || t("voicePanel.chooseHint");
    }
  }

  function applySelection(voice, { silent = false } = {}) {
    if (!voice?.id) return;
    const cfg = settings();
    if (voiceIdInput) voiceIdInput.value = voice.id;
    if (cfg.ttsProvider === "OpenAI" && openaiVoiceInput) openaiVoiceInput.value = voice.id;
    if (cfg.ttsProvider === "Volcengine" && volcVoiceInput) volcVoiceInput.value = voice.id;
    paintSelected(cfg, voice);
    listHost?.querySelectorAll("[data-voice-pick-id]").forEach((row) => {
      row.classList.toggle("is-selected", row.dataset.voicePickId === voice.id);
    });
    if (!silent) persist?.();
  }

  function renderList() {
    if (!listHost) return;
    const q = String(queryInput?.value || "").trim().toLowerCase();
    const current = selectedId();
    const visible = voices.filter((voice) => {
      if (!q) return true;
      const hay = `${voice.name} ${voice.id} ${voiceMetaLine(voice, genderLabels())}`.toLowerCase();
      return hay.includes(q);
    });
    if (!visible.length) {
      listHost.innerHTML = `<p class="voice-picker__empty">${escapeHtml(t("voicePanel.empty"))}</p>`;
      return;
    }
    listHost.innerHTML = visible.map((voice) => {
      const meta = voiceMetaLine(voice, genderLabels());
      const selected = voice.id === current;
      return `
        <article class="voice-pick-row${selected ? " is-selected" : ""}" data-voice-pick-id="${escapeHtml(voice.id)}">
          <button type="button" class="voice-pick-row__choose" data-voice-choose="${escapeHtml(voice.id)}">
            <strong>${escapeHtml(voice.name)}${selected ? `<em>${escapeHtml(t("voicePanel.chosen"))}</em>` : ""}</strong>
            <span>${escapeHtml(meta || t("voicePanel.previewThenChoose"))}</span>
          </button>
          <button type="button" class="voice-pick-row__preview" data-voice-preview="${escapeHtml(voice.id)}" aria-label="${escapeHtml(t("voicePanel.preview"))}">
            <i data-lucide="play"></i>
          </button>
        </article>
      `;
    }).join("");
    refreshIcons(listHost);
    const currentVoice = findCatalogVoice(voices, current);
    if (currentVoice) applySelection(currentVoice, { silent: true });
    else paintSelected();
    listHost.querySelector(".voice-pick-row.is-selected")?.scrollIntoView({ block: "nearest" });
  }

  async function previewVoice(id) {
    const cfg = settings();
    const voice = findCatalogVoice(voices, id) || { id };
    const btn = picker.querySelector(`[data-voice-preview="${cssEscape(id)}"]`) || previewSelectedBtn;
    if (btn) btn.classList.add("is-playing");
    try {
      if (voice.previewUrl) {
        stopPreview();
        stopSpeech();
        previewAudio = new Audio(voice.previewUrl);
        await previewAudio.play();
        await waitUntilEnded(previewAudio);
        return;
      }
      const sample = String(root.querySelector("[data-voice-test-sample]")?.value || "").trim()
        || t("voicePanel.previewSample");
      const next = {
        ...cfg,
        voiceId: id,
        openaiVoice: cfg.ttsProvider === "OpenAI" ? id : cfg.openaiVoice,
        volcSpeechVoiceType: cfg.ttsProvider === "Volcengine" ? id : cfg.volcSpeechVoiceType,
      };
      const blob = await synthesizeSpeech(sample, getSpeechConfig(next));
      await playBlob(blob);
    } finally {
      if (btn) btn.classList.remove("is-playing");
    }
  }

  async function loadCatalog({ force = false, settings: snapshot } = {}) {
    const cfg = snapshot || settings();
    const provider = cfg.ttsProvider || "ElevenLabs";
    if (provider === "OpenAI") {
      voices = curatedOpenAiVoices();
      if (fetchBtn) fetchBtn.hidden = true;
      setStatus("");
      renderList();
      onCatalog?.();
      return;
    }
    if (provider === "Volcengine") {
      voices = curatedVolcVoices();
      if (fetchBtn) fetchBtn.hidden = true;
      setStatus(t("voicePanel.volcHint"));
      renderList();
      onCatalog?.();
      return;
    }
    if (fetchBtn) fetchBtn.hidden = false;
    const key = String(cfg.ttsApiKey || "").trim();
    if (!key) {
      voices = recalledVoiceCatalog("ElevenLabs", "") || [];
      setStatus(t("voicePanel.needKey"), "warn");
      renderList();
      onCatalog?.();
      return;
    }
    if (loading) return;
    loading = true;
    if (fetchBtn) fetchBtn.disabled = true;
    setStatus(t("voicePanel.loading"));
    try {
      voices = await fetchElevenLabsVoices(key, { force });
      setStatus(voices.length ? t("voicePanel.loaded", { n: voices.length }) : t("voicePanel.empty"));
      renderList();
    } catch (error) {
      voices = recalledVoiceCatalog("ElevenLabs", key) || [];
      setStatus(error?.message || t("voicePanel.loadFailed"), "warn");
      renderList();
    } finally {
      loading = false;
      if (fetchBtn) fetchBtn.disabled = false;
      onCatalog?.();
    }
  }

  picker.addEventListener("click", (event) => {
    const choose = event.target.closest("[data-voice-choose]");
    if (choose) {
      const voice = findCatalogVoice(voices, choose.dataset.voiceChoose);
      if (voice) applySelection(voice);
      return;
    }
    const preview = event.target.closest("[data-voice-preview]");
    if (preview) {
      event.preventDefault();
      const id = preview.dataset.voicePreview || selectedId();
      if (id) previewVoice(id).catch((error) => setStatus(error.message || t("voicePanel.previewFailed"), "warn"));
    }
  });

  fetchBtn?.addEventListener("click", () => {
    loadCatalog({ force: true });
  });
  queryInput?.addEventListener("input", () => renderList());
  previewSelectedBtn?.addEventListener("click", () => {
    const id = selectedId();
    if (!id) {
      setStatus(t("voicePanel.none"), "warn");
      return;
    }
    previewVoice(id).catch((error) => setStatus(error.message || t("voicePanel.previewFailed"), "warn"));
  });

  return {
    refresh(options = {}) {
      const cfg = options.settings || settings();
      fillSelect(
        ttsModelSelect,
        cfg.ttsProvider === "OpenAI" ? OPENAI_TTS_MODELS : ELEVENLABS_TTS_MODELS,
        cfg.ttsModel,
      );
      fillSelect(sttModelSelect, OPENAI_STT_MODELS, cfg.sttModel);
      paintSelected(cfg);
      return loadCatalog({ ...options, settings: cfg });
    },
    destroy() {
      stopPreview();
    },
  };
}

export { stopPreview as stopVoicePickerPreview };
