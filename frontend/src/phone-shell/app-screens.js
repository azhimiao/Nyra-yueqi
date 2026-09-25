/**
 * Independent Qiji (栖机) app screens — polished phone UI, no App-mode routing.
 */

import { LOCALES } from "./phone-data.js";
import { switchHtml, segmentedHtml, timeChipHtml } from "./phone-controls.js";
import { buildGateSettingsSectionsHtml } from "../qishi/qishi-screens.js";
import { pt } from "./i18n.js";
import { t } from "../i18n/index.js";
import { memoryGalleryInnerHtml } from "../ui/memory-gallery-markup.js";

export { buildQishiScreenHtml, buildExtHostScreenHtml } from "../qishi/qishi-screens.js";
export { buildGameHostScreenHtml } from "../yeos/game-shell-ui.js";

function localeSegmented(activeId) {
  const labels = { "zh-CN": pt("settings.localeZh"), en: pt("settings.localeEn") };
  return segmentedHtml({
    options: Object.keys(LOCALES || {}).map((id) => ({ id, label: labels[id] || id })),
    activeId,
    dataAttr: 'data-phone-locales',
  });
}

function ttsSegmented(activeId = "OpenAI") {
  return segmentedHtml({
    options: [
      { id: "OpenAI", label: "OpenAI" },
      { id: "ElevenLabs", label: "ElevenLabs" },
    ],
    activeId,
    dataAttr: 'data-tts-providers',
  });
}

export function buildDispersedAppScreens({
  localeId = "zh-CN",
} = {}) {
  return `
    <section class="mini-view mini-calendar" data-phone-screen="calendar" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("screens.calendarTitle")}</strong><span data-cal-month-label>${pt("screens.emptyCalendar")}</span></div>
        <button type="button" class="mini-icon-button" data-phone-pane="calendar-add" aria-label="${pt("screens.add")}"><i data-lucide="plus"></i></button>
      </header>
      <div class="mini-app-scroll" data-phone-pane-view="calendar-home">
        <div class="mini-cal-toolbar">
          <button type="button" class="mini-icon-button" data-cal-prev aria-label="${pt("screens.prevMonth")}"><i data-lucide="chevron-left"></i></button>
          <strong data-cal-heading>—</strong>
          <button type="button" class="mini-icon-button" data-cal-next aria-label="${pt("screens.nextMonth")}"><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="mini-cal-grid" data-phone-cal-grid></div>
        <div class="mini-cal-day-sheet" data-phone-cal-day>
          <header>
            <strong data-cal-day-title>${pt("screens.selectDate")}</strong>
            <button type="button" class="mini-text-btn" data-phone-pane="calendar-add">${pt("screens.add")}</button>
          </header>
          <div class="mini-cal-day-events" data-phone-cal-day-events></div>
        </div>
      </div>
      <div class="mini-app-scroll" data-phone-pane-view="calendar-add" hidden>
        <form class="mini-form" data-phone-event-form>
          <label><span>${pt("screens.title")}</span><input name="title" maxlength="40" placeholder="${pt("calendar.formTitlePlaceholder")}" required autocomplete="off" /></label>
          <input type="hidden" name="date" data-event-date />
          <p class="mini-form-hint">${pt("calendar.formDateHintBefore")}<em data-event-date-label>—</em>${pt("calendar.formDateHintAfter")}</p>
          <span class="mini-form__title">${pt("calendar.time")}</span>
          ${timeChipHtml("21:00")}
          <input type="hidden" name="time" value="21:00" data-event-time />
          <span class="mini-form__title">${pt("calendar.quickTemplates")}</span>
          <div class="mini-cal-templates" data-cal-templates>
            <button type="button" class="mini-cal-chip is-active" data-cal-template="reminder">${pt("calendar.templateReminder")}</button>
            <button type="button" class="mini-cal-chip" data-cal-template="sync_listen">${pt("calendar.templateSyncListen")}</button>
            <button type="button" class="mini-cal-chip" data-cal-template="co_read">${pt("calendar.templateCoRead")}</button>
          </div>
          <label><span>${pt("calendar.eventDesc")}</span><textarea name="prompt" rows="3" maxlength="200" placeholder="${pt("calendar.eventDescPlaceholder")}"></textarea></label>
          <input type="hidden" name="mode" value="proactive_message" />
          <button type="submit" class="mini-app-cta">${pt("screens.saveReminder")}</button>
          <button type="button" class="mini-app-cta mini-app-cta--ghost" data-phone-pane="calendar-home">${pt("screens.cancel")}</button>
        </form>
      </div>
    </section>

    <section class="mini-view mini-pet" data-phone-screen="pet" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("apps.pet")}</strong><span>${pt("jobs.pet")}</span></div>
        <span></span>
      </header>
      <div class="mini-app-scroll mini-pet-scroll">
        <article class="mini-pet-hero" data-phone-pet-hero>
          <div class="mini-pet-hero__preview" data-phone-pet-preview aria-hidden="true"></div>
          <div class="mini-pet-hero__copy">
            <p class="mini-pet-hero__eyebrow">${pt("pet.currentPet")}</p>
            <h2 data-phone-pet-name>—</h2>
            <p data-phone-pet-tagline></p>
            <p class="mini-pet-hero__bind" data-phone-pet-bind>${pt("pet.currentCompanion", { name: pt("home.someone") })}</p>
          </div>
        </article>

        <div class="mini-settings-block">
          <strong>${pt("pet.floatBlock")}</strong>
          ${switchHtml({ label: pt("pet.showFloat"), attrs: "data-pet-float" })}
          <p class="mini-app-lead">${pt("pet.lead")}</p>
        </div>

        <div class="mini-settings-block" data-overlay-presence data-overlay-android-only hidden>
          <strong>${pt("pet.keepAliveBlock")}</strong>
          <p class="mini-app-lead" data-overlay-status>${pt("pet.keepAliveLead")}</p>
          <button type="button" class="mini-settings-row" data-overlay-request-permission>
            <i data-lucide="layers"></i>
            <span>${pt("pet.overlayPermission")}</span>
            <i data-lucide="chevron-right"></i>
          </button>
          <button type="button" class="mini-settings-row" data-overlay-oem-battery>
            <i data-lucide="battery-charging"></i>
            <span>${pt("pet.oemBattery")}</span>
            <i data-lucide="chevron-right"></i>
          </button>
          <button type="button" class="mini-settings-row" data-overlay-oem-autostart>
            <i data-lucide="power"></i>
            <span>${pt("pet.oemAutostart")}</span>
            <i data-lucide="chevron-right"></i>
          </button>
          <div data-overlay-help>
            <button type="button" class="mini-settings-row" data-overlay-oem-app>
              <i data-lucide="settings"></i>
              <span>${pt("pet.oemApp")}</span>
              <i data-lucide="chevron-right"></i>
            </button>
          </div>
        </div>

        <div class="mini-settings-block">
          <strong>${pt("pet.desktopBlock")}</strong>
          <label class="mini-pet-size">
            <span>${pt("pet.size")}</span>
            <input type="range" min="48" max="96" step="4" value="64" data-pet-float-size aria-label="${pt("pet.size")}" />
            <output data-pet-float-size-value>${pt("pet.sizeStandard")}</output>
          </label>
          <p class="mini-app-lead">${pt("pet.dockHint")}</p>
        </div>

        <div class="mini-settings-block">
          <strong>${pt("pet.libraryBlock")}</strong>
          <p class="mini-app-lead">${pt("pet.libraryLead")}</p>
          <div class="mini-pet-library" data-pet-library data-phone-pet-library>
            <div class="mini-pet-library__grid" data-pet-library-grid></div>
            <p class="mini-pet-library__status" data-pet-library-status aria-live="polite"></p>
          </div>
        </div>
      </div>
    </section>

    <section class="mini-view mini-profile" data-phone-screen="profile" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("apps.profile")}</strong><span>${pt("profile.subtitle")}</span></div>
        <button type="button" class="mini-icon-button" data-profile-add aria-label="${pt("profile.newCharacter")}"><i data-lucide="user-plus"></i></button>
      </header>
      <div class="mini-app-scroll mini-profile__scroll">
        <div class="mini-char-library" data-profile-character-list></div>

        <div class="mini-settings-block mini-profile-block">
          <strong data-phone-i18n="profile.behavior">${pt("profile.behavior")}</strong>
          ${switchHtml({ label: pt("profile.proactive"), labelKey: "profile.proactive", attrs: 'data-feature-flag="proactive"' })}
          <details class="mini-profile-fold mini-profile-fold--in-card">
            <summary data-phone-i18n="profile.moreSwitches">${pt("profile.moreSwitches")}</summary>
            ${switchHtml({ label: pt("profile.memoryRag"), labelKey: "profile.memoryRag", attrs: 'data-feature-flag="memoryRag"' })}
            ${switchHtml({ label: pt("profile.voice"), labelKey: "profile.voice", attrs: 'data-feature-flag="voice"' })}
          </details>
        </div>

        <details class="mini-settings-block mini-profile-block mini-profile-fold-card" data-proactive-wake-panel>
          <summary>
            <strong data-phone-i18n="profile.proactiveParams">${pt("profile.proactiveParams")}</strong>
            <span class="mini-profile-fold__hint" data-phone-i18n="profile.proactiveHint">${pt("profile.proactiveHint")}</span>
          </summary>
          <div class="mini-profile-fold__body">
            <label class="mini-slider">
              <span>${pt("profile.triggerProbability")} <em data-proactive-wake-out>100%</em></span>
              <input type="range" min="0" max="100" step="5" value="100" data-proactive-wake="probability" />
            </label>
            <label class="mini-slider">
              <span>${pt("profile.minSilence")} <em data-proactive-wake-out>${pt("profile.minutes", { n: 120 })}</em></span>
              <input type="range" min="5" max="720" step="5" value="120" data-proactive-wake="silenceMinMin" />
            </label>
            <label class="mini-slider">
              <span>${pt("profile.maxSilence")} <em data-proactive-wake-out>${pt("profile.minutes", { n: 120 })}</em></span>
              <input type="range" min="5" max="1440" step="5" value="120" data-proactive-wake="silenceMaxMin" />
            </label>
            <label class="mini-slider">
              <span>${pt("profile.checkInterval")} <em data-proactive-wake-out>${pt("profile.minutes", { n: 5 })}</em></span>
              <input type="range" min="1" max="60" step="1" value="5" data-proactive-wake="checkEveryMin" />
            </label>
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-proactive-wake-reset data-phone-i18n="profile.resetDefault">${pt("profile.resetDefault")}</button>
          </div>
        </details>

        <div class="mini-settings-block mini-profile-block">
          <strong data-phone-i18n="profile.worldbook">${pt("profile.worldbook")}</strong>
          <div class="mini-book-feed" data-phone-worldbook></div>
          <button type="button" class="mini-app-cta mini-app-cta--ghost" data-phone-open="worldbook" data-phone-i18n="profile.editAllEntries">${pt("profile.editAllEntries")}</button>
        </div>

        <div class="mini-settings-block mini-profile-block">
          <strong data-phone-i18n="profile.import">${pt("profile.import")}</strong>
          <button type="button" class="mini-app-cta mini-app-cta--ghost" data-phone-import-character data-phone-i18n="profile.importCharacterCard">${pt("profile.importCharacterCard")}</button>
          <button type="button" class="mini-app-cta mini-app-cta--ghost" data-phone-export-character>${pt("profile.exportCharacter")}</button>
        </div>
      </div>
    </section>

    <section class="mini-view mini-memory" data-phone-screen="memory" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("screens.memoryTitle")}</strong><span>${pt("apps.memory")}</span></div>
        <button type="button" class="mini-icon-button" data-session-summary-open data-phone-i18n-aria="memory.summarizeOpen" aria-label="${pt("memory.summarizeOpen")}"><i data-lucide="bookmark"></i></button>
      </header>
      <div class="mini-app-scroll">
        <article class="mini-stat-card">
          <strong data-memory-count>—</strong>
          <span>${pt("memory.searchable")}</span>
        </article>
        <form class="mini-search" data-phone-memory-search>
          <input type="search" name="q" maxlength="80" placeholder="${pt("memory.searchPlaceholder")}" aria-label="${pt("memory.searchAria")}" />
          <button type="submit" class="mini-icon-button" aria-label="${pt("screens.search")}"><i data-lucide="search"></i></button>
        </form>
        <div class="mini-memory-feed" data-phone-memory-list></div>
      </div>
      <div class="mini-pop-sheet" data-session-summary-sheet hidden>
        <button type="button" class="mini-pop-sheet__scrim" data-session-summary-close aria-label="${pt("memory.summarizeClose")}"></button>
        <div class="mini-pop-sheet__panel mini-pop-sheet__panel--session-summary" role="dialog" aria-modal="true" aria-labelledby="phone-session-summary-title">
          <header>
            <strong id="phone-session-summary-title">${pt("memory.summarizeOpen")}</strong>
            <button type="button" class="mini-icon-button" data-session-summary-close aria-label="${pt("memory.summarizeClose")}"><i data-lucide="x"></i></button>
          </header>
          <p class="mini-session-summary-hint">${t("mePanels.memory.summarizeHint")}</p>
          <div class="session-summary-list" data-session-summary-list></div>
          <p class="me-soft-status" data-session-summary-status hidden></p>
          <footer class="session-summary-footer">
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-session-summary-select-all>${t("mePanels.memory.summarizeSelectAll")}</button>
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-session-summary-clear>${t("mePanels.memory.summarizeClear")}</button>
            <button type="button" class="mini-app-cta" data-session-summary-write>${t("mePanels.memory.summarizeWrite")}</button>
          </footer>
        </div>
      </div>
      <div class="mini-pop-sheet" data-experience-archive-sheet hidden>
        <button type="button" class="mini-pop-sheet__scrim" data-experience-archive-close aria-label="关闭"></button>
        <div class="mini-pop-sheet__panel" role="dialog" aria-modal="true" aria-label="体验归档">
          <header class="mini-experience-archive__head">
            <strong data-experience-archive-title>体验归档</strong>
            <span data-experience-archive-meta></span>
          </header>
          <p class="mini-experience-archive__note">该体验已冻结，以下为只读归档摘要。</p>
          <div class="mini-experience-archive__body" data-experience-archive-body></div>
        </div>
      </div>
    </section>

    <section class="mini-view mini-read" data-phone-screen="read" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <button type="button" class="mini-icon-button" data-phone-reader-back hidden aria-label="${pt("screens.backToShelf")}"><i data-lucide="chevron-left"></i></button>
        <div><strong data-read-appbar-title>${pt("read.shelf")}</strong><span data-read-appbar-sub>${pt("read.shelfSub")}</span></div>
        <button type="button" class="mini-icon-button" data-phone-book-import data-phone-i18n-aria="read.importBook" aria-label="${pt("read.importBook")}"><i data-lucide="plus"></i></button>
      </header>
      <div class="mini-read-body mini-app-scroll" data-phone-pane-view="read-shelf">
        <p class="mini-read-hint">${pt("read.shelfHint")}</p>
        <div class="book-list mini-book-shelf" data-phone-books></div>
        <p class="mini-form__status" data-phone-book-status aria-live="polite" hidden></p>
        <input type="file" accept=".txt,.md,.epub,text/plain,text/markdown,application/epub+zip" multiple hidden data-phone-book-file />
      </div>
      <div class="mini-ebook" data-phone-pane-view="read-reader" hidden>
        <header class="mini-ebook-chrome" data-ebook-chrome hidden>
          <button type="button" class="mini-icon-button" data-phone-reader-back aria-label="${pt("screens.backToShelf")}"><i data-lucide="chevron-left"></i></button>
          <div class="mini-ebook-chrome__meta">
            <strong data-phone-reader-title>—</strong>
            <span data-phone-reader-progress>1 / 1</span>
          </div>
          <button type="button" class="mini-icon-button" data-ebook-theme-toggle aria-label="${pt("read.themeToggle")}"><i data-lucide="sun-moon"></i></button>
        </header>
        <div class="mini-ebook-viewport reader-engine-viewport" data-ebook-viewport>
          <div class="reader-engine-pages" data-reader-pages data-ebook-flow data-phone-reader-body></div>
          <button type="button" class="mini-ebook-zone mini-ebook-zone--prev" data-ebook-prev aria-label="${pt("read.prevPage")}" tabindex="-1"></button>
          <button type="button" class="mini-ebook-zone mini-ebook-zone--next" data-ebook-next aria-label="${pt("read.nextPage")}" tabindex="-1"></button>
          <button type="button" class="mini-ebook-zone mini-ebook-zone--center" data-ebook-toggle-chrome aria-label="${pt("read.toggleChrome")}" tabindex="-1"></button>
        </div>
        <div class="mini-ebook-footer" data-ebook-chrome-footer hidden>
          <span data-ebook-page-label>1 / 1</span>
        </div>
        <div class="mini-ebook-select-bar" data-ebook-select-bar hidden>
          <button type="button" data-ebook-hl>${pt("read.highlight")}</button>
          <button type="button" data-ebook-ask>${pt("read.askTa")}</button>
          <button type="button" data-ebook-copy>${pt("read.copy")}</button>
        </div>
        <aside class="mini-ebook-comment" data-ebook-comment hidden>
          <blockquote data-ebook-comment-quote></blockquote>
          <div class="mini-ebook-comment__body" data-ebook-comment-body></div>
          <div class="mini-ebook-comment__actions">
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-ebook-comment-close>${pt("read.closeComment")}</button>
            <button type="button" class="mini-app-cta" data-ebook-continue-chat>${pt("read.continueChat")}</button>
          </div>
        </aside>
      </div>
    </section>

    <section class="mini-view mini-lab" data-phone-screen="lab" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("apps.lab")}</strong><span>${pt("lab.subtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-app-scroll">
        <section class="mini-form" data-provider-managed-only hidden>
          <strong class="mini-form__title">${pt("settings.subscriptionMode")}</strong>
          <p class="mini-form__lead">${pt("settings.managedApiLead")}</p>
          <p class="mini-form__lead">订阅模式下朗读与语音转写走云端语音，按额度扣费；无需再填 OpenAI/ElevenLabs Key。</p>
          <p class="mini-form__status" data-product-access-status></p>
        </section>
        <form class="mini-form" data-phone-hosted-voice-form data-provider-managed-only hidden>
          <strong class="mini-form__title">${pt("lab.hostedVoice")}</strong>
          <p class="mini-form__lead mini-form__lead--warn" data-hosted-voice-setup-needed hidden>${pt("lab.hostedVoiceSetupNeeded")}</p>
          <p class="mini-form__lead">${pt("lab.hostedVoiceHint")}</p>
          <label><span>${pt("lab.hostedVoice")}</span><select name="hostedVoiceType" data-hosted-voice-select data-hosted-voice-scope="user"></select></label>
          <button type="submit" class="mini-app-cta">${pt("lab.saveHostedVoice")}</button>
        </form>
        <form class="mini-form" data-phone-provider-form data-provider-byok-only>
          <strong class="mini-form__title">${pt("lab.model")}</strong>
          <p class="mini-form__lead" data-lab-service-status>${pt("lab.detecting")}</p>
          <label><span>Base URL</span><input name="baseUrl" placeholder="https://api.openai.com/v1" autocomplete="off" /></label>
          <label><span>Model</span><input name="model" placeholder="ep-xxxxxxxx" autocomplete="off" /></label>
          <label><span>API Key</span><input name="apiKey" type="password" placeholder="ark-..." autocomplete="off" /></label>
          <div class="mini-form__row">
            <button type="submit" class="mini-app-cta">${pt("lab.saveModel")}</button>
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-lab-fill-ark>${pt("lab.fillArk")}</button>
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-lab-test-model>${pt("lab.testConnection")}</button>
          </div>
          <p class="mini-form__status" data-lab-model-status aria-live="polite"></p>
        </form>
        <form class="mini-form" data-phone-voice-form data-provider-byok-only>
          <strong class="mini-form__title">${pt("lab.voice")}</strong>
          <span class="mini-form__title">TTS Provider</span>
          ${ttsSegmented("OpenAI")}
          <input type="hidden" name="ttsProvider" value="OpenAI" data-tts-provider />
          <label><span>TTS Key</span><input name="ttsApiKey" type="password" autocomplete="off" /></label>
          <label><span>Voice / Model</span><input name="voiceId" placeholder="alloy / voice id" autocomplete="off" /></label>
          <label><span>STT Key</span><input name="sttApiKey" type="password" placeholder="${pt("lab.sttKeyPlaceholder")}" autocomplete="off" /></label>
          <label><span>STT Model</span><input name="sttModel" placeholder="whisper-1" autocomplete="off" /></label>
          ${switchHtml({ label: pt("lab.autoSpeak"), attrs: 'data-voice-autospeak name="autoSpeak"' })}
          <div class="mini-form__row">
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-lab-test-tts>${pt("lab.testTts")}</button>
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-lab-test-stt>${pt("lab.testStt")}</button>
          </div>
          <p class="mini-form__status" data-lab-voice-status aria-live="polite"></p>
          <button type="submit" class="mini-app-cta">${pt("lab.saveVoice")}</button>
        </form>
        <form class="mini-form" data-phone-imagegen-form data-provider-byok-only>
          <strong class="mini-form__title">${pt("lab.imagegen")}</strong>
          <p class="mini-form__lead">${pt("lab.imagegenLead")}</p>
          <label><span>Base URL</span><input name="baseUrl" placeholder="${pt("lab.baseUrlFollowModel")}" autocomplete="off" /></label>
          <label><span>API Key</span><input name="apiKey" type="password" placeholder="${pt("lab.savedLocally")}" autocomplete="off" /></label>
          <label><span>Model</span><input name="model" placeholder="dall-e-3" autocomplete="off" /></label>
          <div class="mini-form__field">
            <span>${pt("lab.defaultSize")}</span>
            ${segmentedHtml({
              options: [
                { id: "1024x1024", label: "1024×1024" },
                { id: "512x512", label: "512×512" },
                { id: "1792x1024", label: "1792×1024" },
                { id: "1024x1792", label: "1024×1792" },
              ],
              activeId: "1024x1024",
              dataAttr: 'data-imagegen-sizes aria-label="' + pt("lab.defaultSize") + '"',
            })}
            <input type="hidden" name="defaultSize" value="1024x1024" />
          </div>
          <button type="submit" class="mini-app-cta">${pt("lab.saveImagegen")}</button>
        </form>
      </div>
    </section>
  `;
}

export function buildStudioScreenHtml() {
  return `
    <section class="mini-view mini-studio-host" data-phone-screen="studio" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("studio.title")}</strong><span>${pt("studio.subtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-studio-mount mini-app-scroll" data-studio-mount></div>
    </section>
  `;
}

/** Experience package editor — distinct from imagegen studio (`studio`). */
export function buildExperienceStudioScreenHtml() {
  return `
    <section class="mini-view mini-experience-studio-host" data-phone-screen="experience-studio" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("experienceStudio.title")}</strong><span>${pt("experienceStudio.subtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-experience-studio-mount mini-app-scroll" data-experience-studio-mount></div>
    </section>
  `;
}

export function buildDiaryScreenHtml() {
  return `
    <section class="mini-view mini-diary" data-phone-screen="diary" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("screens.diaryTitle")}</strong><span>${pt("diary.bookTitle")}</span></div>
        <div class="mini-diary-appbar-actions">
          <button type="button" class="mini-icon-button" data-phone-diary-generate aria-label="${pt("diary.generate")}">
            <i data-lucide="sparkles"></i>
          </button>
        </div>
      </header>
      <div class="mini-diary-host companion-page mini-app-scroll">
        <div class="memory-layout memory-layout--gallery" data-memory-gallery data-phone-memory-gallery>
          ${memoryGalleryInnerHtml()}
        </div>
      </div>
    </section>
  `;
}

export function buildGalleryScreenHtml() {
  return `
    <section class="mini-view mini-gallery" data-phone-screen="gallery" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-gallery-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("apps.gallery")}</strong><span data-gallery-title>${pt("gallery.myGroups")}</span></div>
        <button type="button" class="mini-icon-button" data-gallery-action="add-group" aria-label="${pt("gallery.addGroup")}"><i data-lucide="folder-plus"></i></button>
      </header>
      <div class="mini-gallery-body">
        <div class="mini-app-scroll" data-gallery-pane="stacks">
          <p class="mini-gallery-hint">${pt("gallery.hint")}</p>
          <div class="mini-album-stacks" data-phone-album-stacks></div>
        </div>
        <div class="mini-app-scroll" data-gallery-pane="grid" hidden>
          <div class="mini-album-grid" data-phone-album-grid></div>
        </div>
      </div>
      <input type="file" accept="image/*" multiple hidden data-gallery-file />
      <div class="mini-album-lightbox" data-phone-album-lightbox hidden>
        <button type="button" class="mini-album-lightbox__close" data-lightbox-close aria-label="${pt("screens.close")}"><i data-lucide="x"></i></button>
        <img data-lightbox-img alt="" />
        <div class="mini-album-lightbox__qa" data-lightbox-qa hidden>
          <button type="button" data-identity-qa="passed">${pt("gallery.qaPass")}</button>
          <button type="button" data-identity-qa="failed">${pt("gallery.qaFail")}</button>
          <button type="button" data-identity-qa="pending">${pt("gallery.qaPending")}</button>
        </div>
        <div class="mini-album-lightbox__dots" data-lightbox-dots></div>
      </div>
    </section>
  `;
}

export function buildBeautifyScreenHtml({
  wallpaperButtons = "",
  widgets = {},
} = {}) {
  return `
    <section class="mini-view mini-beautify" data-phone-screen="beautify" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("apps.beautify")}</strong><span>${pt("beautify.subtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-beautify-body mini-app-scroll">
        <div class="mini-settings-block">
          <strong>${pt("beautify.wallpaperSection")}</strong>
          <div class="mini-wallpaper-targets">
            <button type="button" class="mini-wallpaper-target" data-wallpaper-target="lock">
              <span class="mini-wallpaper-target__preview" data-wallpaper-preview="lock"></span>
              <em>${pt("beautify.lockScreen")}</em>
            </button>
            <button type="button" class="mini-wallpaper-target" data-wallpaper-target="home">
              <span class="mini-wallpaper-target__preview" data-wallpaper-preview="home"></span>
              <em>${pt("beautify.homeScreen")}</em>
            </button>
          </div>
          <p class="mini-app-lead">${pt("beautify.wallpaperLead")}</p>
        </div>
        <div class="mini-settings-block">
          <strong>${pt("beautify.presets")}</strong>
          <div class="mini-wallpaper-picks" data-wallpaper-picks>${wallpaperButtons}</div>
          <p class="mini-app-lead">${pt("beautify.presetsLead")}</p>
        </div>
        <div class="mini-settings-block">
          <strong>${pt("beautify.widgets")}</strong>
          <strong>${pt("beautify.homeWidgets")}</strong>
          <p class="mini-app-lead">${pt("beautify.widgetsLead")}</p>
          ${switchHtml({ label: pt("beautify.clockGreeting"), checked: widgets.clock, attrs: 'data-widget-toggle="clock"' })}
          ${switchHtml({ label: pt("beautify.calendarWidget"), checked: widgets.calendar !== false, attrs: 'data-widget-toggle="calendar"' })}
          ${switchHtml({ label: pt("beautify.listenWidget"), checked: widgets.listen !== false, attrs: 'data-widget-toggle="listen"' })}
        </div>
        <div class="mini-beautify-contact" data-beautify-contact>
          <strong data-beautify-contact-title>${pt("beautify.contactTitle")}</strong>
          <p data-beautify-contact-blurb>${pt("beautify.contactBlurb")}</p>
          <div class="mini-beautify-contact__row" data-beautify-contact-github-row>
            <span>${pt("beautify.github")}</span>
            <a class="mini-beautify-contact__value" data-beautify-contact-github href="https://github.com/azhimiao/Nyra-yueqi" target="_blank" rel="noopener noreferrer">github.com/azhimiao/Nyra-yueqi</a>
            <a class="mini-beautify-contact__copy" data-beautify-contact-github-action href="https://github.com/azhimiao/Nyra-yueqi" target="_blank" rel="noopener noreferrer">${pt("beautify.openProject")}</a>
          </div>
          <div class="mini-beautify-contact__row">
            <span>${pt("beautify.discord")}</span>
            <em data-beautify-contact-discord>—</em>
            <button type="button" class="mini-beautify-contact__copy" data-beautify-copy-discord>${pt("screens.copy")}</button>
          </div>
          <div class="mini-beautify-contact__row">
            <span>${pt("beautify.wechat")}</span>
            <em data-beautify-contact-wechat>—</em>
            <button type="button" class="mini-beautify-contact__copy" data-beautify-copy-wechat>${pt("screens.copy")}</button>
          </div>
          <div class="mini-beautify-contact__row">
            <span>${pt("beautify.qqGroup")}</span>
            <em data-beautify-contact-qq-group>—</em>
            <button type="button" class="mini-beautify-contact__copy" data-beautify-copy-qq-group>${pt("screens.copy")}</button>
          </div>
          <div class="mini-beautify-contact__row" data-beautify-contact-email-row hidden>
            <span>${pt("beautify.email")}</span>
            <em data-beautify-contact-email></em>
            <button type="button" class="mini-beautify-contact__copy" data-beautify-copy-email>${pt("screens.copy")}</button>
          </div>
          <div class="mini-beautify-contact__row">
            <span>${pt("beautify.qq")}</span>
            <em data-beautify-contact-qq>—</em>
            <button type="button" class="mini-beautify-contact__copy" data-beautify-copy-qq>${pt("screens.copy")}</button>
          </div>
          <p class="mini-beautify-contact__note" data-beautify-contact-note></p>
          <p class="mini-beautify-contact__status" data-beautify-contact-status aria-live="polite"></p>
        </div>
      </div>
      <div class="mini-wallpaper-sheet" data-wallpaper-sheet hidden>
        <button type="button" class="mini-wallpaper-sheet__backdrop" data-wallpaper-sheet-close aria-label="${pt("screens.close")}"></button>
        <div class="mini-wallpaper-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="mini-wallpaper-sheet-title">
          <header>
            <strong id="mini-wallpaper-sheet-title" data-wallpaper-sheet-title>${pt("beautify.changeWallpaper")}</strong>
            <button type="button" class="mini-icon-button" data-wallpaper-sheet-close aria-label="${pt("screens.close")}"><i data-lucide="x"></i></button>
          </header>
          <div class="mini-wallpaper-picks" data-wallpaper-sheet-picks>${wallpaperButtons}</div>
          <label class="mini-wallpaper-upload">
            <input type="file" accept="image/*" hidden data-wallpaper-file />
            <span>${pt("beautify.uploadImage")}</span>
          </label>
          <label class="mini-wallpaper-url">
            <span>${pt("beautify.imageUrl")}</span>
            <input type="url" inputmode="url" placeholder="https://…" data-wallpaper-url />
          </label>
          <div class="mini-wallpaper-sheet__actions">
            <button type="button" class="mini-app-cta" data-wallpaper-url-save>${pt("beautify.saveUrl")}</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function buildSettingsHubHtml({
  localeId = "zh-CN",
  passcodeEnabled = false,
} = {}) {
  return `
    <section class="mini-view mini-settings" data-phone-screen="settings" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("screens.settingsTitle")}</strong><span>${pt("jobs.settings")}</span></div>
        <span></span>
      </header>
      <div class="mini-settings-list mini-app-scroll" data-phone-pane-view="settings-home">
        <div class="mini-settings-block mini-settings-block--account">
          <strong>${pt("settings.account")}</strong>
          <p class="mini-app-lead" data-phone-account-status>${pt("settings.accountStatus")}</p>
        </div>
        <div class="mini-settings-block mini-settings-block--primary">
          <strong>${pt("settings.createAndData")}</strong>
          <p class="mini-app-lead">${pt("settings.createLead")}</p>
          <button type="button" class="mini-settings-row" data-phone-open="activity"><i data-lucide="activity"></i><span>${pt("apps.activity")}</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-phone-open="autonomy"><i data-lucide="heart-handshake"></i><span>${pt("settings.companionAutonomy")}</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-phone-open="agent-perms"><i data-lucide="shield"></i><span>${pt("apps.agentPerms")}</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-phone-open="tasks"><i data-lucide="list-checks"></i><span>${pt("apps.tasks")}</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-phone-open="worldbook"><i data-lucide="book-marked"></i><span>${pt("settings.worldbookTitle")}</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-phone-open="presets"><i data-lucide="message-square-quote"></i><span>${pt("settings.presetsTitle")}</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-phone-open="backup"><i data-lucide="hard-drive-download"></i><span>${pt("settings.backupTitle")}</span><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="mini-settings-block" data-lock-settings>
          <strong data-phone-i18n="settings.lockScreen">${pt("settings.lockScreen")}</strong>
          ${switchHtml({ label: pt("settings.enablePasscode"), labelKey: "settings.enablePasscode", checked: passcodeEnabled, attrs: "data-passcode-enabled" })}
          <button type="button" class="mini-settings-row" data-passcode-fold-toggle ${passcodeEnabled ? "" : "hidden"}>
            <i data-lucide="key-round"></i>
            <span data-phone-i18n="settings.changePasscode">${pt("settings.changePasscode")}</span>
            <i data-lucide="chevron-right" data-passcode-fold-chevron></i>
          </button>
          <div class="mini-settings-fold" data-passcode-fold hidden>
            <label class="mini-settings-passcode">
              <span data-phone-i18n="settings.passcode">${pt("settings.passcode")}</span>
              <input type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" data-passcode-input data-phone-i18n-aria="settings.passcodeAria" aria-label="${pt("settings.passcodeAria")}" />
            </label>
            <p class="mini-form-hint" data-phone-i18n="settings.passcodeHint">${pt("settings.passcodeHint")}</p>
          </div>
          <button type="button" class="mini-settings-row" data-phone-lock-now><i data-lucide="lock"></i><span data-phone-i18n="settings.lockNow">${pt("settings.lockNow")}</span><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="mini-settings-block">
          <strong>${pt("settings.language")}</strong>
          ${localeSegmented(localeId)}
        </div>
        <div class="mini-settings-block">
          <strong>${pt("settings.firstRun")}</strong>
          <p class="mini-app-lead">${pt("settings.firstRunLead")}</p>
          <button type="button" class="mini-settings-row" data-reset-onboarding><i data-lucide="rotate-ccw"></i><span>${pt("settings.resetGuide")}</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-reset-first-light><i data-lucide="sparkles"></i><span>${pt("settings.resetFirstLight")}</span><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="mini-settings-block">
          <strong>${pt("settings.uiVersion")}</strong>
          <p class="mini-app-lead">${pt("settings.uiVersionLead")}</p>
          ${segmentedHtml({
            options: [
              { id: "phone", label: pt("settings.phoneUi") },
              { id: "app", label: pt("settings.appUi") },
            ],
            activeId: "phone",
            dataAttr: "data-phone-ui-modes",
          })}
        </div>
        <div class="mini-settings-block">
          <strong>${pt("settings.appearance")}</strong>
          <button type="button" class="mini-settings-row" data-phone-open="beautify"><i data-lucide="palette"></i><span>${pt("settings.wallpaperWidgets")}</span><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="mini-settings-block">
          <strong>${pt("settings.modelApi")}</strong>
          <p class="mini-app-lead">${pt("settings.modelApiLead")}</p>
          <button type="button" class="mini-settings-row" data-phone-open="lab"><i data-lucide="plug-zap"></i><span>${pt("settings.openLab")}</span><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="mini-settings-block">
          <p class="mini-app-lead">
            <a href="https://azhimiao.github.io/legal/?doc=terms&amp;lang=zh-CN" target="_blank" rel="noopener noreferrer" data-legal-document="terms">${pt("settings.terms")}</a>
            ${pt("settings.legalConsentJoin")}
            <a href="https://azhimiao.github.io/legal/?doc=privacy&amp;lang=zh-CN" target="_blank" rel="noopener noreferrer" data-legal-document="privacy">${pt("settings.privacy")}</a>
          </p>
        </div>
        <details class="mini-settings-advanced">
          <summary>${pt("settings.advanced")}</summary>
          <p class="mini-app-lead" style="margin:0 0 8px">${pt("settings.advancedLead")}</p>
          <button type="button" class="mini-settings-row" data-phone-open="regex"><i data-lucide="filter"></i><span>${pt("settings.regexTitle")}</span><i data-lucide="chevron-right"></i></button>
          ${buildGateSettingsSectionsHtml({ localChatEnabled: false })}
          <button type="button" class="mini-settings-row" data-phone-open="devtools" data-devtools-entry hidden><i data-lucide="bug"></i><span>${pt("apps.devtools")}</span><i data-lucide="chevron-right"></i></button>
        </details>
      </div>
    </section>
    ${buildWorldbookScreenHtml()}
    ${buildPresetsScreenHtml()}
    ${buildRegexScreenHtml()}
    ${buildBackupScreenHtml()}
  `;
}

export function buildWorldbookScreenHtml() {
  return `
    <section class="mini-view mini-worldbook" data-phone-screen="worldbook" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.backToSettings")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("settings.worldbookTitle")}</strong><span>${pt("settings.worldbookSub")}</span></div>
        <button type="button" class="mini-icon-button" data-phone-wb-add aria-label="${pt("settings.worldbookAdd")}"><i data-lucide="plus"></i></button>
      </header>
      <div class="mini-app-scroll" data-phone-wb-list-pane>
        <p class="mini-app-lead">${pt("settings.worldbookLead")}</p>
        <div class="mini-wb-list" data-phone-wb-list></div>
      </div>
      <div class="mini-app-scroll" data-phone-wb-edit-pane hidden>
        <form class="mini-form" data-phone-wb-form>
          <input type="hidden" name="id" data-wb-id />
          <label><span>${pt("screens.title")}</span><input name="title" maxlength="40" required placeholder="${pt("settings.worldbookTitlePlaceholder")}" autocomplete="off" /></label>
          <label><span>${pt("settings.category")}</span><input name="category" maxlength="24" placeholder="${pt("settings.worldbookCategoryPlaceholder")}" autocomplete="off" /></label>
          <label><span>${pt("settings.triggers")}</span><input name="triggersText" maxlength="120" placeholder="${pt("settings.worldbookTriggersPlaceholder")}" autocomplete="off" /></label>
          <label><span>${pt("settings.content")}</span><textarea name="content" rows="6" maxlength="2000" required placeholder="${pt("settings.worldbookContentPlaceholder")}"></textarea></label>
          <label class="mini-settings-row mini-settings-row--field"><span>${pt("settings.priority")}</span><input name="priority" type="number" min="0" max="100" value="50" /></label>
          <label class="mini-switch-row"><span>${pt("settings.enabled")}</span><input type="checkbox" name="enabled" checked data-wb-enabled /></label>
          <div class="mini-form__actions">
            <button type="submit" class="mini-app-cta">${pt("screens.save")}</button>
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-phone-wb-cancel>${pt("screens.cancel")}</button>
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-phone-wb-delete hidden>${pt("screens.delete")}</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

export function buildPresetsScreenHtml() {
  return `
    <section class="mini-view mini-presets" data-phone-screen="presets" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.backToSettings")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("settings.presetsTitle")}</strong><span>${pt("settings.presetsSub")}</span></div>
        <span></span>
      </header>
      <div class="mini-app-scroll mini-settings-mount" data-phone-presets-mount></div>
    </section>
  `;
}

export function buildRegexScreenHtml() {
  return `
    <section class="mini-view mini-regex" data-phone-screen="regex" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.backToSettings")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("settings.regexTitle")}</strong><span>${pt("settings.regexSub")}</span></div>
        <span></span>
      </header>
      <div class="mini-app-scroll mini-settings-mount" data-phone-regex-mount></div>
    </section>
  `;
}

export function buildBackupScreenHtml() {
  return `
    <section class="mini-view mini-backup" data-phone-screen="backup" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.backToSettings")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("settings.backupTitle")}</strong><span>${pt("settings.backupSub")}</span></div>
        <span></span>
      </header>
      <div class="mini-app-scroll">
        <div class="mini-settings-block">
          <strong>${pt("backup.title")}</strong>
          <p class="mini-app-lead">${pt("backup.lead")}</p>
          <button type="button" class="mini-settings-row" data-phone-backup-export-nyra><i data-lucide="download"></i><span>${pt("backup.export")}</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-phone-backup-import><i data-lucide="upload"></i><span>${pt("backup.import")}</span><i data-lucide="chevron-right"></i></button>
          <input type="file" accept=".nyra,.json,.zip,application/json,application/zip,application/vnd.nyra.archive" data-phone-backup-input hidden />
        </div>
        <p class="mini-form__status" data-phone-backup-status aria-live="polite"></p>
      </div>
    </section>
  `;
}

/** 剧章 / 共创 / 游戏 — mount 宿主 */
export function buildStoryScreenHtml() {
  return `
    <section class="mini-view mini-story-host" data-phone-screen="story" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("story.title")}</strong><span>${pt("story.subtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-story-mount" data-story-mount></div>
    </section>
  `;
}

export function buildCocreateScreenHtml() {
  return `
    <section class="mini-view mini-cocreate-host" data-phone-screen="cocreate" hidden>
      <div class="mini-cocreate-mount" data-cocreate-mount></div>
    </section>
  `;
}

export function buildScrollScreenHtml() {
  return `
    <section class="mini-view mini-scroll-host" data-phone-screen="scroll" hidden>
      <div class="mini-scroll-mount" data-scroll-mount></div>
    </section>
  `;
}

export function buildAdventureScreenHtml() {
  return `
    <section class="mini-view mini-adventure-host" data-phone-screen="adventure" hidden>
      <div class="mini-adventure-mount" data-adventure-mount></div>
    </section>
  `;
}

export function buildGamesScreenHtml() {
  return `
    <section class="mini-view mini-games-host" data-phone-screen="games" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("apps.games")}</strong><span>${pt("games.subtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-games-mount" data-games-mount></div>
    </section>
  `;
}

export function buildAssetsScreenHtml() {
  return `
    <section class="mini-view mini-assets-host" data-phone-screen="assets" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("apps.assets")}</strong><span>${pt("assets.subtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-assets-mount" data-assets-mount></div>
    </section>
  `;
}

/** @deprecated 查手机已下线 — 保留空函数以免旧 import 崩。 */
export function buildSidewriteScreenHtml() {
  return "";
}

/** 一起听 — 播放器 + 曲目列表 */
export function buildListenScreenHtml() {
  return `
    <section class="mini-view mini-listen" data-phone-screen="listen" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong data-phone-i18n="listen.screenTitle">${pt("listen.screenTitle")}</strong><span data-phone-i18n="listen.screenSubtitle">${pt("listen.screenSubtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-listen-body">
        <div class="mini-listen-stage">
          <div class="mini-listen-vinyl" data-listen-vinyl aria-hidden="true">
            <div class="mini-listen-vinyl__disc" data-listen-vinyl-disc>
              <span class="mini-listen-vinyl__ring"></span>
              <span class="mini-listen-vinyl__label" data-listen-vinyl-label></span>
              <span class="mini-listen-vinyl__hole"></span>
            </div>
            <div class="mini-listen-vinyl__arm"></div>
          </div>
          <div class="mini-listen-now">
            <strong data-listen-track data-phone-i18n="listen.pickTrack">${pt("listen.pickTrack")}</strong>
            <p data-listen-playlist data-phone-i18n="listen.localPlaylist">${pt("listen.localPlaylist")}</p>
          </div>
          <div class="mini-listen-controls">
            <div class="mini-listen-times">
              <span data-listen-pos>0:00</span>
              <span data-listen-dur>--:--</span>
            </div>
            <input type="range" class="mini-listen-seek" min="0" max="1000" value="0" data-listen-seek data-phone-i18n-aria="listen.seekLabel" aria-label="${pt("listen.seekLabel")}" />
            <button type="button" class="mini-listen-play" data-listen-play data-haptic="medium-light" data-phone-i18n-aria="listen.play" aria-label="${pt("listen.play")}" disabled>
              <i data-lucide="play"></i>
            </button>
            <p class="mini-listen-hint" data-listen-hint data-phone-i18n="listen.noPlayableAudio" hidden>${pt("listen.noPlayableAudio")}</p>
          </div>
          ${switchHtml({ labelKey: "listen.coListen", label: pt("listen.coListen"), checked: true, attrs: 'data-listen-colisten', rowClass: "mini-listen-colisten" })}
          <aside class="mini-listen-companion">
            <span class="mini-listen-companion__avatar" data-phone-character-avatar><span class="mini-avatar-fallback" aria-hidden="true">N</span></span>
            <div>
              <strong><span data-phone-name>${pt("home.someone")}</span><em data-phone-i18n="listen.companionState">正在一起听</em></strong>
              <p data-phone-i18n="listen.companionNote">我在这里。选好以后，我们一起听。</p>
            </div>
            <i data-lucide="audio-waveform" aria-hidden="true"></i>
          </aside>
        </div>
        <section class="mini-listen-sheet" data-listen-sheet>
          <header class="mini-listen-sheet__head">
            <button type="button" class="mini-listen-sheet__toggle" data-listen-sheet-toggle aria-expanded="true">
              <strong data-phone-i18n="listen.playlist">${pt("listen.playlist")}</strong>
              <span data-listen-track-count>${pt("listen.trackCount", { count: 0 })}</span>
              <i data-lucide="chevron-down" data-listen-sheet-chevron></i>
            </button>
            <div class="mini-listen-sheet__actions">
              <button type="button" class="mini-icon-button" data-listen-import data-phone-i18n-aria="listen.importAudio" aria-label="${pt("listen.importAudio")}">
                <i data-lucide="plus"></i>
              </button>
              <button type="button" class="mini-icon-button" data-listen-edit data-phone-i18n-aria="listen.editPlaylist" aria-label="${pt("listen.editPlaylist")}">
                <i data-lucide="pencil"></i>
              </button>
            </div>
          </header>
          <div class="mini-listen-sheet__body" data-listen-sheet-body>
            <div class="mini-listen-tracks" data-phone-tracks></div>
          </div>
          <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg" multiple hidden data-listen-file />
        </section>
      </div>
      <audio data-listen-audio hidden></audio>
    </section>
  `;
}

export function buildShopScreenHtml() {
  return `
    <section class="mini-view mini-shop" data-phone-screen="shop" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="${pt("screens.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong data-shop-appbar-title>${pt("apps.shop")}</strong><span data-shop-appbar-sub>${pt("jobs.shop")}</span></div>
        <span class="mini-shop-balance" data-shop-balance>—</span>
      </header>
      <nav class="mini-shop-tabs" aria-label="${pt("shop.tabsLabel")}">
        <button type="button" class="mini-shop-tab is-active" data-shop-tab="catalog">${pt("shop.catalog")}</button>
        <button type="button" class="mini-shop-tab" data-shop-tab="bag">${pt("shop.bag")}</button>
        <button type="button" class="mini-shop-tab" data-shop-tab="orders">${pt("shop.orders")}</button>
      </nav>
      <div class="mini-app-scroll" data-phone-pane-view="shop-catalog">
        <div class="mini-shop-hero" aria-hidden="true">
          <strong>${pt("shop.heroTitle")}</strong>
          <p>${pt("shop.heroSub")}</p>
        </div>
        <div class="mini-shop-workbench" aria-label="${pt("shop.creationAndWorks")}">
          <button type="button" data-shop-open-studio>
            <span><i data-lucide="pen-line"></i></span>
            <strong>${pt("shop.creationStudio")}</strong>
            <small>${pt("shop.creationStudioLead")}</small>
            <i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>
          <button type="button" data-shop-open-assets>
            <span><i data-lucide="archive"></i></span>
            <strong>${pt("shop.myWorks")}</strong>
            <small>${pt("shop.myWorksLead")}</small>
            <i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>
        </div>
        <label class="mini-shop-search">
          <i data-lucide="search"></i>
          <input type="search" data-shop-search placeholder="${pt("shop.searchPlaceholder")}" enterkeyhint="search" />
        </label>
        <div class="mini-shop-cats" data-shop-cats></div>
        <div class="mini-shop-grid" data-shop-grid></div>
      </div>
      <div class="mini-app-scroll" data-phone-pane-view="shop-bag" hidden>
        <div class="mini-shop-orders" data-shop-bag></div>
      </div>
      <div class="mini-app-scroll" data-phone-pane-view="shop-orders" hidden>
        <div class="mini-shop-orders" data-shop-orders></div>
      </div>
      <div class="mini-app-scroll" data-phone-pane-view="shop-product" hidden>
        <div data-shop-product></div>
      </div>
      <div class="mini-app-scroll" data-phone-pane-view="shop-detail" hidden>
        <div data-shop-detail></div>
      </div>
      <div class="mini-app-scroll" data-phone-pane-view="shop-studio" hidden>
        <div class="mini-shop-economy" data-shop-studio></div>
      </div>
      <div class="mini-app-scroll" data-phone-pane-view="shop-assets" hidden>
        <div class="mini-shop-economy" data-shop-assets></div>
      </div>
      <div class="mini-shop-economy-sheet" data-shop-economy-sheet hidden>
        <button type="button" class="mini-shop-economy-sheet__backdrop" data-shop-economy-close aria-label="关闭"></button>
        <section class="mini-shop-economy-sheet__panel" role="dialog" aria-modal="true" data-shop-economy-sheet-panel></section>
      </div>
      <div class="mini-shop-confirm" data-shop-confirm hidden>
        <button type="button" class="mini-shop-confirm__backdrop" data-confirm-close aria-label="${pt("screens.close")}"></button>
        <div class="mini-shop-confirm__panel" role="dialog" aria-modal="true" aria-labelledby="mini-shop-confirm-title">
          <header>
            <strong id="mini-shop-confirm-title">${pt("shop.confirmPurchase")}</strong>
            <button type="button" class="mini-icon-button" data-confirm-close aria-label="${pt("screens.close")}"><i data-lucide="x"></i></button>
          </header>
          <div class="mini-shop-confirm__product">
            <span class="mini-shop-confirm__emoji" data-confirm-emoji>🎁</span>
            <div>
              <strong data-confirm-title>—</strong>
              <em>${pt("shop.payPrefix")}<span data-confirm-amount>—</span></em>
              <p>${pt("shop.balancePrefix")}<span data-confirm-balance>—</span></p>
            </div>
          </div>
          <p class="mini-shop-confirm__hint">${pt("shop.virtualHint")}</p>
          <p class="mini-shop-confirm__error" data-confirm-error hidden></p>
          <div class="mini-shop-confirm__actions">
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-confirm-cancel>${pt("screens.cancel")}</button>
            <button type="button" class="mini-app-cta" data-confirm-submit>${pt("shop.confirmPurchase")}</button>
          </div>
        </div>
      </div>
    </section>
  `;
}
