import { escapeHtml, readLocalObject, writeLocalObject } from "../lib/utils.js";
import { resolveCallUserAs } from "../chat/opening-intro.js";
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";
import { applyPhoneI18n, getLocale, phoneAppLabel, pt } from "./i18n.js";
import { warnIfChineseUiLeak } from "../i18n/leak-guard.js";
import { COMPANION_CHANGED_EVENT, CHARACTERS_CHANGED_EVENT, getActiveCharacterId, getCharacterSync, listCharacters, setActiveCharacterId, createCharacter, deleteCharacter } from "../characters/store.js";
import {
  applyDraft,
  getSharedCharacterEditorService,
} from "../characters/editor-service.js";
import {
  bindOriginMemoryEditor,
  commitOriginMemoryEditor,
  originMemoryEditorInnerMarkup,
} from "../characters/origin-memory-editor.js";
import { listOriginMemoriesForCharacters, toOriginMemoryDraft } from "../characters/origin-memories.js";
import {
  getSharedCharacterEditorController,
  identityPatchFromProfileState,
} from "../characters/editor-controller.js";
import {
  POP_CONTACTS_CHANGED_EVENT,
  addContact,
  ensurePopContactsMigrated,
  listContactCharacters,
  listContacts,
  listNonContactCharacters,
  removeContact,
} from "../characters/contacts.js";
import { isRealCharacterAvatar, resolveCharacterAvatarUrl } from "../characters/avatar.js";
import { COMPANION_V2_LIMITS } from "../contracts/companion-v2-shared.js";
import { getChatFocus, CHAT_FOCUS_CHANGED_EVENT } from "../characters/session-context.js";
import { onCompanionSessionEnd } from "../companion/session-hooks.js";
import { listPopSessions, openDm, openGroup } from "../characters/sessions.js";
import { createGroupConversation } from "../characters/group-chat.js";
import { mountScenarioTheater } from "../scenario/theater-ui.js";
import { mountStoryApp } from "../story/story-app.js";
import { mountGamesLobby } from "../games/lobby-ui.js";
import { mountAdventureApp } from "../adventure/player-ui.js";
import { mountScrollPlayer } from "../scroll/scroll-app.js";
import { ensureExperienceBindingSlots } from "../experience/bindings.js";
import { loadMultiplayerPrefs, saveMultiplayerPrefs } from "../multiplayer/prefs.js";
import { loadMoments, saveMoments, normalizeMoment } from "../moments/store.js";
import { startMomentsAutoPost, stopMomentsAutoPost } from "../moments/auto-post.js";
import { consumePopObservationReaction } from "../life/consumers.js";
import {
  parseTokenMessage,
  renderTokenCardHtml,
  markTokenSettled,
  isTokenMediaType,
  isRenderableTokenCard,
} from "../chat/token-message.js";
import {
  loadWallet,
  canAfford,
  applyTokenSettlement,
} from "../wallet/ledger.js";
import {
  getServiceBase,
  setServiceBase,
  loginAccount,
  logoutAccountSession,
  registerAccount,
  sendRegisterCode,
  selectProductMode,
} from "../auth/client.js";
import {
  isAuthCredentialReady,
  normalizeAuthType,
} from "../auth/form-credentials.js";
import { LOCAL_KEYS } from "../constants.js";
import { formatUserError } from "../onboarding/errors.js";
import { enhancePhoneCodeFields } from "../auth/phone-code-field.js";
import { mountBillingPanel } from "../billing/ui/billing-panel.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import { createPhoneOsNavigation } from "./os-navigation.js";
import { registerSystemBack } from "../platform/system-back.js";
import { bindHomePager } from "./os-home-pager.js";
import { bindIconEditor } from "./os-icon-edit.js";
import { mountIconFaceSheet } from "./os-icon-face-sheet.js";
import { applyIconFace, appFaceInnerHtml } from "./icon-face.js";
import { bindWidgetEditor } from "./os-widget-edit.js";
import { getSharedAppLifecycle } from "./app-lifecycle.js";
import { bindLockSwipe } from "./os-lock-gesture.js";
import { PHONE_APP_MAP, appsForHomePage, HOME_PAGE_COUNT, ICON_PAGE_MIN, ICON_PAGE_MAX, MAX_ICON_PAGES, MIN_ICON_PAGES, clampIconPageCount, totalHomePages, iconSlotsForPages, resolveDockEntry, DOCK_SLOT_COUNT, parseExtDesktopId, parseGameDesktopId, localizeApp } from "./apps-catalog.js";
import {
  selectGreeting,
  selectLocalAtmosphere,
  selectPresenceWidget,
  selectRelationWidget,
  selectTogetherWidget,
} from "./home-layout.js";
import { normalizeCoListenState } from "../library/co-listen.js";
import { togetherDaysFromAnniversary } from "../calendar/anniversaries.js";
import { getRelationshipState } from "../experience/relationship.js";
import {
  buildHomeRelationCardDisplay,
  computeHomeIntimacyScore,
} from "./home-intimacy-display.js";
import { isFeatureEnabled } from "../features/flags.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";
import { refreshRelationshipContinuity } from "../relationship/index.js";
import {
  buildDispersedAppScreens,
  buildSettingsHubHtml,
  buildBeautifyScreenHtml,
  buildDiaryScreenHtml,
  buildGalleryScreenHtml,
  buildListenScreenHtml,
  buildShopScreenHtml,
  buildGamesScreenHtml,
  buildScrollScreenHtml,
  buildAdventureScreenHtml,
  buildAssetsScreenHtml,
  buildQishiScreenHtml,
  buildExtHostScreenHtml,
  buildGameHostScreenHtml,
  buildCocreateScreenHtml,
} from "./app-screens.js";
import { buildTaskCenterScreenHtml, mountTaskCenterUi } from "../agent/ui/task-center-ui.js";
import { approveUnifiedTask, rejectUnifiedTask } from "../agent/task-center-facade.js";
import { buildPopTaskInlineHtml } from "../panels/pop-task-inline.js";
import { renderTurnActivityHtml, renderLiveTurnActivityHtml, bindTurnActivityFolds, revealTurnActivityText, turnActivityFoldLabel } from "../chat/turn-activity.js";
import { CHAT_TURN_PROGRESS_EVENT } from "../chat/turn-progress-event.js";
import { buildExploreScreenHtml, mountExploreApp, registerExploreApp } from "../skill-platform/ui/explore-ui.js";
import { buildAssistScreenHtml, mountPhoneAssist } from "./phone-assist.js";
import { createHostSkillModelFn } from "../skill-platform/host-model.js";
import {
  buildAutonomySettingsScreenHtml,
  buildActivityCenterScreenHtml,
  buildAgentPermissionsScreenHtml,
  buildDeveloperDiagnosticsScreenHtml,
  buildAutonomyOnboardingHtml,
} from "../companion/feature-control-ui.js";
import { mountFeatureControlUi, isDeveloperModeEnabled } from "../companion/feature-control-bind.js";
import { listAssistantTasks } from "../studio-assist/agent/task-store.js";
import {
  listTodayInboxItems,
  countUnreadToday,
  acknowledgeTodaySurface,
  markAllTodayRead,
  markInboxItemRead,
  openArtifactDeepLink,
  artifactDeepLink,
  flushPopDeliveries,
  flushSystemNotificationDeliveries,
} from "../artifacts/index.js";
import { LISTEN_PLAY_EVENT } from "../companion/listen-action.js";
import { CAPABILITY_OPEN_EVENT } from "../chat/capability-message.js";
import { resolveCapabilityActionCard } from "../chat/capability-message.js";
import { ensurePermission } from "../platform/permissions.js";
import { createProductionConversationApi } from "../skill-platform/conversation-binding.js";
import { getSkillRun } from "../skill-platform/run-store.js";
import "../skill-platform/ui/explore.css";
import { mountAgentPickerHost } from "../agents/ui/agent-picker.js";
import { registerBuiltinCapabilities } from "../agent/capabilities/index.js";
import { buildContextViewerScreenHtml, mountContextViewerUi } from "../context/ui/context-viewer-ui.js";
import { mountAssetsHub } from "../assets-hub/hub-ui.js";
import { bindComposerChrome } from "../chat/composer-chrome.js";
import { bindTokenComposeSheets } from "../chat/token-compose-ui.js";
import { bindGiftComposeSheet } from "../chat/gift-compose-ui.js";
import { buildAttachmentContext } from "../chat/attachments.js";
import { stickerPromptText } from "../assets-hub/stickers.js";
import { captureShareLocation, parseLocationMessage, renderLocationCardHtml } from "../chat/share-location.js";
import { messageTimelineLabel } from "../chat/message-timeline.js";
import { resolveDiaryMessageCard } from "../chat/diary-message.js";
import { resolveGameMessageCard } from "../chat/game-message.js";
import { resolveCallMessageCard } from "../chat/call-message.js";
import { createAttachmentMessageMetadata, resolveAttachmentMessageCard } from "../chat/attachment-message.js";
import { notifyChatFeedback } from "../chat/feedback.js";
import {
  MESSAGE_REACTIONS,
  normalizeMessageState,
  persistMessageState,
  resolveReplyPreview,
  toggleMessageReaction,
} from "../chat/message-actions.js";
import {
  closeMessageMenus,
  messageMenuCopy,
  renderMessageMenuHtml,
  toggleMessageMenu,
} from "../chat/message-menu.js";
import {
  applyMessageDelete,
  applyMessageEdit,
  resolveMessageMenuActions,
} from "../chat/message-ops.js";
import {
  isChatIntroNoteCollapsed,
  isOpeningIntroMessage,
  isPlatformPlaceholderGreeting,
  renderChatIntroNote,
  renderOpeningSetupCtaHtml,
  resolveChatIntroDestination,
  shouldPinChatIntroNote,
  toggleChatIntroNote,
  transcriptHasLivedChat,
} from "../chat/intro-note.js";
import { deleteRecord, saveChatMessage } from "../storage/db.js";
import { projectActivityToChat } from "../chat/activity-projection.js";
import { mountPhoneVoice, wireLabVoiceTests } from "./phone-voice.js";
import { refreshHostedSpeechStatus } from "../voice/speech-routing.js";
import { refreshHostedVoiceUi } from "../voice/hosted-voice-ui.js";
import { getVoiceSettings, saveVoiceSettings, setCharacterHostedVoice } from "../settings/voice-preferences.js";
import { refreshDeviceSpeechSupport } from "../voice/device-speech.js";
import {
  getImagegenSettings,
  saveImagegenSettings,
} from "../settings/imagegen-preferences.js";
import { openCharacterImportFlow } from "../characters/import-ui.js";
import { openCharacterExportFlow } from "../characters/export-ui.js";
import { mountPresetsManager } from "../presets/presets-ui.js";
import { mountRegexManager } from "../regex/regex-ui.js";
import { renderWorldbookMiniFeed } from "../worldbook/worldbook-ui.js";
import {
  loadPhoneOsPrefs,
  savePhoneOsPrefs,
  WALLPAPERS,
  WALLPAPER_PRESET_IDS,
  wallpaperMeta,
  wallpaperToneForPair,
  normalizeWallpaperPair,
  normalizeWidgetOrder,
  addExtIconToHome,
  removeExtIconFromHome,
  addGameIconToHome,
  removeGameIconFromHome,
  addAppIconToHome,
  removeAppIconFromHome,
  isAppOnHome,
} from "./os-prefs.js";
import { isWallpaperImageValue, readImageAsWallpaperDataUrl } from "./wallpaper-image.js";
import * as phoneData from "./phone-data.js";
import {
  isInAppFloatPreferredOn,
  setInAppFloatPreferredOn,
} from "../ui/desktop-presence-wire.js";
import { shouldDispatchDeskPetSet } from "../ui/pet-power-control.js";
import { wirePetLibrary } from "../ui/pet-library.js";
import { wirePetSizeControl } from "../ui/pet-size-control.js";
import { getPet, readSelectedPetId } from "../avatar/pet-catalog.js";
import { t as i18nT } from "../i18n/index.js";
import { toggleSwitch, setSwitchState, isSwitchOn, setSegmentedActive } from "./phone-controls.js";
import { mountPhoneMemoryDiary } from "./phone-memory-diary.js";
import { bindSessionSummaryPicker } from "../memory/session-summary-ui.js";
import { fileDrawer } from "../memory/palace/index.js";
import { createPhoneCalendar } from "./phone-calendar.js";
import { mountPhoneGallery } from "./phone-gallery.js";
import { mountPhoneListen } from "./phone-listen.js";
import { mountPhoneReader } from "./phone-reader.js";
import { mountPhoneShop } from "./phone-shop.js";
import { displayReadProgress } from "../library/books.js";
import { ensureBuiltinLibrary } from "../library/builtin-catalog.js";
import { mountCocreateApp } from "../cocreate/cocreate-app.js";
import { CUSTOM_CONTACT, getUiCustomContactCopy } from "../commerce/custom-contact.js";
import { rescheduleProactiveScheduler } from "../proactive/scheduler.js";
import { bindProactiveWakeControls, fillProactiveWakeControls, resetProactiveWakeControls } from "../proactive/ui.js";
import { bindCompanionLifeWakeListeners, wakeCompanionLife } from "../companion/life-wake.js";
import { emitAppEvent, subscribeAppEvent } from "../world/app-events.js";
import { isWithinDnd } from "../integrations/context.js";
import { LIFE_TICK_LIMITS } from "../proactive/config.js";
import { mountQishiApp } from "../qishi/qishi-app.js";
import { mountExtRuntime } from "../phone-ext/runtime.js";
import { mountGateUi } from "../gate/gate-ui.js";
import { getInstalledExtension } from "../phone-ext/registry.js";
import { mountGameShell } from "../yeos/game-shell-ui.js";
import { getInstalledGame } from "../yeos/registry-games.js";
import { callModel, checkServerHealth } from "../model/client.js";
import { isLocalOfflineSession } from "../account/product-access.js";
import { mountPopChatPlugins } from "./pop-chat-plugins.js";
import { createPermissionRequester } from "../phone-ext/permission-ui.js";
import { bindActionProposalCards } from "../ui/action-proposal-card.js";
import { confirmAction, promptText } from "../ui/confirm.js";

function avatarMarkup(url, name) {
  const safeUrl = isRealCharacterAvatar(url) ? String(url).trim() : "";
  if (safeUrl) return `<img src="${escapeHtml(safeUrl)}" alt="" />`;
  const fallbackName = name || pt("pop.defaultCharacter");
  const initial = escapeHtml(String(fallbackName || pt("pop.defaultInitial")).trim().slice(0, 1) || pt("pop.defaultInitial"));
  return `<span class="mini-avatar-fallback" aria-hidden="true">${initial}</span>`;
}

function characterAvatarMarkup(character) {
  return avatarMarkup(resolveCharacterAvatarUrl(character), character?.name || character?.alias || pt("pop.defaultCharacter"));
}

/** WarmLand-style A–Z letter for contacts (Latin + approx. zh via localeCompare anchors). */
function contactLetter(name) {
  const ch = String(name || "").trim().charAt(0);
  if (!ch) return "#";
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  if (/[0-9]/.test(ch)) return "#";
  if (!/^[\u4e00-\u9fff]$/.test(ch)) return "#";
  const letters = "ABCDEFGHJKLMNOPQRSTWXYZ";
  const anchors = "阿八嚓哒妸发旮哈讥咔垃痳拏噢妑七呥扨它穵夕丫帀";
  for (let i = 0; i < anchors.length; i += 1) {
    if (ch.localeCompare(anchors[i], "zh-CN") < 0) {
      return i === 0 ? "A" : letters[i - 1];
    }
  }
  return "Z";
}

const APP_MAP = PHONE_APP_MAP;

function intlLocale() {
  return getLocale() === "en" ? "en-US" : "zh-CN";
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat(intlLocale(), { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatLockDate(date = new Date()) {
  return new Intl.DateTimeFormat(intlLocale(), {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function normalizeMessage(record = {}) {
  return {
    id: String(record.id || `phone-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    sessionId: String(record.sessionId || ""),
    role: record.role === "user"
      ? "user"
      : record.role === "system"
        ? "system"
        : "assistant",
    content: String(record.content || record.text || "").trim(),
    createdAt: record.createdAt || new Date().toISOString(),
    metadata: record.metadata || {},
  };
}

function messageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(), { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function attachmentSize(bytes = 0) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentCardHtml(card) {
  if (!card) return "";
  if (card.type === "image") {
    const media = card.previewUrl
      ? `<img src="${escapeHtml(card.previewUrl)}" alt="${escapeHtml(card.name)}" loading="lazy" />`
      : '<span class="message-attachment-card__placeholder"><i data-lucide="image"></i></span>';
    return `<figure class="message-attachment-card is-image" data-media-id="${escapeHtml(card.mediaId)}">
      ${media}
      <figcaption><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml(attachmentSize(card.size))}</span></figcaption>
    </figure>`;
  }
  const kindLabel = card.type === "text"
    ? (String(getLocale() || "").toLowerCase().startsWith("en") ? "Text attachment" : "文本附件")
    : (String(getLocale() || "").toLowerCase().startsWith("en") ? "File attachment" : "文件附件");
  return `<div class="message-attachment-card is-${escapeHtml(card.type)}" data-media-id="${escapeHtml(card.mediaId)}">
    <span class="message-attachment-card__icon"><i data-lucide="${card.type === "text" ? "file-text" : "file"}"></i></span>
    <span class="message-attachment-card__body">
      <strong>${escapeHtml(card.name)}</strong>
      <span>${escapeHtml(`${kindLabel} · ${attachmentSize(card.size)}`)}</span>
      ${card.preview ? `<p>${escapeHtml(card.preview)}</p>` : ""}
    </span>
  </div>`;
}

/** WeChat-like relative time for moments. */
function momentRelativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return pt("time.justNow");
  if (diff < 3600_000) return pt("time.minutesAgo", { n: Math.floor(diff / 60_000) });
  if (diff < 86400_000) return pt("time.hoursAgo", { n: Math.floor(diff / 3600_000) });
  const days = Math.floor(diff / 86400_000);
  if (days === 1) return pt("time.yesterday");
  if (days < 7) return pt("time.daysAgo", { n: days });
  return pt("time.monthDay", { month: date.getMonth() + 1, day: date.getDate() });
}

function isJunkMoment(moment = {}) {
  const time = String(moment.time || "");
  const content = String(moment.content || "");
  if (time === "共同经历") return true;
  if (/进入了.+手机|用户进入/.test(content)) return true;
  if (String(moment.source || "") === "life") return true;
  return false;
}

function resolveAppIconLabel(entry) {
  if (!entry) return "";
  if (entry.type === "folder") return String(entry.label || pt("pop.folderTitle"));
  // Always resolve from labelKey at paint time so locale switches update home icons.
  const localized = phoneAppLabel(entry);
  if (localized) return localized;
  return String(entry.label || entry.id || "");
}

function appIconHtml(entry) {
  const col = Number(entry?.col) || 1;
  const row = Number(entry?.row) || 1;
  const hasSlot = Number.isFinite(Number(entry?.slot));
  const slot = hasSlot ? Number(entry.slot) : "";
  const pos = hasSlot ? `grid-column:${col};grid-row:${row}` : "";
  const styleAttr = pos ? ` style="${pos}"` : "";
  const label = resolveAppIconLabel(entry);

  if (entry?.type === "empty") {
    return `
      <div class="mini-app-slot" data-app-slot="${slot}"${styleAttr} aria-hidden="true">
        <i></i>
      </div>
    `;
  }

  if (entry?.type === "folder") {
    const previews = (entry.apps || []).slice(0, 4);
    return `
      <button type="button" class="mini-app-icon mini-app-icon--folder" data-app-id="${escapeHtml(entry.id)}" data-folder-id="${escapeHtml(entry.folderId)}" data-app-slot="${slot}" aria-label="${escapeHtml(label)}"${styleAttr}>
        <span data-tone="ink" class="mini-app-folder-face" aria-hidden="true">
          <i data-lucide="folder" class="mini-app-folder-face__glyph"></i>
          <span class="mini-app-folder-face__dots">${previews.map((app) => `<i data-tone="${app.tone || "mint"}"></i>`).join("")}</span>
        </span>
        <em>${escapeHtml(label)}</em>
      </button>
    `;
  }
  return `
    <button type="button" class="mini-app-icon" data-app-id="${escapeHtml(entry.id)}" data-app-slot="${slot}" aria-label="${escapeHtml(label)}"${styleAttr}>
      ${appFaceInnerHtml(entry, escapeHtml)}
      <em>${escapeHtml(label)}</em>
    </button>
  `;
}

/**
 * Mount the immersive phone shell. Business data remains owned by the existing app.
 */
export function mountSmallPhone({
  root,
  runtime,
  getRecentMessages,
  sendMessage,
  getPhotos,
  listPhotoGroups,
  listPhotosInGroup,
  createPhotoGroup,
  renamePhotoGroup,
  deletePhotoGroup,
  addPhotosToGroup,
  removePhoto,
  markIdentityQa,
  getDiaries,
  getNowPlaying,
  setNowPlaying,
  getMediaRecord,
  readMediaBlob,
  resolveMediaUrl,
  storeMediaFile,
  collectProviderConfig,
  saveChatMessage,
  exportLocalPayload,
  exportNyraBackup,
  exportFullBackupZip,
  downloadJson,
  downloadBackupZip,
  downloadNyraArchive,
  importNyraOrLegacyFile,
  restoreImportPayload,
  restoreFullBackupZip,
  getRestoreHandlers,
  switchToAppMode,
} = {}) {
  if (!root || !runtime) throw new TypeError("mountSmallPhone requires root and runtime");

  function goToAppUi() {
    if (typeof switchToAppMode === "function") {
      switchToAppMode();
      return;
    }
    window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode: "app" } }));
  }

  const lifeTickDeps = {
    getActiveCharacterId,
    isFeatureEnabled,
    isWithinDnd,
    collectLibraryState: () => phoneData.readLibrary(),
  };

  function tickCompanionLife(source, overrides = {}) {
    try {
      wakeCompanionLife(source, lifeTickDeps, { limits: LIFE_TICK_LIMITS, ...overrides });
    } catch {
      /* non-blocking */
    }
  }

  function emitPhoneAppEvent(type, detail = {}) {
    try {
      emitAppEvent(type, {
        appId: detail.appId || "",
        characterId: getActiveCharacterId() || "",
        ...detail,
      });
    } catch {
      /* non-blocking */
    }
  }

  const unbindLifeWake = bindCompanionLifeWakeListeners(lifeTickDeps);
  const onDiaryArtifactSaved = () => {
    syncArtifactSurfaces().catch(() => {});
  };
  const unbindDiaryDelivery = subscribeAppEvent("diary.created", onDiaryArtifactSaved);
  document.addEventListener("yueqi:diary-saved", onDiaryArtifactSaved);

  let prefs = loadPhoneOsPrefs();
  let pageIndex = Math.max(0, Math.min(totalHomePages(prefs.iconPageCount) - 1, Number(prefs.homePageIndex) || 0));
  let editMode = false;
  let iconFaceSheet = null;
  let locked = true;
  let lockMode = "TIME";
  let passcodeBuffer = "";
  const diaryPrefs = phoneData.getDiarySettings();
  const getPetFloatOn = () => isInAppFloatPreferredOn();
  const setPetFloatOn = (on) => {
    const enabled = Boolean(on);
    // Opening again is a no-op. Closing must always reach the shared closer —
    // a stale pref match used to swallow Off while the overlay was still alive.
    if (!shouldDispatchDeskPetSet(enabled, isInAppFloatPreferredOn())) return;
    window.dispatchEvent(new CustomEvent("yueqi:desk-pet-set", { detail: { enabled } }));
  };
  let phonePetLibrary = null;
  let phonePetSize = null;
  let phoneBillingPanel = null;

  root.innerHTML = `
      <section class="mini-phone" data-phone-view="home" data-phone-locked="false" data-wallpaper="dawn">
        <div class="mini-phone__hardware" aria-hidden="true"><span></span><i></i></div>
        <div class="mini-phone__screen">
          <header class="mini-controlbar" aria-label="${escapeHtml(pt("shell.quickActions"))}">
            <button
              type="button"
              class="mini-controlbar__app-switch"
              data-phone-switch-ui="app"
              aria-label="${escapeHtml(pt("shell.switchToApp"))}"
              title="${escapeHtml(pt("shell.appUi"))}"
            >
              <i data-lucide="panels-top-left" aria-hidden="true"></i>
              <span>App</span>
            </button>
            <button
              type="button"
              class="mini-controlbar__notifications"
              data-phone-notifications
              aria-label="${escapeHtml(pt("shell.messagesUpdates"))}"
              title="${escapeHtml(pt("shell.messagesUpdates"))}"
            >
              <i data-lucide="bell" aria-hidden="true"></i>
              <em class="mini-controlbar__badge" data-phone-inbox-badge hidden>0</em>
            </button>
          </header>

          <div class="mini-lock" data-phone-lock>
          <div class="mini-lock__wallpaper" aria-hidden="true"></div>
          <div class="mini-lock__vignette" aria-hidden="true"></div>
          <div class="mini-lock__time-pane" data-lock-pane="TIME">
            <div class="mini-lock__time-block" data-lock-time-block>
              <p data-lock-date>${formatLockDate()}</p>
              <time data-lock-clock>${formatClock()}</time>
            </div>
            <div class="mini-lock__bottom">
              <button type="button" class="mini-lock__hint" data-lock-to-passcode data-lock-hint>
                <i data-lucide="chevron-up"></i>
                <span data-phone-i18n="lock.swipe">向上轻扫以解锁</span>
              </button>
              <div class="mini-lock__home-pill" aria-hidden="true"></div>
            </div>
          </div>
          <div class="mini-lock__pass-pane" data-lock-pane="PASSCODE" hidden>
            <div class="mini-lock__pass-scrim" aria-hidden="true"></div>
            <div class="mini-lock__pass-head">
              <strong data-phone-i18n="lock.enterPasscode">输入密码</strong>
              <div class="mini-lock__dots" data-lock-dots><i></i><i></i><i></i><i></i></div>
            </div>
            <div class="mini-lock__pass-spacer" aria-hidden="true"></div>
            <div class="mini-lock__pass-foot">
              <div class="mini-lock__pad" data-lock-pad>
                ${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "del"].map((key) => {
                  if (key === "") return "<span aria-hidden=\"true\"></span>";
                  if (key === "del") {
                    return `<button type="button" class="mini-lock__key--del" data-lock-key="del" data-phone-i18n-aria="lock.delete" aria-label="删除">
                      <svg width="26" height="18" viewBox="0 0 30 22" fill="none" aria-hidden="true">
                        <path d="M9.1 1.75H24.2c1.66 0 3 1.34 3 3v12.5c0 1.66-1.34 3-3 3H9.1c-.7 0-1.37-.25-1.9-.7L2.55 12.7a1.75 1.75 0 0 1 0-2.4L7.2 2.45c.53-.45 1.2-.7 1.9-.7Z" fill="rgba(255,255,255,0.92)"/>
                        <path d="M14.2 7.2l7.1 7.1M21.3 7.2l-7.1 7.1" stroke="rgba(40,40,45,0.88)" stroke-width="1.85" stroke-linecap="round"/>
                      </svg>
                    </button>`;
                  }
                  return `<button type="button" data-lock-key="${key}">${key}</button>`;
                }).join("")}
              </div>
              <div class="mini-lock__pass-actions">
                <button type="button" data-lock-to-time data-phone-i18n="lock.cancel">取消</button>
              </div>
            </div>
            <div class="mini-lock__home-pill mini-lock__home-pill--light" aria-hidden="true"></div>
          </div>
        </div>

        <div class="mini-phone__content">
          <section class="mini-view mini-home is-active" data-phone-screen="home">
            <div class="mini-home__wallpaper" data-home-wallpaper aria-hidden="true"></div>
            <div class="mini-home__pager" data-home-pager>
              <div class="mini-home__track" data-home-track>
                <div class="mini-home__page" data-home-page="0">
                  <div class="mini-widgets" data-home-widgets>
                    <section
                      class="mini-widget mini-widget--clock mini-home-hero"
                      data-widget="clock"
                      data-home-continuity-card
                    >
                      <div class="mini-home-greeting">
                        <time data-widget-clock></time>
                        <strong><span data-phone-greeting></span><span data-phone-user-call></span></strong>
                        <p data-home-presence-copy data-home-relationship-meta>${pt("home.presenceDay")}</p>
                        <span data-home-continuity-sources hidden aria-hidden="true"></span>
                        <span data-home-intimacy-row hidden aria-hidden="true">
                          <em data-phone-i18n="home.relationStatus" data-home-relation-label>${pt("home.relationStatus")}</em>
                          <strong data-home-intimacy hidden aria-hidden="true"></strong>
                        </span>
                        <i data-home-intimacy-bar-wrap aria-hidden="true" hidden><b data-home-intimacy-bar></b></i>
                      </div>
                    </section>
                    <article
                      class="mini-widget mini-widget--today"
                      data-widget="today"
                      data-home-companion-chat
                      role="button"
                      tabindex="0"
                      aria-label="${pt("home.presenceChatHint")}"
                    >
                      <div class="mini-today__head">
                        <span class="mini-today__avatar" data-phone-character-avatar><span class="mini-avatar-fallback" aria-hidden="true">N</span></span>
                        <div>
                          <strong data-home-today-title>${pt("home.todayWith", { name: pt("home.someone") })}</strong>
                          <span data-home-presence-status>${pt("home.presenceHere")}</span>
                        </div>
                        <i data-lucide="message-circle" aria-hidden="true"></i>
                        <em data-today-unread hidden>0</em>
                      </div>
                      <div class="mini-today__list" data-today-inbox></div>
                      <p class="mini-today__empty" data-today-empty>${pt("home.presenceChatHint")}</p>
                    </article>
                    <article
                      class="mini-widget mini-widget--vinyl"
                      data-widget="listen"
                      data-home-open-listen
                      role="button"
                      tabindex="0"
                      aria-label="${pt("home.listenTitle")}"
                    >
                      <header class="mini-home-widget-title">
                        <strong data-phone-i18n="home.listenTitle">一起听</strong>
                        <span><span data-phone-i18n="home.withCompanion">与</span> <span data-phone-name>${pt("home.someone")}</span></span>
                      </header>
                      <div class="mini-vinyl" data-vinyl-stage>
                        <div class="mini-vinyl__disc" data-vinyl-disc>
                          <span class="mini-vinyl__ring" aria-hidden="true"></span>
                          <span class="mini-vinyl__label" data-vinyl-label></span>
                          <span class="mini-vinyl__hole" aria-hidden="true"></span>
                        </div>
                        <div class="mini-vinyl__arm" aria-hidden="true"></div>
                      </div>
                      <div class="mini-vinyl__meta">
                        <strong data-home-listen-title>${pt("home.togetherIdleTitle")}</strong>
                        <p data-home-listen-meta>${pt("home.togetherIdleSubtitle")}</p>
                        <div class="mini-vinyl__progress" aria-hidden="true"><i data-home-listen-progress style="width: 0%"></i></div>
                      </div>
                      <span class="mini-home-widget-action" aria-hidden="true"><i data-lucide="play"></i></span>
                    </article>
                    <article class="mini-widget mini-widget--calendar" data-widget="calendar">
                      <button type="button" class="mini-cal-widget__label" data-cal-open-full data-phone-i18n-aria="home.openCalendar" aria-label="打开完整日历">
                        <strong data-cal-month>7月</strong>
                        <span data-cal-week-meta>/ —</span>
                      </button>
                      <div class="mini-cal-widget__body" data-cal-week-swipe data-home-gesture-own>
                        <div class="mini-cal-widget__slide" data-cal-week-track></div>
                      </div>
                    </article>
                  </div>
                </div>
                <div class="mini-home__page" data-home-page="1">
                  <div class="mini-app-grid" data-home-app-grid="1"></div>
                  <p class="mini-home__edit-hint" data-phone-i18n="home.editHint">长按：移动，或换图片（选颜色 / 自己的图）</p>
                </div>
              </div>
            </div>
            <div class="mini-home__dots" data-home-dots role="tablist" data-phone-i18n-aria="home.pagerLabel" aria-label="桌面分页">
              <button type="button" class="is-active" data-home-dot data-page="0" aria-label="第 1 页"></button>
              <button type="button" data-home-dot data-page="1" aria-label="第 2 页"></button>
            </div>
            <nav class="mini-dock" data-home-dock data-phone-i18n-aria="home.dockLabel" aria-label="快捷应用"></nav>
            <div class="mini-folder-sheet" data-folder-sheet hidden>
              <button type="button" class="mini-folder-sheet__scrim" data-folder-close data-phone-i18n-aria="pop.folderClose" aria-label="关闭文件夹"></button>
              <div class="mini-folder-sheet__panel" role="dialog" aria-modal="true">
                <strong data-folder-title data-phone-i18n="pop.folderTitle">文件夹</strong>
                <div class="mini-folder-sheet__grid" data-folder-grid></div>
              </div>
            </div>
          </section>

          <section class="mini-view mini-pop" data-phone-screen="pop" hidden>
            <header class="mini-appbar mini-pop-appbar">
              <button type="button" class="mini-icon-button" data-pop-nav-back data-phone-i18n-aria="screens.back" aria-label="返回"><i data-lucide="chevron-left"></i></button>
              <div><strong data-pop-title data-phone-i18n="pop.tabTalk">对话</strong><span data-pop-status data-phone-i18n="pop.sessionList">会话列表</span></div>
              <button type="button" class="mini-icon-button" data-pop-header-action data-phone-i18n-aria="pop.startChat" aria-label="发起聊天"><i data-lucide="square-pen" data-pop-header-icon></i></button>
            </header>
            <div class="mini-pop__body">
              <section class="mini-pop-panel is-active" data-pop-panel="chat">
                <div class="mini-pop-chat-list" data-pop-chat-mode="list">
                  <div class="mini-pop-search">
                    <i data-lucide="search"></i>
                    <input type="search" data-pop-session-query data-phone-i18n-placeholder="pop.searchSessions" placeholder="搜索聊天" data-phone-i18n-aria="pop.searchSessions" aria-label="搜索聊天" autocomplete="off" />
                  </div>
                  <div class="mini-pop-session-list" data-pop-session-list></div>
                </div>
                <div class="mini-pop-chat-thread" data-pop-chat-mode="thread" hidden>
                  <section class="mini-pop-relation" data-pop-relation>
                    <div class="mini-pop-relation__moon" aria-hidden="true"><i data-lucide="moon"></i></div>
                    <div class="mini-pop-relation__copy">
                      <strong data-pop-relation-title data-phone-i18n="pop.roomQuiet">今晚的房间很安静</strong>
                      <span data-pop-relation-sub data-phone-i18n="pop.sheLeftThis">ta把你说过的话，留在了这里。</span>
                    </div>
                    <em class="mini-pop-relation__day" data-pop-relation-day></em>
                  </section>
                  <div class="mini-message-list" data-phone-messages aria-live="polite"></div>
                  <div class="mini-composer-stack" data-mini-composer-stack>
                    <form class="mini-composer" data-phone-chat-form>
                      <button type="button" class="mini-icon-button mini-composer-tool" data-phone-plus data-phone-i18n-aria="pop.more" aria-label="更多" aria-expanded="false"><i data-lucide="plus"></i></button>
                      <button type="button" class="mini-icon-button mini-composer-tool mini-composer-speak" data-phone-speak-char data-phone-i18n-aria="pop.charReply" aria-label="续聊" data-phone-i18n-attr="title:pop.charReplyTitle" title="再让ta回一句"><i data-lucide="message-circle"></i></button>
                      <div class="mini-composer-field">
                        <textarea rows="1" maxlength="1200" data-phone-chat-input data-phone-i18n-placeholder="pop.inputMessage" placeholder="输入消息" data-phone-i18n-aria="pop.message" aria-label="消息" autocomplete="off" enterkeyhint="send"></textarea>
                        <button type="button" class="mini-composer-hold" data-phone-hold hidden data-phone-i18n-aria="pop.holdToTalk" aria-label="按住说话"><span data-phone-i18n="pop.holdToTalkShort">按住 说话</span></button>
                      </div>
                      <button type="button" class="mini-icon-button mini-composer-tool mini-mic-btn" data-phone-mic data-phone-i18n-aria="pop.voiceInput" aria-label="语音输入"><i data-lucide="mic"></i></button>
                      <button type="button" class="mini-icon-button mini-composer-tool mini-send" data-phone-send data-haptic="none" data-phone-i18n-aria="pop.send" aria-label="发送"><i data-lucide="send"></i></button>
                    </form>
                    <div class="mini-composer-sheet mini-composer-plus" data-phone-plus-sheet hidden>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="listen">
                        <span class="mini-composer-plus__icon"><i data-lucide="headphones"></i></span>
                        <span data-phone-i18n="pop.togetherListen">一起听</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="image">
                        <span class="mini-composer-plus__icon"><i data-lucide="image"></i></span>
                        <span data-phone-i18n="pop.photo">照片</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="note">
                        <span class="mini-composer-plus__icon"><i data-lucide="sticky-note"></i></span>
                        <span data-phone-i18n="pop.leaveNote">便签</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="gift">
                        <span class="mini-composer-plus__icon"><i data-lucide="heart"></i></span>
                        <span data-phone-i18n="pop.interact">互动</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="transfer">
                        <span class="mini-composer-plus__icon"><i data-lucide="hand-coins"></i></span>
                        <span data-phone-i18n="pop.transfer">转账</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="location">
                        <span class="mini-composer-plus__icon"><i data-lucide="map-pin"></i></span>
                        <span data-phone-i18n="pop.location">定位</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="game">
                        <span class="mini-composer-plus__icon"><i data-lucide="sparkles"></i></span>
                        <span data-phone-i18n="pop.scene">场景</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="memory">
                        <span class="mini-composer-plus__icon"><i data-lucide="book-heart"></i></span>
                        <span data-phone-i18n="pop.memories">回忆</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="sticker">
                        <span class="mini-composer-plus__icon"><i data-lucide="smile"></i></span>
                        <span data-phone-i18n="pop.sticker">表情</span>
                      </button>
                      <button type="button" class="mini-composer-plus__tile" data-phone-plus-action="voice">
                        <span class="mini-composer-plus__icon"><i data-lucide="mic"></i></span>
                        <span data-phone-i18n="pop.voice">语音</span>
                      </button>
                    </div>
                    <div class="mini-composer-sheet mini-composer-stickers" data-phone-stickers hidden></div>
                    <input type="file" accept="image/*" hidden data-phone-attach-input />
                  </div>
                  <div class="mini-pop-token-sheet" data-token-compose="transfer" hidden>
                    <button type="button" class="mini-pop-token-sheet__scrim" data-token-compose-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                    <div class="mini-pop-token-sheet__panel" role="dialog" data-phone-i18n-aria="pop.transferSheet" aria-label="转账">
                      <header><button type="button" data-token-compose-close data-phone-i18n="screens.cancel">取消</button><strong data-phone-i18n="pop.transferTo">转账给对方</strong><span></span></header>
                      <label class="mini-pop-token-field"><span data-phone-i18n="pop.amount">金额</span><input type="number" min="0.01" max="999999.99" step="0.01" inputmode="decimal" data-token-amount placeholder="0.00" /><em data-phone-i18n="pop.coin">栖币</em></label>
                      <label class="mini-pop-token-field is-note"><span data-phone-i18n="pop.note">备注</span><input type="text" data-token-note maxlength="40" data-phone-i18n-placeholder="pop.transferNotePlaceholder" placeholder="添加转账说明" /></label>
                      <button type="button" class="mini-pop-token-submit" data-token-compose-submit="transfer" data-phone-i18n="pop.transfer">转账</button>
                    </div>
                  </div>
                  <div class="mini-pop-token-sheet" data-gift-compose hidden>
                    <button type="button" class="mini-pop-token-sheet__scrim" data-gift-compose-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                    <div class="mini-pop-token-sheet__panel" role="dialog" data-phone-i18n-aria="pop.sendGiftSheet" aria-label="送礼物">
                      <header>
                        <button type="button" data-gift-compose-close data-phone-i18n="screens.cancel">取消</button>
                        <strong data-phone-i18n="pop.sendGift">送礼物</strong>
                        <span></span>
                      </header>
                      <p class="gift-compose-lead" data-phone-i18n="pop.sendGiftLead">从收藏柜里挑一件「礼物」送给当前角色</p>
                      <div class="gift-compose-list" data-gift-compose-list></div>
                    </div>
                  </div>
                </div>
                <div class="mini-pop-sheet" data-pop-compose-sheet hidden>
                  <button type="button" class="mini-pop-sheet__scrim" data-pop-compose-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                  <div class="mini-pop-sheet__panel" role="dialog" aria-modal="true" data-phone-i18n-aria="pop.newSession" aria-label="新建会话">
                    <header><strong data-phone-i18n="pop.newChat">新建</strong><button type="button" class="mini-icon-button" data-pop-compose-close data-phone-i18n-aria="screens.close" aria-label="关闭"><i data-lucide="x"></i></button></header>
                    <div class="mini-pop-compose-actions">
                      <button type="button" data-pop-compose-dm><i data-lucide="user"></i><span data-phone-i18n="pop.startDm">发起私聊</span></button>
                      <button type="button" data-pop-compose-group><i data-lucide="users"></i><span data-phone-i18n="pop.startGroup">发起群聊</span></button>
                    </div>
                  </div>
                </div>
                <div class="mini-pop-sheet" data-pop-dm-sheet hidden>
                  <button type="button" class="mini-pop-sheet__scrim" data-pop-dm-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                  <div class="mini-pop-sheet__panel" role="dialog" aria-modal="true" data-phone-i18n-aria="pop.startDm" aria-label="发起私聊">
                    <header><strong data-phone-i18n="pop.startDm">发起私聊</strong><button type="button" class="mini-icon-button" data-pop-dm-close data-phone-i18n-aria="screens.close" aria-label="关闭"><i data-lucide="x"></i></button></header>
                    <div class="mini-pop-sheet__list" data-pop-dm-pick-list></div>
                  </div>
                </div>
                <div class="mini-pop-sheet" data-pop-group-sheet hidden>
                  <button type="button" class="mini-pop-sheet__scrim" data-pop-group-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                  <div class="mini-pop-sheet__panel" role="dialog" aria-modal="true" data-phone-i18n-aria="pop.startGroup" aria-label="发起群聊">
                    <header><strong data-phone-i18n="pop.startGroup">发起群聊</strong><button type="button" class="mini-icon-button" data-pop-group-close data-phone-i18n-aria="screens.close" aria-label="关闭"><i data-lucide="x"></i></button></header>
                    <label class="mini-pop-group-title"><span data-phone-i18n="pop.groupName">群名称</span><input type="text" maxlength="32" data-phone-i18n-placeholder="pop.optional" placeholder="可选" data-pop-group-title /></label>
                    <p class="mini-app-lead" data-phone-i18n="pop.minGroupMembers">至少选择两位角色</p>
                    <div class="mini-pop-sheet__list" data-pop-group-pick-list></div>
                    <button type="button" class="mini-pop-group-create" data-pop-group-create data-phone-i18n="pop.createGroup">创建群聊</button>
                  </div>
                </div>
                <div class="mini-pop-sheet" data-pop-game-sheet hidden>
                  <button type="button" class="mini-pop-sheet__scrim" data-pop-game-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                  <div class="mini-pop-sheet__panel mini-pop-game-panel" role="dialog" aria-modal="true" data-phone-i18n-aria="pop.gameTitle" aria-label="一起玩">
                    <header><strong data-phone-i18n="pop.gameTitle">一起玩</strong><button type="button" class="mini-icon-button" data-pop-game-close data-phone-i18n-aria="screens.close" aria-label="关闭"><i data-lucide="x"></i></button></header>
                    <p class="mini-pop-dice-lead" data-phone-i18n="pop.gameLead">和 TA 在当前聊天里玩，沿用这条会话的上下文</p>
                    <div class="mini-pop-game-list" data-pop-game-list></div>
                  </div>
                </div>
                <div class="mini-pop-sheet" data-pop-plugin-sheet hidden>
                  <button type="button" class="mini-pop-sheet__scrim" data-pop-plugin-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                  <div class="mini-pop-sheet__panel mini-pop-plugin-panel" data-pop-plugin-panel role="dialog" aria-modal="true" data-phone-i18n-aria="pop.pluginTitle" aria-label="聊天插件"></div>
                </div>
              </section>
              <section class="mini-pop-panel" data-pop-panel="contacts" hidden>
                <div class="mini-contact-scroll">
                  <div class="mini-contact-list" data-pop-contacts></div>
                  <nav class="mini-contact-index" data-pop-contact-index hidden data-phone-i18n-aria="pop.contactIndex" aria-label="字母索引"></nav>
                </div>
                <div class="mini-pop-sheet" data-pop-add-friend-sheet hidden>
                  <button type="button" class="mini-pop-sheet__scrim" data-pop-add-friend-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                  <div class="mini-pop-sheet__panel mini-pop-sheet__panel--pop" role="dialog" aria-modal="true" data-phone-i18n-aria="pop.addFriendTitle" aria-label="添加朋友">
                    <header><strong data-phone-i18n="pop.addFriendTitle">添加朋友</strong><button type="button" class="mini-icon-button" data-pop-add-friend-close data-phone-i18n-aria="screens.close" aria-label="关闭"><i data-lucide="x"></i></button></header>
                    <label class="mini-pop-search">
                      <i data-lucide="search"></i>
                      <input type="search" maxlength="48" data-phone-i18n-placeholder="pop.addFriendSearch" placeholder="搜索角色库名字或 id" data-pop-add-friend-query autocomplete="off" />
                    </label>
                    <p class="mini-pop-sheet-lead" data-phone-i18n="pop.addFriendLead">只显示尚未加入通讯录的角色卡</p>
                    <div class="mini-pop-sheet__list" data-pop-add-friend-list></div>
                  </div>
                </div>
                <div class="mini-pop-sheet" data-pop-contact-card-sheet hidden>
                  <button type="button" class="mini-pop-sheet__scrim" data-pop-contact-card-close data-phone-i18n-aria="screens.close" aria-label="关闭"></button>
                  <div class="mini-pop-sheet__panel mini-pop-sheet__panel--pop mini-pop-contact-card" role="dialog" aria-modal="true" data-phone-i18n-aria="pop.contactCardTitle" aria-label="好友资料" data-pop-contact-card-panel></div>
                </div>
              </section>
              <section class="mini-pop-panel" data-pop-panel="moments" hidden>
                <div class="mini-moments-wx">
                  <header class="mini-moments-cover" data-moments-cover>
                    <div class="mini-moments-cover__shade" aria-hidden="true"></div>
                    <button type="button" class="mini-moments-cover__edit" data-moments-cover-edit data-phone-i18n-aria="pop.coverChange" aria-label="${escapeHtml(pt("pop.coverChange"))}">
                      <i data-lucide="image"></i>
                    </button>
                    <div class="mini-moments-cover__self">
                      <strong data-moments-cover-name>你</strong>
                      <span class="mini-moments-cover__avatar" data-moments-cover-avatar></span>
                    </div>
                  </header>
                  <div class="mini-moment-feed" data-phone-moments-inline></div>
                </div>
              </section>
              <section class="mini-pop-panel mini-pop-me" data-pop-panel="me" hidden>
                <div class="mini-me-scroll">
                  <div class="mini-me-hero">
                    <span class="mini-me-hero__avatar" data-pop-me-avatar></span>
                    <strong data-pop-me-name>你</strong>
                    <span class="mini-me-hero__tag" data-pop-me-meta data-phone-i18n="pop.personaTag">User Persona · 你在故事里的身份</span>
                    <em class="mini-me-hero__handle" data-pop-me-handle></em>
                    <p class="mini-me-hero__companion" data-pop-me-companion></p>
                    <span class="mini-me-hero__actions" aria-hidden="true"><i data-lucide="qr-code"></i><i data-lucide="chevron-right"></i></span>
                  </div>
                  <div class="mini-me-stats" data-pop-me-stats hidden></div>
                  <div class="mini-me-list">
                    <div class="mini-me-list-group">
                    <button type="button" class="mini-pop-list-row" data-pop-wallet-toggle>
                      <i data-lucide="wallet"></i>
                      <span data-phone-i18n="pop.wallet">栖币钱包</span>
                      <strong data-wallet-balance>200.00</strong>
                      <i data-lucide="chevron-right" class="mini-pop-list-row__chev"></i>
                    </button>
                    <div class="mini-wallet-ledger" data-pop-wallet-ledger hidden></div>
                    </div>
                    <div class="mini-me-list-group">
                    <button type="button" class="mini-pop-list-row" data-pop-tab="contacts">
                      <i data-lucide="users"></i><span data-phone-i18n="pop.contacts">通讯录</span><i data-lucide="chevron-right" class="mini-pop-list-row__chev"></i>
                    </button>
                    <button type="button" class="mini-pop-list-row" data-phone-open="profile">
                      <i data-lucide="users"></i><span data-phone-i18n="pop.library">角色库</span><i data-lucide="chevron-right" class="mini-pop-list-row__chev"></i>
                    </button>
                    <button type="button" class="mini-pop-list-row" data-phone-open="context">
                      <i data-lucide="brain-circuit"></i><span data-phone-i18n="pop.contextCenter">上下文中心</span><i data-lucide="chevron-right" class="mini-pop-list-row__chev"></i>
                    </button>
                    </div>
                    <div class="mini-me-list-group">
                    <button type="button" class="mini-pop-list-row" data-phone-open="settings">
                      <i data-lucide="settings-2"></i><span data-phone-i18n="pop.settings">设置</span><i data-lucide="chevron-right" class="mini-pop-list-row__chev"></i>
                    </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
            <nav class="mini-pop-tabs" data-phone-i18n-aria="pop.navLabel" aria-label="Pop 导航">
              <button type="button" class="is-active" data-pop-tab="chat"><i data-lucide="message-circle"></i><span data-phone-i18n="pop.tabTalk">对话</span></button>
              <button type="button" data-pop-tab="contacts"><i data-lucide="door-open"></i><span data-phone-i18n="pop.tabRoom">房间</span></button>
              <button type="button" data-pop-tab="moments"><i data-lucide="heart"></i><span data-phone-i18n="pop.tabUs">我们</span></button>
              <button type="button" data-pop-tab="me"><i data-lucide="user-round"></i><span data-phone-i18n="pop.me">我</span></button>
            </nav>
          </section>

          <section class="mini-view mini-moments" data-phone-screen="moments" hidden>
            <header class="mini-appbar">
              <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="返回"><i data-lucide="chevron-left"></i></button>
              <div><strong data-phone-i18n="pop.moments">朋友圈</strong></div>
              <button type="button" class="mini-icon-button" data-moment-compose data-phone-i18n-aria="pop.publishMoment" aria-label="发布动态"><i data-lucide="camera"></i></button>
            </header>
            <div class="mini-moments-wx">
              <header class="mini-moments-cover" data-moments-cover-standalone>
                <div class="mini-moments-cover__shade" aria-hidden="true"></div>
                <button type="button" class="mini-moments-cover__edit" data-moments-cover-edit data-phone-i18n-aria="pop.coverChange" aria-label="${escapeHtml(pt("pop.coverChange"))}">
                  <i data-lucide="image"></i>
                </button>
                <div class="mini-moments-cover__self">
                  <strong data-moments-cover-name-standalone>你</strong>
                  <span class="mini-moments-cover__avatar" data-moments-cover-avatar-standalone></span>
                </div>
              </header>
              <div class="mini-moment-feed" data-phone-moments></div>
            </div>
          </section>

          ${buildGalleryScreenHtml()}
          ${buildDiaryScreenHtml()}
          ${buildListenScreenHtml()}
          ${buildShopScreenHtml()}
          ${buildGamesScreenHtml()}
          ${buildScrollScreenHtml()}
          ${buildAdventureScreenHtml()}
          ${buildCocreateScreenHtml()}
          ${buildAssetsScreenHtml()}
          ${buildQishiScreenHtml()}
          ${buildExtHostScreenHtml()}
          ${buildGameHostScreenHtml()}
          ${buildTaskCenterScreenHtml()}
          ${buildActivityCenterScreenHtml()}
          ${buildAutonomySettingsScreenHtml()}
          ${buildAgentPermissionsScreenHtml()}
          ${buildDeveloperDiagnosticsScreenHtml()}
          ${buildContextViewerScreenHtml()}
          ${buildExploreScreenHtml()}
          ${buildAssistScreenHtml()}

          <div class="explore-picker-portal" data-agent-picker-host hidden aria-hidden="true"></div>

          <section class="mini-view mini-scenario-host" data-phone-screen="scenario" hidden>
            <div class="mini-scenario-mount" data-scenario-mount></div>
          </section>

          <section class="mini-view mini-theater-host" data-phone-screen="theater" hidden>
            <div class="mini-theater-mount" data-theater-mount></div>
          </section>

          ${buildDispersedAppScreens({
            localeId: phoneData.getLocale(),
          })}
          ${buildBeautifyScreenHtml({
            wallpaperButtons: WALLPAPERS.map((item) => {
              const label = pt(`beautify.wallpaper.${item.id}`);
              return `
              <button type="button" data-wallpaper-id="${item.id}" data-tone="${item.tone}" class="${item.id === (prefs.wallpaper?.homeScreen || "dawn") ? "is-active" : ""}" aria-label="${escapeHtml(label)}">
                <span></span><em>${escapeHtml(label)}</em>
              </button>
            `;
            }).join(""),
            widgets: prefs.widgets,
          })}
          ${buildSettingsHubHtml({
            localeId: phoneData.getLocale(),
            passcodeEnabled: prefs.passcodeEnabled === true,
          })}
          <div class="mini-pop-sheet mini-moment-sheet" data-moment-compose-sheet hidden>
            <button type="button" class="mini-pop-sheet__scrim" data-moment-compose-close data-phone-i18n-aria="screens.close" aria-label="${escapeHtml(pt("screens.close"))}"></button>
            <div class="mini-pop-sheet__panel mini-moment-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="moment-compose-title">
              <header>
                <button type="button" class="mini-moment-sheet__text" data-moment-compose-close data-phone-i18n="screens.cancel">取消</button>
                <strong id="moment-compose-title" data-phone-i18n="pop.momentCompose">写一条</strong>
                <button type="submit" class="mini-moment-sheet__text is-primary" form="moment-compose-form" data-phone-i18n="pop.publish">发表</button>
              </header>
              <form id="moment-compose-form" data-moment-form>
                <p class="mini-moment-sheet__label" data-phone-i18n="pop.momentAs">用谁发</p>
                <div class="mini-moment-authors" data-moment-author-list></div>
                <textarea rows="4" maxlength="280" data-moment-input data-phone-i18n-placeholder="pop.momentThoughtPlaceholder" placeholder="这一刻的想法…"></textarea>
                <p class="mini-moment-sheet__hint" data-phone-i18n="pop.momentNoImage">不配图也可以</p>
                <div class="mini-moment-sheet__media">
                  <button type="button" class="mini-moment-sheet__add" data-moment-add-image>
                    <i data-lucide="image-plus"></i>
                    <span data-phone-i18n="pop.momentAddImage">添加图片</span>
                  </button>
                  <div class="mini-moment-sheet__preview" data-moment-image-preview hidden>
                    <img alt="" data-moment-image-thumb />
                    <button type="button" data-moment-image-clear data-phone-i18n="pop.momentRemoveImage">去掉图片</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
          <input type="file" accept="image/*" hidden data-moments-cover-file />
          <input type="file" accept="image/*" hidden data-moment-image-file />
        </div>
        <p class="mini-phone-toast" data-phone-toast hidden aria-live="polite"></p>
        ${buildAutonomyOnboardingHtml()}
      </div>
    </section>
  `;

  let currentView = "home";
  /** App stack for top-left back (not home indicator). */
  let appViewStack = [];
  let currentPopTab = "chat";
  /** @type {"list"|"thread"} */
  let popChatMode = "list";
  let popSessionQuery = "";
  /** @type {{ characterId: string, sessionId: string }|null} */
  let companionTrackedSession = null;
  let messages = [];
  /** @type {null | { sessionId: string, characterId: string, messageId: string, phase: string, innerState: string, visibleText: string, createdAt: string }} */
  let liveTurn = null;
  let pendingPhoneReply = null;
  const attachmentPreviewUrls = new Map();
  let moments = loadMoments();
  let pendingMomentImage = "";
  /** @type {{ refresh?: () => void, destroy?: () => void } | null} */
  let actionProposalUi = null;
  let clockTimer = 0;
  let destroyed = false;
  let expandTimer = 0;
  let profileExpandedId = "";
  const phoneCharacterEditor = getSharedCharacterEditorController();
  phoneCharacterEditor.bindShell("phone");
  let profilePatchTimer = 0;
  const phoneOriginDirtyIds = new Set();

  function promptMaxLength(limit, value) {
    return Math.max(limit, String(value || "").length);
  }
  /** Sunday-start week anchor for home calendar widget. */
  let homeCalWeekStart = startOfHomeWeek(new Date());
  let homeCalSwipeBound = false;

  const phone = root.querySelector(".mini-phone");
  const content = root.querySelector(".mini-phone__content");
  const lockRoot = root.querySelector("[data-phone-lock]");
  const appGrid1 = root.querySelector('[data-home-app-grid="1"]');
  let appGrids = [appGrid1].filter(Boolean);

  function liveIconPageCount() {
    return clampIconPageCount(prefs.iconPageCount || MIN_ICON_PAGES);
  }

  function liveHomePageCount() {
    return totalHomePages(liveIconPageCount());
  }

  /** Expand/shrink icon pages; rebuild track + dots. Returns true if count grew. */
  function ensureIconPages(nextCount, { goToLast = false } = {}) {
    const prev = liveIconPageCount();
    const next = clampIconPageCount(nextCount);
    const slots = iconSlotsForPages(next);
    let order = Array.isArray(prefs.iconOrder) ? prefs.iconOrder.slice() : [];
    while (order.length < slots) order.push(null);
    if (order.length > slots) order = order.slice(0, slots);
    const grew = next > prev;
    persistPrefs({ iconPageCount: next, iconOrder: order, pageCount: totalHomePages(next) });
    rebuildHomePages();
    if (goToLast || pageIndex >= liveHomePageCount()) {
      pageIndex = liveHomePageCount() - 1;
      persistPrefs({ homePageIndex: pageIndex });
    }
    homePager?.sync(pageIndex);
    return grew || next !== prev;
  }

  function rebuildHomePages() {
    const track = root.querySelector("[data-home-track]");
    const dots = root.querySelector("[data-home-dots]");
    if (!track || !dots) return;
    const widgetPage = track.querySelector('[data-home-page="0"]');
    const iconPages = liveIconPageCount();
    // Remove old icon pages
    track.querySelectorAll('[data-home-page]:not([data-home-page="0"])').forEach((node) => node.remove());
    for (let p = 1; p <= iconPages; p += 1) {
      const page = document.createElement("div");
      page.className = "mini-home__page";
      page.dataset.homePage = String(p);
      page.innerHTML = `
        <div class="mini-app-grid" data-home-app-grid="${p}"></div>
        <p class="mini-home__edit-hint">长按移动；拖到右边缘可加一页</p>
      `;
      track.append(page);
    }
    if (widgetPage && widgetPage.parentElement === track) {
      track.prepend(widgetPage);
    }
    appGrids = Array.from(track.querySelectorAll("[data-home-app-grid]"));
    const total = liveHomePageCount();
    dots.innerHTML = Array.from({ length: total }, (_, i) => (
      `<button type="button" class="${i === pageIndex ? "is-active" : ""}" data-home-dot data-page="${i}" aria-label="${escapeHtml(pt("home.pageLabel", { n: i + 1 }))}"></button>`
    )).join("");
    renderAppGrid(prefs.iconOrder, prefs.folders);
  }
  function onCompanionChanged() {
    refreshHomeWidgets(runtime.getState?.() || {});
    renderProfile();
    renderFloatControl();
    if (currentPopTab === "me") renderPopMe();
    if (currentPopTab === "contacts") renderContacts();
  }
  function onPopContactsChanged() {
    if (currentPopTab === "chat" && popChatMode === "list") renderSessionList();
    if (currentPopTab === "contacts") renderContacts();
    if (currentPopTab === "me") renderPopMe();
  }
  function onCharactersChanged() {
    void renderProfile();
    refreshHomeWidgets(runtime.getState?.() || {});
    renderFloatControl();
    if (currentPopTab === "me") renderPopMe();
    if (currentPopTab === "contacts") renderContacts();
  }
  document.addEventListener(COMPANION_CHANGED_EVENT, onCompanionChanged);
  document.addEventListener(CHARACTERS_CHANGED_EVENT, onCharactersChanged);
  document.addEventListener(POP_CONTACTS_CHANGED_EVENT, onPopContactsChanged);
  void ensurePopContactsMigrated();

  function syncLockSettingsUi({ collapseFold = false } = {}) {
    const enabled = prefs.passcodeEnabled === true;
    const passEnabled = root.querySelector("[data-passcode-enabled]");
    const passInput = root.querySelector("[data-passcode-input]");
    const foldToggle = root.querySelector("[data-passcode-fold-toggle]");
    const fold = root.querySelector("[data-passcode-fold]");
    if (passEnabled) setSwitchState(passEnabled, enabled);
    if (passInput) passInput.value = prefs.passcode;
    if (foldToggle) {
      foldToggle.hidden = !enabled;
      if (!enabled || collapseFold) foldToggle.classList.remove("is-open");
    }
    if (fold) {
      if (!enabled || collapseFold) fold.hidden = true;
    }
  }

  syncLockSettingsUi({ collapseFold: true });

  const phoneCalendar = createPhoneCalendar(root.querySelector('[data-phone-screen="calendar"]'));
  try {
    registerBuiltinCapabilities();
  } catch {
    /* already registered */
  }
  const taskCenter = mountTaskCenterUi(root.querySelector('[data-phone-screen="tasks"]'), {
    getCharacterId: () => {
      try {
        return getActiveCharacterId() || "";
      } catch {
        return "";
      }
    },
    getApproveOpts: () => {
      const focus = getChatFocus?.() || {};
      return {
        userId: "local",
        companionId: String(focus.characterId || getActiveCharacterId() || "").trim(),
        initiatingCompanionId: String(focus.characterId || getActiveCharacterId() || "").trim(),
        chatSessionId: String(focus.sessionId || "").trim(),
        saveChatMessage: typeof saveChatMessage === "function" ? saveChatMessage : undefined,
      };
    },
    onToast: (msg) => phoneToast(msg),
    refreshIcons,
  });
  const contextViewer = mountContextViewerUi(root.querySelector('[data-phone-screen="context"]'), {
    getCharacterId: () => {
      try {
        return getActiveCharacterId() || "";
      } catch {
        return "";
      }
    },
    onToast: (msg) => phoneToast(msg),
    refreshIcons,
  });
  /** Late-bound: filled after mountPopChatPlugins */
  const popPlayBridge = {
    /** @type {(gameId: string) => void} */
    play(gameId) {
      const id = String(gameId || "").trim();
      if (!id) return;
      phoneToast("请先进入 Pop 私聊或群聊");
    },
  };
  const exploreApp = mountExploreApp(root.querySelector('[data-phone-screen="explore"]'), {
    onToast: (msg) => phoneToast(msg),
    getCharacterId: () => {
      try {
        return getActiveCharacterId() || "";
      } catch {
        return "";
      }
    },
    getCharacterName: () => {
      try {
        const c = getCharacterSync(getActiveCharacterId());
        return c?.name || c?.displayName || "";
      } catch {
        return "";
      }
    },
    onPlayInPop: (gameId) => {
      const id = String(gameId || "").trim();
      if (!id) return;
      openApp("pop");
      popPlayBridge.play(id);
    },
    modelFn: createHostSkillModelFn({
      callModel,
      getProviderConfig: () => readProviderConfig(),
      onNeedConfig: () => phoneToast("请先在设置 → 模型服务里配置 API（Key 关掉浏览器会清空）"),
      getHistory: (envelope) => {
        try {
          const api = createProductionConversationApi();
          const run = envelope?.runId ? getSkillRun(envelope.runId) : null;
          const sid = String(
            run?.conversation?.conversationSessionId
            || envelope?.context?.request?.conversationSessionId
            || "",
          ).trim();
          if (!sid) return [];
          const sess = api.getSession?.(sid);
          const history = sess && api.selectVisibleHistory ? api.selectVisibleHistory(sess) : [];
          return history;
        } catch {
          return [];
        }
      },
    }),
  });
  registerExploreApp(exploreApp);

  const phoneAssist = mountPhoneAssist(root.querySelector('[data-phone-screen="assist"]'), {
    onToast: (msg) => phoneToast(msg),
    collectProviderConfig: async () => readProviderConfig(),
    onNavigateSettings: (route) => {
      if (route === "worldbook") openApp("worldbook");
      else if (route === "identity" || route === "behavior" || route === "theme") openApp("profile");
      else if (route === "presets") openApp("presets");
      else if (route === "regex") openApp("regex");
      else if (route === "cloud" || route === "backup") openApp("backup");
      else if (route === "memory") openApp("memory");
      else if (route === "external" || route === "calendar") openApp("calendar");
      else if (route === "assist") openApp("assist");
      else openApp("settings");
    },
  });

  const agentPicker = mountAgentPickerHost(root.querySelector("[data-agent-picker-host]"), {});
  window.addEventListener("yueqi.explore.navigate", () => {
    openApp("explore");
  });
  window.addEventListener("yueqi.agent.open-picker", () => {
    agentPicker?.open?.();
  });
  const phoneDiary = mountPhoneMemoryDiary(root.querySelector("[data-phone-screen='diary']"), {
    getDiaries,
    getAnniversaryDate: () => getCharacterSync(getActiveCharacterId())?.profile?.anniversaryDate || "",
  });
  const refreshPhoneDiaryBook = () => {
    phoneDiary?.refresh?.().catch?.(() => {});
  };
  document.addEventListener("yueqi:diary-saved", refreshPhoneDiaryBook);
  phonePetLibrary = wirePetLibrary(root.querySelector("[data-phone-screen='pet']") || root);
  phonePetSize = wirePetSizeControl(root.querySelector("[data-phone-screen='pet']") || root);
  const onPhonePetChanged = () => renderFloatControl();
  document.addEventListener("yueqi:pet-changed", onPhonePetChanged);
  let toastTimer = 0;
  const TOAST_KEY_BY_ZH = {
    "已保存": "toast.saved",
    "已删除": "toast.deleted",
    "已导出 JSON": "toast.exportOk",
    "导出失败": "toast.exportFail",
    "已导出完整 ZIP": "toast.zipOk",
    "备份接口未就绪": "toast.backupNotReady",
    "完整备份接口未就绪": "toast.backupNotReady",
    "栖币不足，无法转账": "toast.insufficientCoins",
    "栖币不足，转账未发出": "toast.transferBlocked",
    "请先进入 Pop 私聊或群聊": "toast.needPopChat",
    "请先在设置 → 模型服务里配置 API（Key 关掉浏览器会清空）": "toast.needApi",
    "正在定位…": "toast.locating",
    "定位失败，已发送占位位置": "toast.locateFail",
    "无法添加图片": "toast.imageFail",
    "拖动图标换位置，点空白处完成": "toast.rearrange",
    "最多 4 页应用": "toast.maxPages",
    "已添加一页桌面": "toast.pageAdded",
    "信物已发送到 Pop": "toast.tokenSent",
    "舞台推进完成": "toast.stageDone",
    "完成": "toast.done",
    "打开一起玩": "toast.openPlay",
    "打开一个会话后会自动发起": "toast.openSession",
    "打开会话后，点 + → 一起玩": "toast.openSession",
    "请先进入聊天会话": "toast.needChatSession",
    "已添加到通讯录": "toast.addedToContacts",
    "已从通讯录移除（角色库仍保留）": "toast.removedFromContacts",
    "已加入角色库。可在 Pop → 通讯录 → 添加朋友": "toast.joinedLibrary",
    "已导入角色视觉包": "toast.packImported",
    "语音已保存": "toast.voiceSaved",
    "生图配置已保存": "toast.imagegenSaved",
    "已新建角色": "toast.newCharacter",
    "新建失败": "toast.newCharacterFail",
    "已设为陪伴": "toast.setCompanion",
    "切换失败": "toast.setCompanionFail",
    "至少保留一个角色": "toast.keepOneCharacter",
    "删除失败": "toast.deleteFail",
    "保存失败": "toast.saveFail",
    "导入失败": "toast.importFail",
    "已从备份恢复": "toast.restored",
    "已退出": "toast.loggedOut",
    "已换上自定义图片": "toast.customImageApplied",
    "已换颜色": "toast.iconColorChanged",
    "已设为透明": "toast.iconTransparent",
    "已恢复默认图标": "toast.iconRestored",
    "换图失败": "toast.iconChangeFail",
    "预设已更新": "toast.presetUpdated",
    "已开启": "toast.toggledOn",
    "已关闭": "toast.toggledOff",
  };
  function resolveToastMessage(msg) {
    const raw = String(msg || "");
    if (/^[a-z]+\./.test(raw)) {
      const resolved = pt(raw);
      if (resolved !== `phone.${raw}`) return resolved;
    }
    const key = TOAST_KEY_BY_ZH[raw];
    if (key) return pt(key);
    warnIfChineseUiLeak(raw, { source: "phoneToast" });
    return raw;
  }
  function phoneToast(msg, action) {
    const el = root.querySelector("[data-phone-toast]");
    if (!el) return;
    window.clearTimeout(toastTimer);
    msg = resolveToastMessage(msg);
    if (action?.label && typeof action.onClick === "function") {
      const actionLabel = resolveToastMessage(action.label);
      el.innerHTML = `${escapeHtml(String(msg || ""))} <button type="button" class="mini-phone-toast__action">${escapeHtml(String(actionLabel || ""))}</button>`;
      el.querySelector("button")?.addEventListener("click", () => {
        el.hidden = true;
        action.onClick();
      }, { once: true });
    } else {
      el.textContent = String(msg || "");
    }
    el.hidden = false;
    toastTimer = window.setTimeout(() => { el.hidden = true; }, action ? 3200 : 1600);
  }

  async function injectPopSystemMessage(text, meta = {}) {
    const focus = getChatFocus();
    const sessionId = focus?.sessionId;
    const characterId = String(focus?.characterId || getActiveCharacterId() || "").trim();
    const content = String(text || "").trim();
    if (!sessionId || !content) return;
    const messageId = `pop-sys-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    try {
      const { writeCompanionSystemNote } = await import("../conversation/companion-write.js");
      const written = await writeCompanionSystemNote({
        text: content,
        characterId,
        chatSessionId: sessionId,
        messageId,
        meta: { kind: "system", source: "phone_shell", ...meta },
        saveChatMessage: typeof saveChatMessage === "function" ? saveChatMessage : undefined,
      });
      if (!written.ok) {
        console.error("[yueqi.conversation] system note V2 write failed", written.reason);
        return;
      }
      if (!written.projected) {
        messages.push(normalizeMessage({
          id: written.turn?.id || messageId,
          sessionId,
          role: "system",
          content,
          metadata: {
            kind: "system",
            ...meta,
            conversationTurnId: written.turn?.id || "",
            conversationSessionId: written.conversationSessionId || "",
            source: "conversation_runtime",
          },
        }));
        renderMessages();
      } else {
        renderMessages?.();
      }
      return;
    } catch (error) {
      console.error("[yueqi.conversation] system note write failed", error);
    }
  }

  const popPluginRequestUi = createPermissionRequester(phone || root);
  const popChatPlugins = mountPopChatPlugins(root, {
    getChatFocus,
    isThreadActive: () => currentView === "pop" && currentPopTab === "chat" && popChatMode === "thread",
    injectSystemMessage: injectPopSystemMessage,
    startGame: async (gameId) => {
      document.dispatchEvent(new CustomEvent("yueqi:chat-game-start", {
        detail: { gameId: String(gameId || ""), source: "phone_pop" },
      }));
    },
    sendInviteMessage: async (text) => {
      await sendPhoneMessage(String(text || "").trim());
    },
    phoneToast,
    refreshIcons,
    listCharacters,
    requestPermissionUi: popPluginRequestUi,
  });
  popPlayBridge.play = (gameId) => {
    const id = String(gameId || "").trim();
    if (!id) return;
    popChatPlugins.queueGame?.(id);
    popChatPlugins.openGamePicker?.(id);
  };
  window.addEventListener("yueqi.explore.play-in-pop", (event) => {
    const id = String(event?.detail?.gameId || "").trim();
    if (id) {
      openApp("pop");
      popPlayBridge.play(id);
    }
  });

  const appLifecycle = getSharedAppLifecycle();
  try {
    ensureExperienceBindingSlots();
  } catch {
    /* optional */
  }

  const storyApp = mountStoryApp(root.querySelector("[data-scenario-mount]"), {
    collectProviderConfig: async () => {
      if (typeof collectProviderConfig === "function") {
        const config = await collectProviderConfig();
        const apiKey = await phoneData.readApiKey();
        return { ...config, apiKey };
      }
      const provider = phoneData.readProvider();
      const apiKey = await phoneData.readApiKey();
      return { ...provider, apiKey };
    },
    onToast: phoneToast,
    onOpenTheater: () => openApp("theater"),
    onOpenCharacters: () => openApp("profile"),
    onHome: () => exitToHome({ animate: true }),
  });

  const scenarioTheater = mountScenarioTheater(root.querySelector("[data-theater-mount]"), {
    collectProviderConfig,
    listWorldbook: () => phoneData.listWorldbook(),
    onToast: phoneToast,
    onHome: () => exitToHome({ animate: true }),
    onFullscreenChange: (immersive) => {
      const host = root.querySelector(".mini-theater-host");
      const chrome = root.querySelector("[data-scenario-phone-chrome]");
      host?.classList.toggle("is-fullscreen-takeover", Boolean(immersive));
      phone?.classList.toggle("is-scenario-immersive", Boolean(immersive));
      if (chrome) chrome.hidden = Boolean(immersive);
      const theaterActive = root.querySelector('[data-phone-screen="theater"].is-active');
      document.querySelector("[data-companion-float]")?.classList.toggle(
        "is-immersive-suppressed",
        Boolean(theaterActive) || Boolean(immersive),
      );
    },
    onBackgroundComplete: (payload) => {
      appLifecycle.notifyComplete({
        appId: "theater",
        label: payload?.label || "舞台推进完成",
        payload,
      });
      phoneToast(payload?.label || "舞台推进完成", {
        label: "回去继续",
        onClick: () => openApp("theater"),
      });
    },
    onOpenDiary: (payload) => {
      if (payload?.runId) {
        root.dataset.lastLifeRunId = String(payload.runId);
        phone.dataset.lastLifeRunId = String(payload.runId);
      }
      const diaryId = String(payload?.diaryId || "").trim();
      openApp("diary", diaryId ? { entityId: diaryId, diaryId } : undefined);
    },
    onPetIdle: () => {
      try {
        runtime?.recordMessage?.({
          role: "ai",
          text: "",
          source: "theater",
          actionId: "idle_loop",
          emotion: "neutral",
        });
      } catch {
        /* optional */
      }
    },
  });

  appLifecycle.register("theater", {
    capture: () => scenarioTheater?.captureUiState?.() || null,
    restore: (state) => scenarioTheater?.restoreUiState?.(state),
    onBackground: () => scenarioTheater?.onBackground?.(),
    onForeground: () => scenarioTheater?.onForeground?.(),
    getBackgroundJob: () => scenarioTheater?.getBackgroundJob?.() || null,
  });

  const unsubLifecycleNotify = appLifecycle.onNotification((note) => {
    if (note.appId !== "theater") return;
    if (currentView === "theater") return;
    phoneToast(note.label || "完成", {
      label: "打开",
      onClick: () => {
        appLifecycle.consumeNotification(note.id);
        openApp("theater");
      },
    });
  });
  const gamesLobby = mountGamesLobby(root.querySelector("[data-games-mount]"), {
    onToast: phoneToast,
    onOpenYeosGame: (gameId) => openApp(`game:${gameId}`),
    onSessionCompleted: (detail = {}) => {
      emitPhoneAppEvent("game.session.completed", { appId: "games", ...detail });
    },
    onPlayInPop: (gameId) => {
      const id = String(gameId || "").trim();
      openApp("pop");
      const inThread = currentPopTab === "chat" && popChatMode === "thread";
      if (inThread && id) {
        popChatPlugins.startGame?.(id);
        return;
      }
      if (id) popChatPlugins.queueGame?.(id);
      phoneToast(inThread ? "打开一起玩" : (id ? "打开一个会话后会自动发起" : "打开会话后，点 + → 一起玩"));
      if (inThread) popChatPlugins.openGamePicker?.(id);
    },
  });
  const adventureApp = mountAdventureApp(root.querySelector("[data-adventure-mount]"), {
    collectProviderConfig: async () => {
      if (typeof collectProviderConfig === "function") {
        const config = await collectProviderConfig();
        const apiKey = await phoneData.readApiKey();
        return { ...config, apiKey };
      }
      const provider = phoneData.readProvider();
      const apiKey = await phoneData.readApiKey();
      return { ...provider, apiKey };
    },
    onToast: phoneToast,
    onOpenSettings: () => openApp("lab"),
    onHome: () => exitToHome({ animate: true }),
  });
  const scrollPlayer = mountScrollPlayer(root.querySelector("[data-scroll-mount]"), {
    onHome: () => exitToHome({ animate: true }),
    onToast: phoneToast,
    onOpenCharacters: () => openApp("profile"),
    collectProviderConfig: async () => {
      if (typeof collectProviderConfig === "function") {
        const config = await collectProviderConfig();
        const apiKey = await phoneData.readApiKey();
        return { ...config, apiKey };
      }
      const provider = phoneData.readProvider();
      const apiKey = await phoneData.readApiKey();
      return { ...provider, apiKey };
    },
  });
  const assetsHub = mountAssetsHub(root.querySelector("[data-assets-mount]"), {
    onToast: phoneToast,
    collectLibraryState: () => phoneData.readLibrary() || { books: [] },
    onOpenApp: (id) => openApp(id),
    onOpenSettings: (route) => {
      if (route === "worldbook") openApp("worldbook");
      else if (route === "identity" || route === "behavior" || route === "theme") openApp("profile");
      else if (route === "presets") openApp("presets");
      else if (route === "regex") openApp("regex");
      else if (route === "cloud" || route === "backup") openApp("backup");
      else if (route === "account" || route === "diary" || route === "language") openApp("settings");
      else openApp("settings");
    },
    onCharacterImported: () => {
      renderProfile?.();
    },
    getEditingCharacterId: () => getActiveCharacterId(),
  });
  const phonePresets = mountPresetsManager(root.querySelector("[data-phone-presets-mount]"), {
    onToast: phoneToast,
  });
  const phoneRegex = mountRegexManager(root.querySelector("[data-phone-regex-mount]"), {
    onToast: phoneToast,
    onOpenAssist: () => {
      openApp("assist");
    },
  });
  const phoneGallery = mountPhoneGallery(root.querySelector('[data-phone-screen="gallery"]'), {
    listGroups: listPhotoGroups || (async () => []),
    listPhotosInGroup: listPhotosInGroup || getPhotos || (async () => []),
    createGroup: createPhotoGroup,
    renameGroup: renamePhotoGroup,
    deleteGroup: deletePhotoGroup,
    addPhotosToGroup,
    removePhoto,
    markIdentityQa,
    onHome: () => exitToHome({ animate: true }),
  });

  function injectPopComposer(text) {
    const value = String(text || "").trim();
    void openCompanionThread();
    if (!value) return;
    const input = root.querySelector("[data-phone-chat-input]");
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus?.();
    }
  }

  async function injectPopAndSend(text) {
    const value = String(text || "").trim();
    if (!value) return;
    const companionId = String(getActiveCharacterId() || "").trim();
    // Fire the turn first — waiting for openDm/model would leave the book
    // with no chat write if either hangs.
    void sendPhoneMessage(value, "", companionId
      ? { characterId: companionId, routeIntent: "companion_chat" }
      : { routeIntent: "companion_chat" })
      .catch((error) => console.warn("[yueqi.co-read] send highlight to chat failed", error));
    try {
      await openCompanionThread();
    } catch (error) {
      console.warn("[yueqi.co-read] open chat thread failed", error);
      openApp("pop");
    }
  }

  const phoneListen = mountPhoneListen(root.querySelector('[data-phone-screen="listen"]'), {
    getMediaRecord,
    getNowPlaying,
    setNowPlaying,
    storeMediaFile,
    onAnnounce: (text, resolved = {}) => {
      if (!text) return;
      const companionId = String(getChatFocus()?.characterId || getActiveCharacterId() || "").trim();
      if (!companionId) return;
      const state = resolved.state || {};
      const key = `${resolved.reason || "state"}:${state.mediaId || state.title || "media"}:${Boolean(state.paused)}`;
      void projectActivityToChat({
        companionId,
        kind: "co_listen",
        sourceId: `${key}:${state.updatedAt || Date.now()}`,
        text,
        metadata: { source: "co_listen", reason: resolved.reason || "state" },
      });
    },
  });

  const onListenPlayRequest = (event) => {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    if (detail.openApp === false) return;
    try {
      openApp("listen");
      phoneListen?.open?.();
    } catch (error) {
      console.warn("[yueqi.listen] open on chat play failed", error);
    }
  };
  document.addEventListener(LISTEN_PLAY_EVENT, onListenPlayRequest);

  const onCapabilityOpen = (event) => {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    const app = String(detail.openApp || "").trim();
    try {
      if (app) openApp(app);
      if (app === "moments") {
        const compose = root.querySelector("[data-moment-compose]");
        compose?.click?.();
      }
      if (detail.event) {
        document.dispatchEvent(new CustomEvent(String(detail.event), { detail }));
      }
    } catch (error) {
      console.warn("[yueqi.capability] open failed", error);
    }
  };
  document.addEventListener(CAPABILITY_OPEN_EVENT, onCapabilityOpen);

  const phoneReader = mountPhoneReader(root.querySelector('[data-phone-screen="read"]'), {
    getMediaRecord,
    storeMediaFile,
    onToast: (msg) => phoneToast(msg),
    onContinueCoRead: () => injectPopComposer(""),
    onSubmitCoRead: (text) => injectPopAndSend(text),
    // Companion stays silent on open — co-read starts only after 划线 → TA说说.
    onSessionStarted: null,
  });

  // Cold-start: shelf + playlist must exist before first open of 一起看 / 一起听.
  void ensureBuiltinLibrary({ storeMediaFile }).catch((error) => {
    console.warn("[yueqi.library] phone builtin seed failed", error);
  });

  const phoneShop = mountPhoneShop(root.querySelector('[data-phone-screen="shop"]'), {
    onToast: (msg) => {
      const el = root.querySelector("[data-phone-toast]");
      if (el) {
        el.textContent = msg;
        el.hidden = false;
        window.setTimeout(() => { el.hidden = true; }, 1600);
      }
    },
    onGiftSent: () => {
      syncArtifactSurfaces().catch(() => {});
    },
  });

  function resolveExtMeta(extId) {
    const ext = getInstalledExtension(extId);
    if (!ext) return null;
    return {
      label: ext.manifest?.name || extId,
      name: ext.manifest?.name || extId,
      icon: "calendar-heart",
      tone: "yellow",
      iconDataUrl: ext.iconDataUrl || "",
    };
  }

  function resolveGameMeta(gameId) {
    const game = getInstalledGame(gameId);
    if (!game) return null;
    return {
      label: game.manifest?.name || gameId,
      name: game.manifest?.name || gameId,
      icon: "gamepad-2",
      tone: "ember",
      iconDataUrl: game.iconDataUrl || "",
    };
  }

  async function injectExtTokenCard(payload = {}) {
    const title = String(payload.title || "提醒").slice(0, 40);
    const subtitle = String(payload.subtitle || "").slice(0, 80);
    const id = `phone-token-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const message = normalizeMessage({
      id,
      role: "user",
      content: title,
      metadata: {
        mediaType: "token_card",
        token: {
          kind: "reminder",
          title,
          subtitle,
          sourceExtId: payload.sourceExtId || "",
          status: "pending",
        },
      },
    });
    messages.push(message);
    renderMessages();
    phoneToast("信物已发送到 Pop", {
      label: "打开 Pop",
      onClick: () => openApp("pop"),
    });
    try {
      appendCohabitEvent({
        appId: payload.sourceExtId ? `phone-ext:${payload.sourceExtId}` : "pop",
        kind: "token.reminder",
        summary: `发送提醒信物：${title}`,
        characterId: getChatFocus().characterId || getActiveCharacterId(),
      });
    } catch {
      /* ignore */
    }
    return message;
  }

  const qishiApp = mountQishiApp(root.querySelector('[data-phone-screen="qishi"]'), {
    onToast: phoneToast,
    onOpenApp: (appId) => openApp(appId),
    onOpenExt: (extId) => openApp(`ext:${extId}`),
    onOpenGame: (gameId) => openApp(`game:${gameId}`),
    onOpenGames: () => openApp("games"),
    onOpenSettings: () => openApp("settings"),
    isAppOnHome: (appId) => isAppOnHome(appId),
    onAddAppToDesktop: (appId) => {
      prefs = addAppIconToHome(appId);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    onRemoveAppFromDesktop: (appId) => {
      prefs = removeAppIconFromHome(appId);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    onAddToDesktop: (extId) => {
      prefs = addExtIconToHome(extId);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    onAddGameToDesktop: (gameId) => {
      prefs = addGameIconToHome(gameId);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    onRemoveFromDesktop: (extId) => {
      prefs = removeExtIconFromHome(extId);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    onRemoveGameFromDesktop: (gameId) => {
      prefs = removeGameIconFromHome(gameId);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    onInstalled: () => {
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
      popChatPlugins.renderToolbar();
    },
  });

  const extRuntime = mountExtRuntime(root.querySelector('[data-phone-screen="ext-host"]'), {
    phoneRoot: phone,
    onToast: phoneToast,
    onHome: () => exitToHome({ animate: true }),
    onUninstalled: (extId) => {
      prefs = removeExtIconFromHome(extId);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    onReport: (extId) => {
      openApp("qishi");
      const ext = getInstalledExtension(extId);
      qishiApp.openReport?.(extId, ext?.manifest?.name || extId);
    },
    onPermissions: (extId) => {
      openApp("settings");
      gateUi?.refresh?.();
    },
    sendMessage: (text) => sendPhoneMessage(text),
    sendTokenCard: injectExtTokenCard,
    getRecentMessages: async ({ limit = 20 } = {}) => messages.slice(-limit),
    getActiveProfileSummary: () => {
      const character = getCharacterSync(getActiveCharacterId());
      if (!character) return null;
      return {
        id: character.id,
        name: character.name,
        avatarUrl: resolveCharacterAvatarUrl(character),
      };
    },
    isDnd: () => false,
    showToast: phoneToast,
  });

  async function readProviderConfig() {
    if (typeof collectProviderConfig === "function") {
      return collectProviderConfig();
    }
    const provider = phoneData.readProvider();
    return {
      kind: "OpenAI Compatible",
      baseUrl: provider.baseUrl || "",
      apiKey: await phoneData.readApiKey(),
      model: provider.model || "",
    };
  }

  const gameShell = mountGameShell(root.querySelector('[data-phone-screen="game-host"]'), {
    phoneRoot: phone,
    onHome: () => exitToHome({ animate: true }),
    onUninstalled: (gameId) => {
      prefs = removeGameIconFromHome(gameId);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    getCharacters: () => listCharacters(),
    getPlayer: () => ({ name: "你", avatarUrl: "" }),
    callModel: async ({ messages }) => {
      const config = await readProviderConfig();
      const result = await callModel(config, messages, { stream: false });
      return { content: String(result?.content || ""), model: config.model };
    },
  });

  const gateUiDeps = {
    onToast: phoneToast,
    onImportDraft: (text) => {
      injectPopComposer(text);
      openApp("pop");
    },
  };
  let gateUi = mountGateUi(root.querySelector('[data-phone-screen="settings"]'), gateUiDeps);

  let phoneComposerChrome = null;
  const phoneAttachInput = root.querySelector("[data-phone-attach-input]");
  const phoneTokenCompose = bindTokenComposeSheets(root, {
    onToast: phoneToast,
    onSend: (text) => sendPhoneMessage(text),
  });
  const phoneGiftCompose = bindGiftComposeSheet(root, {
    onToast: phoneToast,
    getCharacterId: () => getChatFocus().characterId || getActiveCharacterId() || "",
    openShopBag: () => openApp("shop"),
    onSent: () => {
      syncArtifactSurfaces().catch(() => {});
    },
    labels: {
      empty: pt("shop.emptyBag"),
      emptyHint: pt("pop.sendGiftEmptyHint"),
      goShop: pt("shop.browse"),
      send: pt("shop.sendToTa"),
      qty: "×{n}",
    },
  });
  phoneComposerChrome = bindComposerChrome({
    plusBtn: root.querySelector("[data-phone-plus]"),
    micBtn: root.querySelector("[data-phone-mic]"),
    holdBtn: root.querySelector("[data-phone-hold]"),
    sendBtn: root.querySelector("[data-phone-send]"),
    speakBtn: root.querySelector("[data-phone-speak-char]"),
    textInput: root.querySelector("[data-phone-chat-input]"),
    plusSheet: root.querySelector("[data-phone-plus-sheet]"),
    stickerSheet: root.querySelector("[data-phone-stickers]"),
    fileInput: phoneAttachInput,
    form: root.querySelector("[data-phone-chat-form]"),
    ns: "mini-composer",
    onPickSticker: (sticker) => {
      if (!sticker?.url) return;
      sendPhoneSticker(sticker);
    },
    onPlusAction: (kind) => {
      if (kind === "listen") openApp("listen");
      else if (kind === "note") openApp("diary");
      else if (kind === "memory") openApp("memory");
      else if (kind === "game") {
        popChatPlugins.openGamePicker?.();
      } else if (kind === "transfer") phoneTokenCompose.open("transfer");
      else if (kind === "gift") phoneGiftCompose.open();
      else if (kind === "location") {
        if (root.dataset.locating === "1") return;
        root.dataset.locating = "1";
        notifyChatFeedback("正在定位…", { source: "phone_location" });
        captureShareLocation()
          .then((loc) => {
            if (!loc.ok) {
              notifyChatFeedback(loc.error || "定位失败，已发送占位位置", {
                tone: "warning",
                source: "phone_location",
              });
            } else {
              notifyChatFeedback("已发送位置", { tone: "success", source: "phone_location" });
            }
            return sendPhoneMessage(loc.text, "", {
              location: loc.metadata?.location || { title: loc.title, subtitle: loc.subtitle, lat: loc.lat, lon: loc.lon },
            });
          })
          .catch((error) => {
            notifyChatFeedback(String(error?.message || "定位失败"), {
              tone: "danger",
              source: "phone_location",
            });
          })
          .finally(() => {
            delete root.dataset.locating;
          });
      }
    },
    onCharacterSpeak: () => {
      window.dispatchEvent(new CustomEvent("yueqi.character.speak"));
    },
    onToast: phoneToast,
  });

  window.addEventListener("yueqi.character.speak", () => {
    phoneComposerChrome?.setSpeakBusy?.(true);
  });
  window.addEventListener("yueqi.character.replied", () => {
    phoneComposerChrome?.setSpeakBusy?.(false);
    refreshMessages().catch(() => {});
  });

  const phoneVoice = mountPhoneVoice(root, {
    onToast: phoneToast,
    getInput: () => root.querySelector("[data-phone-chat-input]"),
    isAudioMode: () => phoneComposerChrome?.isAudioMode?.() === true,
    onTranscribed: (text) => {
      const input = root.querySelector("[data-phone-chat-input]");
      const form = root.querySelector("[data-phone-chat-form]");
      if (!text || !form) return;
      if (input) input.value = text;
      form.requestSubmit();
      phoneComposerChrome?.setAudioMode?.(true);
    },
  });
  wireLabVoiceTests(root);

  function refreshPhoneSpeechRoutes({ force = false } = {}) {
    return Promise.all([
      refreshHostedSpeechStatus({ force }),
      refreshDeviceSpeechSupport(),
    ]).then(() => {
    phoneVoice?.syncMic?.();
    phoneVoice?.refreshSpeakButtons?.();
    refreshHostedVoiceUi();
  }).catch(() => {});
}

  phoneAttachInput?.addEventListener("change", async () => {
    const file = phoneAttachInput.files?.[0];
    if (!file) return;
    try {
      const attachment = await buildAttachmentContext(file);
      phoneAttachInput.value = "";
      phoneComposerChrome?.closeSheets?.();
      if (!attachment) return;
      const caption = attachment.type === "image" ? "发了一张图片" : `附件：${attachment.name}`;
      await sendPhoneMessage(caption, "", { attachment });
    } catch (error) {
      const code = String(error?.code || error?.message || "");
      notifyChatFeedback(
        code.includes("too_large")
          ? "附件太大：图片/PDF 不超过 10MB，文本不超过 1MB"
          : String(error?.message || "无法添加附件").slice(0, 80),
        { tone: "warning", source: "phone_attachment_picker" },
      );
    }
  });

  const phoneCocreate = mountCocreateApp(root.querySelector("[data-cocreate-mount]"), {
    onToast: phoneToast,
    onOpenScenario: () => openApp("scenario"),
    onOpenProfile: () => openApp("profile"),
    onOpenCharacters: () => openApp("profile"),
    onHome: () => exitToHome({ animate: true }),
    collectProviderConfig: async () => {
      if (typeof collectProviderConfig === "function") {
        return collectProviderConfig();
      }
      const provider = phoneData.readProvider();
      return {
        kind: "OpenAI Compatible",
        baseUrl: provider.baseUrl || "",
        apiKey: await phoneData.readApiKey(),
        model: provider.model || "",
      };
    },
  });

  function persistPrefs(patch = {}) {
    prefs = savePhoneOsPrefs({ ...prefs, ...patch });
    return prefs;
  }

  function renderAppGrid(order = prefs.iconOrder, folders = prefs.folders) {
    const overrides = prefs.iconOverrides || {};
    appGrids.forEach((grid, index) => {
      if (!grid) return;
      const page = index + 1;
      const apps = appsForHomePage(page, order, folders, resolveExtMeta, resolveGameMeta)
        .map((entry) => applyIconFace(entry, overrides));
      grid.innerHTML = apps.map(appIconHtml).join("");
    });
    refreshIcons();
  }

  function renderDock(dockOrder = prefs.dockOrder) {
    const dock = root.querySelector("[data-home-dock]");
    if (!dock) return;
    const overrides = prefs.iconOverrides || {};
    const filled = [];
    for (let i = 0; i < DOCK_SLOT_COUNT; i += 1) {
      const id = dockOrder?.[i];
      if (id == null || id === "") continue;
      filled.push(id);
    }
    // iOS elastic dock: only occupied icons; in edit mode keep one trailing empty to drop into.
    const slots = filled.map((id, slot) => ({ id, slot }));
    if (editMode && filled.length < DOCK_SLOT_COUNT) {
      slots.push({ id: null, slot: filled.length });
    } else if (editMode && filled.length === 0) {
      slots.push({ id: null, slot: 0 });
    }

    dock.dataset.dockCount = String(Math.max(1, filled.length));
    dock.classList.toggle("is-editing-dock", editMode);
    dock.innerHTML = slots.map(({ id, slot }) => {
      const entry = id ? applyIconFace(resolveDockEntry(id, resolveExtMeta, resolveGameMeta), overrides) : null;
      if (!entry) {
        return `<div class="mini-dock__slot is-empty" data-dock-slot="${slot}" aria-hidden="true"><i></i></div>`;
      }
      return `
        <div class="mini-dock__slot" data-dock-slot="${slot}">
          <button type="button" class="mini-app-icon mini-dock-icon" data-app-id="${escapeHtml(entry.id)}" data-dock-slot="${slot}" aria-label="${escapeHtml(entry.label)}">
            ${appFaceInnerHtml(entry, escapeHtml)}
          </button>
        </div>
      `;
    }).join("");
    refreshIcons();
  }

  function renderHomeLayout(order = prefs.iconOrder, folders = prefs.folders, dockOrder = prefs.dockOrder) {
    renderAppGrid(order, folders);
    renderDock(dockOrder);
  }

  function closeFolderSheet() {
    const sheet = root.querySelector("[data-folder-sheet]");
    if (!sheet) return;
    sheet.hidden = true;
    sheet.classList.remove("is-creator-hub");
    sheet.querySelector(".mini-folder-sheet__panel")?.classList.remove("is-creator-hub-panel");
    const title = sheet.querySelector("[data-folder-title]");
    if (title) title.hidden = false;
    const grid = sheet.querySelector("[data-folder-grid], .mini-folder-sheet__hub");
    if (grid) grid.className = "mini-folder-sheet__grid";
  }

  function openFolderSheet(folderId) {
    const folder = prefs.folders?.[folderId];
    const sheet = root.querySelector("[data-folder-sheet]");
    const title = root.querySelector("[data-folder-title]");
    const grid = root.querySelector("[data-folder-grid]");
    if (!folder || !sheet || !grid) return;

    const panel = sheet.querySelector(".mini-folder-sheet__panel");
    sheet.classList.remove("is-creator-hub");
    if (panel) panel.classList.remove("is-creator-hub-panel");
    if (title) {
      title.hidden = false;
      title.textContent = folder.name || pt("pop.folderTitle");
    }
    grid.className = "mini-folder-sheet__grid";
    const overrides = prefs.iconOverrides || {};
    const apps = (folder.apps || [])
      .map((id) => localizeApp(PHONE_APP_MAP[id]))
      .filter(Boolean)
      .map((app) => applyIconFace({ ...app, type: "app" }, overrides));
    grid.innerHTML = apps.length
      ? apps.map((app) => appIconHtml(app)).join("")
      : `<p class="mini-empty">${escapeHtml(pt("pop.folderEmpty"))}</p>`;
    sheet.hidden = false;
    refreshIcons();
  }

  function setEditMode(next) {
    const on = Boolean(next);
    if (!on) {
      // Drop empty dock placeholders first, then leave edit chrome — avoids dashed flash.
      editMode = false;
      renderDock(prefs.dockOrder);
      phone.classList.remove("is-home-editing");
      return;
    }
    editMode = true;
    phone.classList.add("is-home-editing");
    iconFaceSheet?.close?.();
    closeFolderSheet();
    homePager?.cancel?.();
    pageIndex = Math.max(ICON_PAGE_MIN, pageIndex || ICON_PAGE_MIN);
    homePager?.sync(pageIndex);
    renderDock(prefs.dockOrder);
  }

  function applyWidgets() {
    root.querySelectorAll("[data-widget]").forEach((node) => {
      const key = node.dataset.widget;
      node.hidden = prefs.widgets?.[key] === false;
    });
    renderHomeWidgetsLayout();
  }

  function renderHomeWidgetsLayout() {
    const host = root.querySelector("[data-home-widgets]");
    if (!host) return;
    const order = normalizeWidgetOrder(prefs.widgetOrder, prefs.widgets);
    prefs.widgetOrder = order;
    const nodes = new Map();
    host.querySelectorAll("[data-widget]").forEach((node) => {
      const id = node.dataset.widget;
      if (id) nodes.set(id, node);
    });
    order.forEach((id) => {
      const node = nodes.get(id);
      if (!node) return;
      node.hidden = prefs.widgets?.[id] === false;
      host.append(node);
    });
    const visibleCompact = order.filter((id) => (
      (id === "today" || id === "listen") && prefs.widgets?.[id] !== false
    ));
    host.querySelectorAll("[data-widget]").forEach((node) => {
      const id = node.dataset.widget;
      const compact = id === "today" || id === "listen";
      node.dataset.widgetSpan = !compact || visibleCompact.length === 1 ? "wide" : "half";
    });
  }

  let wallpaperSheetTarget = "home";

  function wallpaperCssValue(value) {
    if (WALLPAPER_PRESET_IDS.has(value)) {
      const gradients = {
        dawn: "linear-gradient(165deg, #f6efe6 0%, #e8f2ee 50%, #d7e7e1 100%)",
        rose: "linear-gradient(165deg, #f6e7e4 0%, #f0ebe6 52%, #e4d5d0 100%)",
        mist: "linear-gradient(165deg, #e8f1f0 0%, #dce9e8 48%, #c9dcd8 100%)",
        ink: "linear-gradient(165deg, #2a3338 0%, #1d262b 55%, #141a1e 100%)",
        sand: "linear-gradient(165deg, #f4ead8 0%, #ebe0cf 50%, #e0d1b8 100%)",
      };
      return gradients[value] || gradients.dawn;
    }
    if (isWallpaperImageValue(value)) {
      const safe = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `center / cover no-repeat url("${safe}")`;
    }
    return wallpaperCssValue("dawn");
  }

  function paintWallpaperPreview(node, value) {
    if (!node) return;
    node.style.background = wallpaperCssValue(value);
    node.dataset.wallpaperKind = WALLPAPER_PRESET_IDS.has(value) ? "preset" : "image";
  }

  function applyWallpaper(pair = prefs.wallpaper) {
    const next = normalizeWallpaperPair(pair);
    prefs.wallpaper = next;
    const tone = wallpaperToneForPair(next, prefs.wallpaperTone);
    prefs.wallpaperTone = tone;
    phone.dataset.wallpaperTone = tone;
    const homePreset = WALLPAPER_PRESET_IDS.has(next.homeScreen) ? next.homeScreen : "custom";
    phone.dataset.wallpaper = homePreset;
    phone.style.setProperty("--phone-wallpaper-home", wallpaperCssValue(next.homeScreen));
    phone.style.setProperty("--phone-wallpaper-lock", wallpaperCssValue(next.lockScreen));
    phone.style.setProperty("--phone-wallpaper", wallpaperCssValue(next.homeScreen));

    root.querySelectorAll("[data-wallpaper-id]").forEach((button) => {
      const id = button.dataset.wallpaperId;
      const active = next.homeScreen === id && next.lockScreen === id;
      button.classList.toggle("is-active", active);
    });
    paintWallpaperPreview(root.querySelector('[data-wallpaper-preview="lock"]'), next.lockScreen);
    paintWallpaperPreview(root.querySelector('[data-wallpaper-preview="home"]'), next.homeScreen);
  }

  function openWallpaperSheet(target = "home") {
    wallpaperSheetTarget = target === "lock" ? "lock" : "home";
    const sheet = root.querySelector("[data-wallpaper-sheet]");
    const title = root.querySelector("[data-wallpaper-sheet-title]");
    const urlInput = root.querySelector("[data-wallpaper-url]");
    if (title) {
      title.textContent = wallpaperSheetTarget === "lock"
        ? pt("beautify.changeLockWallpaper")
        : pt("beautify.changeHomeWallpaper");
    }
    const current = wallpaperSheetTarget === "lock" ? prefs.wallpaper.lockScreen : prefs.wallpaper.homeScreen;
    if (urlInput) urlInput.value = isWallpaperImageValue(current) && /^https?:/i.test(current) ? current : "";
    root.querySelectorAll("[data-wallpaper-sheet-picks] [data-wallpaper-id]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.wallpaperId === current);
    });
    if (sheet) sheet.hidden = false;
    refreshIcons();
  }

  function closeWallpaperSheet() {
    const sheet = root.querySelector("[data-wallpaper-sheet]");
    if (sheet) sheet.hidden = true;
  }

  function setWallpaperValue(target, value, { tone } = {}) {
    const key = target === "lock" ? "lockScreen" : "homeScreen";
    const next = {
      ...normalizeWallpaperPair(prefs.wallpaper),
      [key]: value,
    };
    if (tone === "dark" || tone === "light") prefs.wallpaperTone = tone;
    persistPrefs({ wallpaper: next, wallpaperTone: prefs.wallpaperTone });
    applyWallpaper(next);
  }

  function setWallpaperBoth(value, { tone } = {}) {
    const next = { lockScreen: value, homeScreen: value };
    if (tone === "dark" || tone === "light") prefs.wallpaperTone = tone;
    else if (WALLPAPER_PRESET_IDS.has(value)) prefs.wallpaperTone = wallpaperMeta(value).tone;
    persistPrefs({ wallpaper: next, wallpaperTone: prefs.wallpaperTone });
    applyWallpaper(next);
  }

  function setLockMode(mode = "TIME") {
    lockMode = mode;
    passcodeBuffer = "";
    const timePane = root.querySelector('[data-lock-pane="TIME"]');
    const passPane = root.querySelector('[data-lock-pane="PASSCODE"]');
    if (timePane) timePane.hidden = mode !== "TIME";
    if (passPane) passPane.hidden = mode !== "PASSCODE";
    paintLockDots();
    phone.dataset.lockMode = mode;
    lockRoot?.classList.toggle("is-passcode", mode === "PASSCODE");
    lockRoot?.classList.remove("is-unlocking", "is-shake");
    // Hide status-bar clock on TIME lock (avoid double clock), show on passcode.
    const statusTime = root.querySelector("[data-phone-time]");
    if (statusTime) statusTime.style.opacity = locked && mode === "TIME" ? "0" : "";
    refreshIcons();
  }

  function paintLockDots() {
    root.querySelectorAll("[data-lock-dots] i").forEach((dot, index) => {
      dot.classList.toggle("is-on", index < passcodeBuffer.length);
    });
  }

  function setLocked(next) {
    locked = Boolean(next);
    phone.dataset.phoneLocked = locked ? "true" : "false";
    if (lockRoot) {
      lockRoot.hidden = !locked;
      lockRoot.classList.remove("is-unlocking");
    }
    if (locked) {
      setLockMode("TIME");
      paintView("home");
      setEditMode(false);
      window.clearInterval(clockTimer);
      clockTimer = window.setInterval(updateLockClock, 1000);
    } else {
      setLockMode("TIME");
      const statusTime = root.querySelector("[data-phone-time]");
      if (statusTime) statusTime.style.opacity = "";
      window.clearInterval(clockTimer);
      clockTimer = window.setInterval(updateGreeting, 30000);
    }
    refreshIcons();
  }

  function unlockPhone() {
    if (!locked) return;
    if (!prefs.passcodeEnabled && lockMode === "TIME") {
      // Direct unlock from swipe when passcode off — still play exit motion.
    }
    lockRoot?.classList.add("is-unlocking");
    window.setTimeout(() => {
      setLocked(false);
      syncArtifactSurfaces();
      pageIndex = Math.max(0, Math.min(liveHomePageCount() - 1, Number(prefs.homePageIndex) || 0));
      homePager?.sync(pageIndex);
      refreshHomeWidgets();
    }, 420);
  }

  function tryPasscode(digit) {
    if (lockRoot?.classList.contains("is-shake") || lockRoot?.classList.contains("is-unlocking")) return;
    if (digit === "del") {
      passcodeBuffer = passcodeBuffer.slice(0, -1);
      paintLockDots();
      return;
    }
    if (!/^\d$/.test(String(digit))) return;
    if (passcodeBuffer.length >= 4) return;
    passcodeBuffer += String(digit);
    paintLockDots();
    if (passcodeBuffer.length < 4) return;
    if (passcodeBuffer === prefs.passcode) {
      unlockPhone();
      return;
    }
    const dots = root.querySelector("[data-lock-dots]");
    dots?.classList.add("is-shake");
    lockRoot?.classList.add("is-shake");
    window.setTimeout(() => {
      dots?.classList.remove("is-shake");
      lockRoot?.classList.remove("is-shake");
      passcodeBuffer = "";
      paintLockDots();
    }, 420);
  }

  function isInApp() {
    return !locked && currentView !== "home";
  }

  function paintView(view = "home") {
    const prev = currentView;
    const target = root.querySelector(`[data-phone-screen="${view}"]`) ? view : "home";
    if (prev && prev !== "home" && prev !== target) {
      try {
        appLifecycle.background(prev);
      } catch {
        /* optional */
      }
    }
    currentView = target;
    phone.dataset.phoneView = target;
    phone.dataset.phonePlane = target === "home" ? "home" : "app";
    // Full-screen takeover: when in an app, home chrome must not bleed through.
    phone.classList.toggle("is-app-fullscreen", target !== "home");
    // 桌宠不进舞台剧；剧情会话不压制桌宠
    if (target !== "theater" && target !== "scenario") {
      document.querySelector("[data-companion-float]")?.classList.remove("is-immersive-suppressed");
      phone?.classList.remove("is-scenario-immersive");
    }
    root.querySelectorAll("[data-phone-screen]").forEach((screen) => {
      const active = screen.dataset.phoneScreen === target;
      screen.classList.toggle("is-active", active);
      screen.hidden = !active;
    });
    if (target === "pop") {
      if (popChatMode === "thread") refreshMessages();
      else {
        popSessionQuery = "";
        const queryInput = root.querySelector("[data-pop-session-query]");
        if (queryInput) queryInput.value = "";
        setPopChatMode("list");
        renderSessionList();
      }
      syncPopChrome();
      phoneVoice?.syncMic?.();
    }
    if (target === "moments") {
      renderMoments();
      emitPhoneAppEvent("feed.post.viewed", { appId: "moments" });
    }
    if (target === "gallery") phoneGallery?.open?.();
    if (target === "diary") {
      tickCompanionLife("view_diary");
      emitPhoneAppEvent("diary.viewed", { appId: "diary" });
      phoneDiary?.open?.();
    }
    if (target === "listen") {
      phoneListen?.open?.();
    }
    if (target === "calendar") {
      showPane(root.querySelector('[data-phone-screen="calendar"]'), "calendar-home");
      phoneCalendar?.render?.();
    }
    if (target === "read") phoneReader?.open?.();
    if (target === "shop") phoneShop?.open?.();
    if (target === "profile") {
      renderProfile();
      renderWorldbook();
    }
    if (target === "pet") renderFloatControl();
    if (target === "theater" || target === "scenario") {
      try {
        appLifecycle.foreground("theater");
      } catch {
        /* optional */
      }
      document.querySelector("[data-companion-float]")?.classList.add("is-immersive-suppressed");
      scenarioTheater?.refresh?.();
    }
    if (target === "games") gamesLobby?.open?.();
    if (target === "scroll") scrollPlayer?.open?.();
    if (target === "adventure") adventureApp?.open?.();
    if (target === "assets") assetsHub?.open?.();
    if (target === "qishi") qishiApp?.open?.();
    if (target === "ext-host") {
      /* opened via openApp("ext:…") */
    }
    if (target === "game-host") {
      /* opened via openApp("game:…") */
    }
    if (target === "memory") renderMemory();
    if (target === "lab") renderLab();
    if (target === "tasks") taskCenter?.open?.();
    if (target === "explore") exploreApp?.open?.();
    if (target === "assist") phoneAssist?.refresh?.();
    if (target === "context") contextViewer?.open?.();
    if (target === "settings") {
      renderSettingsExtras();
      gateUi?.refresh?.();
    }
    if (target === "beautify") {
      applyWallpaper(prefs.wallpaper);
      paintBeautifyContact();
    }
    if (target === "cocreate") {
      phoneCocreate?.open?.();
    }
    if (target === "worldbook") {
      showWorldbookList();
      renderWorldbookEditorList().catch(() => {});
    }
    if (target === "presets") phonePresets?.refresh?.();
    if (target === "regex") phoneRegex?.refresh?.();
    runtime.setPanel(`phone-${target === "pop" ? "chat" : target}`);
    refreshIcons();
    osNav.syncHistory();
  }

  function playAppExpand() {
    if (!content) return;
    content.classList.remove("is-app-expanding");
    void content.offsetWidth;
    content.classList.add("is-app-expanding");
    window.clearTimeout(expandTimer);
    expandTimer = window.setTimeout(() => content.classList.remove("is-app-expanding"), 420);
  }

  function maybeInjectObservationReaction() {
    try {
      const cid = getActiveCharacterId() || "";
      const reaction = consumePopObservationReaction(cid);
      if (!reaction.ok || !reaction.text) return;
      const id = `obs-react-${Date.now().toString(36)}`;
      messages.push({
        id,
        role: "ai",
        content: reaction.text,
        createdAt: new Date().toISOString(),
        metadata: { kind: "observation_reaction", evidenceId: reaction.evidenceId },
      });
      renderMessages();
    } catch {
      /* non-blocking */
    }
  }

  async function resolveOpenAppEntity(view, opts = {}) {
    const entityId = String(
      opts.entityId || opts.diaryId || opts.mediaId || opts.orderId || "",
    ).trim();
    if (!entityId) return;
    const resolved = view === "scenario" ? "theater" : view;
    if (resolved === "diary" || opts.diaryId) {
      await phoneDiary?.openToDiaryId?.(entityId);
    } else if (resolved === "gallery" || opts.mediaId) {
      await phoneGallery?.openToMediaId?.(entityId);
    } else if (resolved === "shop" || opts.orderId) {
      phoneShop?.openToOrder?.(entityId);
    }
  }

  function openApp(view = "home", opts = null) {
    if (locked || editMode) return;
    const route = opts && typeof opts === "object" ? opts : null;
    if (route) {
      const deepLink = String(route.deepLink || "").trim();
      const artifactId = String(route.artifactId || "").trim();
      if (deepLink || artifactId) {
        void openPhoneDeepLink(deepLink || artifactDeepLink(artifactId), route);
        return;
      }
    }
    // P0: archived experience apps — freeze entry; content archive later.
    // E2E experience stub may still open them for cutover / life-journey coverage.
    const e2eExperienceStub = Boolean(
      (typeof window !== "undefined" && window.__YUEQI_E2E_EXPERIENCE_STUB__)
      || (typeof localStorage !== "undefined" && localStorage.getItem("yueqi.e2e.experienceStub") === "1"),
    );
    const archivedIds = new Set(["scroll", "adventure", "cocreate"]);
    if (!e2eExperienceStub && archivedIds.has(String(view || "").trim())) {
      phoneToast("该体验已冻结：可在开发者诊断导出只读归档，内容不会删除");
      import("./experience-archive.js").then(({ censusExperienceArchives }) => {
        const census = censusExperienceArchives();
        console.info("[yueqi.archive] frozen open blocked", view, census);
      }).catch(() => {});
      return;
    }
    // 查手机已下线 — 旧入口落到桌面
    if (view === "sidewrite") {
      exitToHome({ animate: false });
      return;
    }
    const extParsed = parseExtDesktopId(view);
    if (extParsed) {
      const from = currentView;
      const wasHome = from === "home";
      if (!wasHome && from !== "ext-host") {
        if (appViewStack[appViewStack.length - 1] !== from) appViewStack.push(from);
      } else if (wasHome) {
        appViewStack = [];
      }
      paintView("ext-host");
      extRuntime?.open?.(extParsed.extId);
      if (wasHome) playAppExpand();
      return;
    }
    const gameParsed = parseGameDesktopId(view);
    if (gameParsed) {
      const from = currentView;
      const wasHome = from === "home";
      if (!wasHome && from !== "game-host") {
        if (appViewStack[appViewStack.length - 1] !== from) appViewStack.push(from);
      } else if (wasHome) {
        appViewStack = [];
      }
      paintView("game-host");
      gameShell?.open?.(gameParsed.gameId);
      if (wasHome) playAppExpand();
      return;
    }
    const resolved = view === "scenario" ? "theater" : view;
    const target = root.querySelector(`[data-phone-screen="${resolved}"]`) ? resolved : "home";
    if (target === "home") {
      exitToHome({ animate: false });
      return;
    }
    const from = currentView;
    const wasHome = from === "home";
    // Returning to a screen already on the stack must pop, not push.
    // Prevents settings ↔ child ping-pong when a back chevron uses data-phone-open.
    if (from === target) {
      paintView(target);
      if (route) void resolveOpenAppEntity(target, route);
      return;
    }
    const stackIdx = appViewStack.lastIndexOf(target);
    if (stackIdx >= 0) {
      appViewStack = appViewStack.slice(0, stackIdx);
      paintView(target);
      if (route) void resolveOpenAppEntity(target, route);
      return;
    }
    if (!wasHome) {
      if (appViewStack[appViewStack.length - 1] !== from) appViewStack.push(from);
      if (appViewStack.length > 16) appViewStack.shift();
    } else {
      appViewStack = [];
    }
    paintView(target);
    if (wasHome) playAppExpand();
    if (target === "pop") {
      maybeInjectObservationReaction();
    }
    if (route) {
      void resolveOpenAppEntity(target, route);
    }
  }

  function goBack() {
    if (editMode) {
      setEditMode(false);
      return;
    }
    const folderSheet = root.querySelector("[data-folder-sheet]");
    if (folderSheet && !folderSheet.hidden) {
      closeFolderSheet();
      return;
    }
    if (currentView === "pop") {
      if (popChatMode === "thread") {
        setPopChatMode("list");
        return;
      }
      const openSheet = root.querySelector(".mini-pop-sheet:not([hidden])");
      if (openSheet) {
        closeContactSheets();
        closeAllComposeSheets();
        return;
      }
    }
    if (currentView === "read") {
      const readerPane = root.querySelector('[data-phone-pane-view="read-reader"]');
      if (readerPane && !readerPane.hidden) {
        root.querySelector("[data-phone-reader-back]")?.click();
        return;
      }
    }
    if (currentView === "gallery") {
      const grid = root.querySelector('[data-gallery-pane="grid"]');
      if (grid && !grid.hidden) {
        root.querySelector("[data-gallery-back]")?.click();
        return;
      }
    }
    if (currentView === "shop" && phoneShop?.handleBack?.()) {
      return;
    }
    const leaving = currentView;
    const seen = new Set([leaving]);
    while (appViewStack.length) {
      const prev = appViewStack.pop();
      if (!prev || seen.has(prev)) continue;
      seen.add(prev);
      if (!root.querySelector(`[data-phone-screen="${prev}"]`)) continue;
      // Drop the screen we leave so a later open cannot re-form A↔B cycles.
      appViewStack = appViewStack.filter((id) => id !== leaving);
      paintView(prev);
      return;
    }
    osNav.exitToHome({ source: "ui" });
  }

  function exitToHome({ animate = true } = {}) {
    // Explicit home (settings shortcuts / data-phone-home) — not a fake iOS home bar.
    appViewStack = [];
    if (currentView === "home") {
      osNav.syncHistory();
      return;
    }
    if (animate && content) {
      content.classList.add("is-app-closing");
      window.setTimeout(() => {
        content.classList.remove("is-app-closing");
        paintView("home");
      }, 160);
      return;
    }
    paintView("home");
  }

  function setView(view = "home") {
    if (view === "home") osNav.exitToHome({ source: "setView" });
    else openApp(view);
  }

  const osNav = createPhoneOsNavigation({
    isInApp,
    // Android back / iOS edge-swipe / browser history → same as in-app back.
    onBack: () => {
      goBack();
    },
    onExitToHome: () => {
      exitToHome({ animate: true });
    },
  });
  osNav.attach();
  const unregisterSystemBack = registerSystemBack(() => {
    if (root.hidden) return false;
    if (locked) return true;
    const folderOpen = Boolean(root.querySelector("[data-folder-sheet]:not([hidden])"));
    if (!isInApp() && !folderOpen) return false;
    goBack();
    return true;
  });

  const homePager = bindHomePager(root.querySelector("[data-home-pager]"), {
    getPageCount: () => liveHomePageCount(),
    getPageIndex: () => pageIndex,
    setPageIndex: (next) => {
      pageIndex = Math.max(0, Math.min(liveHomePageCount() - 1, next));
      persistPrefs({ homePageIndex: pageIndex });
    },
    // Allow swipe while arranging icons so pages are real, not decorative.
    canPage: () => !locked && currentView === "home",
  });

  // Materialize icon pages from prefs (may be >1 after user added pages).
  rebuildHomePages();
  homePager?.sync(pageIndex);

  const homeRoot = root.querySelector(".mini-home");
  iconFaceSheet = mountIconFaceSheet(homeRoot, {
    getOverrides: () => prefs.iconOverrides || {},
    setOverrides: (next) => {
      persistPrefs({ iconOverrides: next });
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    resolveExt: resolveExtMeta,
    onArrange: () => {
      setEditMode(true);
      phoneToast("拖动图标换位置，点空白处完成");
    },
    onToast: phoneToast,
  });
  const unbindIconEditor = bindIconEditor(homeRoot, {
    getOrder: () => prefs.iconOrder,
    getDock: () => prefs.dockOrder,
    setOrder: (order, folders, dock) => {
      const patch = { iconOrder: order };
      if (folders) patch.folders = folders;
      if (dock) patch.dockOrder = dock;
      persistPrefs(patch);
      renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    },
    setDock: (dock) => {
      persistPrefs({ dockOrder: dock });
      renderDock(prefs.dockOrder);
    },
    getFolders: () => prefs.folders || {},
    setFolders: (folders) => {
      persistPrefs({ folders });
      renderAppGrid(prefs.iconOrder, prefs.folders);
    },
    getPageIndex: () => pageIndex,
    setPageIndex: (next) => {
      pageIndex = Math.max(0, Math.min(liveHomePageCount() - 1, next));
      persistPrefs({ homePageIndex: pageIndex });
    },
    syncPage: (next) => homePager?.sync?.(next),
    getGridForPage: (page) => root.querySelector(`[data-home-app-grid="${page}"]`) || appGrids[0],
    getDockRoot: () => root.querySelector("[data-home-dock]"),
    getIconPageMax: () => liveIconPageCount(),
    onNeedNewPage: () => {
      if (liveIconPageCount() >= MAX_ICON_PAGES) {
        phoneToast("最多 4 页应用");
        return false;
      }
      ensureIconPages(liveIconPageCount() + 1, { goToLast: true });
      phoneToast("已添加一页桌面");
      return true;
    },
    onLiveLayout: ({ order, dock, folders }) => {
      renderHomeLayout(order, folders || prefs.folders, dock);
    },
    isEditMode: () => editMode,
    setEditMode,
    onDragStart: () => homePager?.cancel?.(),
    onOpenApp: (id) => openApp(id),
    onOpenFolder: (folderId) => openFolderSheet(folderId),
    onIconFaceEdit: (id) => iconFaceSheet.open(id),
  });

  const unbindWidgetEditor = bindWidgetEditor(homeRoot, {
    getOrder: () => normalizeWidgetOrder(prefs.widgetOrder, prefs.widgets),
    setOrder: (ids) => {
      persistPrefs({ widgetOrder: normalizeWidgetOrder(ids, prefs.widgets) });
      renderHomeWidgetsLayout();
    },
    getContainer: () => root.querySelector("[data-home-widgets]"),
    isBlocked: () => locked || editMode || currentView !== "home",
    onDragStart: () => homePager?.cancel?.(),
  });

  function setPopTab(tab = "chat") {
    currentPopTab = root.querySelector(`[data-pop-panel="${tab}"]`) ? tab : "chat";
    root.querySelectorAll("[data-pop-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.popTab === currentPopTab));
    root.querySelectorAll("[data-pop-panel]").forEach((panel) => {
      const active = panel.dataset.popPanel === currentPopTab;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (currentPopTab === "chat") {
      if (popChatMode === "thread") refreshMessages();
      else renderSessionList();
    }
    if (currentPopTab === "contacts") renderContacts();
    if (currentPopTab === "moments") {
      renderMoments(root.querySelector("[data-phone-moments-inline]"));
      emitPhoneAppEvent("feed.post.viewed", { appId: "moments", surface: "pop" });
    }
    if (currentPopTab === "me") {
      renderPopMe();
      renderWalletPanel();
    }
    syncPopChrome();
    runtime.setPanel(`phone-${currentPopTab}`);
    refreshIcons();
  }

  function syncPopChrome() {
    const title = root.querySelector("[data-pop-title]");
    const status = root.querySelector("[data-pop-status]");
    const headerAction = root.querySelector("[data-pop-header-action]");
    const headerIcon = root.querySelector("[data-pop-header-icon]");
    const focus = getChatFocus();
    const inThread = currentPopTab === "chat" && popChatMode === "thread";
    root.querySelector('[data-phone-screen="pop"]')?.classList.toggle("is-thread", inThread);
    const tabTitles = {
      chat: inThread ? null : pt("pop.tabTalk"),
      contacts: pt("pop.tabRoom"),
      moments: pt("pop.tabUs"),
      me: pt("pop.me"),
    };
    if (title) {
      if (inThread) {
        if (focus.kind === "group") title.textContent = focus.title || pt("pop.chat");
        else title.textContent = getCharacterSync(focus.characterId)?.name || pt("pop.chat");
      } else {
        title.textContent = tabTitles[currentPopTab] || pt("pop.chat");
      }
    }
    if (status) {
      if (!inThread) {
        status.hidden = true;
        status.textContent = "";
      } else if (focus.kind === "group") {
        status.hidden = false;
        const n = (focus.memberIds || []).length;
        status.textContent = getLocale() === "en" ? `${n} members` : `${n}人`;
      } else {
        status.hidden = false;
        const character = getCharacterSync(focus.characterId);
        const togetherDays = togetherDaysFromAnniversary(character?.profile?.anniversaryDate || "");
        const hour = new Date().getHours();
        const mood = hour < 6 || hour >= 22
          ? pt("pop.roomQuiet")
          : hour < 11
            ? pt("home.atmosphereMorning")
            : hour < 18
              ? pt("home.atmosphereAfternoon")
              : pt("home.atmosphereDusk");
        status.textContent = togetherDays != null
          ? `${mood} · ${pt("home.relationshipDay", { days: togetherDays })}`
          : mood;
      }
    }
    // Intimate thread: mood lives in the appbar subtitle — no second header card.
    const relation = root.querySelector("[data-pop-relation]");
    if (relation) relation.hidden = true;
    if (headerAction) {
      const showCompose = currentPopTab === "chat" && popChatMode === "list";
      const showAdd = currentPopTab === "contacts";
      headerAction.hidden = !(showCompose || showAdd);
      headerAction.dataset.popHeaderKind = showAdd ? "add-friend" : "new-chat";
      headerAction.setAttribute("aria-label", showAdd ? pt("pop.addFriend") : pt("pop.startChat"));
      if (headerIcon) {
        headerIcon.setAttribute("data-lucide", showAdd ? "user-plus" : "square-pen");
      }
    }
    const input = root.querySelector("[data-phone-chat-input]");
    if (input) {
      input.placeholder = inThread && focus.kind === "group"
        ? pt("pop.composerPlaceholderGroup")
        : pt("pop.composerPlaceholder");
    }
    popChatPlugins.renderToolbar();
    refreshIcons();
  }

  function syncCompanionTrackedSession() {
    const focus = getChatFocus();
    companionTrackedSession = {
      characterId: String(focus.characterId || getActiveCharacterId() || "").trim(),
      sessionId: String(focus.sessionId || "").trim(),
    };
  }

  function finalizeCompanionSession(target = companionTrackedSession, reason = "session_end") {
    const characterId = String(target?.characterId || "").trim();
    const sessionId = String(target?.sessionId || "").trim();
    if (!characterId || !sessionId) return;
    Promise.resolve(onCompanionSessionEnd({
      characterId,
      sessionId,
      messages: messages.map((row) => ({
        role: row.role === "user" ? "user" : "assistant",
        content: String(row.content || ""),
      })),
    })).catch((error) => console.warn("[yueqi.companion] session end hook failed", error));
    if (reason !== "destroy") syncCompanionTrackedSession();
  }

  function setPopChatMode(mode = "list") {
    if (popChatMode === "thread" && mode === "list") {
      finalizeCompanionSession(companionTrackedSession, "leave_thread");
    }
    popChatMode = mode === "thread" ? "thread" : "list";
    const listPane = root.querySelector('[data-pop-chat-mode="list"]');
    const threadPane = root.querySelector('[data-pop-chat-mode="thread"]');
    if (listPane) listPane.hidden = popChatMode !== "list";
    if (threadPane) threadPane.hidden = popChatMode !== "thread";
    const chatPanel = root.querySelector('[data-pop-panel="chat"]');
    chatPanel?.classList.toggle("is-thread", popChatMode === "thread");
    syncPopChrome();
    if (popChatMode === "list") renderSessionList();
    else {
      syncCompanionTrackedSession();
      refreshMessages();
      emitPhoneAppEvent("pop.message.read", { appId: "pop", sessionId: getChatFocus().sessionId || "" });
    }
    popChatPlugins.renderToolbar();
    runtime.setPanel("phone-chat");
    refreshIcons();
  }

  async function renderSessionList() {
    const list = root.querySelector("[data-pop-session-list]");
    if (!list) return;
    const all = await listPopSessions();
    const query = popSessionQuery.trim().toLowerCase();
    const rows = query
      ? all.filter((row) => `${row.title || ""} ${row.preview || ""}`.toLowerCase().includes(query))
      : all;
    if (!rows.length) {
      const emptyKey = query ? "pop.searchEmpty" : "pop.sessionEmpty";
      list.innerHTML = `<p class="mini-empty">${escapeHtml(pt(emptyKey))}</p>`;
      return;
    }
    list.innerHTML = rows.map((row) => {
      if (row.kind === "group") {
        return `
          <button type="button" class="mini-pop-session is-group" data-open-group="${escapeHtml(row.sessionId)}">
            ${avatarMarkup(row.avatarUrl, row.title)}
            <div class="mini-pop-session__main">
              <div class="mini-pop-session__top">
                <strong>${escapeHtml(row.title)}<em class="mini-pop-session__tag">${escapeHtml(pt("pop.groupTag"))}</em></strong>
                <time>${escapeHtml(messageTime(row.updatedAt))}</time>
              </div>
              <span class="mini-pop-session__preview">${escapeHtml(row.preview)}</span>
            </div>
          </button>
        `;
      }
      return `
        <button type="button" class="mini-pop-session" data-open-dm="${escapeHtml(row.characterId)}">
          ${avatarMarkup(row.avatarUrl, row.title)}
          <div class="mini-pop-session__main">
            <div class="mini-pop-session__top">
              <strong>${escapeHtml(row.title)}</strong>
              <time>${escapeHtml(messageTime(row.updatedAt))}</time>
            </div>
            <span class="mini-pop-session__preview">${escapeHtml(row.preview)}</span>
          </div>
        </button>
      `;
    }).join("");
  }

  async function renderContacts() {
    const list = root.querySelector("[data-pop-contacts]");
    const indexNav = root.querySelector("[data-pop-contact-index]");
    if (!list) return;
    await ensurePopContactsMigrated();
    const rows = await listContactCharacters();

    const pinned = `
      <button type="button" class="mini-pop-list-row mini-contact-pinned" data-pop-add-friend>
        <span class="mini-contact-symbol"><i data-lucide="user-plus"></i></span>
        <span class="mini-pop-list-row__body">
          <strong>${escapeHtml(pt("pop.newFriends"))}</strong>
        </span>
        <i data-lucide="chevron-right" class="mini-pop-list-row__chev"></i>
      </button>
    `;

    if (!rows.length) {
      list.innerHTML = `${pinned}
        <div class="mini-contact-empty">
          <p>${escapeHtml(pt("pop.contactsEmpty"))}</p>
          <span>${escapeHtml(pt("pop.contactsEmptyHint"))}</span>
          <button type="button" class="mini-contact-empty-cta" data-phone-open="profile">${escapeHtml(pt("pop.openLibrary"))}</button>
        </div>`;
      if (indexNav) {
        indexNav.hidden = true;
        indexNav.innerHTML = "";
      }
      refreshIcons();
      return;
    }

    /** @type {Map<string, object[]>} */
    const groups = new Map();
    for (const character of rows) {
      const letter = contactLetter(character.name || character.alias || "");
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(character);
    }
    const letters = [...groups.keys()].sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });

    const sections = letters.map((letter) => {
      const items = groups.get(letter) || [];
      return `
        <section class="mini-contact-section" data-contact-letter="${escapeHtml(letter)}">
          <header class="mini-contact-section__label">${escapeHtml(letter)}</header>
          <div class="mini-contact-section__group">
            ${items.map((character) => `
                <article class="mini-contact-row" data-contact-id="${escapeHtml(character.id)}">
                  <button type="button" class="mini-contact-main" data-pop-contact-card="${escapeHtml(character.id)}">
                    <span class="mini-contact-avatar">${characterAvatarMarkup(character)}</span>
                    <span class="mini-contact-copy">
                      <strong>${escapeHtml(character.name || pt("pop.defaultCharacter"))}</strong>
                    </span>
                  </button>
                </article>
              `).join("")}
          </div>
        </section>
      `;
    }).join("");

    list.innerHTML = `${pinned}${sections}`;
    if (indexNav) {
      indexNav.hidden = letters.length < 2;
      indexNav.innerHTML = letters.map((letter) => `
        <button type="button" data-pop-jump-letter="${escapeHtml(letter)}">${escapeHtml(letter)}</button>
      `).join("");
    }
    refreshIcons();
  }

  async function renderPopMe() {
    const summary = phoneData.profileSummary();
    const userName = String(summary.alias || "").trim() || pt("pop.defaultYou");
    const nameNode = root.querySelector("[data-pop-me-name]");
    const metaNode = root.querySelector("[data-pop-me-meta]");
    const handleNode = root.querySelector("[data-pop-me-handle]");
    const avatarHost = root.querySelector("[data-pop-me-avatar]");
    const companionNode = root.querySelector("[data-pop-me-companion]");
    const statsNode = root.querySelector("[data-pop-me-stats]");
    if (nameNode) nameNode.textContent = userName;
    if (metaNode) metaNode.textContent = pt("pop.personaTag");
    if (handleNode) {
      handleNode.textContent = getLocale() === "en"
        ? `Nyra ID: ${userName}`
        : `月栖号：${userName}`;
    }
    if (avatarHost) avatarHost.innerHTML = avatarMarkup("", userName);
    const companion = getCharacterSync(getActiveCharacterId());
    if (companionNode) {
      const companionName = companion?.name || companion?.alias || pt("home.someone");
      companionNode.textContent = companion
        ? pt("pop.companionLine", { name: companionName })
        : pt("pop.companionUnset");
    }
    if (statsNode) {
      await ensurePopContactsMigrated();
      const friendCount = listContacts().length;
      const sessions = await listPopSessions();
      statsNode.hidden = false;
      statsNode.innerHTML = `<span><strong>${friendCount}</strong>${escapeHtml(pt("pop.statsFriends"))}</span><span><strong>${sessions.length}</strong>${escapeHtml(pt("pop.statsSessions"))}</span>`;
    }
  }

  function closeContactSheets() {
    root.querySelectorAll("[data-pop-add-friend-sheet], [data-pop-contact-card-sheet]").forEach((node) => {
      node.hidden = true;
    });
  }

  async function openAddFriendSheet() {
    closeContactSheets();
    closeAllComposeSheets();
    const sheet = root.querySelector("[data-pop-add-friend-sheet]");
    const queryInput = root.querySelector("[data-pop-add-friend-query]");
    if (queryInput) queryInput.value = "";
    if (sheet) sheet.hidden = false;
    await renderAddFriendList("");
    refreshIcons();
  }

  async function renderAddFriendList(query = "") {
    const host = root.querySelector("[data-pop-add-friend-list]");
    if (!host) return;
    const q = String(query || "").trim().toLowerCase();
    let candidates = await listNonContactCharacters();
    if (q) {
      candidates = candidates.filter((character) => {
        const name = String(character.name || "").toLowerCase();
        const alias = String(character.alias || "").toLowerCase();
        const id = String(character.id || "").toLowerCase();
        return name.includes(q) || alias.includes(q) || id.includes(q);
      });
    }
    if (!candidates.length) {
      host.innerHTML = q
        ? `<p class="mini-empty">${escapeHtml(pt("pop.addFriendNoMatch"))}</p>`
        : `<p class="mini-empty">${escapeHtml(pt("pop.addFriendAllAdded"))}</p>`;
      return;
    }
    host.innerHTML = candidates.map((character) => `
      <button type="button" class="mini-pop-add-friend-row" data-pop-add-contact="${escapeHtml(character.id)}">
        <span class="mini-contact-avatar">${characterAvatarMarkup(character)}</span>
        <span>
          <strong>${escapeHtml(character.name || pt("pop.defaultCharacter"))}</strong>
          <em>${escapeHtml(character.id)}</em>
        </span>
      </button>
    `).join("");
  }

  async function openContactCard(characterId) {
    const id = String(characterId || "").trim();
    const character = getCharacterSync(id) || (await listCharacters()).find((row) => row.id === id);
    const sheet = root.querySelector("[data-pop-contact-card-sheet]");
    const panel = root.querySelector("[data-pop-contact-card-panel]");
    if (!character || !sheet || !panel) return;
    const activeId = getActiveCharacterId();
    const blurb = String(character.profile?.fields?.[2] || character.alias || "").trim() || pt("pop.friendDefault");
    panel.innerHTML = `
      <header>
        <strong>${escapeHtml(pt("pop.contactCardTitle"))}</strong>
        <button type="button" class="mini-icon-button" data-pop-contact-card-close data-phone-i18n-aria="screens.close" aria-label="${escapeHtml(pt("screens.close"))}"><i data-lucide="x"></i></button>
      </header>
      <div class="mini-pop-contact-card__hero">
        <span class="mini-contact-avatar is-lg ${character.id === activeId ? "is-companion" : ""}">${characterAvatarMarkup(character)}</span>
        <div>
          <strong>${escapeHtml(character.name || pt("pop.defaultCharacter"))}</strong>
          <span>${escapeHtml(blurb)}</span>
        </div>
      </div>
      <div class="mini-pop-contact-card__actions">
        <button type="button" class="is-primary" data-open-dm="${escapeHtml(character.id)}">${escapeHtml(pt("pop.sendMessage"))}</button>
        <button type="button" data-set-companion="${escapeHtml(character.id)}">${character.id === activeId ? escapeHtml(pt("pop.currentCompanion")) : escapeHtml(pt("pop.setCompanion"))}</button>
        <button type="button" class="is-danger" data-pop-remove-contact="${escapeHtml(character.id)}">${escapeHtml(pt("pop.removeContact"))}</button>
      </div>
    `;
    sheet.hidden = false;
    refreshIcons();
  }

  async function openDmPicker() {
    closeAllComposeSheets();
    const sheet = root.querySelector("[data-pop-dm-sheet]");
    const pickList = root.querySelector("[data-pop-dm-pick-list]");
    if (!sheet || !pickList) return;
    const characters = await listContactCharacters();
    pickList.innerHTML = characters.map((character) => `
      <button type="button" data-open-dm="${escapeHtml(character.id)}">
        ${characterAvatarMarkup(character)}
        <span>${escapeHtml(character.name || pt("pop.defaultCharacter"))}</span>
      </button>
    `).join("") || `<p class="mini-empty">${escapeHtml(pt("pop.dmPickEmpty"))}</p>`;
    sheet.hidden = false;
    refreshIcons();
  }

  async function openGroupPicker() {
    closeAllComposeSheets();
    const sheet = root.querySelector("[data-pop-group-sheet]");
    const pickList = root.querySelector("[data-pop-group-pick-list]");
    const titleInput = root.querySelector("[data-pop-group-title]");
    if (!sheet || !pickList) return;
    if (titleInput) titleInput.value = "";
    const characters = await listContactCharacters();
    pickList.innerHTML = characters.map((character) => `
      <label class="mini-pop-group-pick">
        <input type="checkbox" data-group-member="${escapeHtml(character.id)}" />
        ${characterAvatarMarkup(character)}
        <span>${escapeHtml(character.name || pt("pop.defaultCharacter"))}</span>
      </label>
    `).join("") || `<p class="mini-empty">${escapeHtml(pt("pop.groupPickEmpty"))}</p>`;
    sheet.hidden = false;
    refreshIcons();
  }

  async function openDmThread(characterId) {
    closeContactSheets();
    await openDm(characterId);
    setPopChatMode("thread");
    setPopTab("chat");
  }

  async function openGroupThread(sessionId) {
    closeContactSheets();
    await openGroup(sessionId);
    setPopChatMode("thread");
    setPopTab("chat");
  }

  function closeAllComposeSheets() {
    root.querySelectorAll("[data-pop-compose-sheet], [data-pop-dm-sheet], [data-pop-group-sheet]").forEach((node) => {
      node.hidden = true;
    });
  }

  function openComposeSheet() {
    closeAllComposeSheets();
    closeContactSheets();
    const sheet = root.querySelector("[data-pop-compose-sheet]");
    if (sheet) sheet.hidden = false;
    refreshIcons();
  }

  async function confirmCreateGroup() {
    const memberIds = Array.from(root.querySelectorAll("[data-group-member]:checked"))
      .map((input) => input.dataset.groupMember)
      .filter(Boolean);
    const title = String(root.querySelector("[data-pop-group-title]")?.value || "").trim();
    try {
      const group = await createGroupConversation({ title, memberIds });
      closeAllComposeSheets();
      await openGroupThread(group.id);
    } catch (error) {
      console.warn("create group failed", error);
      window.alert(error?.message === "group_needs_two_members" ? "请至少选择两位角色" : "创建群聊失败");
    }
  }

  function closeDmPicker() {
    closeAllComposeSheets();
  }

  function momentAvatar(moment = {}) {
    if (isRealCharacterAvatar(moment.authorAvatar)) return moment.authorAvatar;
    if (moment.authorType === "character" || moment.authorId?.startsWith("char-")) {
      const character = getCharacterSync(moment.authorId || getActiveCharacterId());
      return resolveCharacterAvatarUrl(character);
    }
    return "";
  }

  function momentImagesHtml(moment = {}) {
    const images = Array.isArray(moment.images) && moment.images.length
      ? moment.images
      : moment.image ? [moment.image] : [];
    if (!images.length) return "";
    if (images.length === 1) {
      return `<div class="mini-moment__image"><img src="${escapeHtml(images[0])}" alt="动态配图" /></div>`;
    }
    const visible = images.slice(0, 9);
    const extra = images.length > 9 ? images.length - 9 : 0;
    return `
      <div class="mini-moment__grid">
        ${visible.map((url, index) => `
          <span class="mini-moment__grid-cell">
            <img src="${escapeHtml(url)}" alt="" />
            ${extra && index === visible.length - 1 ? `<em>+${extra}</em>` : ""}
          </span>
        `).join("")}
      </div>`;
  }

  function renderWalletPanel() {
    const wallet = loadWallet();
    const balanceNode = root.querySelector("[data-wallet-balance]");
    if (balanceNode) balanceNode.textContent = `${wallet.balance.toFixed(2)}`;
    const ledgerNode = root.querySelector("[data-pop-wallet-ledger]");
    if (!ledgerNode) return;
    const rows = [...wallet.ledger].reverse().slice(0, 40);
    ledgerNode.innerHTML = rows.length
      ? rows.map((row) => `
        <article class="mini-wallet-row ${row.type === "debit" ? "is-debit" : "is-credit"}">
          <span class="mini-wallet-row__icon" aria-hidden="true"><i data-lucide="${row.type === "debit" ? "arrow-up-right" : "arrow-down-left"}"></i></span>
          <div>
            <strong>${escapeHtml(row.note || row.reason || pt("pop.ledgerDefault"))}</strong>
            <time>${escapeHtml(String(row.createdAt || "").slice(0, 16).replace("T", " "))}</time>
          </div>
          <em>${row.type === "debit" ? "−" : "+"}${Number(row.amount || 0).toFixed(2)}</em>
        </article>
      `).join("")
      : `<p class="mini-empty">${escapeHtml(pt("pop.walletEmpty"))}</p>`;
    refreshIcons();
  }

  function ensurePhoneActionProposalHost() {
    const thread = root.querySelector('[data-pop-chat-mode="thread"]');
    const messagesEl = root.querySelector("[data-phone-messages]");
    if (!thread || !messagesEl) return null;
    let host = thread.querySelector("[data-action-proposal-host='phone']");
    if (!host) {
      host = document.createElement("div");
      host.className = "action-proposal-host";
      host.dataset.actionProposalHost = "phone";
      host.hidden = true;
      // Sibling after message list so renderMessages innerHTML wipe cannot destroy cards.
      messagesEl.insertAdjacentElement("afterend", host);
    }
    if (!actionProposalUi) {
      actionProposalUi = bindActionProposalCards({
        host,
        variant: "phone",
        getCompanionId: () => String(getChatFocus()?.characterId || getActiveCharacterId() || "").trim(),
      });
    }
    return host;
  }

  function messagesWithLiveTurn() {
    if (!liveTurn?.messageId) return messages;
    if (!liveTurn.innerState && !liveTurn.visibleText && !liveTurn.statusCopy && !liveTurn.stage) return messages;
    const focus = getChatFocus();
    if (liveTurn.sessionId && focus.sessionId && liveTurn.sessionId !== focus.sessionId) return messages;
    const persisted = messages.find((row) => row.id === liveTurn.messageId && !row.metadata?.pending);
    if (persisted && (liveTurn.phase === "done" || liveTurn.phase === "fail")) return messages;
    const row = {
      id: liveTurn.messageId,
      role: "assistant",
      content: liveTurn.visibleText || "",
      createdAt: liveTurn.createdAt,
      metadata: {
        pending: liveTurn.phase !== "done" && liveTurn.phase !== "fail",
        failed: liveTurn.phase === "fail",
        turnActivity: {
          innerState: liveTurn.innerState || "",
          statusCopy: liveTurn.statusCopy || "",
          stage: liveTurn.stage || "",
          operation: liveTurn.operation || "",
          state: liveTurn.phase === "fail" ? "failed" : liveTurn.phase === "done" ? "complete" : "running",
        },
      },
    };
    const idx = messages.findIndex((item) => item.id === liveTurn.messageId);
    if (idx >= 0) {
      const next = messages.slice();
      next[idx] = { ...messages[idx], ...row, metadata: { ...(messages[idx].metadata || {}), ...row.metadata } };
      return next;
    }
    return [...messages, row];
  }

  function bindLiveTurnActivityFold(activity) {
    if (!activity || activity.dataset.foldBound === "1") return;
    activity.dataset.foldBound = "1";
    activity.addEventListener("toggle", () => {
      if (activity.dataset.foldSync === "1") {
        delete activity.dataset.foldSync;
        return;
      }
      activity.dataset.foldUserSet = "1";
      const action = activity.querySelector(".message-turn-activity__toggle");
      if (action) {
        action.textContent = turnActivityFoldLabel(
          activity.open,
          activity.classList.contains("is-inner-state"),
        );
      }
    });
  }

  function patchLiveAssistantDom(turn) {
    const container = root.querySelector("[data-phone-messages]");
    if (!container || !turn?.messageId) return false;
    const safeId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(turn.messageId)
      : String(turn.messageId).replace(/["\\]/g, "\\$&");
    const article = container.querySelector(`[data-message-id="${safeId}"]`);
    if (!article) return false;
    let activity = article.querySelector("[data-live-turn-activity], [data-turn-activity]");
    const html = renderLiveTurnActivityHtml(turn);
    if (html) {
      if (!activity) {
        article.insertAdjacentHTML("afterbegin", html);
        activity = article.querySelector("[data-live-turn-activity], [data-turn-activity]");
        bindLiveTurnActivityFold(activity);
        const copy = activity?.querySelector(".message-turn-activity__copy");
        if (copy && turn.innerState) {
          revealTurnActivityText(copy, turn.innerState, { animate: true });
        }
      } else {
        const copy = activity.querySelector(".message-turn-activity__copy");
        const thoughtText = String(turn.innerState || "").trim();
        if (copy) revealTurnActivityText(copy, thoughtText, { animate: Boolean(turn.innerState && turn.phase !== "done" && turn.phase !== "fail") });
        const hasInnerState = Boolean(turn.innerState);
        activity.classList.toggle("is-inner-state", hasInnerState);
        activity.classList.toggle("is-runtime-progress", !hasInnerState);
        if (!activity.dataset.foldUserSet) {
          const nextOpen = hasInnerState
            ? true
            : turn.phase === "start" || turn.phase === "thinking" || (!turn.visibleText && Boolean(turn.innerState));
          if (activity.open !== nextOpen) {
            activity.dataset.foldSync = "1";
            activity.open = nextOpen;
          }
        }
        const toggle = activity.querySelector(".message-turn-activity__toggle");
        if (toggle) toggle.textContent = turnActivityFoldLabel(activity.open, hasInnerState);
        activity.classList.toggle("is-waiting", turn.phase === "start" || turn.phase === "thinking");
        activity.classList.toggle("is-complete", turn.phase === "done");
        activity.classList.toggle("is-failed", turn.phase === "fail");
      }
      article.classList.add("has-turn-activity");
    } else if (activity) {
      activity.remove();
      article.classList.remove("has-turn-activity", "is-psychology-pending");
    }
    if (turn.visibleText) {
      article.classList.remove("is-psychology-pending");
      let body = article.querySelector("[data-message-body]");
      if (!body) {
        let bubble = article.querySelector(".message-bubble");
        if (!bubble) {
          bubble = document.createElement("div");
          bubble.className = "message-bubble";
          article.append(bubble);
        }
        body = document.createElement("p");
        body.dataset.messageBody = "true";
        bubble.append(body);
      }
      body.textContent = turn.visibleText;
    } else {
      article.classList.add("is-psychology-pending");
    }
    container.scrollTop = container.scrollHeight;
    return true;
  }

  function applyLiveTurnProgress(detail) {
    const focus = getChatFocus();
    if (detail.sessionId && focus.sessionId && detail.sessionId !== focus.sessionId) return;
    liveTurn = {
      sessionId: String(detail.sessionId || focus.sessionId || ""),
      characterId: String(detail.characterId || ""),
      messageId: String(detail.messageId || ""),
      phase: String(detail.phase || "stream"),
      stage: String(detail.stage || liveTurn?.stage || "").trim(),
      statusCopy: String(detail.statusCopy || detail.detail || liveTurn?.statusCopy || "").trim(),
      operation: String(detail.operation || liveTurn?.operation || "").trim(),
      innerState: String(detail.innerState || liveTurn?.innerState || ""),
      visibleText: String(detail.visibleText || liveTurn?.visibleText || ""),
      createdAt: liveTurn?.createdAt || new Date().toISOString(),
    };
    if (currentView !== "pop" || currentPopTab !== "chat" || popChatMode !== "thread") return;
    if (!patchLiveAssistantDom(liveTurn)) renderMessages();
  }

  function renderMessages() {
    const container = root.querySelector("[data-phone-messages]");
    const focus = getChatFocus();
    const introCharacter = getCharacterSync(focus?.characterId || getActiveCharacterId());
    const wallet = loadWallet();
    const visible = [];
    messagesWithLiveTurn().filter((item) => (
      !isPlatformPlaceholderGreeting(item)
      && (
        item.content
        || isTokenMediaType(item.metadata?.mediaType)
        || (liveTurn && item.id === liveTurn.messageId)
      )
    )).slice(-80).forEach((message) => {
      if (message.metadata?.kind !== "voice") {
        visible.push({ ...message, metadata: { ...message.metadata } });
        return;
      }
      const related = [...visible].reverse().find((item) => (
        item.role === message.role && item.content === message.content && !item.metadata?.voiceDurationMs
      ));
      if (related) related.metadata.voiceDurationMs = Number(message.metadata?.durationMs) || 0;
      else visible.push({ ...message, metadata: { ...message.metadata, voiceDurationMs: Number(message.metadata?.durationMs) || 0 } });
    });
    const recent = visible.slice(-40);
    const lastAssistantId = [...recent].reverse()
      .find((item) => item.role !== "user" && item.role !== "system" && item.metadata?.kind !== "system")?.id || "";
    const pinIntro = shouldPinChatIntroNote(recent, { character: introCharacter });
    const chatIntroNoteHtml = pinIntro
      ? renderChatIntroNote({
        locale: getLocale(),
        surface: "phone",
        characterId: introCharacter?.id,
        characterName: introCharacter?.name,
        callUserAs: introCharacter?.alias,
        collapsed: isChatIntroNoteCollapsed(introCharacter?.id, { messages: recent }),
      })
      : "";
    if (!recent.length) {
      container.classList.add("is-first-open");
      container.innerHTML = pinIntro ? `<div class="mini-message-list__pin">${chatIntroNoteHtml}</div>` : "";
      ensurePhoneActionProposalHost();
      actionProposalUi?.refresh?.();
      container.scrollTop = 0;
      refreshIcons();
      return;
    }
    const articles = recent.map((message, index) => {
      const markerLabel = messageTimelineLabel(
        recent[index - 1]?.createdAt || "",
        message.createdAt,
        { locale: getLocale() },
      );
      const markerHtml = markerLabel
        ? `<time class="mini-chat-time-separator" datetime="${escapeHtml(message.createdAt)}">${escapeHtml(markerLabel)}</time>`
        : "";
      if (message.role === "system" || message.metadata?.kind === "system") {
        const isActivity = message.metadata?.kind === "activity" || message.metadata?.mediaType === "activity";
        const callCard = resolveCallMessageCard(message.metadata || {}, message.content, { locale: getLocale() });
        if (callCard) {
          const turnsLabel = callCard.turnCount > 0
            ? `${callCard.turnCount} ${String(getLocale() || "").toLowerCase().startsWith("en") ? "turns" : "轮"}`
            : "";
          return `${markerHtml}
      <article class="mini-message is-system is-call-record" data-message-id="${escapeHtml(message.id)}">
        <div class="message-call-card is-${escapeHtml(callCard.kind)}">
          <span class="message-call-card__icon"><i data-lucide="${callCard.kind === "voice" ? "phone" : "video"}"></i></span>
          <span class="message-call-card__body">
            <span class="message-call-card__head"><strong>${escapeHtml(callCard.title)}</strong><em>${escapeHtml(callCard.statusLabel)}</em></span>
            <strong class="message-call-card__duration">${escapeHtml(callCard.duration)}</strong>
            ${(callCard.startedAt || turnsLabel) ? `<small>${escapeHtml([callCard.startedAt ? messageTime(callCard.startedAt) : "", turnsLabel].filter(Boolean).join(" · "))}</small>` : ""}
          </span>
        </div>
      </article>`;
        }
        const gameCard = resolveGameMessageCard(message.metadata || {}, message.content, { locale: getLocale() });
        if (gameCard) {
          const detail = gameCard.type === "start"
            ? gameCard.summary
            : (gameCard.result || (gameCard.type === "round" ? "" : gameCard.summary));
          const endedLabel = String(getLocale() || "").toLowerCase().startsWith("en") ? "Ended" : "已结束";
          const activeLabel = String(getLocale() || "").toLowerCase().startsWith("en") ? "Active" : "进行中";
          return `${markerHtml}
      <article class="mini-message is-system is-game-event is-game-${escapeHtml(gameCard.type)}" data-message-id="${escapeHtml(message.id)}">
        <div class="message-game-card is-${escapeHtml(gameCard.type)}">
          <span class="message-game-card__head">
            <span><i data-lucide="${gameCard.type === "end" ? "flag" : "gamepad-2"}"></i>${escapeHtml(gameCard.eyebrow)}</span>
            <em>${escapeHtml(gameCard.status === "ended" ? endedLabel : activeLabel)}</em>
          </span>
          <strong>${escapeHtml(gameCard.title)}</strong>
          ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
          ${gameCard.canEnd ? `<span class="message-game-card__actions"><button type="button" data-game-end="${escapeHtml(gameCard.runId)}">${escapeHtml(gameCard.endLabel)}</button></span>` : ""}
        </div>
      </article>`;
        }
        const diary = isActivity
          ? resolveDiaryMessageCard(message.metadata || {}, { locale: getLocale() })
          : null;
        const actionLabel = String(message.metadata?.actionLabel || "").trim();
        const deepLink = String(message.metadata?.deepLink || "").trim();
        if (diary) {
          const tag = diary.deepLink ? "button" : "div";
          const buttonAttrs = diary.deepLink
            ? ` type="button" data-artifact-open
                data-deep-link="${escapeHtml(diary.deepLink)}"
                data-delivery-id="${escapeHtml(message.metadata?.deliveryId || "")}"
                data-artifact-id="${escapeHtml(message.metadata?.artifactId || "")}"`
            : "";
          const diaryLabel = String(getLocale() || "").toLowerCase().startsWith("en") ? "Diary" : "日记";
          return `${markerHtml}
      <article class="mini-message is-system has-activity is-diary-activity" data-message-id="${escapeHtml(message.id)}">
        <${tag} class="message-diary-card"${buttonAttrs}>
          <span class="message-diary-card__head">
            <span><i data-lucide="book-open"></i>${escapeHtml(diaryLabel)}</span>
            ${diary.day ? `<time datetime="${escapeHtml(diary.day)}">${escapeHtml(diary.day)}</time>` : ""}
          </span>
          <strong>${escapeHtml(diary.title)}</strong>
          ${diary.preview ? `<p>${escapeHtml(diary.preview)}</p>` : ""}
          ${diary.deepLink ? `<span class="message-diary-card__action">${escapeHtml(diary.actionLabel)}</span>` : ""}
        </${tag}>
      </article>`;
        }
        const capability = isActivity
          ? resolveCapabilityActionCard(message.metadata || {}, { locale: getLocale() })
          : null;
        let actionHtml = "";
        if (capability?.needsPermission && capability.permissionId) {
          actionHtml = `<button type="button" data-request-permission="${escapeHtml(capability.permissionId)}" data-capability-id="${escapeHtml(capability.capabilityId)}" data-capability-open="${escapeHtml(capability.openApp || "")}" data-capability-event="${escapeHtml(capability.event || "")}">${escapeHtml(capability.actionLabel)}</button>`;
        } else if (capability && (capability.openApp || capability.event)) {
          actionHtml = `<button type="button" data-capability-open-btn data-capability-open="${escapeHtml(capability.openApp || "")}" data-capability-event="${escapeHtml(capability.event || "")}" data-capability-id="${escapeHtml(capability.capabilityId)}">${escapeHtml(capability.actionLabel)}</button>`;
        } else if (isActivity && actionLabel && deepLink) {
          actionHtml = `<button type="button" data-artifact-open
              data-deep-link="${escapeHtml(deepLink)}"
              data-delivery-id="${escapeHtml(message.metadata?.deliveryId || "")}"
              data-artifact-id="${escapeHtml(message.metadata?.artifactId || "")}">${escapeHtml(actionLabel)}</button>`;
        }
        return `${markerHtml}
      <article class="mini-message is-system ${isActivity ? "has-activity" : ""}" data-message-id="${escapeHtml(message.id)}">
        <div class="chat-activity-note${capability ? " is-capability-action" : ""}"><span>${escapeHtml(message.content)}</span>${actionHtml}</div>
      </article>`;
      }
      const parsedToken = parseTokenMessage(message.content, message.metadata || {});
      const token = parsedToken.ok
        ? {
          ...parsedToken.token,
          ...(message.metadata?.token || {}),
          direction: message.metadata?.token?.direction
            || (message.role === "user" ? "out" : "in"),
          status: message.metadata?.token?.status || parsedToken.token.status || "pending",
        }
        : message.metadata?.token;
      const mediaType = message.metadata?.mediaType
        || message.metadata?.kind
        || (parsedToken.ok ? parsedToken.mediaType : "text");
      const attachmentCard = resolveAttachmentMessageCard(message.metadata || {});
      const attachmentHtml = attachmentCard ? attachmentCardHtml(attachmentCard) : "";
      const tokenHtml = isRenderableTokenCard(mediaType, token) && token
        ? renderTokenCardHtml(token, {
          messageId: message.id,
          canPay: canAfford(Number(token.amount) || 0, wallet),
        })
        : "";
      const stickerUrl = message.metadata?.stickerUrl || "";
      const isSticker = (mediaType === "sticker" || message.metadata?.kind === "sticker") && stickerUrl;
      const locationParsed = parseLocationMessage(message.content, message.metadata || {});
      const locationHtml = !attachmentHtml && !tokenHtml && !isSticker && locationParsed.ok
        ? renderLocationCardHtml(locationParsed)
        : "";
      const isArtifact = mediaType === "artifact" || message.metadata?.kind === "artifact";
      const popTaskInline = !attachmentHtml && !tokenHtml && !locationHtml && !isSticker && !isArtifact
        ? buildPopTaskInlineHtml(message.metadata || {})
        : "";
      const artifactHtml = !attachmentHtml && !tokenHtml && !locationHtml && !isSticker && !popTaskInline && isArtifact
        ? `<button type="button" class="mini-artifact-card" data-artifact-open
            data-deep-link="${escapeHtml(message.metadata?.deepLink || "")}"
            data-delivery-id="${escapeHtml(message.metadata?.deliveryId || "")}"
            data-artifact-id="${escapeHtml(message.metadata?.artifactId || "")}">
            <strong>${escapeHtml(message.metadata?.artifactType || "内容")}</strong>
            <span>${escapeHtml(message.content || "")}</span>
          </button>`
        : "";
      const bodyHtml = tokenHtml
        || attachmentHtml
        || locationHtml
        || artifactHtml
        || (isSticker
          ? `<div class="mini-message__sticker"><img src="${escapeHtml(stickerUrl)}" alt="${escapeHtml(message.content || pt("pop.stickerAlt"))}" /></div>`
          : `${message.content ? `<p data-message-body="true">${escapeHtml(message.content)}</p>` : ""}${popTaskInline}`);
      const bodyWithCompanionCaption = attachmentHtml && message.metadata?.source === "companion_selfie" && message.content
        ? `${bodyHtml}<p class="message-attachment-caption" data-message-body="true">${escapeHtml(message.content)}</p>`
        : bodyHtml;
      const turnActivityHtml = message.role === "user"
        ? ""
        : (liveTurn && message.id === liveTurn.messageId
          ? renderLiveTurnActivityHtml(liveTurn)
          : renderTurnActivityHtml(message.metadata?.turnActivity));
      const hasPsychology = Boolean(turnActivityHtml);
      const spokenHtml = hasPsychology && bodyWithCompanionCaption
        ? `<div class="message-bubble">${bodyWithCompanionCaption}</div>`
        : bodyWithCompanionCaption;
      const messageState = normalizeMessageState(message.metadata || {});
      const reply = resolveReplyPreview(message.metadata || {});
      const replyHtml = reply
        ? `<blockquote class="message-reply-preview" data-reply-message-id="${escapeHtml(reply.messageId)}"><strong>${reply.role === "user" ? "你" : "对方"}</strong><span>${escapeHtml(reply.text)}</span></blockquote>`
        : "";
      const reactionsHtml = Object.entries(messageState.reactions).length
        ? `<div class="message-reactions">${Object.entries(messageState.reactions).map(([emoji, actors]) => `<span class="message-reaction">${escapeHtml(emoji)} ${actors.length}</span>`).join("")}</div>`
        : "";
      const actionsHtml = renderMessageMenuHtml(
        resolveMessageMenuActions(message, {
          isLastAssistant: message.id === lastAssistantId,
          pending: Boolean(message.metadata?.pending || message.metadata?.failed),
        }),
        { locale: getLocale() },
      );
      const speakBtn = message.role !== "user" && !attachmentHtml && !tokenHtml && !locationHtml && !artifactHtml && !popTaskInline && !isSticker && String(message.content || "").trim()
        ? `<button type="button" class="mini-icon-button mini-speak-btn" data-phone-speak aria-label="${escapeHtml(pt("pop.speak"))}" title="${escapeHtml(pt("pop.speak"))}"><i data-lucide="volume-2"></i></button>`
        : "";
      const openingCtaHtml = message.role !== "user"
        && !messageState.recalledAt
        && !attachmentHtml
        && !tokenHtml
        && !locationHtml
        && !artifactHtml
        && !isSticker
        && isOpeningIntroMessage(message.metadata, message.id)
        ? renderOpeningSetupCtaHtml(getLocale())
        : "";
      return `${markerHtml}
      <article class="mini-message ${message.role === "user" ? "is-user" : "is-ai"} ${hasPsychology ? "has-turn-activity" : ""} ${actionsHtml ? "has-message-menu" : ""} ${openingCtaHtml ? "has-opening-setup" : ""} ${message.metadata?.pending ? "is-pending" : ""} ${message.metadata?.failed ? "is-failed" : ""} ${messageState.recalledAt ? "is-recalled" : ""} ${attachmentHtml ? `has-attachment is-attachment-${escapeHtml(attachmentCard.type)}` : ""} ${tokenHtml ? "has-token" : ""} ${locationHtml ? "has-location" : ""} ${artifactHtml ? "has-artifact" : ""} ${isSticker ? "is-sticker" : ""}" data-message-id="${escapeHtml(message.id)}">
        ${message.role !== "user" && message.metadata?.speakerName ? `<header class="mini-message__speaker">${escapeHtml(message.metadata.speakerName)}</header>` : ""}
        ${messageState.recalledAt ? `<p class="message-recalled-copy">${message.role === "user" ? "你撤回了一条消息" : "对方撤回了一条消息"}</p>` : `${replyHtml}${turnActivityHtml}${spokenHtml}${openingCtaHtml}`}
        ${message.metadata?.voiceDurationMs ? `<span class="mini-message__voice"><i data-lucide="audio-lines"></i><em>${Math.max(1, Math.ceil(message.metadata.voiceDurationMs / 1000))}s</em></span>` : ""}
        ${reactionsHtml}
        ${speakBtn ? `<footer>${speakBtn}</footer>` : ""}
        ${actionsHtml}
        ${message.metadata?.pending ? `<span class="mini-message__state">${escapeHtml(pt("pop.sending"))}</span>` : ""}
        ${message.metadata?.failed ? `<button type="button" class="mini-message__retry" data-phone-retry>${escapeHtml(pt("pop.sendFailed"))}</button>` : ""}
      </article>`;
    }).join("");
    const lived = transcriptHasLivedChat(recent);
    container.classList.toggle("is-first-open", !lived);
    container.innerHTML = `<div class="mini-message-list__pin">${pinIntro ? chatIntroNoteHtml : ""}${articles}</div>`;
    bindTurnActivityFolds(container);
    ensurePhoneActionProposalHost();
    actionProposalUi?.refresh?.();
    container.scrollTop = lived ? container.scrollHeight : 0;
    phoneVoice?.refreshSpeakButtons?.();
    refreshIcons();
  }

  function openPhoneChatIntroDestination(action) {
    const destination = resolveChatIntroDestination(action, "phone");
    if (!destination) return;
    if (destination.kind === "phone-app") {
      openApp(destination.value);
      return;
    }
    if (destination.kind === "app-panel") {
      window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", {
        detail: { mode: "app", source: "chat_intro" },
      }));
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("yueqi.assist.open-panel", {
          detail: { panel: destination.value, source: "chat_intro" },
        }));
      }, 0);
    }
  }

  function settleTokenMessage(messageId, action = "open") {
    const message = messages.find((item) => item.id === messageId);
    if (!message?.metadata?.token) return;
    const token = message.metadata.token;
    if (token.status === "opened" || token.status === "completed") return;
    if (token.status === "awaiting" && token.direction === "out") return;

    // 发出的转账已在发送时扣款，无需再点确认
    if (action === "confirm" && token.kind === "transfer" && token.direction === "out") {
      return;
    }
    if (action === "pay" && token.kind === "collect" && !canAfford(token.amount)) {
      window.alert(pt("pop.insufficientCoins"));
      return;
    }

    const result = applyTokenSettlement(token, messageId);
    if (!result.ok) {
      if (result.error === "insufficient_balance") window.alert("栖币不足");
      return;
    }

    message.metadata.token = markTokenSettled(token, result);
    appendCohabitEvent({
      appId: "pop",
      kind: `token.${token.kind}`,
      summary: `${token.kind === "collect" ? "确认收款" : "完成转账"} ${Number(token.amount).toFixed(2)} 栖币`,
      characterId: getChatFocus().characterId || getActiveCharacterId(),
      meta: { messageId, ledgerId: result.ledgerId },
    });
    if (!result.duplicate) {
      void import("../wallet/transfer-delivery.js").then(({ deliverTransferSettlement }) => (
        deliverTransferSettlement({
          messageId,
          token: message.metadata.token,
          characterId: getChatFocus().characterId || getActiveCharacterId(),
          ledgerId: result.ledgerId,
        })
      )).then(() => syncArtifactSurfaces()).catch(() => {});
    }
    renderMessages();
    renderWalletPanel();
  }

  async function hydrateAttachmentPreview(message) {
    const card = resolveAttachmentMessageCard(message?.metadata || {});
    if (!card || card.type !== "image" || card.previewUrl || !card.mediaId) return message;
    try {
      let previewUrl = attachmentPreviewUrls.get(card.mediaId) || "";
      if (!previewUrl) {
        const record = await Promise.resolve(getMediaRecord?.(card.mediaId));
        previewUrl = String(await Promise.resolve(resolveMediaUrl?.(record)) || "");
        if (previewUrl) attachmentPreviewUrls.set(card.mediaId, previewUrl);
      }
      if (previewUrl) {
        message.metadata = {
          ...(message.metadata || {}),
          attachment: {
            ...(message.metadata?.attachment || {}),
            previewUrl,
          },
        };
      }
    } catch {
      /* durable fallback card remains usable without a thumbnail */
    }
    return message;
  }

  async function refreshMessages() {
    let records = await Promise.resolve(getRecentMessages?.() || []);
    if (Array.isArray(records)) {
      records = records.filter((row) => !isPlatformPlaceholderGreeting(row));
    }
    const focus = getChatFocus();
    if (focus?.kind !== "group" && !(Array.isArray(records) && records.length)) {
      try {
        const { hasFirstLightDoneV2 } = await import("../first-light/controller-v2.js");
        if (hasFirstLightDoneV2()) {
          const { ensureCharacterOpeningMessage } = await import("../chat/ensure-opening.js");
          const { writeCompanionTurn } = await import("../conversation/companion-write.js");
          const seeded = await ensureCharacterOpeningMessage({
            character: getCharacterSync(focus?.characterId || getActiveCharacterId()),
            sessionId: focus?.sessionId,
            messages: records,
            writeCompanionTurn,
            saveChatMessage,
            locale: getLocale(),
          });
          if (seeded.wrote) {
            records = await Promise.resolve(getRecentMessages?.() || []);
          }
        }
      } catch {
        /* opening seed is optional; empty chat still shows the intro letter */
      }
    }
    messages = records.map(normalizeMessage);
    await Promise.all(messages.map((message) => hydrateAttachmentPreview(message)));
    renderMessages();
  }

  function paintMomentsCover() {
    const summary = phoneData.profileSummary();
    const userName = String(summary.alias || "").trim() || pt("pop.defaultYou");
    root.querySelectorAll("[data-moments-cover-name], [data-moments-cover-name-standalone]").forEach((node) => {
      node.textContent = userName;
    });
    root.querySelectorAll("[data-moments-cover-avatar], [data-moments-cover-avatar-standalone]").forEach((node) => {
      node.innerHTML = avatarMarkup("", userName);
    });
    const coverUrl = String(readLocalObject(LOCAL_KEYS.momentsCoverKey, {})?.url || "").replace(/"/g, "");
    root.querySelectorAll("[data-moments-cover], [data-moments-cover-standalone]").forEach((node) => {
      if (coverUrl) {
        node.style.backgroundImage = `linear-gradient(180deg, transparent 42%, rgb(0 0 0 / 38%)), url("${coverUrl}")`;
        node.style.backgroundSize = "cover";
        node.style.backgroundPosition = "center";
      } else {
        node.style.backgroundImage = "";
        node.style.backgroundSize = "";
        node.style.backgroundPosition = "";
      }
    });
  }

  function selectedMomentAuthor() {
    const on = root.querySelector("[data-moment-author].is-on");
    const id = String(on?.dataset?.momentAuthor || "user");
    if (id === "user") {
      const summary = phoneData.profileSummary();
      return {
        author: String(summary.alias || "").trim() || pt("pop.defaultYou"),
        authorId: "user",
        authorType: "user",
        authorAvatar: "",
      };
    }
    const character = getCharacterSync(id);
    return {
      author: character?.name || pt("pop.defaultCharacter"),
      authorId: character?.id || id,
      authorType: "character",
      authorAvatar: resolveCharacterAvatarUrl(character),
    };
  }

  function fillMomentAuthors() {
    const host = root.querySelector("[data-moment-author-list]");
    if (!host) return;
    const activeId = getActiveCharacterId();
    const people = listCharacters();
    const selected = people.some((item) => item.id === activeId) ? activeId : "user";
    host.innerHTML = [
      `<button type="button" class="mini-moment-author${selected === "user" ? " is-on" : ""}" data-moment-author="user">${escapeHtml(pt("pop.momentAsYou"))}</button>`,
      ...people.map((character) => {
        const id = String(character.id || "");
        const name = String(character.name || pt("pop.defaultCharacter"));
        return `<button type="button" class="mini-moment-author${id === selected ? " is-on" : ""}" data-moment-author="${escapeHtml(id)}">${escapeHtml(name)}</button>`;
      }),
    ].join("");
  }

  function setMomentImagePreview(url = "") {
    pendingMomentImage = String(url || "");
    const preview = root.querySelector("[data-moment-image-preview]");
    const thumb = root.querySelector("[data-moment-image-thumb]");
    if (thumb) thumb.src = pendingMomentImage;
    if (preview) preview.hidden = !pendingMomentImage;
  }

  function closeMomentCompose() {
    const sheet = root.querySelector("[data-moment-compose-sheet]");
    if (sheet) sheet.hidden = true;
    const input = root.querySelector("[data-moment-input]");
    if (input) input.value = "";
    setMomentImagePreview("");
  }

  function openMomentCompose() {
    fillMomentAuthors();
    const sheet = root.querySelector("[data-moment-compose-sheet]");
    if (!sheet) return;
    sheet.hidden = false;
    refreshIcons(sheet);
    window.setTimeout(() => root.querySelector("[data-moment-input]")?.focus(), 40);
  }

  function renderAllMoments() {
    renderMoments(root.querySelector("[data-phone-moments]"));
    renderMoments(root.querySelector("[data-phone-moments-inline]"));
  }

  function renderMoments(target = root.querySelector("[data-phone-moments]")) {
    if (!target) return;
    paintMomentsCover();

    const cleaned = moments.filter((item) => !isJunkMoment(item));
    if (cleaned.length !== moments.length) {
      moments = saveMoments(cleaned, "purge_junk");
    }
    const feed = moments.slice();
    if (!feed.length) {
      target.innerHTML = `
        <div class="mini-moment-empty">
          <p>${escapeHtml(pt("pop.momentsEmpty"))}</p>
          <span>${escapeHtml(pt("pop.momentsEmptyHint"))}</span>
          <button type="button" class="mini-moment-empty__btn" data-moment-compose>${escapeHtml(pt("pop.momentCompose"))}</button>
        </div>`;
      return;
    }
    target.innerHTML = feed.map((moment) => {
      const when = momentRelativeTime(moment.createdAt) || escapeHtml(moment.time) || "";
      return `
      <article class="mini-moment" data-moment-id="${escapeHtml(moment.id)}">
        <div class="mini-moment__avatar">${avatarMarkup(momentAvatar(moment), moment.author)}</div>
        <div class="mini-moment__body">
          <strong class="mini-moment__name">${escapeHtml(moment.author)}</strong>
          <p class="mini-moment__text">${escapeHtml(moment.content)}</p>
          ${momentImagesHtml(moment)}
          <div class="mini-moment__meta">
            <time>${escapeHtml(when)}</time>
            <div class="mini-moment__ops">
              <button type="button" class="mini-moment__op" data-moment-like aria-label="${escapeHtml(pt("pop.like"))}"><i data-lucide="heart"></i>${moment.likes.length ? `<span>${moment.likes.length}</span>` : ""}</button>
              <button type="button" class="mini-moment__op" data-moment-comment aria-label="${escapeHtml(pt("pop.comment"))}"><i data-lucide="message-circle"></i></button>
            </div>
          </div>
          ${moment.likes.length || moment.comments.length ? `
          <div class="mini-moment__engage">
            ${moment.likes.length ? `<div class="mini-moment__likes"><i data-lucide="heart"></i><span>${moment.likes.map(escapeHtml).join("、")}</span></div>` : ""}
            ${moment.comments.length ? `<div class="mini-moment__comments">${moment.comments.map((comment) => `<p><strong>${escapeHtml(comment.author)}</strong>${escapeHtml(comment.text)}</p>`).join("")}</div>` : ""}
          </div>` : ""}
          <form class="mini-moment__comment-form" data-phone-moment-comment-form hidden>
            <input type="text" maxlength="120" data-phone-i18n-placeholder="pop.commentPlaceholder" placeholder="${escapeHtml(pt("pop.commentPlaceholder"))}" aria-label="${escapeHtml(pt("pop.commentAria"))}" />
            <button type="submit" aria-label="${escapeHtml(pt("pop.commentSend"))}">${escapeHtml(pt("pop.commentSend"))}</button>
          </form>
        </div>
      </article>`;
    }).join("");
    refreshIcons();
  }

  function readListenSnapshot() {
    const live = getNowPlaying?.();
    if (live?.title) return normalizeCoListenState(live);
    return normalizeCoListenState(readLocalObject(LOCAL_KEYS.coListenStateKey, null) || {});
  }

  function refreshTodayInboxWidget() {
    const companionId = getActiveCharacterId();
    const widget = root.querySelector('[data-widget="today"]');
    const list = root.querySelector("[data-today-inbox]");
    const empty = root.querySelector("[data-today-empty]");
    const badge = root.querySelector("[data-today-unread]");
    if (!widget || !list) return;
    widget.hidden = prefs.widgets?.today === false;
    acknowledgeTodaySurface(companionId);
    const items = listTodayInboxItems({ companionId, limit: 1 });
    const unread = countUnreadToday(companionId);
    if (badge) {
      badge.hidden = unread <= 0;
      badge.textContent = unread > 99 ? "99+" : String(unread);
    }
    const statusBadge = root.querySelector("[data-phone-inbox-badge]");
    if (statusBadge) {
      statusBadge.hidden = unread <= 0;
      statusBadge.textContent = unread > 99 ? "99+" : String(unread);
    }
    if (!items.length) {
      list.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = items.map((item) => {
      const type = String(item.type || "").trim();
      const typeLabel = type === "diary"
        ? pt("home.inboxDiary")
        : type === "selfie" || type === "photo"
          ? pt("home.inboxPhoto")
          : pt("home.inboxUpdate");
      const rawTitle = String(item.title || "").trim();
      const rawPreview = String(item.preview || "").trim();
      const title = rawTitle.replace(/[\p{P}\p{Z}\s]/gu, "") ? rawTitle : typeLabel;
      const preview = rawPreview.replace(/[\p{P}\p{Z}\s]/gu, "")
        ? rawPreview
        : pt("home.inboxOpenHint");
      return `
      <button type="button" class="mini-today__item ${item.unread ? "is-unread" : ""}"
        data-today-open
        data-deep-link="${escapeHtml(item.deepLink || "")}"
        data-delivery-id="${escapeHtml(item.deliveryId || "")}"
        data-artifact-id="${escapeHtml(item.artifact?.artifactId || "")}">
        <strong>${escapeHtml(title === typeLabel ? typeLabel : `${typeLabel} · ${title}`)}</strong>
        <span>${escapeHtml(preview)}</span>
      </button>
    `;
    }).join("");
  }

  async function openExperienceArchive(detail = {}, artifact = null) {
    const sheet = root.querySelector("[data-experience-archive-sheet]");
    if (!sheet) {
      phoneToast(detail.summary || "体验归档");
      return;
    }
    const { resolveExperienceArchiveDetail } = await import("../experience/projection-archive.js");
    const { listExperienceProjections } = await import("../experience/projections-feed.js");
    let item = null;
    if (detail.projId) {
      item = listExperienceProjections({ limit: 80 }).find((row) => row.id === detail.projId) || null;
    }
    if (!item && detail.entityId) {
      item = listExperienceProjections({ limit: 80 }).find((row) => {
        const meta = row.meta || {};
        return meta.entityId === detail.entityId || meta.runId === detail.entityId || meta.sessionId === detail.entityId;
      }) || null;
    }
    const resolved = await resolveExperienceArchiveDetail(item || {
      kind: detail.kind,
      summary: detail.summary || artifact?.previewText || "",
      characterId: artifact?.companionId || "",
      meta: {
        appId: detail.appId,
        entityId: detail.entityId,
        projId: detail.projId,
      },
    });
    const titleNode = sheet.querySelector("[data-experience-archive-title]");
    const metaNode = sheet.querySelector("[data-experience-archive-meta]");
    const bodyNode = sheet.querySelector("[data-experience-archive-body]");
    if (titleNode) titleNode.textContent = resolved.title || "体验归档";
    if (metaNode) {
      metaNode.textContent = [resolved.kindLabel, resolved.entityId ? `#${resolved.entityId.slice(0, 8)}` : ""]
        .filter(Boolean)
        .join(" · ");
    }
    if (bodyNode) bodyNode.textContent = resolved.body || resolved.summary || "暂无归档正文";
    sheet.hidden = false;
  }

  function closeExperienceArchiveSheet() {
    const sheet = root.querySelector("[data-experience-archive-sheet]");
    if (sheet) sheet.hidden = true;
  }

  async function openPhoneDeepLink(href, detail = {}) {
    return openArtifactDeepLink(href, {
      deliveryId: detail.deliveryId || "",
      openPhoneApp: (appId, entityOpts) => openApp(appId, entityOpts),
      openDiary: async (diaryId) => {
        const id = String(diaryId || "").trim();
        openApp("diary", id ? { entityId: id, diaryId: id } : undefined);
      },
      openGallery: async (mediaId) => {
        const id = String(mediaId || "").trim();
        openApp("gallery", id ? { entityId: id, mediaId: id } : undefined);
      },
      openShopOrder: async (orderId) => {
        const id = String(orderId || "").trim();
        openApp("shop", id ? { entityId: id, orderId: id } : undefined);
      },
      openExperienceArchive: (payload, artifact) => openExperienceArchive(payload, artifact),
      openWalletLedger: async () => {
        openApp("pop");
        const ledger = root.querySelector("[data-pop-wallet-ledger]");
        if (ledger) {
          ledger.hidden = false;
          renderWalletPanel();
        }
      },
      focusPop: () => openApp("pop"),
      onToast: (msg) => phoneToast(msg),
    });
  }

  function appendArtifactMessage(text, role = "ai", opts = {}) {
    messages.push({
      id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: role === "user" ? "user" : "ai",
      content: text,
      createdAt: new Date().toISOString(),
      metadata: opts.metadata || {},
    });
    renderMessages();
  }

  async function syncArtifactSurfaces() {
    const companionId = getActiveCharacterId();
    try {
      await flushPopDeliveries({ companionId });
    } catch (error) {
      console.warn("[yueqi.delivery] pop flush failed", error);
    }
    try {
      await flushSystemNotificationDeliveries({ companionId });
    } catch (error) {
      console.warn("[yueqi.delivery] notification flush failed", error);
    }
    refreshTodayInboxWidget();
  }

  function refreshHomeWidgets(runtimeState = null) {
    const now = new Date();
    const character = getCharacterSync(getActiveCharacterId());
    const characterName = String(
      runtimeState?.characterName
      || character?.name
      || phoneData.profileSummary()?.name
      || "",
    ).trim();

    const greeting = selectGreeting(now);
    const atmosphere = selectLocalAtmosphere(now);
    const events = phoneData.listEvents?.() || [];
    const latestCompanionMessage = [...messages].reverse().find((message) => message?.role !== "user");
    const presence = selectPresenceWidget({
      name: characterName,
      talking: runtimeState?.playState === "talking",
      asleep: Boolean(runtimeState?.asleep),
      lastMessage: String(latestCompanionMessage?.content || "").trim(),
    });
    const relation = selectRelationWidget({
      events,
      anniversaryDate: character?.profile?.anniversaryDate || "",
      characterName,
      now,
    });
    // W1/W8: ordinary phone home never renders intimacy % / stage from numeric store.
    // When relationshipContinuityV1 is on, skip reading intimacy for UX decisions entirely.
    const continuityNumericOff = isFeatureEnabled("relationshipContinuityV1");
    const relationState = continuityNumericOff
      ? null
      : getRelationshipState(character?.id || getActiveCharacterId());
    const intimacyScore = computeHomeIntimacyScore(relationState);
    const togetherDays = togetherDaysFromAnniversary(character?.profile?.anniversaryDate || "");
    const hour = now.getHours();
    const presenceCopy = hour < 11
      ? pt("home.presenceMorning")
      : hour < 18
        ? pt("home.presenceDay")
        : pt("home.presenceEvening");
    const continuityCompanionId = String(character?.id || getActiveCharacterId() || "").trim();
    const continuitySnapshot = isFeatureEnabled("relationshipContinuityV1")
      ? createTemporalSnapshotV1({
        locale: getLocale() === "en" ? "en" : "zh-CN",
      })
      : null;
    if (continuityCompanionId && continuitySnapshot) {
      // Best-effort refresh on home paint / localDate change (fingerprint dedupes).
      try {
        void refreshRelationshipContinuity({
          companionId: continuityCompanionId,
          userId: "local",
          snapshot: continuitySnapshot,
          locale: getLocale() === "en" ? "en" : "zh-CN",
        });
      } catch {
        /* non-blocking */
      }
    }
    const relationCard = buildHomeRelationCardDisplay({
      presenceCopy,
      presenceStatus: presence.statusText,
      relationBody: relation.empty ? "" : relation.body,
      togetherDays,
      togetherDaysLabel: togetherDays != null
        ? pt("home.relationshipDay", { days: togetherDays })
        : "",
      companionId: continuityCompanionId,
      userId: "local",
      snapshot: continuitySnapshot || undefined,
      locale: getLocale() === "en" ? "en" : "zh-CN",
    });
    root.querySelectorAll("[data-phone-greeting]").forEach((node) => { node.textContent = greeting; });
    const userCall = resolveCallUserAs(character?.alias);
    root.querySelectorAll("[data-phone-user-call]").forEach((node) => {
      if (userCall && userCall !== characterName) {
        node.hidden = false;
        node.textContent = `，${userCall}`;
      } else {
        node.hidden = true;
        node.textContent = "";
      }
    });
    root.querySelectorAll("[data-phone-atmosphere]").forEach((node) => {
      node.textContent = atmosphere.label;
      node.dataset.atmosphereSource = atmosphere.source;
    });
    root.querySelectorAll("[data-phone-time], [data-lock-clock], [data-widget-clock]").forEach((node) => {
      node.textContent = formatClock(now);
    });
    const lockDate = root.querySelector("[data-lock-date]");
    if (lockDate) lockDate.textContent = formatLockDate(now);
    refreshTodayInboxWidget();

    // Pop subtitle is owned by syncPopChrome — do not overwrite with "online".

    root.querySelectorAll("[data-phone-name]").forEach((node) => {
      node.textContent = characterName || pt("home.someone");
    });

    root.querySelectorAll("[data-phone-character-avatar]").forEach((node) => {
      node.innerHTML = characterAvatarMarkup(character || { name: characterName });
    });
    const characterButton = root.querySelector(".mini-statusbar__assistant");
    if (characterButton) {
      const label = getLocale() === "en"
        ? `Current companion: ${characterName || pt("home.someone")}`
        : `当前伴侣：${characterName || pt("home.someone")}`;
      characterButton.setAttribute("aria-label", label);
      characterButton.setAttribute("title", label);
    }
    // Continuity soft line lives in the greeting subtitle (no separate "此刻" card).
    const greetingMeta = relationCard.meta || presenceCopy;
    root.querySelectorAll("[data-home-presence-copy]").forEach((node) => {
      node.textContent = greetingMeta;
    });
    root.querySelectorAll("[data-home-relationship-meta]").forEach((node) => {
      if (relationCard.usesContinuity) node.setAttribute("data-continuity", "1");
      else node.removeAttribute("data-continuity");
    });
    root.querySelectorAll("[data-home-presence-status]").forEach((node) => { node.textContent = presence.statusText; });
    root.querySelectorAll("[data-home-today-title]").forEach((node) => {
      node.textContent = pt("home.todayWith", { name: presence.name });
    });
    root.querySelectorAll("[data-home-intimacy]").forEach((node) => {
      if (relationCard.showNumericScore && intimacyScore != null) {
        node.hidden = false;
        node.removeAttribute("aria-hidden");
        node.textContent = String(intimacyScore);
      } else {
        node.hidden = true;
        node.setAttribute("aria-hidden", "true");
        node.textContent = "";
      }
    });
    root.querySelectorAll("[data-home-intimacy-bar-wrap]").forEach((node) => {
      node.hidden = !relationCard.showProgressBar;
    });
    root.querySelectorAll("[data-home-intimacy-bar]").forEach((node) => {
      node.style.width = relationCard.showProgressBar && intimacyScore != null
        ? `${Math.max(4, intimacyScore)}%`
        : "0%";
    });
    root.querySelectorAll("[data-home-relation-label]").forEach((node) => {
      const key = relationCard.labelKey || "home.relationStatus";
      const label = pt(key);
      node.textContent = label && label !== key ? label : pt("home.relationStatus");
      node.setAttribute("data-phone-i18n", key);
    });
    root.querySelectorAll("[data-home-continuity-sources]").forEach((node) => {
      const sources = relationCard.continuitySources || [];
      if (!sources.length) {
        node.hidden = true;
        node.setAttribute("aria-hidden", "true");
        node.textContent = "";
        node.removeAttribute("data-source-count");
        return;
      }
      node.hidden = true;
      node.setAttribute("aria-hidden", "true");
      node.dataset.sourceCount = String(sources.length);
      node.dataset.continuitySources = JSON.stringify(
        sources.map((s) => ({ field: s.field, sourceIds: s.sourceIds })),
      );
    });
    root.querySelectorAll("[data-home-continuity-card]").forEach((node) => {
      node.classList.toggle("is-continuity", Boolean(relationCard.usesContinuity));
      if (relationCard.fingerprint) {
        node.dataset.continuityFingerprint = relationCard.fingerprint;
      } else {
        delete node.dataset.continuityFingerprint;
      }
    });
    const todayEmpty = root.querySelector("[data-today-empty]");
    if (todayEmpty) todayEmpty.textContent = presence.lastMessage;
    renderHomeCalendarWidget(now, events);

    const listenSnap = readListenSnapshot();
    const together = selectTogetherWidget({
      listenState: listenSnap,
      books: phoneData.readLibrary?.()?.books || [],
    });
    const listenWidget = root.querySelector('[data-widget="listen"]');
    if (listenWidget) {
      const hasTrack = Boolean(String(listenSnap?.title || "").trim());
      const playing = hasTrack && listenSnap?.paused === false;
      listenWidget.hidden = prefs.widgets?.listen === false;
      listenWidget.classList.toggle("is-playing", playing);
      listenWidget.classList.toggle("is-idle", !hasTrack);
      root.querySelectorAll("[data-home-listen-title]").forEach((node) => {
        node.textContent = together.kind === "listen" && hasTrack
          ? phoneData.displayTrackTitle(together.title)
          : together.title;
      });
      root.querySelectorAll("[data-home-listen-meta]").forEach((node) => {
        node.textContent = together.subtitle;
      });
      const progress = root.querySelector("[data-home-listen-progress]");
      if (progress) {
        const ratio = Number(listenSnap?.progress);
        const pct = Number.isFinite(ratio) ? Math.max(0, Math.min(100, Math.round(ratio * 100))) : (hasTrack ? 38 : 0);
        progress.style.width = `${pct}%`;
      }
      const label = root.querySelector("[data-vinyl-label]");
      if (label) {
        const seed = String(listenSnap?.title || "yueqi");
        let hash = 0;
        for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        const hue = Math.abs(hash) % 360;
        label.style.background = `linear-gradient(145deg, hsl(${hue} 42% 62%), hsl(${(hue + 40) % 360} 38% 42%))`;
      }
    }

    // Keep listen screen labels in sync when a real track is active
    if (listenSnap?.title) {
      root.querySelectorAll("[data-listen-track]").forEach((node) => {
        node.textContent = phoneData.displayTrackTitle(listenSnap.title);
      });
      root.querySelectorAll("[data-listen-playlist]").forEach((node) => {
        node.textContent = listenSnap.playlist
          ? phoneData.displayPlaylistName(listenSnap.playlist)
          : "";
      });
    }
    refreshIcons();
  }

  function startOfHomeWeek(date = new Date()) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() - next.getDay());
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function homeWeekNumber(date) {
    const first = new Date(date.getFullYear(), 0, 1);
    const day = Math.floor((date - first) / 86400000) + 1;
    return Math.max(1, Math.ceil(day / 7));
  }

  function shiftHomeCalWeek(deltaWeeks) {
    const next = new Date(homeCalWeekStart);
    next.setDate(next.getDate() + deltaWeeks * 7);
    homeCalWeekStart = startOfHomeWeek(next);
    renderHomeCalendarWidget(new Date(), phoneData.listEvents?.() || listEventsSafe());
  }

  function listEventsSafe() {
    try {
      return phoneData.listEvents?.() || [];
    } catch {
      return [];
    }
  }

  function homeCalWeekdayLabels() {
    return [
      pt("home.weekdaySun"),
      pt("home.weekdayMon"),
      pt("home.weekdayTue"),
      pt("home.weekdayWed"),
      pt("home.weekdayThu"),
      pt("home.weekdayFri"),
      pt("home.weekdaySat"),
    ];
  }

  function homeCalDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function renderHomeCalWeekPanel(weekStart, todayKey, marked) {
    const mid = new Date(weekStart);
    mid.setDate(weekStart.getDate() + 3);
    const labels = homeCalWeekdayLabels();
    const heads = [];
    const cells = [];
    for (let index = 0; index < 7; index += 1) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + index);
      const key = homeCalDateKey(dayDate);
      const classes = [
        key === todayKey ? "is-today" : "",
        marked.has(key) ? "has-event" : "",
        dayDate.getMonth() !== mid.getMonth() ? "is-muted" : "",
      ].filter(Boolean).join(" ");
      heads.push(`<span>${escapeHtml(labels[index])}</span>`);
      cells.push(`<button type="button" class="${classes}" data-cal-day="${key}">${dayDate.getDate()}</button>`);
    }
    return `
      <div class="mini-cal-widget__panel">
        <div class="mini-cal-widget__weekdays" aria-hidden="true">${heads.join("")}</div>
        <div class="mini-cal-widget__grid">${cells.join("")}</div>
      </div>
    `;
  }

  function renderHomeCalendarWidget(now = new Date(), events = []) {
    const track = root.querySelector("[data-cal-week-track]");
    const monthEl = root.querySelector("[data-cal-month]");
    const weekMeta = root.querySelector("[data-cal-week-meta]");
    if (!track) return;

    if (!(homeCalWeekStart instanceof Date) || Number.isNaN(homeCalWeekStart.getTime())) {
      homeCalWeekStart = startOfHomeWeek(now);
    }

    const mid = new Date(homeCalWeekStart);
    mid.setDate(homeCalWeekStart.getDate() + 3);
    if (monthEl) {
      monthEl.textContent = getLocale() === "en"
        ? new Intl.DateTimeFormat("en-US", { month: "short" }).format(mid)
        : pt("home.month", { month: mid.getMonth() + 1 });
    }
    if (weekMeta) {
      weekMeta.textContent = `/ ${pt("home.weekOf", { week: homeWeekNumber(mid) })}`;
    }

    const todayKey = homeCalDateKey(now);
    const marked = new Set(
      (Array.isArray(events) ? events : [])
        .map((ev) => String(ev?.date || "").slice(0, 10))
        .filter(Boolean),
    );

    // Pre-render prev / current / next so a 1:1 drag never exposes empty gutter.
    const prevStart = new Date(homeCalWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const nextStart = new Date(homeCalWeekStart);
    nextStart.setDate(nextStart.getDate() + 7);
    track.innerHTML = [
      renderHomeCalWeekPanel(prevStart, todayKey, marked),
      renderHomeCalWeekPanel(homeCalWeekStart, todayKey, marked),
      renderHomeCalWeekPanel(nextStart, todayKey, marked),
    ].join("");
    track.style.transition = "none";
    track.style.transform = "translate3d(-33.333333%, 0, 0)";
    track.classList.remove("is-dragging");
    bindHomeCalendarSwipe();
  }

  function bindHomeCalendarSwipe() {
    if (homeCalSwipeBound) return;
    const surface = root.querySelector("[data-cal-week-swipe]");
    const track = root.querySelector("[data-cal-week-track]");
    if (!surface || !track) return;
    homeCalSwipeBound = true;

    // Frictionless handfeel over a 3-week strip: 1:1 follow, ease-out settle, no rubber.
    const AXIS_LOCK_PX = 8;
    const COMMIT_PX = 36;
    const VELOCITY_COMMIT = 0.28;
    const SETTLE_MS = 180;
    const CENTER = -33.333333;
    const PREV = 0;
    const NEXT = -66.666666;

    let active = false;
    let axis = "";
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let pointerId = null;
    let dayKey = "";
    let suppressClick = false;
    let suppressTimer = 0;
    let settleTimer = 0;

    surface.style.touchAction = "none";
    track.style.touchAction = "none";

    function pageWidth() {
      return Math.max(surface.clientWidth || 1, 1);
    }

    function capture(id) {
      try {
        surface.setPointerCapture?.(id);
      } catch {
        /* ignore */
      }
    }

    function release(id) {
      try {
        if (id != null && surface.hasPointerCapture?.(id)) {
          surface.releasePointerCapture(id);
        }
      } catch {
        /* ignore */
      }
    }

    function setTrackOffset(percent, dxPx = 0, { animate = false, dragging = false } = {}) {
      track.classList.toggle("is-dragging", dragging);
      if (animate) {
        track.style.transition = `transform ${SETTLE_MS}ms ease-out`;
      } else {
        track.style.transition = "none";
      }
      if (dxPx) {
        track.style.transform = `translate3d(calc(${percent}% + ${dxPx}px), 0, 0)`;
      } else {
        track.style.transform = `translate3d(${percent}%, 0, 0)`;
      }
    }

    function snapCenter({ animate = false } = {}) {
      setTrackOffset(CENTER, 0, { animate, dragging: false });
    }

    function armSuppress() {
      suppressClick = true;
      window.clearTimeout(suppressTimer);
      suppressTimer = window.setTimeout(() => {
        suppressClick = false;
      }, 420);
    }

    function openDay(day) {
      if (!day) return;
      phoneCalendar.setSelected?.(day);
      openApp("calendar");
    }

    function onPointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (pointerId != null) return;
      homePager?.cancel?.();
      window.clearTimeout(settleTimer);
      track.style.transition = "none";
      active = true;
      axis = "";
      startX = event.clientX;
      startY = event.clientY;
      lastX = startX;
      lastT = performance.now();
      velocity = 0;
      pointerId = event.pointerId;
      dayKey = event.target.closest("[data-cal-day]")?.dataset.calDay || "";
      capture(pointerId);
    }

    function onPointerMove(event) {
      if (!active || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!axis) {
        if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.12) {
          axis = "x";
        } else {
          axis = "y";
          return;
        }
      }
      if (axis !== "x") return;
      event.preventDefault();
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = velocity * 0.55 + ((event.clientX - lastX) / dt) * 0.45;
      lastX = event.clientX;
      lastT = now;
      // Keep drag inside the pre-rendered prev/current/next window.
      const clamped = Math.max(-pageWidth(), Math.min(pageWidth(), dx));
      setTrackOffset(CENTER, clamped, { dragging: true });
    }

    function finish(event) {
      if (!active) return;
      if (pointerId != null && event.pointerId !== pointerId) return;
      const dx = (event.clientX ?? lastX) - startX;
      const wasAxis = axis;
      const day = dayKey;
      const id = pointerId;
      active = false;
      axis = "";
      dayKey = "";
      pointerId = null;
      release(id);

      if (wasAxis === "x") {
        const commit = Math.abs(dx) >= COMMIT_PX || Math.abs(velocity) >= VELOCITY_COMMIT;
        if (commit) {
          armSuppress();
          const dir = dx < 0 || velocity < -VELOCITY_COMMIT ? 1 : -1;
          setTrackOffset(dir > 0 ? NEXT : PREV, 0, { animate: true });
          settleTimer = window.setTimeout(() => {
            shiftHomeCalWeek(dir);
          }, SETTLE_MS);
        } else {
          snapCenter({ animate: true });
          settleTimer = window.setTimeout(() => {
            track.classList.remove("is-dragging");
            track.style.transition = "none";
          }, SETTLE_MS);
        }
        return;
      }

      snapCenter();
      if (day && Math.hypot(dx, (event.clientY ?? startY) - startY) < AXIS_LOCK_PX + 4) {
        armSuppress();
        openDay(day);
      }
    }

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove, { passive: false });
    surface.addEventListener("pointerup", finish);
    surface.addEventListener("pointercancel", finish);
    surface.addEventListener("lostpointercapture", (event) => {
      if (event.pointerId !== pointerId) return;
      finish({ pointerId: event.pointerId, clientX: lastX, clientY: startY });
    });
    surface.addEventListener("click", (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const day = event.target.closest("[data-cal-day]")?.dataset.calDay;
      if (!day) return;
      event.preventDefault();
      event.stopPropagation();
      openDay(day);
    }, true);
  }

  function renderNowPlaying() {
    refreshHomeWidgets();
  }

  function showPane(screen, paneId) {
    if (!screen || !paneId) return;
    screen.querySelectorAll("[data-phone-pane-view]").forEach((pane) => {
      pane.hidden = pane.dataset.phonePaneView !== paneId;
    });
  }

  function renderTracks() {
    const feed = root.querySelector("[data-phone-tracks]");
    if (!feed) return;
    const tracks = phoneData.listTracks().slice(0, 12);
    feed.innerHTML = tracks.length
      ? tracks.map((track) => `
        <button type="button" class="mini-listen-row">
          <span class="mini-listen-row__art" aria-hidden="true"></span>
          <span>
            <strong>${escapeHtml(track.title || "未命名")}</strong>
            <em>${escapeHtml(track.playlist || "")}</em>
          </span>
        </button>
      `).join("")
      : '<p class="mini-empty">歌单还空着</p>';
  }

  function coverToneForTitle(title = "") {
    const tones = ["ink", "moss", "clay", "dusk", "sea", "sand"];
    const text = String(title || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 3)) % 997;
    return tones[hash % tones.length];
  }

  function renderBooks() {
    const feed = root.querySelector("[data-phone-books]");
    if (!feed) return;
    const books = phoneData.listBooks().slice(0, 24);
    if (!books.length) {
      feed.innerHTML = `<p class="mini-empty">${escapeHtml(pt("read.emptyShelf"))}</p>`;
      return;
    }
    feed.innerHTML = books.map((book, index) => {
      const title = book.title || pt("read.unnamed");
      const author = book.author || pt("read.unknownAuthor");
      const progress = displayReadProgress(book.scrollRatio > 0 ? book.scrollRatio : (book.progress || "待读"));
      const showProgress = book.scrollRatio > 0
        || (book.progress && book.progress !== "未读" && book.progress !== "待读");
      const tone = coverToneForTitle(title);
      return `
        <article class="book-row book-shelf-card tone-${tone}" style="--book-i:${index}">
          <button class="book-cover" type="button" data-phone-book-id="${escapeHtml(book.id || "")}" aria-label="${escapeHtml(title)} · ${escapeHtml(author)} · ${escapeHtml(progress)}">
            <span class="book-cover-spine" aria-hidden="true"></span>
            <span class="book-cover-label">${escapeHtml(title)}</span>
            ${showProgress
              ? `<span class="book-cover-progress">${escapeHtml(progress)}</span>`
              : ""}
          </button>
        </article>
      `;
    }).join("");
  }

  function characterEditorHtml(character, {
    expanded = false,
    isCompanion = false,
    canDelete = true,
    originMemories = [],
  } = {}) {
    const draft = getSharedCharacterEditorService().listUnsaved()
      .find((item) => item.characterId === character.id);
    const working = applyDraft(character, draft?.patch) || character;
    const id = escapeHtml(working.id);
    const name = String(working.name || pt("profile.defaultName"));
    const alias = String(working.alias || working.profile?.fields?.[1] || "").trim();
    const identity = String(working.profile?.fields?.[2] || "").trim();
    const promptSystemBase = String(working.profile?.promptSystem || "").trim();
    const promptDeveloper = String(working.profile?.promptDeveloper || "").trim();
    const promptSystem = promptDeveloper && !promptSystemBase.includes(promptDeveloper)
      ? [promptSystemBase, promptDeveloper].filter(Boolean).join("\n\n")
      : promptSystemBase;
    const blurb = alias || identity || (isCompanion ? pt("profile.currentCompanion") : pt("profile.tapToEdit"));
    const shortId = String(working.id || "").slice(0, 8).toUpperCase();
    return `
      <article class="mini-char-card ${expanded ? "is-open" : ""} ${isCompanion ? "is-companion" : ""}" data-char-card="${id}">
        <button type="button" class="mini-char-card__head" data-profile-toggle="${id}" aria-expanded="${expanded ? "true" : "false"}">
          <span class="mini-char-card__avatar">${characterAvatarMarkup(character)}</span>
          <span class="mini-char-card__meta">
            <strong>${escapeHtml(name)}${isCompanion ? `<em class="mini-char-card__badge">${escapeHtml(pt("profile.companionBadge"))}</em>` : ""}</strong>
            <span>${escapeHtml(blurb)}</span>
          </span>
          <i data-lucide="chevron-down" class="mini-char-card__chev" aria-hidden="true"></i>
        </button>
        <div class="mini-char-card__body" ${expanded ? "" : "hidden"}>
          <form class="mini-form mini-form--card mini-char-card__form" data-profile-form="${id}">
            <div class="mini-char-archive">
              <div class="mini-char-archive__photo">${characterAvatarMarkup(character)}</div>
              <div class="mini-char-archive__meta">
                <span class="mini-char-archive__kicker">${escapeHtml(pt("profile.archiveKicker"))}</span>
                <strong class="mini-char-archive__name">${escapeHtml(name)}</strong>
                <span class="mini-char-archive__id">ID ${escapeHtml(shortId)}</span>
              </div>
            </div>
            <strong class="mini-form__title">${escapeHtml(pt("profile.chatIdentity"))}</strong>
            <p class="mini-form-hint">${escapeHtml(pt("profile.chatIdentityHint"))}</p>
            <label class="mini-form__row-field"><span>${escapeHtml(pt("profile.characterName"))}</span><input name="name" maxlength="24" value="${escapeHtml(name)}" autocomplete="off" placeholder="${escapeHtml(pt("profile.characterNamePlaceholder"))}" /></label>
            <label class="mini-form__row-field"><span>${escapeHtml(pt("profile.yourAlias"))}</span><input name="alias" maxlength="24" value="${escapeHtml(alias)}" autocomplete="off" placeholder="${escapeHtml(pt("profile.yourAliasPlaceholder"))}" /></label>
            <label class="mini-form__row-field" data-hosted-voice-only hidden><span>${escapeHtml(pt("profile.hostedVoice"))}</span><select name="hostedVoice" data-hosted-voice-select data-hosted-voice-scope="character" data-character-id="${escapeHtml(id)}"></select></label>
            <p class="mini-form-hint mini-form-hint--warn" data-hosted-voice-setup-needed hidden>${escapeHtml(pt("profile.hostedVoiceSetupNeeded"))}</p>
            <p class="mini-form-hint" data-hosted-voice-only hidden>${escapeHtml(pt("profile.hostedVoiceHint"))}</p>
            <label class="mini-form__row-field"><span>${escapeHtml(pt("profile.identity"))}</span><input name="identity" maxlength="40" value="${escapeHtml(identity)}" autocomplete="off" placeholder="${escapeHtml(pt("profile.identityPlaceholder"))}" /></label>
            <strong class="mini-form__title">${escapeHtml(pt("profile.promptTitle"))}</strong>
            <p class="mini-form-hint">${escapeHtml(pt("profile.promptHint"))}</p>
            <label class="mini-char-archive__prompt"><span>${escapeHtml(pt("profile.characterPrompt"))}</span><textarea name="promptSystem" rows="9" maxlength="${promptMaxLength(COMPANION_V2_LIMITS.characterSystemSupplement, promptSystem)}" placeholder="${escapeHtml(pt("profile.systemPromptPlaceholder"))}">${escapeHtml(promptSystem)}</textarea></label>
            ${expanded ? `
            <strong class="mini-form__title">${escapeHtml(t("character.originMemoriesTitle"))}</strong>
            <p class="mini-form-hint">${escapeHtml(t("character.originMemoriesHint"))}</p>
            <div class="origin-memory-editor" data-origin-memory-editor data-origin-memories-ready="1" data-origin-character-id="${id}">
              ${originMemoryEditorInnerMarkup((originMemories || []).map(toOriginMemoryDraft))}
            </div>` : ""}
            <div class="mini-char-card__actions">
              <span class="mini-form-hint" data-character-unsaved ${draft || phoneOriginDirtyIds.has(character.id) ? "" : "hidden"}>${escapeHtml(t("character.unsaved"))}</span>
              <button type="submit" class="mini-app-cta character-editor-save">${escapeHtml(pt("profile.save"))}</button>
              <button type="button" class="mini-app-cta mini-app-cta--ghost" data-profile-discard="${id}">${escapeHtml(t("character.discard"))}</button>
              ${isCompanion
                ? `<button type="button" class="mini-app-cta mini-app-cta--ghost" disabled>${escapeHtml(pt("profile.currentCompanion"))}</button>`
                : `<button type="button" class="mini-app-cta mini-app-cta--ghost" data-profile-set-active="${id}">${escapeHtml(pt("profile.setCompanion"))}</button>`}
              ${canDelete
                ? `<button type="button" class="mini-app-cta mini-app-cta--danger" data-profile-delete="${id}">${escapeHtml(pt("profile.delete"))}</button>`
                : ""}
            </div>
          </form>
        </div>
      </article>
    `;
  }

  async function renderProfile() {
    const list = root.querySelector("[data-profile-character-list]");
    const characters = await listCharacters();
    const activeId = getActiveCharacterId();
    if (profileExpandedId && !characters.some((c) => c.id === profileExpandedId)) {
      profileExpandedId = "";
    }

    if (list) {
      if (!characters.length) {
        list.innerHTML = `
          <div class="mini-char-empty">
            <p>${escapeHtml(pt("pop.charEmpty"))}</p>
            <button type="button" class="mini-app-cta" data-profile-add>${escapeHtml(pt("pop.charAdd"))}</button>
          </div>`;
      } else {
        const canDelete = characters.length > 1;
        let originMap = {};
        try {
          originMap = await listOriginMemoriesForCharacters(characters.map((item) => item.id));
        } catch (error) {
          console.warn("listOriginMemoriesForCharacters failed", error);
        }
        list.innerHTML = characters.map((character) => characterEditorHtml(character, {
          expanded: character.id === profileExpandedId,
          isCompanion: character.id === activeId,
          canDelete,
          originMemories: originMap[character.id] || [],
        })).join("");
      }
    }

    const summary = phoneData.profileSummary();
    root.querySelectorAll("[data-phone-name]").forEach((node) => {
      node.textContent = summary.name || pt("pop.defaultCharacter");
    });

    const flags = phoneData.getFeatureFlags();
    root.querySelectorAll("[data-feature-flag]").forEach((button) => {
      setSwitchState(button, Boolean(flags[button.dataset.featureFlag]));
    });
    fillProactiveWakeControls(root);
    refreshIcons();
    refreshHostedVoiceUi();
  }

  function patchFromProfileForm(form) {
    const character = getCharacterSync(form?.dataset?.profileForm);
    const name = form.name?.value.trim() || character?.name || "新角色";
    const alias = form.alias?.value.trim() || name;
    const identity = form.identity?.value.trim() || "";
    const promptSystem = form.promptSystem?.value?.trim() || "";
    const promptDeveloper = "";
    const prevFields = Array.isArray(character?.profile?.fields) ? [...character.profile.fields] : ["", "", "", "", ""];
    const fields = [name, alias, identity, prevFields[3] || "", prevFields[4] || ""];
    return identityPatchFromProfileState({
      fields,
      promptSystem,
      promptDeveloper,
    });
  }

  function confirmLeaveCharacterEditor() {
    const id = phoneCharacterEditor.characterId || profileExpandedId;
    const originDirty = Boolean(id && phoneOriginDirtyIds.has(id));
    const nav = phoneCharacterEditor.confirmNavigation();
    if (nav.allowed && !originDirty) return true;
    return window.confirm(t("character.unsavedChanges"));
  }

  async function patchCharacterFromForm(form) {
    const id = String(form?.dataset?.profileForm || "").trim();
    if (!id || !form) return null;
    if (phoneCharacterEditor.characterId !== id) {
      await phoneCharacterEditor.open(id);
    }
    const state = await phoneCharacterEditor.patch(patchFromProfileForm(form));
    const originDirty = phoneOriginDirtyIds.has(id);
    form.querySelector("[data-character-unsaved]")?.toggleAttribute("hidden", !state.hasUnsaved && !originDirty);
    return state;
  }

  async function saveCharacterFromForm(form) {
    const id = String(form?.dataset?.profileForm || "").trim();
    if (!id || !form) return;
    await patchCharacterFromForm(form);
    const result = await phoneCharacterEditor.save();
    if (!result?.ok) {
      phoneToast(result?.conflict ? pt("profile.saveConflict") : t("character.saveFailed"));
      return result;
    }
    const savedCharacter = getCharacterSync(id);
    await commitOriginMemoryEditor(form.querySelector("[data-origin-memory-editor]"), id, {
      role: savedCharacter?.name || savedCharacter?.profile?.fields?.[0] || "",
    });
    phoneOriginDirtyIds.delete(id);
    if (id === getActiveCharacterId()) {
      const character = getCharacterSync(id);
      const fields = Array.isArray(character?.profile?.fields) ? [...character.profile.fields] : ["", "", "", "", ""];
      const current = phoneData.readProfile();
      phoneData.writeProfile({
        ...current,
        fields,
        promptSystem: character?.profile?.promptSystem || "",
        promptDeveloper: character?.profile?.promptDeveloper || "",
      });
    }
    phoneToast("已保存");
    await renderProfile();
    updateRuntime(runtime.getState?.() || {});
    return result;
  }

  async function renderWorldbook() {
    const feed = root.querySelector("[data-phone-worldbook]");
    if (!feed) return;
    await renderWorldbookMiniFeed(feed, { limit: 3 });
  }

  function showWorldbookList() {
    const listPane = root.querySelector("[data-phone-wb-list-pane]");
    const editPane = root.querySelector("[data-phone-wb-edit-pane]");
    if (listPane) listPane.hidden = false;
    if (editPane) editPane.hidden = true;
  }

  function showWorldbookEdit(entry = null) {
    const listPane = root.querySelector("[data-phone-wb-list-pane]");
    const editPane = root.querySelector("[data-phone-wb-edit-pane]");
    const form = root.querySelector("[data-phone-wb-form]");
    const delBtn = root.querySelector("[data-phone-wb-delete]");
    if (listPane) listPane.hidden = true;
    if (editPane) editPane.hidden = false;
    if (!form) return;
    const idInput = form.querySelector("[data-wb-id]");
    if (idInput) idInput.value = entry?.id || "";
    form.title.value = entry?.title || "";
    form.category.value = entry?.category || "氛围";
    form.triggersText.value = Array.isArray(entry?.triggers) ? entry.triggers.join(", ") : "";
    form.content.value = entry?.content || "";
    form.priority.value = entry?.priority ?? 50;
    const enabled = form.querySelector("[data-wb-enabled]");
    if (enabled) enabled.checked = entry?.enabled !== false;
    if (delBtn) delBtn.hidden = !entry?.id;
  }

  async function renderWorldbookEditorList() {
    const list = root.querySelector("[data-phone-wb-list]");
    if (!list) return;
    const entries = await phoneData.listWorldbook();
    list.innerHTML = entries.length
      ? entries.map((entry) => `
        <article class="mini-wb-card ${entry.enabled === false ? "is-off" : ""}" data-phone-wb-id="${escapeHtml(entry.id)}">
          <button type="button" class="mini-wb-card__main" data-phone-wb-edit="${escapeHtml(entry.id)}">
            <strong>${escapeHtml(entry.title || "条目")}</strong>
            <span>${escapeHtml(entry.category || "")} · ${(entry.triggers || []).slice(0, 3).map((t) => escapeHtml(t)).join(" / ") || "无触发词"}</span>
          </button>
          <button type="button" class="mini-wb-card__toggle" data-phone-wb-toggle="${escapeHtml(entry.id)}" aria-label="${escapeHtml(entry.enabled === false ? pt("screens.enable") : pt("screens.disable"))}">
            ${entry.enabled === false ? "关" : "开"}
          </button>
        </article>
      `).join("")
      : '<p class="mini-empty">还没有条目，点右上角加一条</p>';
    refreshIcons(root);
  }

  function renderFloatControl() {
    const toggle = root.querySelector("[data-pet-float]");
    if (toggle) setSwitchState(toggle, Boolean(getPetFloatOn?.()));
    const character = getCharacterSync(getActiveCharacterId());
    const companionName = character?.name || character?.alias || pt("home.someone");
    const bindNode = root.querySelector("[data-phone-pet-bind]");
    if (bindNode) bindNode.textContent = pt("pet.currentCompanion", { name: companionName });

    const pet = getPet(readSelectedPetId());
    const petLabelKey = `pages.petLibrary.pets.${pet?.id || ""}.label`;
    const petTagKey = `pages.petLibrary.pets.${pet?.id || ""}.tagline`;
    const petLabelRaw = i18nT(petLabelKey);
    const petTagRaw = i18nT(petTagKey);
    const petLabel = petLabelRaw.startsWith("pages.") ? (pet?.label || "—") : petLabelRaw;
    const petTagline = petTagRaw.startsWith("pages.") ? (pet?.tagline || "") : petTagRaw;
    const nameNode = root.querySelector("[data-phone-pet-name]");
    const tagNode = root.querySelector("[data-phone-pet-tagline]");
    if (nameNode) nameNode.textContent = petLabel;
    if (tagNode) tagNode.textContent = petTagline;
    phonePetLibrary?.refresh?.();
    phonePetSize?.refresh?.();
    refreshIcons(root.querySelector("[data-phone-screen='pet']") || root);
  }

  async function renderMemory(query = "") {
    const node = root.querySelector("[data-memory-count]");
    const list = root.querySelector("[data-phone-memory-list]");
    try {
      const count = await phoneData.memoryCount(getActiveCharacterId());
      if (node) node.textContent = String(count);
    } catch {
      if (node) node.textContent = "—";
    }
    if (!list) return;
    const { listExperienceProjections, projectionKindLabel } = await import("../experience/projections-feed.js");
    const { experienceProjectionDeepLink } = await import("../experience/projection-archive.js");
    const projections = listExperienceProjections({
      characterId: getActiveCharacterId() || "",
      limit: 8,
    });
    const projectionHtml = projections.length
      ? `<div class="mini-memory-projections"><strong class="mini-memory-projections__title">最近一起经历</strong>${projections.map((item) => {
          const deepLink = experienceProjectionDeepLink(item);
          return `
          <button type="button" class="mini-memory-card is-projection is-clickable" data-projection-open data-deep-link="${escapeHtml(deepLink)}" data-projection-id="${escapeHtml(item.id || "")}">
            <em>${escapeHtml(projectionKindLabel(item.kind))}</em>
            <p>${escapeHtml(item.summary)}</p>
          </button>`;
        }).join("")}</div>`
      : "";
    const records = await phoneData.searchPhoneMemories(query, getActiveCharacterId());
    const recordsHtml = records.length
      ? records.map((record) => `
        <article class="mini-memory-card">
          <strong>${escapeHtml(record.title || record.rawText?.slice(0, 24) || "记忆")}</strong>
          <p>${escapeHtml((record.rawText || "").slice(0, 90))}</p>
        </article>
      `).join("")
      : (projections.length ? "" : `
        <section class="mini-memory-empty">
          <span aria-hidden="true"><i data-lucide="sparkles"></i></span>
          <strong>${escapeHtml(pt(query ? "memory.noResultsTitle" : "memory.emptyTitle"))}</strong>
          <p>${escapeHtml(pt(query ? "memory.noResultsBody" : "memory.emptyBody"))}</p>
          ${query ? "" : `<button type="button" data-home-companion-chat><i data-lucide="message-circle"></i>${escapeHtml(pt("memory.emptyAction"))}</button>`}
        </section>`);
    list.innerHTML = projectionHtml + recordsHtml;
    refreshIcons(list);
  }

  async function renderLab() {
    const provider = phoneData.readProvider();
    const form = root.querySelector("[data-phone-provider-form]");
    if (form) {
      form.baseUrl.value = provider.baseUrl || "";
      form.model.value = provider.model || "";
      form.apiKey.value = await phoneData.readApiKey();
    }
    const serviceStatus = root.querySelector("[data-lab-service-status]");
    if (serviceStatus) {
      if (isLocalOfflineSession()) {
        serviceStatus.textContent = pt("lab.offlineTestHint");
        serviceStatus.classList.remove("is-warn");
      } else {
        const ok = await checkServerHealth();
        serviceStatus.textContent = ok
          ? "本机服务已连接（8787）。DeepSeek：Base URL 填 https://api.deepseek.com/v1，Model 填 deepseek-chat。"
          : "本机服务未启动：另开终端运行 npm run server（8787），否则模型全部失败。";
        serviceStatus.classList.toggle("is-warn", !ok);
      }
    }
    const voice = phoneData.getVoiceSettings();
    const voiceForm = root.querySelector("[data-phone-voice-form]");
    if (voiceForm) {
      const providerId = voice.ttsProvider || "OpenAI";
      const hidden = voiceForm.querySelector("[data-tts-provider]");
      if (hidden) hidden.value = providerId;
      setSegmentedActive(root.querySelector("[data-tts-providers]"), providerId);
      voiceForm.ttsApiKey.value = voice.ttsApiKey || "";
      voiceForm.voiceId.value = voice.voiceId || voice.openaiVoice || "";
      if (voiceForm.sttApiKey) voiceForm.sttApiKey.value = voice.sttApiKey || "";
      if (voiceForm.sttModel) voiceForm.sttModel.value = voice.sttModel || "whisper-1";
      const autoSpeak = voiceForm.querySelector("[data-voice-autospeak]");
      if (autoSpeak) setSwitchState(autoSpeak, Boolean(voice.autoSpeak));
    }
    const imageForm = root.querySelector("[data-phone-imagegen-form]");
    if (imageForm) {
      const img = getImagegenSettings();
      imageForm.baseUrl.value = img.baseUrl || "";
      imageForm.apiKey.value = img.apiKey || "";
      imageForm.model.value = img.model || "dall-e-3";
      const size = img.defaultSize || "1024x1024";
      if (imageForm.defaultSize) imageForm.defaultSize.value = size;
      setSegmentedActive(imageForm.querySelector("[data-imagegen-sizes]"), size);
    }
    phoneVoice?.syncMic?.();
    refreshHostedVoiceUi();
  }

  async function copyBeautifyText(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function paintBeautifyContact() {
    const panel = root.querySelector("[data-beautify-contact]");
    if (!panel) return;
    const contact = getUiCustomContactCopy();
    const title = root.querySelector("[data-beautify-contact-title]");
    const blurb = root.querySelector("[data-beautify-contact-blurb]");
    const note = root.querySelector("[data-beautify-contact-note]");
    const status = root.querySelector("[data-beautify-contact-status]");
    if (title) title.textContent = contact.title || "";
    if (blurb) blurb.textContent = contact.blurb || "";
    if (note) {
      note.textContent = contact.note || "";
      note.hidden = !contact.note;
    }
    const github = String(contact.github || "").trim();
    const githubLink = root.querySelector("[data-beautify-contact-github]");
    const githubRow = githubLink?.closest("[data-beautify-contact-github-row]");
    if (githubLink) {
      githubLink.textContent = github.replace(/^https?:\/\//i, "");
      githubLink.setAttribute("href", github || "#");
    }
    root.querySelectorAll("[data-beautify-contact-github-action]").forEach((link) => {
      link.setAttribute("href", github || "#");
    });
    if (githubRow) githubRow.hidden = !github;
    [
      ["discord", "discord"],
      ["wechat", "wechat"],
      ["qqGroup", "qq-group"],
      ["email", "email"],
      ["qq", "qq"],
    ].forEach(([key, attr]) => {
      const value = String(contact[key] || "").trim();
      const valueEl = root.querySelector(`[data-beautify-contact-${attr}]`);
      const row = valueEl?.closest(`[data-beautify-contact-${attr}-row], .mini-beautify-contact__row`);
      const copyButton = root.querySelector(`[data-beautify-copy-${attr}]`);
      if (valueEl) valueEl.textContent = value;
      if (row) row.hidden = !value;
      if (copyButton) copyButton.disabled = !value;
    });
    if (status) status.textContent = "";
  }

  function renderSettingsExtras() {
    const eco = phoneData.readEcosystem();
    if (!phoneBillingPanel) {
      phoneBillingPanel = mountBillingPanel(root.querySelector("[data-billing-phone-panel]"), {
        locale: phoneData.getLocale(),
        getToken: () => phoneData.readEcosystem().token,
        onSummary(summary) {
          phoneData.writeEcosystem({
            billingBalance: summary.balance,
            billingReserved: summary.reserved,
            memberSince: summary.memberSince,
          });
        },
      });
    }
    root.querySelectorAll("[data-phone-account-status]").forEach((status) => {
      status.textContent = pt("settings.accountStatus");
    });
    root.querySelectorAll([
      "[data-account-login-body]",
      "[data-phone-auth-guest-only]",
      "[data-phone-auth-form]",
      "[data-phone-auth-logout]",
      "[data-product-mode]",
      "[data-hosted-tier-group]",
      "[data-hosted-tier]",
    ].join(", ")).forEach((node) => {
      node.hidden = true;
    });
    const productMode = eco.modelSource === "hosted" || eco.productMode === "subscription"
      ? "hosted"
      : "byok";
    const hostedTier = eco.hostedTier === "high" ? "high" : "standard";
    root.querySelectorAll("[data-product-mode]").forEach((btn) => {
      const active = btn.dataset.productMode === productMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.disabled = btn.dataset.productMode === "hosted" && !eco.loggedIn;
    });
    root.querySelectorAll("[data-hosted-tier-group]").forEach((node) => {
      node.hidden = productMode !== "hosted" || !eco.loggedIn;
    });
    root.querySelectorAll("[data-hosted-tier]").forEach((btn) => {
      const active = btn.dataset.hostedTier === hostedTier;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    root.querySelectorAll("[data-product-access-status]").forEach((node) => {
      if (!eco.loggedIn && productMode === "hosted") node.textContent = t("onboard.loginRequired");
      else if (productMode === "hosted") {
        node.textContent = t("onboard.productSubscriptionActive", {
          credits: Math.max(0, Number(eco.billingBalance ?? eco.credits) || 0),
          tier: t(hostedTier === "high" ? "onboard.hostedTierHigh" : "onboard.hostedTierStandard"),
        });
      } else node.textContent = t("onboard.productDeveloperActive");
    });
    const managed = productMode === "hosted";
    root.querySelectorAll("[data-provider-byok-only]").forEach((node) => { node.hidden = managed; });
    root.querySelectorAll("[data-provider-managed-only]").forEach((node) => { node.hidden = !managed; });
    refreshHostedVoiceUi();
    const authForm = root.querySelector("[data-phone-auth-form]");
    if (authForm) {
      const emailInput = authForm.querySelector("[data-phone-auth-email]");
      if (emailInput && eco.loggedIn && String(eco.username || "").includes("@")) {
        emailInput.value = eco.username;
      }
      const loginBtn = authForm.querySelector("[data-phone-auth-login]");
      if (loginBtn) loginBtn.hidden = Boolean(eco.loggedIn);
      setPhoneAuthType(authForm.dataset.phoneAuthTypeValue || "email");
      setPhoneAuthMode(authForm.dataset.phoneAuthModeValue || "login");
    }
    setSegmentedActive(root.querySelector("[data-phone-locales]"), phoneData.getLocale());
    setSegmentedActive(
      root.querySelector("[data-diary-styles]"),
      phoneData.getDiarySettings().style || "literary",
    );
    const schedule = root.querySelector("[data-diary-schedule]");
    if (schedule) setSwitchState(schedule, Boolean(phoneData.getDiarySettings().scheduleEnabled));
    const mpPrefs = loadMultiplayerPrefs();
    const mpSwitch = root.querySelector("[data-multiplayer-enabled]");
    if (mpSwitch) setSwitchState(mpSwitch, Boolean(mpPrefs.enabled));
    const mpLabel = root.querySelector("[data-multiplayer-mode-label]");
    if (mpLabel) {
      mpLabel.textContent = mpPrefs.enabled
        ? `模式：${mpPrefs.mode}（本地暂缓，未开放公网）`
        : "模式：本地暂缓（未开放）";
    }
  }

  async function changePhoneProductMode(mode) {
    const eco = phoneData.readEcosystem();
    const status = root.querySelector("[data-product-access-status]");
    const nextMode = mode === "hosted" ? "hosted" : "byok";
    if (nextMode === "hosted" && (!eco.loggedIn || !eco.token)) {
      const message = t("onboard.loginRequired");
      if (status) status.textContent = message;
      phoneToast(message);
      window.dispatchEvent(new CustomEvent("yueqi:auth-required"));
      return;
    }
    if (nextMode === "byok" && (!eco.loggedIn || !eco.token)) {
      phoneData.writeEcosystem({ modelSource: "byok", authMode: eco.authMode || "offline" });
      renderSettingsExtras();
      return;
    }
    if (status) status.textContent = t("onboard.savingMode");
    try {
      const payload = await selectProductMode(eco.token, nextMode);
      const access = payload?.access || {};
      phoneData.writeEcosystem({
        modelSource: access.modelSource || access.mode || nextMode,
        hostedTier: access.hostedTier === "high" ? "high" : "standard",
        billingBalance: Math.max(0, Number(access.credits) || 0),
      });
      renderSettingsExtras();
      window.dispatchEvent(new CustomEvent("yueqi:product-access-changed", { detail: access }));
      void refreshPhoneSpeechRoutes({ force: true });
    } catch (error) {
      const message = String(error?.message || t("onboard.modeSaveFailed"));
      if (status) status.textContent = message;
      phoneToast(message);
    }
  }

  async function changePhoneHostedTier(tier) {
    const eco = phoneData.readEcosystem();
    const status = root.querySelector("[data-product-access-status]");
    const nextTier = tier === "high" ? "high" : "standard";
    if (!eco.loggedIn || !eco.token) {
      const message = t("onboard.loginRequired");
      if (status) status.textContent = message;
      phoneToast(message);
      window.dispatchEvent(new CustomEvent("yueqi:auth-required"));
      return;
    }
    if (status) status.textContent = t("onboard.savingMode");
    try {
      const payload = await selectProductMode(eco.token, "", { hostedTier: nextTier });
      const access = payload?.access || {};
      phoneData.writeEcosystem({
        modelSource: access.modelSource || access.mode || eco.modelSource,
        hostedTier: access.hostedTier === "high" ? "high" : "standard",
        billingBalance: Math.max(0, Number(access.credits ?? eco.billingBalance) || 0),
      });
      renderSettingsExtras();
      window.dispatchEvent(new CustomEvent("yueqi:product-access-changed", { detail: access }));
      void refreshPhoneSpeechRoutes({ force: true });
    } catch (error) {
      const message = String(error?.message || t("onboard.modeSaveFailed"));
      if (status) status.textContent = message;
      phoneToast(message);
    }
  }

  function setPhoneAuthMode(mode) {
    const form = root.querySelector("[data-phone-auth-form]");
    if (!form) return;
    const next = mode === "register" ? "register" : "login";
    form.dataset.phoneAuthModeValue = next;
    form.querySelectorAll("[data-phone-auth-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.phoneAuthMode === next);
      button.setAttribute("aria-pressed", button.dataset.phoneAuthMode === next ? "true" : "false");
    });
    form.querySelectorAll("[data-phone-auth-register-only]").forEach((node) => {
      node.hidden = next !== "register";
    });
    const authType = normalizeAuthType(form.dataset.phoneAuthTypeValue);
    form.querySelectorAll("[data-phone-auth-email-register-only]").forEach((node) => {
      node.hidden = next !== "register" || authType !== "email";
    });
    const submit = form.querySelector("[data-phone-auth-login]");
    if (submit) {
      submit.textContent = pt(next === "register" ? "settings.register" : "settings.login");
    }
    syncPhoneAuthSubmit(form);
  }

  function setPhoneAuthType(type) {
    const form = root.querySelector("[data-phone-auth-form]");
    if (!form) return;
    const next = normalizeAuthType(type);
    form.dataset.phoneAuthTypeValue = next;
    form.querySelectorAll("[data-phone-auth-type]").forEach((button) => {
      const active = button.dataset.phoneAuthType === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    form.querySelectorAll("[data-phone-auth-email-only]").forEach((node) => {
      node.hidden = next !== "email";
    });
    form.querySelectorAll("[data-phone-auth-phone-only]").forEach((node) => {
      node.hidden = next !== "phone";
    });
    setPhoneAuthMode(form.dataset.phoneAuthModeValue);
  }

  function readPhoneAuthForm(form) {
    return {
      authType: normalizeAuthType(form?.dataset.phoneAuthTypeValue),
      email: String(form?.querySelector("[data-phone-auth-email]")?.value || "").trim(),
      countryCode: String(form?.querySelector("[data-phone-auth-country-code]")?.value || "+86"),
      phone: String(form?.querySelector("[data-phone-auth-phone]")?.value || "").trim(),
      code: String(form?.querySelector("[data-phone-auth-code]")?.value || "").trim(),
      invitationCode: String(form?.querySelector("[data-phone-auth-invitation-code]")?.value || "").trim(),
      password: String(form?.querySelector("[data-phone-auth-password]")?.value || ""),
      legalConsent: form?.querySelector("[data-phone-auth-legal-consent]")?.checked === true,
    };
  }

  function syncPhoneAuthSubmit(form = root.querySelector("[data-phone-auth-form]")) {
    if (!form) return;
    const mode = form.dataset.phoneAuthModeValue === "register" ? "register" : "login";
    const values = readPhoneAuthForm(form);
    const submit = form.querySelector("[data-phone-auth-login]");
    if (!submit) return;
    submit.disabled = !isAuthCredentialReady(values)
      || (mode === "register" && (
        !values.legalConsent
        || (values.authType === "email" && !/^\d{6}$/.test(values.code))
      ));
  }

  async function runPhoneAuth(mode) {
    const form = root.querySelector("[data-phone-auth-form]");
    const status = root.querySelector("[data-phone-auth-status]");
    if (!form) return;
    mode = mode === "register" ? "register" : "login";
    const values = readPhoneAuthForm(form);
    if (!isAuthCredentialReady(values)) {
      const msg = t("onboard.authNeedFields");
      if (status) status.textContent = msg;
      phoneToast(msg);
      return;
    }
    if (mode === "register" && values.authType === "email" && !/^\d{6}$/.test(values.code)) {
      const msg = t("onboard.authNeedEmail");
      if (status) status.textContent = msg;
      phoneToast(msg);
      return;
    }
    if (mode === "register" && !values.legalConsent) {
      const msg = t("onboard.authNeedLegalConsent");
      if (status) status.textContent = msg;
      phoneToast(msg);
      return;
    }
    if (status) {
      status.textContent = mode === "register"
        ? t("onboard.authRegistering")
        : t("onboard.authLoggingIn");
    }
    try {
      const result = mode === "register"
        ? await registerAccount(values)
        : await loginAccount(values);
      const token = String(result?.token || "").trim();
      phoneData.writeEcosystem({
        loggedIn: true,
        authMode: "online",
        username: result?.user?.email
          || result?.user?.phone
          || result?.user?.username
          || (values.authType === "phone" ? `${values.countryCode}${values.phone}` : values.email),
        token,
        serviceBase: getServiceBase(),
        modelSource: result?.user?.productAccess?.modelSource
          || result?.user?.productAccess?.mode
          || "byok",
        hostedTier: result?.user?.productAccess?.hostedTier === "high" ? "high" : "standard",
        billingBalance: Math.max(0, Number(result?.user?.productAccess?.credits) || 0),
      });
      if (form.querySelector("[data-phone-auth-password]")) {
        form.querySelector("[data-phone-auth-password]").value = "";
      }
      const okMsg = mode === "register" ? t("onboard.authRegistered") : t("onboard.authLoggedIn");
      if (status) status.textContent = okMsg;
      phoneToast(okMsg);
      renderSettingsExtras();
      void phoneBillingPanel?.refresh();
      void refreshPhoneSpeechRoutes({ force: true });
    } catch (error) {
      const msg = formatUserError(error, { fallbackKey: "onboard.authFailed" }).slice(0, 120);
      if (status) status.textContent = msg;
      phoneToast(msg);
    }
  }

  function paintPhoneReply() {
    const stack = root.querySelector("[data-mini-composer-stack]");
    if (!stack) return;
    let banner = stack.querySelector("[data-phone-composer-reply]");
    if (!pendingPhoneReply) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "composer-reply-preview";
      banner.dataset.phoneComposerReply = "";
      banner.innerHTML = `<span data-phone-composer-reply-copy></span><button type="button" data-phone-composer-reply-close aria-label="${escapeHtml(pt("pop.cancelReply"))}"><i data-lucide="x"></i></button>`;
      stack.prepend(banner);
    }
    banner.querySelector("[data-phone-composer-reply-copy]").textContent =
      `引用${pendingPhoneReply.role === "user" ? "你" : "对方"}：${pendingPhoneReply.text}`;
    refreshIcons();
  }

  async function sendPhoneMessage(text, existingId = "", options = {}) {
    const raw = String(text || "").trim();
    const hasAttachment = Boolean(options.attachment && typeof options.attachment === "object");
    if (!raw && !options.stickerUrl && !hasAttachment) return;
    // Freeze the DM target before optimistic rendering or shell events can
    // repaint the active companion. A turn must stay with the thread where
    // the user pressed send, even if another surface changes global focus.
    const sendFocus = getChatFocus();
    const visibleThread = popChatMode === "thread" ? companionTrackedSession : null;
    const targetCharacterId = String(
      options.characterId || visibleThread?.characterId || sendFocus?.characterId || "",
    ).trim();
    const targetSessionId = String(
      options.sessionId || visibleThread?.sessionId || sendFocus?.sessionId || "",
    ).trim();
    const sendKey = `${raw}::${options.stickerUrl || ""}::${options.stickerId || ""}::${options.attachment?.name || ""}`;
    if (!existingId) {
      if (root.dataset.phoneSendingKey === sendKey) return;
      root.dataset.phoneSendingKey = sendKey;
    }
    try {
      const parsed = parseTokenMessage(raw);
      if (!parsed.ok && /^\[(转账|收款)\|/i.test(raw)) {
        const err = parsed.errors?.includes("amount_invalid")
          ? "金额需在 0.01～999999.99 之间"
          : "转账格式有误，请从「+」里重新发起";
        notifyChatFeedback(err, { tone: "warning", source: "phone_token" });
        return;
      }
      if (parsed.ok && parsed.mediaType === "transfer") {
        if (!canAfford(parsed.token.amount)) {
          notifyChatFeedback("栖币不足，无法转账", { tone: "warning", source: "phone_token" });
          return;
        }
      }
      // 内容保留协议串，渲染时再解析成卡片（备注不会变成纯文本气泡）
      const displayContent = raw || (parsed.ok ? parsed.content : (parsed.display?.content || ""));
      const tokenMeta = parsed.ok
        ? {
          mediaType: parsed.mediaType,
          kind: parsed.mediaType,
          token: {
            ...parsed.token,
            direction: "out",
            status: "pending",
          },
        }
        : {
          mediaType: options.stickerUrl ? "sticker" : (hasAttachment ? "attachment" : "text"),
        };
      const stickerMeta = options.stickerUrl
        ? {
          kind: "sticker",
          mediaType: "sticker",
          stickerUrl: options.stickerUrl,
          stickerId: options.stickerId || "",
        }
        : {};
      const locationMeta = options.location
        ? {
          kind: "location",
          mediaType: "location",
          location: options.location,
        }
        : {};
      const attachmentBase = hasAttachment
        ? createAttachmentMessageMetadata(options.attachment)
        : null;
      const attachmentMeta = attachmentBase
        ? {
          ...attachmentBase,
          attachment: {
            ...attachmentBase.attachment,
            previewUrl: options.attachment.type === "image"
              ? (options.attachment.dataUrl || options.attachment.previewUrl || "")
              : "",
          },
        }
        : {};
      const replyTo = options.replyTo || pendingPhoneReply;
      if (!existingId) {
        pendingPhoneReply = null;
        paintPhoneReply();
      }
      const id = existingId || `phone-pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let message = messages.find((item) => item.id === id);
      if (!message) {
        message = normalizeMessage({
          id,
          role: "user",
          content: displayContent || (hasAttachment ? (options.attachment?.name || "[附件]") : "[表情]"),
          metadata: {
            pending: true,
            ...tokenMeta,
            ...stickerMeta,
            ...locationMeta,
            ...attachmentMeta,
            ...(replyTo ? { replyTo } : {}),
          },
        });
        messages.push(message);
      } else {
        message.content = displayContent || (hasAttachment ? (options.attachment?.name || "[附件]") : "[表情]");
        message.metadata = {
          ...message.metadata,
          pending: true,
          failed: false,
          ...tokenMeta,
          ...stickerMeta,
          ...locationMeta,
          ...attachmentMeta,
          ...(replyTo ? { replyTo } : {}),
        };
      }
      renderMessages();
      try {
        const expectContent = String(raw || stickerPromptText({ description: displayContent })).trim();
        const result = await Promise.resolve(sendMessage?.(expectContent, {
          characterId: targetCharacterId,
          sessionId: targetSessionId,
          stickerUrl: options.stickerUrl || "",
          stickerId: options.stickerId || "",
          // Same id as optimistic bubble → chat-message event merges by id, not content race.
          messageId: id,
          location: options.location || null,
          replyTo: replyTo || null,
          attachment: options.attachment || null,
          routeIntent: options.routeIntent || "",
        }));
        if (result === false) throw new Error("SEND_REJECTED");
        // Keep pending until reconciled — clearing it early let chat-message push a twin.
        let reconciled = false;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const persisted = await Promise.resolve(getRecentMessages?.() || []);
          const match = [...persisted].reverse().find((row) => (
            row?.role === "user"
            && (
              String(row.id || "") === id
              || (expectContent && String(row.content || "").trim() === expectContent)
              || (expectContent && String(row.content || "").includes(expectContent))
            )
          ));
          if (match) {
            messages = dedupePhoneUserMessages(persisted.map(normalizeMessage));
            await Promise.all(messages.map((item) => hydrateAttachmentPreview(item)));
            message = messages.find((row) => row.id === match.id) || normalizeMessage(match);
            if (message.metadata) {
              message.metadata = { ...message.metadata, pending: false, failed: false };
            }
            reconciled = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (!reconciled) {
          // Authoritative write already succeeded (result !== false). Keep bubble delivered.
          message.metadata = { ...message.metadata, pending: false, failed: false };
          messages = dedupePhoneUserMessages(messages);
        }
        // 发出即扣款并到账，不再卡「待对方收款」
        if (message.metadata?.token?.kind === "transfer" && message.metadata.token.direction === "out") {
          const settled = applyTokenSettlement(message.metadata.token, message.id);
          if (settled.ok) {
            message.metadata.token = markTokenSettled(message.metadata.token, settled);
          } else if (settled.error === "insufficient_balance") {
            message.metadata.failed = true;
            notifyChatFeedback("栖币不足，转账未发出", { tone: "danger", source: "phone_token" });
          }
        }
        renderMessages();
        emitPhoneAppEvent("pop.message.sent", {
          appId: "pop",
          messageId: message.id,
          sessionId: targetSessionId,
          characterId: targetCharacterId,
          preview: String(raw || displayContent || "").slice(0, 120),
        });
      } catch {
        if (replyTo) {
          message.metadata = { ...message.metadata, replyTo };
        }
        message.metadata = { ...message.metadata, pending: false, failed: true };
        renderMessages();
      }
    } finally {
      if (!existingId && root.dataset.phoneSendingKey === sendKey) {
        delete root.dataset.phoneSendingKey;
      }
    }
  }

  function sendPhoneSticker(sticker) {
    const text = stickerPromptText(sticker);
    return sendPhoneMessage(text, "", {
      stickerUrl: sticker.url,
      stickerId: sticker.id,
    });
  }

  function updateRuntime(state) {
    refreshHomeWidgets(state);
  }

  function updateGreeting() {
    refreshHomeWidgets();
  }

  /**
   * Lock screen ticks every second but only shows a clock. Repainting every home
   * widget (character, events, relationship, avatars) at 1Hz behind the lock
   * overlay was pure jank on device; unlockPhone() repaints them anyway.
   */
  function updateLockClock() {
    const now = new Date();
    root.querySelectorAll("[data-phone-time], [data-lock-clock], [data-widget-clock]").forEach((node) => {
      node.textContent = formatClock(now);
    });
    const lockDate = root.querySelector("[data-lock-date]");
    if (lockDate) lockDate.textContent = formatLockDate(now);
  }

  function remountSettingsHub() {
    const old = root.querySelector('[data-phone-screen="settings"]');
    if (!old?.parentNode) return null;
    const diaryPrefs = phoneData.getDiarySettings();
    const wrap = document.createElement("div");
    wrap.innerHTML = buildSettingsHubHtml({
      localeId: phoneData.getLocale(),
      passcodeEnabled: prefs.passcodeEnabled === true,
    }).trim();
    const next = wrap.firstElementChild;
    if (!next) return null;
    const wasHidden = old.hidden;
    const scrollTop = old.querySelector(".mini-app-scroll")?.scrollTop || 0;
    const oldPass = old.querySelector("[data-phone-auth-password]")?.value || "";
    const oldEmail = old.querySelector("[data-phone-auth-email]")?.value || "";
    const oldPhone = old.querySelector("[data-phone-auth-phone]")?.value || "";
    const oldCountryCode = old.querySelector("[data-phone-auth-country-code]")?.value || "+86";
    const oldCode = old.querySelector("[data-phone-auth-code]")?.value || "";
    const oldInvitation = old.querySelector("[data-phone-auth-invitation-code]")?.value || "";
    const oldLegalConsent = old.querySelector("[data-phone-auth-legal-consent]")?.checked === true;
    const oldAuthMode = old.querySelector("[data-phone-auth-form]")?.dataset.phoneAuthModeValue || "login";
    const oldAuthType = old.querySelector("[data-phone-auth-form]")?.dataset.phoneAuthTypeValue || "email";
    const serviceBase = old.querySelector("[data-phone-service-base]")?.value || "";
    old.replaceWith(next);
    next.hidden = wasHidden;
    const passField = next.querySelector("[data-phone-auth-password]");
    const emailInput = next.querySelector("[data-phone-auth-email]");
    const phoneInput = next.querySelector("[data-phone-auth-phone]");
    const countryCodeInput = next.querySelector("[data-phone-auth-country-code]");
    const codeInput = next.querySelector("[data-phone-auth-code]");
    const invitationInput = next.querySelector("[data-phone-auth-invitation-code]");
    const legalInput = next.querySelector("[data-phone-auth-legal-consent]");
    const serviceInput = next.querySelector("[data-phone-service-base]");
    if (passField && oldPass) passField.value = oldPass;
    if (emailInput && oldEmail) emailInput.value = oldEmail;
    if (phoneInput && oldPhone) phoneInput.value = oldPhone;
    if (countryCodeInput) countryCodeInput.value = oldCountryCode;
    if (codeInput && oldCode) codeInput.value = oldCode;
    if (invitationInput && oldInvitation) invitationInput.value = oldInvitation;
    if (legalInput) legalInput.checked = oldLegalConsent;
    if (serviceInput && serviceBase) serviceInput.value = serviceBase;
    setPhoneAuthType(oldAuthType);
    setPhoneAuthMode(oldAuthMode);
    const scroller = next.querySelector(".mini-app-scroll");
    if (scroller) scroller.scrollTop = scrollTop;
    syncLockSettingsUi({ collapseFold: true });
    syncDevtoolsEntry();
    try {
      gateUi?.destroy?.();
    } catch {
      /* ignore */
    }
    gateUi = mountGateUi(next, gateUiDeps);
    next.classList.remove("is-locale-refresh");
    void next.offsetWidth;
    next.classList.add("is-locale-refresh");
    window.setTimeout(() => next.classList.remove("is-locale-refresh"), 380);
    enhancePhoneCodeFields(next);
    return next;
  }

  function refreshLocaleUi(localeId = getLocale()) {
    const id = localeId === "en" ? "en" : "zh-CN";
    remountSettingsHub();
    applyPhoneI18n(root);
    const companionBtn = root.querySelector(".mini-statusbar__assistant");
    const companionName = getCharacterSync(getActiveCharacterId())?.name || pt("home.someone");
    const companionLabel = id === "en" ? `Current companion: ${companionName}` : `当前伴侣：${companionName}`;
    companionBtn?.setAttribute("aria-label", companionLabel);
    companionBtn?.setAttribute("title", companionLabel);
    const notificationBtn = root.querySelector("[data-phone-notifications]");
    const notificationLabel = id === "en" ? "Messages and updates" : "消息与动态";
    notificationBtn?.setAttribute("aria-label", notificationLabel);
    notificationBtn?.setAttribute("title", notificationLabel);
    const appExitBtn = root.querySelector("[data-phone-switch-ui='app']");
    if (appExitBtn) {
      const appLabel = id === "en" ? "Switch to App UI" : "切换到 App 界面";
      const appTitle = id === "en" ? "App UI" : "App 界面";
      appExitBtn.setAttribute("aria-label", appLabel);
      appExitBtn.setAttribute("title", appTitle);
    }
    root.querySelectorAll("[data-home-dot]").forEach((dot) => {
      const page = Number(dot.dataset.page || 0) + 1;
      dot.setAttribute("aria-label", pt("home.pageLabel", { n: page }));
    });
    renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
    refreshHomeWidgets(runtime.getState?.() || {});
    syncPopChrome();
    if (currentView === "pop") {
      if (currentPopTab === "chat") {
        if (popChatMode === "list") renderSessionList();
        else renderMessages();
      } else if (currentPopTab === "contacts") {
        renderContacts();
      } else if (currentPopTab === "moments") {
        renderMoments();
        renderMoments(root.querySelector("[data-phone-moments-inline]"));
      } else if (currentPopTab === "me") {
        renderPopMe();
        renderWalletPanel();
      }
    }
    phoneVoice?.syncMic?.();
    phoneVoice?.refreshSpeakButtons?.();
    void renderProfile();
    phoneListen?.refreshLocale?.();
    exploreApp?.refreshLocale?.();
    qishiApp?.refreshLocale?.();
    root.querySelectorAll("[data-wallpaper-id]").forEach((button) => {
      const wallpaperId = button.dataset.wallpaperId;
      if (!WALLPAPER_PRESET_IDS.has(wallpaperId)) return;
      const label = pt(`beautify.wallpaper.${wallpaperId}`);
      button.setAttribute("aria-label", label);
      const em = button.querySelector("em");
      if (em) em.textContent = label;
    });
    phoneShop?.renderCatalog?.();
    phoneShop?.renderBag?.();
    phoneShop?.renderOrders?.();
    phoneCalendar?.render?.();
    void phoneDiary?.refresh?.();
    paintBeautifyContact();
    renderSettingsExtras();
    refreshIcons();
  }

  function onLocaleChanged(event) {
    refreshLocaleUi(event?.detail?.locale || getLocale());
  }

  async function openCompanionThread() {
    if (locked || editMode) return false;
    const companionId = String(getActiveCharacterId() || "").trim();
    // Opening Today → chat means the user saw the surface; clear stuck badges.
    if (companionId) markAllTodayRead(companionId);
    refreshTodayInboxWidget();
    // Open the real Pop DM — not just the thread chrome with a stale/empty focus.
    openApp("pop");
    if (currentView !== "pop") return false;
    if (companionId) {
      await openDmThread(companionId);
      return true;
    }
    setPopTab("chat");
    setPopChatMode("list");
    return false;
  }

  const onRootClick = (event) => {
    if (locked) {
      if (event.target.closest("[data-lock-to-passcode]")) {
        if (!prefs.passcodeEnabled) unlockPhone();
        else setLockMode("PASSCODE");
        return;
      }
      if (event.target.closest("[data-lock-to-time]")) {
        setLockMode("TIME");
        return;
      }
      const key = event.target.closest("[data-lock-key]")?.dataset.lockKey;
      if (key != null) {
        // Pointer presses already registered the digit; only keyboard-activated
        // clicks (detail 0) still need handling here.
        if (event.detail === 0) tryPasscode(key);
        return;
      }
      if (event.target.closest('[data-lock-pane="TIME"]')) {
        if (prefs.passcodeEnabled) setLockMode("PASSCODE");
        else unlockPhone();
      }
      return;
    }

    if (event.target.closest("[data-folder-close]")) {
      closeFolderSheet();
      return;
    }
    const folderApp = event.target.closest("[data-folder-grid] .mini-app-icon[data-app-id]");
    if (folderApp) {
      const id = folderApp.dataset.appId;
      closeFolderSheet();
      if (id) openApp(id);
      return;
    }
    const todayOpen = event.target.closest("[data-today-open]");
    if (todayOpen) {
      const href = todayOpen.dataset.deepLink || "";
      const deliveryId = todayOpen.dataset.deliveryId || "";
      const artifactId = todayOpen.dataset.artifactId || "";
      markInboxItemRead(deliveryId, artifactId);
      refreshTodayInboxWidget();
      openPhoneDeepLink(href, {
        deliveryId,
        artifactId,
      });
      return;
    }
    if (event.target.closest("[data-phone-notifications]")) {
      event.preventDefault();
      void syncArtifactSurfaces().finally(() => openCompanionThread());
      return;
    }
    if (event.target.closest("[data-home-companion-chat], [data-widget='today']")) {
      event.preventDefault();
      void openCompanionThread();
      return;
    }
    if (event.target.closest("[data-home-open-listen], [data-widget='listen']")) {
      event.preventDefault();
      openApp("listen");
      return;
    }
    const permBtn = event.target.closest("[data-request-permission]");
    if (permBtn) {
      event.preventDefault();
      const permissionId = String(permBtn.dataset.requestPermission || "").trim();
      if (!permissionId) return;
      permBtn.disabled = true;
      void ensurePermission(permissionId).then((result) => {
        const granted = result?.ok === true || result?.status === "granted";
        if (granted) {
          permBtn.textContent = String(getLocale() || "").toLowerCase().startsWith("en") ? "Granted" : "已授权";
          document.dispatchEvent(new CustomEvent(CAPABILITY_OPEN_EVENT, {
            detail: {
              openApp: permBtn.dataset.capabilityOpen || "",
              event: permBtn.dataset.capabilityEvent || "",
              intentId: permBtn.dataset.capabilityId || "",
            },
          }));
        }
      }).finally(() => {
        permBtn.disabled = false;
      });
      return;
    }
    const capOpen = event.target.closest("[data-capability-open-btn]");
    if (capOpen) {
      event.preventDefault();
      document.dispatchEvent(new CustomEvent(CAPABILITY_OPEN_EVENT, {
        detail: {
          openApp: capOpen.dataset.capabilityOpen || "",
          event: capOpen.dataset.capabilityEvent || "",
          intentId: capOpen.dataset.capabilityId || "",
        },
      }));
      return;
    }
    const artifactOpen = event.target.closest("[data-artifact-open]");
    if (artifactOpen) {
      openPhoneDeepLink(artifactOpen.dataset.deepLink || "", {
        deliveryId: artifactOpen.dataset.deliveryId || "",
        artifactId: artifactOpen.dataset.artifactId || "",
      });
      return;
    }
    const projectionOpen = event.target.closest("[data-projection-open]");
    if (projectionOpen) {
      openPhoneDeepLink(projectionOpen.dataset.deepLink || "", {
        artifactId: projectionOpen.dataset.projectionId ? `exp:${projectionOpen.dataset.projectionId}` : "",
      });
      return;
    }
    if (event.target.closest("[data-experience-archive-close]")) {
      closeExperienceArchiveSheet();
      return;
    }
    if (event.target.closest("[data-cal-open-full]")) {
      event.preventDefault();
      event.stopPropagation();
      openApp("calendar");
      return;
    }
    if (event.target.closest("[data-widget='calendar']")) {
      // Days / swipe handled on the week strip (weekdays + dates); leftover taps open full calendar.
      if (!event.target.closest("[data-cal-week-swipe], [data-cal-week-viewport], [data-cal-day]")) {
        openApp("calendar");
      }
      return;
    }
    if (editMode) {
      if (event.target.closest("[data-icon-face-sheet]")) return;
      const onIcon = event.target.closest(".mini-app-icon[data-app-id]");
      const onDock = event.target.closest(".mini-dock");
      const onDots = event.target.closest(".mini-home__dots");
      if (!onIcon && !onDock && !onDots) {
        setEditMode(false);
        return;
      }
    }
    if (event.target.closest("[data-home-edit-done]")) {
      setEditMode(false);
      return;
    }
    const dot = event.target.closest("[data-home-dot]");
    if (dot) {
      pageIndex = Number(dot.dataset.page) || 0;
      persistPrefs({ homePageIndex: pageIndex });
      homePager?.sync(pageIndex);
      return;
    }
    const wallpaperId = event.target.closest("[data-wallpaper-id]")?.dataset.wallpaperId;
    if (wallpaperId) {
      const inSheet = Boolean(event.target.closest("[data-wallpaper-sheet]"));
      if (inSheet) {
        setWallpaperValue(wallpaperSheetTarget, wallpaperId);
        closeWallpaperSheet();
      } else {
        setWallpaperBoth(wallpaperId);
      }
      return;
    }
    const wallpaperTarget = event.target.closest("[data-wallpaper-target]")?.dataset.wallpaperTarget;
    if (wallpaperTarget) {
      openWallpaperSheet(wallpaperTarget);
      return;
    }
    if (event.target.closest("[data-wallpaper-sheet-close]")) {
      closeWallpaperSheet();
      return;
    }
    if (event.target.closest("[data-wallpaper-url-save]")) {
      const url = String(root.querySelector("[data-wallpaper-url]")?.value || "").trim();
      if (!/^https?:\/\//i.test(url)) return;
      setWallpaperValue(wallpaperSheetTarget, url);
      closeWallpaperSheet();
      return;
    }
    const contactCopy = event.target.closest([
      "[data-beautify-copy-discord]",
      "[data-beautify-copy-wechat]",
      "[data-beautify-copy-qq-group]",
      "[data-beautify-copy-email]",
      "[data-beautify-copy-qq]",
    ].join(","));
    if (contactCopy) {
      const channel = [
        ["discord", "discord", "discordCopied"],
        ["wechat", "wechat", "wechatCopied"],
        ["qqGroup", "qq-group", "qqGroupCopied"],
        ["email", "email", "emailCopied"],
        ["qq", "qq", "qqCopied"],
      ].find(([, attr]) => contactCopy.hasAttribute(`data-beautify-copy-${attr}`));
      if (!channel) return;
      const [key, , copiedKey] = channel;
      copyBeautifyText(CUSTOM_CONTACT[key]).then((ok) => {
        const status = root.querySelector("[data-beautify-contact-status]");
        if (status) {
          status.textContent = ok
            ? t(`pages.companionChrome.customContact.${copiedKey}`)
            : t("pages.companionChrome.customContact.copyFailed");
        }
      });
      return;
    }
    if (event.target.closest("[data-phone-lock-now]")) {
      setLocked(true);
      return;
    }

    const introToggleNote = event.target.closest("[data-chat-intro-toggle]")?.closest("[data-chat-intro-note]");
    if (introToggleNote) {
      toggleChatIntroNote(introToggleNote);
      return;
    }

    const introAction = event.target.closest("[data-chat-intro-action]")?.dataset.chatIntroAction;
    if (introAction && event.target.closest(".chat-intro-note.is-phone, .opening-setup-cta")) {
      openPhoneChatIntroDestination(introAction);
      return;
    }

    const open = event.target.closest("[data-phone-open]")?.dataset.phoneOpen;
    if (open) {
      if (open === "pop") {
        popChatMode = "list";
      }
      openApp(open);
      return;
    }

    if (event.target.closest("[data-phone-wb-add]")) {
      showWorldbookEdit(null);
      return;
    }
    if (event.target.closest("[data-phone-wb-cancel]")) {
      showWorldbookList();
      return;
    }
    const wbEditId = event.target.closest("[data-phone-wb-edit]")?.dataset.phoneWbEdit;
    if (wbEditId) {
      phoneData.listWorldbook().then((entries) => {
        const entry = entries.find((item) => item.id === wbEditId);
        showWorldbookEdit(entry || { id: wbEditId });
      });
      return;
    }
    const wbToggleId = event.target.closest("[data-phone-wb-toggle]")?.dataset.phoneWbToggle;
    if (wbToggleId) {
      phoneData.listWorldbook().then(async (entries) => {
        const entry = entries.find((item) => item.id === wbToggleId);
        if (!entry) return;
        await phoneData.saveWorldbookEntry({ ...entry, enabled: entry.enabled === false });
        await renderWorldbookEditorList();
        await renderWorldbook();
      });
      return;
    }
    if (event.target.closest("[data-phone-wb-delete]")) {
      const id = root.querySelector("[data-wb-id]")?.value;
      if (!id || !window.confirm(pt("settings.deleteWorldbookConfirm"))) return;
      phoneData.deleteWorldbookEntry(id).then(async () => {
        phoneToast("已删除");
        showWorldbookList();
        await renderWorldbookEditorList();
        await renderWorldbook();
      });
      return;
    }

    if (event.target.closest("[data-phone-backup-export-nyra]")) {
      const status = root.querySelector("[data-phone-backup-status]");
      if (!exportNyraBackup || !downloadNyraArchive) {
        phoneToast("导出接口未就绪");
        return;
      }
      exportNyraBackup({ includeMedia: true }).then((built) => {
        downloadNyraArchive(`nyra-backup-${Date.now()}.nyra`, built.bytes);
        if (status) status.textContent = pt("backup.exported");
        phoneToast("已导出月栖数据");
      }).catch((error) => {
        const msg = error?.message || "导出失败";
        if (status) status.textContent = msg;
        phoneToast(msg);
      });
      return;
    }
    if (event.target.closest("[data-phone-backup-export-json]") || event.target.closest("[data-phone-backup-export-zip]")) {
      phoneToast("请使用「导出月栖数据」");
      return;
    }
    if (event.target.closest("[data-phone-backup-import]")) {
      root.querySelector("[data-phone-backup-input]")?.click();
      return;
    }

    if (event.target.closest("[data-profile-add]")) {
      void (async () => {
        try {
          const created = await createCharacter({ name: "新角色" });
          setActiveCharacterId(created.id);
          profileExpandedId = created.id;
          await phoneCharacterEditor.open(created.id);
          phoneToast("已新建角色");
          await renderProfile();
          const card = root.querySelector(`[data-char-card="${CSS.escape(created.id)}"]`);
          card?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        } catch (error) {
          phoneToast(error?.message || "新建失败");
        }
      })();
      return;
    }
    const profileToggleId = event.target.closest("[data-profile-toggle]")?.dataset?.profileToggle;
    if (profileToggleId) {
      const leavingId = profileExpandedId;
      const nextId = profileExpandedId === profileToggleId ? "" : profileToggleId;
      if (leavingId && leavingId !== nextId) {
        void (async () => {
          await phoneCharacterEditor.open(leavingId);
          if (!confirmLeaveCharacterEditor()) return;
          profileExpandedId = nextId;
          if (nextId) await phoneCharacterEditor.open(nextId);
          await renderProfile();
        })();
        return;
      }
      profileExpandedId = nextId;
      if (nextId) void phoneCharacterEditor.open(nextId);
      void renderProfile();
      return;
    }
    const profileDiscardId = event.target.closest("[data-profile-discard]")?.dataset?.profileDiscard;
    if (profileDiscardId) {
      void (async () => {
        if (phoneCharacterEditor.characterId !== profileDiscardId) {
          await phoneCharacterEditor.open(profileDiscardId);
        }
        phoneCharacterEditor.discard();
        phoneOriginDirtyIds.delete(profileDiscardId);
        await renderProfile();
      })();
      return;
    }
    const profileSetActiveId = event.target.closest("[data-profile-set-active]")?.dataset?.profileSetActive;
    if (profileSetActiveId) {
      void (async () => {
        if (profileExpandedId && profileExpandedId !== profileSetActiveId) {
          await phoneCharacterEditor.open(profileExpandedId);
          if (!confirmLeaveCharacterEditor()) return;
        }
        try {
          setActiveCharacterId(profileSetActiveId);
          profileExpandedId = profileSetActiveId;
          await phoneCharacterEditor.open(profileSetActiveId);
          phoneToast("已设为陪伴");
          await renderProfile();
          updateRuntime(runtime.getState?.() || {});
        } catch (error) {
          phoneToast(error?.message || "切换失败");
        }
      })();
      return;
    }
    const profileDeleteId = event.target.closest("[data-profile-delete]")?.dataset?.profileDelete;
    if (profileDeleteId) {
      if (!window.confirm(pt("profile.deleteConfirm"))) return;
      void (async () => {
        try {
          await deleteCharacter(profileDeleteId);
          if (profileExpandedId === profileDeleteId) profileExpandedId = "";
          phoneToast("已删除");
          await renderProfile();
          updateRuntime(runtime.getState?.() || {});
        } catch (error) {
          phoneToast(error?.message === "cannot_delete_last_character" ? "至少保留一个角色" : (error?.message || "删除失败"));
        }
      })();
      return;
    }

        if (event.target.closest("[data-phone-import-character]")) {
      openCharacterImportFlow({
        onToast: phoneToast,
        getEditingCharacterId: () => getActiveCharacterId(),
        onImported: () => {
          renderProfile();
          phoneToast("已加入角色库。可在 Pop → 通讯录 → 添加朋友");
        },
        onPackImported: () => phoneToast("已导入角色视觉包"),
      });
      return;
    }

    if (event.target.closest("[data-phone-export-character]")) {
      void (async () => {
        try {
          const { getCharacter } = await import("../characters/store.js");
          const character = await getCharacter(getActiveCharacterId());
          if (!character) {
            phoneToast("没有可导出的角色");
            return;
          }
          openCharacterExportFlow(character, {
            onToast: phoneToast,
            getAssetBytes: async (ref) => {
              const record = await getMediaRecord?.(ref);
              if (!record) return null;
              return readMediaBytes?.(record) || null;
            },
          });
        } catch (error) {
          phoneToast(error?.message || "导出失败");
        }
      })();
      return;
    }

    if (event.target.closest("[data-pop-nav-back]")) {
      goBack();
      return;
    }

    if (event.target.closest("[data-pop-header-action]")) {
      const kind = event.target.closest("[data-pop-header-action]")?.dataset?.popHeaderKind
        || root.querySelector("[data-pop-header-action]")?.dataset?.popHeaderKind;
      if (kind === "add-friend") openAddFriendSheet();
      else openComposeSheet();
      return;
    }
    if (event.target.closest("[data-pop-add-friend]")) {
      openAddFriendSheet();
      return;
    }
    const jumpLetter = event.target.closest("[data-pop-jump-letter]")?.dataset.popJumpLetter;
    if (jumpLetter) {
      const safe = String(jumpLetter).replace(/["\\]/g, "");
      const section = root.querySelector(`[data-contact-letter="${safe}"]`);
      section?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      return;
    }
    if (event.target.closest("[data-pop-add-friend-close], [data-pop-contact-card-close]")) {
      closeContactSheets();
      return;
    }
    const contactCardId = event.target.closest("[data-pop-contact-card]")?.dataset.popContactCard;
    if (contactCardId) {
      openContactCard(contactCardId);
      return;
    }
    const addContactId = event.target.closest("[data-pop-add-contact]")?.dataset.popAddContact;
    if (addContactId) {
      addContact(addContactId);
      phoneToast("已添加到通讯录");
      closeContactSheets();
      renderContacts();
      renderSessionList();
      return;
    }
    const removeContactId = event.target.closest("[data-pop-remove-contact]")?.dataset.popRemoveContact;
    if (removeContactId) {
      removeContact(removeContactId);
      phoneToast("已从通讯录移除（角色库仍保留）");
      closeContactSheets();
      renderContacts();
      renderSessionList();
      if (currentPopTab === "me") renderPopMe();
      return;
    }
    if (event.target.closest("[data-pop-compose-close], [data-pop-dm-close], [data-pop-group-close]")) {
      closeAllComposeSheets();
      return;
    }
    if (event.target.closest("[data-pop-compose-dm]")) {
      openDmPicker();
      return;
    }
    if (event.target.closest("[data-pop-compose-group]")) {
      openGroupPicker();
      return;
    }
    if (event.target.closest("[data-pop-group-create]")) {
      confirmCreateGroup();
      return;
    }

    const openGroupId = event.target.closest("[data-open-group]")?.dataset.openGroup;
    if (openGroupId) {
      closeAllComposeSheets();
      openGroupThread(openGroupId);
      return;
    }

    const openDmId = event.target.closest("[data-open-dm]")?.dataset.openDm;
    if (openDmId) {
      closeAllComposeSheets();
      openDmThread(openDmId);
      return;
    }

    const companionId = event.target.closest("[data-set-companion]")?.dataset.setCompanion;
    if (companionId) {
      try {
        setActiveCharacterId(companionId);
        renderContacts();
        renderSessionList();
        if (root.querySelector("[data-pop-contact-card-sheet]:not([hidden])")) {
          openContactCard(companionId);
        }
        if (currentPopTab === "me") renderPopMe();
        syncPetBindLabel?.();
      } catch (error) {
        console.warn("set companion failed", error);
      }
      return;
    }

    if (event.target.closest("[data-phone-back]")) {
      goBack();
      return;
    }

    if (event.target.closest("[data-phone-home]")) {
      if (editMode) setEditMode(false);
      else osNav.exitToHome({ source: "ui" });
      return;
    }
    const popTab = event.target.closest("[data-pop-tab]")?.dataset.popTab;
    if (popTab) {
      setPopTab(popTab);
      return;
    }
    const pane = event.target.closest("[data-phone-pane]")?.dataset.phonePane;
    if (pane) {
      const screen = event.target.closest("[data-phone-screen]");
      showPane(screen, pane);
      if (pane === "calendar-add") {
        const selected = phoneCalendar?.getSelected?.() || phoneData.formatDateKey(new Date());
        const dateInput = root.querySelector("[data-event-date]");
        const dateLabel = root.querySelector("[data-event-date-label]");
        if (dateInput) dateInput.value = selected;
        if (dateLabel) dateLabel.textContent = selected;
      }
      refreshIcons();
      return;
    }

    const passcodeFoldToggle = event.target.closest("[data-passcode-fold-toggle]");
    if (passcodeFoldToggle) {
      if (!prefs.passcodeEnabled) return;
      const fold = root.querySelector("[data-passcode-fold]");
      const nextOpen = Boolean(fold?.hidden);
      if (fold) fold.hidden = !nextOpen;
      passcodeFoldToggle.classList.toggle("is-open", nextOpen);
      if (nextOpen) root.querySelector("[data-passcode-input]")?.focus?.();
      return;
    }

    const switchBtn = event.target.closest(".mini-switch");
    if (switchBtn) {
      const on = toggleSwitch(switchBtn);
      if (switchBtn.hasAttribute("data-widget-toggle")) {
        persistPrefs({ widgets: { ...prefs.widgets, [switchBtn.dataset.widgetToggle]: on } });
        applyWidgets();
        renderHomeLayout(prefs.iconOrder, prefs.folders, prefs.dockOrder);
      } else if (switchBtn.hasAttribute("data-passcode-enabled")) {
        persistPrefs({ passcodeEnabled: on });
        syncLockSettingsUi({ collapseFold: !on });
      } else if (switchBtn.hasAttribute("data-pet-float")) {
        setPetFloatOn?.(on);
      } else if (switchBtn.hasAttribute("data-feature-flag")) {
        phoneData.saveFeatureFlags({ ...phoneData.getFeatureFlags(), [switchBtn.dataset.featureFlag]: on });
        if (switchBtn.dataset.featureFlag === "proactive") {
          try {
            rescheduleProactiveScheduler();
          } catch {
            /* ignore */
          }
        }
      } else if (switchBtn.hasAttribute("data-diary-schedule")) {
        phoneData.saveDiarySettings({ scheduleEnabled: on });
      } else if (switchBtn.hasAttribute("data-multiplayer-enabled")) {
        saveMultiplayerPrefs({
          enabled: on,
          mode: "deferred",
        });
        renderSettingsExtras();
      }
      return;
    }


    const timeChip = event.target.closest("[data-time-chip]")?.dataset.timeChip;
    if (timeChip) {
      const rail = event.target.closest("[data-time-rail]");
      rail?.querySelectorAll("[data-time-chip]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.timeChip === timeChip);
      });
      const timeInput = root.querySelector("[data-event-time]");
      if (timeInput) timeInput.value = timeChip;
      return;
    }

    if (event.target.closest("[data-phone-diary-generate]")) {
      phoneDiary?.openCompose?.();
      return;
    }

    const segment = event.target.closest("[data-segment-id]");
    if (segment) {
      const id = segment.dataset.segmentId;
      const group = segment.closest(".mini-segmented, [data-diary-styles]");
      setSegmentedActive(group, id);
      if (group?.hasAttribute("data-phone-locales")) {
        phoneData.setLocale(id);
        // setLocale dispatches yueqi:locale-changed → onLocaleChanged → refreshLocaleUi
      } else if (group?.hasAttribute("data-diary-styles")) {
        phoneData.saveDiarySettings({ style: id });
      } else if (group?.hasAttribute("data-tts-providers")) {
        const hidden = root.querySelector("[data-tts-provider]");
        if (hidden) hidden.value = id;
      } else if (group?.hasAttribute("data-imagegen-sizes")) {
        const hidden = root.querySelector("[data-phone-imagegen-form] [name='defaultSize']");
        if (hidden) hidden.value = id;
      } else if (group?.hasAttribute("data-phone-ui-modes")) {
        if (id === "app") goToAppUi();
      }
      return;
    }

    if (event.target.closest("[data-phone-switch-ui='app']")) {
      goToAppUi();
      return;
    }

    if (event.target.closest("[data-phone-save-service]")) {
      const input = root.querySelector("[data-phone-service-base]");
      const value = String(input?.value || "").trim();
      setServiceBase(value);
      phoneData.writeEcosystem({ serviceBase: value });
      renderSettingsExtras();
      return;
    }
    const productModeButton = event.target.closest("[data-product-mode]");
    if (productModeButton) {
      void changePhoneProductMode(productModeButton.dataset.productMode);
      return;
    }
    const hostedTierButton = event.target.closest("[data-hosted-tier]");
    if (hostedTierButton) {
      void changePhoneHostedTier(hostedTierButton.dataset.hostedTier);
      return;
    }
    const authModeButton = event.target.closest("[data-phone-auth-mode]");
    if (authModeButton) {
      setPhoneAuthMode(authModeButton.dataset.phoneAuthMode);
      return;
    }
    const authTypeButton = event.target.closest("[data-phone-auth-type]");
    if (authTypeButton) {
      setPhoneAuthType(authTypeButton.dataset.phoneAuthType);
      return;
    }
    if (event.target.closest("[data-phone-auth-send-code]")) {
      const form = root.querySelector("[data-phone-auth-form]");
      const status = root.querySelector("[data-phone-auth-status]");
      if (normalizeAuthType(form?.dataset.phoneAuthTypeValue) !== "email") return;
      const email = String(form?.querySelector("[data-phone-auth-email]")?.value || "").trim();
      if (!email) {
        const msg = t("onboard.authNeedEmail");
        if (status) status.textContent = msg;
        phoneToast(msg);
        return;
      }
      if (status) status.textContent = t("onboard.authSendingCode");
      void sendRegisterCode(email)
        .then(() => {
          const msg = t("onboard.authCodeSent");
          if (status) status.textContent = msg;
          phoneToast(msg);
        })
        .catch((error) => {
          const msg = formatUserError(error, { fallbackKey: "onboard.authFailed" }).slice(0, 120);
          if (status) status.textContent = msg;
          phoneToast(msg);
        });
      return;
    }
    if (event.target.closest("[data-phone-auth-toggle-password]")) {
      const input = root.querySelector("[data-phone-auth-password]");
      const btn = event.target.closest("[data-phone-auth-toggle-password]");
      if (input instanceof HTMLInputElement && btn) {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "隐藏" : "显示";
        btn.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
      }
      return;
    }
    if (event.target.closest("[data-phone-auth-logout]")) {
      const token = phoneData.readEcosystem().token;
      void logoutAccountSession(token).catch(() => {});
      phoneData.writeEcosystem({
        loggedIn: false,
        authMode: "signed_out",
        username: "",
        token: "",
      });
      const status = root.querySelector("[data-phone-auth-status]");
      if (status) status.textContent = pt("toast.loggedOut");
      phoneToast("已退出");
      renderSettingsExtras();
      void phoneBillingPanel?.refresh();
      window.dispatchEvent(new CustomEvent("yueqi:auth-required"));
      return;
    }
    const popTaskApprove = event.target.closest("[data-pop-task-approve]");
    if (popTaskApprove) {
      const taskId = popTaskApprove.getAttribute("data-pop-task-approve") || "";
      const focus = getChatFocus?.() || {};
      void approveUnifiedTask(taskId, `assist-appr-${taskId}`, {
        userId: "local",
        companionId: String(focus.characterId || getActiveCharacterId() || "").trim(),
        initiatingCompanionId: String(focus.characterId || getActiveCharacterId() || "").trim(),
        chatSessionId: String(focus.sessionId || "").trim(),
        saveChatMessage: typeof saveChatMessage === "function" ? saveChatMessage : undefined,
      }).then((result) => {
        for (const msg of messages) {
          if (msg.metadata?.taskId === taskId) {
            msg.metadata = {
              ...msg.metadata,
              taskStatus: result?.task?.status || "SUCCEEDED",
              needInlineApproval: false,
            };
          }
        }
        phoneToast(result?.ok ? "已授权并继续" : (result?.task?.failureMessage || "批准失败"));
        taskCenter?.refresh?.();
        renderMessages();
      });
      return;
    }
    const popTaskReject = event.target.closest("[data-pop-task-reject]");
    if (popTaskReject) {
      const taskId = popTaskReject.getAttribute("data-pop-task-reject") || "";
      void rejectUnifiedTask(taskId, `assist-appr-${taskId}`).then(() => {
        for (const msg of messages) {
          if (msg.metadata?.taskId === taskId) {
            msg.metadata = {
              ...msg.metadata,
              taskStatus: "CANCELED",
              needInlineApproval: false,
            };
          }
        }
        phoneToast("已拒绝");
        taskCenter?.refresh?.();
        renderMessages();
      });
      return;
    }
    const popTaskOpenCenter = event.target.closest("[data-pop-task-open-center]");
    if (popTaskOpenCenter) {
      const taskId = popTaskOpenCenter.getAttribute("data-pop-task-open-center") || "";
      openApp("tasks");
      if (taskId) taskCenter?.select?.(taskId);
      return;
    }
    const gameEnd = event.target.closest("[data-game-end]");
    if (gameEnd) {
      document.dispatchEvent(new CustomEvent("yueqi:chat-game-end", {
        detail: { runId: String(gameEnd.dataset.gameEnd || ""), source: "phone_pop" },
      }));
      return;
    }
    if (event.target.closest("[data-phone-composer-reply-close]")) {
      pendingPhoneReply = null;
      paintPhoneReply();
      return;
    }
    const menuTrigger = event.target.closest("[data-message-menu-trigger]");
    if (menuTrigger) {
      toggleMessageMenu(menuTrigger, root);
      return;
    }
    const messageAction = event.target.closest("[data-message-action]");
    if (messageAction) {
      const messageId = messageAction.closest("[data-message-id]")?.dataset.messageId;
      const message = messages.find((item) => item.id === messageId);
      if (!message) return;
      closeMessageMenus(root);
      const action = messageAction.dataset.messageAction;
      const copy = messageMenuCopy(getLocale());
      if (action === "reply") {
        pendingPhoneReply = {
          messageId: message.id,
          role: message.role === "user" ? "user" : "assistant",
          text: String(message.content || "").slice(0, 180),
        };
        paintPhoneReply();
        root.querySelector("[data-phone-chat-input]")?.focus();
        return;
      }
      if (action === "edit") {
        void promptText({
          title: copy.editTitle,
          value: String(message.content || ""),
          confirmLabel: copy.save,
          cancelLabel: copy.cancel,
        }).then((next) => {
          if (next === null) return;
          return applyMessageEdit({ message, text: next, saveChatMessage });
        }).then((result) => {
          if (!result) return;
          if (!result.ok) {
            notifyChatFeedback(copy.editFailed, { tone: "danger", source: "phone_message_menu" });
            return;
          }
          message.content = result.content;
          renderMessages();
        });
        return;
      }
      if (action === "delete" || action === "regenerate") {
        const confirmed = action === "delete"
          ? confirmAction({
            title: copy.deleteTitle,
            message: copy.deleteConfirm,
            confirmLabel: copy.delete,
            cancelLabel: copy.cancel,
          })
          : Promise.resolve(true);
        void confirmed.then((ok) => {
          if (!ok) return null;
          return applyMessageDelete({ message, deleteRecord });
        }).then((result) => {
          if (!result) return;
          if (!result.ok) {
            notifyChatFeedback(copy.deleteFailed, { tone: "danger", source: "phone_message_menu" });
            return;
          }
          messages = messages.filter((item) => item.id !== message.id);
          renderMessages();
          if (action === "regenerate") {
            window.dispatchEvent(new CustomEvent("yueqi.character.speak"));
          }
        });
        return;
      }
      const state = toggleMessageReaction(message.metadata || {}, MESSAGE_REACTIONS[0], "local");
      void persistMessageState({
        message,
        messageState: state,
        saveChatMessage,
      }).then((result) => {
        if (!result.ok) {
          notifyChatFeedback(copy.reactFailed, { tone: "danger", source: "phone_message_menu" });
          return;
        }
        message.metadata = { ...(message.metadata || {}), messageState: result.messageState };
        renderMessages();
      });
      return;
    }
    closeMessageMenus(root);
    const retry = event.target.closest("[data-phone-retry]");
    if (retry) {
      const message = messages.find((item) => item.id === retry.closest("[data-message-id]")?.dataset.messageId);
      if (message) {
        sendPhoneMessage(message.content, message.id, {
          stickerUrl: message.metadata?.stickerUrl || "",
          stickerId: message.metadata?.stickerId || "",
          location: message.metadata?.location || null,
          replyTo: message.metadata?.replyTo || null,
        });
      }
      return;
    }
    const tokenAction = event.target.closest("[data-token-action]");
    if (tokenAction) {
      const messageId = tokenAction.dataset.tokenMessageId
        || tokenAction.closest("[data-message-id]")?.dataset.messageId;
      if (messageId) settleTokenMessage(messageId, tokenAction.dataset.tokenAction);
      return;
    }
    const walletToggle = event.target.closest("[data-pop-wallet-toggle]");
    if (walletToggle) {
      const ledger = root.querySelector("[data-pop-wallet-ledger]");
      if (ledger) {
        ledger.hidden = !ledger.hidden;
        if (!ledger.hidden) renderWalletPanel();
      }
      return;
    }
    if (event.target.closest("[data-moment-compose]")) {
      openMomentCompose();
      return;
    }
    if (event.target.closest("[data-moment-compose-close]")) {
      closeMomentCompose();
      return;
    }
    if (event.target.closest("[data-moment-add-image]")) {
      root.querySelector("[data-moment-image-file]")?.click();
      return;
    }
    if (event.target.closest("[data-moment-image-clear]")) {
      setMomentImagePreview("");
      return;
    }
    const authorBtn = event.target.closest("[data-moment-author]");
    if (authorBtn) {
      root.querySelectorAll("[data-moment-author]").forEach((node) => {
        node.classList.toggle("is-on", node === authorBtn);
      });
      return;
    }
    if (event.target.closest("[data-moments-cover-edit]")
      || (event.target.closest("[data-moments-cover], [data-moments-cover-standalone]")
        && !event.target.closest("[data-moments-cover-avatar], [data-moments-cover-avatar-standalone]"))) {
      root.querySelector("[data-moments-cover-file]")?.click();
      return;
    }
    if (event.target.closest("[data-moment-cancel]")) {
      closeMomentCompose();
      return;
    }
    const like = event.target.closest("[data-moment-like]");
    if (like) {
      const id = like.closest("[data-moment-id]")?.dataset.momentId;
      const moment = moments.find((item) => item.id === id);
      if (!moment) return;
      const index = moment.likes.indexOf("你");
      if (index >= 0) moment.likes.splice(index, 1);
      else {
        moment.likes.push("你");
        tickCompanionLife("like_feed");
        emitPhoneAppEvent("feed.post.liked", { appId: "moments", momentId: id });
      }
      moments = saveMoments(moments, "like");
      renderMoments(like.closest("[data-phone-moments-inline]") || root.querySelector("[data-phone-moments]"));
      return;
    }
    const comment = event.target.closest("[data-moment-comment]");
    if (comment) {
      const form = comment.closest("[data-moment-id]")?.querySelector("[data-phone-moment-comment-form]");
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector("input")?.focus();
    }
  };
  /**
   * A phone keypad registers on press, not on release. Waiting for `click`
   * (touch-up, after tap/scroll disambiguation) is what made the passcode feel
   * a beat behind the system lock screen.
   */
  const onLockKeyPointerDown = (event) => {
    if (!locked) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const key = event.target?.closest?.("[data-lock-key]")?.dataset.lockKey;
    if (key == null) return;
    tryPasscode(key);
  };
  root.addEventListener("pointerdown", onLockKeyPointerDown, { passive: true });
  root.addEventListener("click", onRootClick);
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const chatCard = event.target.closest?.("[data-home-companion-chat], [data-widget='today']");
    if (chatCard && root.contains(chatCard)) {
      event.preventDefault();
      void openCompanionThread();
      return;
    }
    const listenCard = event.target.closest?.("[data-home-open-listen], [data-widget='listen']");
    if (listenCard && root.contains(listenCard)) {
      event.preventDefault();
      openApp("listen");
    }
  });
  root.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-phone-auth-form]")) {
      syncPhoneAuthSubmit(event.target.closest("[data-phone-auth-form]"));
    }
    if (event.target?.matches?.("[data-pop-add-friend-query]")) {
      renderAddFriendList(event.target.value);
    }
    if (event.target?.matches?.("[data-pop-session-query]")) {
      popSessionQuery = String(event.target.value || "");
      void renderSessionList();
    }
    const profileForm = event.target?.closest?.("[data-profile-form]");
    if (profileForm && root.contains(profileForm)) {
      window.clearTimeout(profilePatchTimer);
      profilePatchTimer = window.setTimeout(() => {
        void patchCharacterFromForm(profileForm).catch((error) => {
          console.warn("patchCharacterFromForm failed", error);
        });
      }, 280);
    }
  });

  bindOriginMemoryEditor(root, {
    onDirty: (event) => {
      const form = event?.target?.closest?.("[data-profile-form]");
      const id = String(form?.dataset?.profileForm || "").trim();
      if (!id) return;
      phoneOriginDirtyIds.add(id);
      form.querySelector("[data-character-unsaved]")?.toggleAttribute("hidden", false);
    },
  });

  bindProactiveWakeControls(root, {
    onChange: () => {
      try {
        rescheduleProactiveScheduler();
      } catch {
        /* ignore */
      }
    },
  });
  root.querySelector("[data-proactive-wake-reset]")?.addEventListener("click", () => {
    resetProactiveWakeControls(root, {
      onChange: () => {
        try {
          rescheduleProactiveScheduler();
        } catch {
          /* ignore */
        }
      },
    });
  });

  // Kill browser text-selection / image-drag inside the phone chrome.
  const onSelectStart = (event) => {
    if (event.target.closest("input, textarea")) return;
    event.preventDefault();
  };
  const onDragStart = (event) => {
    if (event.target.closest("input, textarea")) return;
    event.preventDefault();
  };
  root.addEventListener("selectstart", onSelectStart);
  root.addEventListener("dragstart", onDragStart);

  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-phone-auth-legal-consent]")) {
      const mode = event.target.closest("[data-phone-auth-form]")?.dataset.phoneAuthModeValue;
      setPhoneAuthMode(mode);
      return;
    }
    if (event.target.matches("[data-phone-auth-country-code]")) {
      syncPhoneAuthSubmit(event.target.closest("[data-phone-auth-form]"));
      return;
    }
    if (event.target.matches("[data-profile-range]")) {
      const index = event.target.dataset.profileRange;
      const label = root.querySelector(`[data-range-label="${index}"]`);
      if (label) label.textContent = event.target.value;
      return;
    }
    if (event.target.matches("[data-wallpaper-file]")) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      readImageAsWallpaperDataUrl(file)
        .then(({ dataUrl, tone }) => {
          setWallpaperValue(wallpaperSheetTarget, dataUrl, { tone });
          closeWallpaperSheet();
        })
        .catch((error) => {
          const status = root.querySelector("[data-beautify-contact-status]");
          if (status) status.textContent = error?.message || "壁纸上传失败";
        });
      return;
    }
    if (event.target.matches("[data-moments-cover-file]")) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      readImageAsWallpaperDataUrl(file)
        .then(({ dataUrl }) => {
          writeLocalObject(LOCAL_KEYS.momentsCoverKey, { url: dataUrl });
          paintMomentsCover();
          phoneToast(pt("pop.coverChange"));
        })
        .catch((error) => {
          phoneToast(error?.message || pt("pop.coverChange"));
        });
      return;
    }
    if (event.target.matches("[data-moment-image-file]")) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      readImageAsWallpaperDataUrl(file, { maxEdge: 1280, quality: 0.84 })
        .then(({ dataUrl }) => setMomentImagePreview(dataUrl))
        .catch((error) => {
          phoneToast(error?.message || pt("pop.momentAddImage"));
        });
      return;
    }
  });

  root.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-passcode-input]");
    if (!input || !root.contains(input)) return;
    const value = String(input.value || "").replace(/\D/g, "").slice(0, 4);
    input.value = value;
    if (/^\d{4}$/.test(value)) persistPrefs({ passcode: value });
  });
  root.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-passcode-input]");
    if (!input || !root.contains(input)) return;
    input.value = String(input.value || "").replace(/\D/g, "").slice(0, 4);
  });

  const unbindLockSwipe = bindLockSwipe(root.querySelector('[data-lock-pane="TIME"]'), {
    canSwipe: () => locked && lockMode === "TIME",
    onCommit: () => {
      if (!prefs.passcodeEnabled) unlockPhone();
      else setLockMode("PASSCODE");
    },
  });

  const onRootSubmit = (event) => {
    const profileForm = event.target.closest("[data-profile-form]");
    if (profileForm) {
      event.preventDefault();
      void saveCharacterFromForm(profileForm).catch((error) => {
        phoneToast(error?.message || "保存失败");
      });
      return;
    }
    const commentForm = event.target.closest("[data-phone-moment-comment-form]");
    if (!commentForm) return;
    event.preventDefault();
    const id = commentForm.closest("[data-moment-id]")?.dataset.momentId;
    const moment = moments.find((item) => item.id === id);
    const input = commentForm.querySelector("input");
    const text = input?.value.trim().slice(0, 120);
    if (!moment || !text) return;
    moment.comments.push({ author: "你", text });
    moments = saveMoments(moments, "comment");
    const target = commentForm.closest("[data-phone-moments-inline]") || root.querySelector("[data-phone-moments]");
    renderMoments(target);
  };
  root.addEventListener("submit", onRootSubmit);

  root.querySelector("[data-phone-wb-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const enabled = form.querySelector("[data-wb-enabled]");
    try {
      await phoneData.saveWorldbookEntry({
        id: form.querySelector("[data-wb-id]")?.value || undefined,
        title: form.title.value,
        category: form.category.value,
        triggersText: form.triggersText.value,
        content: form.content.value,
        priority: Number(form.priority.value) || 50,
        enabled: enabled ? enabled.checked : true,
      });
      phoneToast("已保存");
      showWorldbookList();
      await renderWorldbookEditorList();
      await renderWorldbook();
    } catch (error) {
      phoneToast(error.message || "保存失败");
    }
  });

  root.querySelector("[data-phone-backup-input]")?.addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const status = root.querySelector("[data-phone-backup-status]");
    if (!file) return;
    try {
      if (importNyraOrLegacyFile) {
        await importNyraOrLegacyFile(file);
      } else {
        if (!window.confirm(pt("backup.importConfirm"))) {
          input.value = "";
          return;
        }
        const name = (file.name || "").toLowerCase();
        if (name.endsWith(".zip") || file.type === "application/zip") {
          if (!restoreFullBackupZip || !getRestoreHandlers) throw new Error("完整恢复接口未就绪");
          const bytes = new Uint8Array(await file.arrayBuffer());
          await restoreFullBackupZip(bytes, getRestoreHandlers());
        } else {
          if (!restoreImportPayload || !getRestoreHandlers) throw new Error("恢复接口未就绪");
          const payload = JSON.parse(await file.text());
          await restoreImportPayload(payload, getRestoreHandlers());
        }
      }
      if (status) status.textContent = pt("backup.restored");
      phoneToast("已从备份恢复");
      renderProfile();
      await renderWorldbook();
    } catch (error) {
      if (error?.code === "archive_cancelled") {
        input.value = "";
        return;
      }
      if (status) status.textContent = error.message || "导入失败";
      phoneToast(error.message || "导入失败");
    }
    input.value = "";
  });

  root.querySelector("[data-phone-chat-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = root.querySelector("[data-phone-chat-input]");
    // Composer chrome may already have cleared the field; prefer dataset stash, else live value.
    const stashed = String(input?.dataset?.pendingSendText || "").trim();
    const text = stashed || input?.value.trim();
    if (!text) return;
    if (input) {
      input.value = "";
      delete input.dataset.pendingSendText;
    }
    if (root.dataset.phoneSendLock === "1") return;
    root.dataset.phoneSendLock = "1";
    phoneComposerChrome?.syncSendState?.();
    phoneComposerChrome?.closeSheets?.();
    Promise.resolve(sendPhoneMessage(text))
      .catch(() => {})
      .finally(() => {
        window.setTimeout(() => {
          delete root.dataset.phoneSendLock;
        }, 450);
      });
    window.dispatchEvent(new CustomEvent("yueqi:interaction-feedback", {
      detail: { haptic: "medium-light", companion: true, source: event.currentTarget },
    }));
  });

  root.querySelector("[data-phone-event-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const eventFields = {
      title: form.title.value,
      date: form.querySelector("[data-event-date]")?.value || phoneCalendar?.getSelected?.(),
      time: form.querySelector("[data-event-time]")?.value || "21:00",
      prompt: form.prompt.value,
      mode: form.mode?.value || "proactive_message",
    };
    const saved = phoneData.addEvent(eventFields);
    const companionId = String(getActiveCharacterId() || "").trim();
    if (saved?.id && companionId) {
      const title = String(saved.title || eventFields.title || "新日程").trim();
      const when = [saved.date || eventFields.date, saved.time || eventFields.time].filter(Boolean).join(" ");
      void projectActivityToChat({
        companionId,
        kind: "calendar",
        sourceId: `${saved.id}:${saved.date || ""}:${saved.time || ""}:${title}`,
        text: `你们约好了：${title}${when ? ` · ${when}` : ""}`,
        metadata: { source: "calendar", calendarEventId: saved.id, phase: "confirmed" },
      });
    }
    void dispatchCalendarReminderTask({
      ...eventFields,
      eventId: saved?.id || "",
      characterId: getActiveCharacterId(),
    }).then((result) => {
      if (result?.value?.id) {
        phoneToast(result.awaitingApproval
          ? "提醒已保存，任务中心待确认"
          : "提醒已同步到任务中心");
        taskCenter?.refresh?.();
      }
    }).catch((error) => {
      console.warn("[yueqi.calendar] task dispatch failed", error);
    });
    form.title.value = "";
    form.prompt.value = "";
    try {
      rescheduleProactiveScheduler();
    } catch {
      /* unbound in some boot paths */
    }
    showPane(root.querySelector('[data-phone-screen="calendar"]'), "calendar-home");
    phoneCalendar?.render?.();
    refreshIcons();
  });

  root.addEventListener("submit", (event) => {
    if (!event.target.closest("[data-phone-auth-form]")) return;
    event.preventDefault();
    const mode = event.target?.dataset?.phoneAuthModeValue;
    void runPhoneAuth(mode === "register" ? "register" : "login");
  });

  root.querySelector("[data-phone-provider-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const baseUrl = form.baseUrl.value.trim().replace(/\/+$/, "");
    const model = form.model.value.trim();
    const apiKey = form.apiKey.value.trim();
    const status = root.querySelector("[data-lab-model-status]");
    if (!baseUrl || !model || !apiKey) {
      const msg = "请填齐 Base URL、Model、API Key。";
      if (status) status.textContent = msg;
      phoneToast(msg);
      return;
    }
    phoneData.writeProvider({
      kind: "OpenAI Compatible",
      baseUrl,
      model,
    });
    await phoneData.writeApiKey(apiKey);
    const appBase = document.querySelector("[data-provider-base-url]");
    const appModel = document.querySelector("[data-provider-model]");
    const appKey = document.querySelector("[data-provider-api-key]");
    const appKind = document.querySelector("[data-provider-kind]");
    if (appBase) appBase.value = baseUrl;
    if (appModel) appModel.value = model;
    if (appKey) appKey.value = apiKey;
    if (appKind && [...appKind.options].some((opt) => opt.value === "火山方舟") && /ark\.cn-beijing\.volces\.com/i.test(baseUrl)) {
      appKind.value = "火山方舟";
    }
    const msg = isLocalOfflineSession()
      ? "模型已保存。可点「测试连接」；离线模式会直连该接口，不必开 8787。"
      : (await checkServerHealth())
        ? "模型已保存。可点「测试连接」验证。"
        : "已保存，但本机 8787 未启动：请运行 npm run server，否则调用会失败。";
    if (status) status.textContent = msg;
    phoneToast(msg);
    await renderLab();
  });

  root.querySelector("[data-lab-fill-ark]")?.addEventListener("click", () => {
    const form = root.querySelector("[data-phone-provider-form]");
    if (!form) return;
    if (!form.baseUrl.value.trim()) form.baseUrl.value = "https://api.openai.com/v1";
    if (!form.model.value.trim()) form.model.placeholder = "gpt-4o-mini";
    phoneToast("已填入 OpenAI 兼容地址。请自行填写 API Key 和模型名。");
  });

  root.querySelector("[data-lab-test-model]")?.addEventListener("click", async () => {
    const form = root.querySelector("[data-phone-provider-form]");
    const status = root.querySelector("[data-lab-model-status]");
    if (!form) return;
    const config = {
      kind: "OpenAI Compatible",
      baseUrl: form.baseUrl.value.trim().replace(/\/+$/, ""),
      model: form.model.value.trim(),
      apiKey: form.apiKey.value.trim() || (await phoneData.readApiKey()),
    };
    if (status) status.textContent = pt("lab.testing");
    try {
      const result = await callModel(config, [
        { role: "user", content: "只回复两个字：通了" },
      ], { temperature: 0.2, timeoutMs: 45000 });
      const text = String(result?.content || "").trim().slice(0, 80);
      const msg = text ? `连接成功：${text}` : "连接成功（空回复）";
      if (status) status.textContent = msg;
      phoneToast(msg);
    } catch (error) {
      const msg = String(error?.message || error || "测试失败").slice(0, 160);
      if (status) status.textContent = msg;
      phoneToast(msg);
    }
  });

  root.querySelector("[data-phone-voice-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const provider = form.querySelector("[data-tts-provider]")?.value || "OpenAI";
    const autoSpeak = isSwitchOn(form.querySelector("[data-voice-autospeak]"));
    phoneData.saveVoiceSettings({
      ttsProvider: provider,
      ttsApiKey: form.ttsApiKey.value.trim(),
      voiceId: form.voiceId.value.trim(),
      openaiVoice: form.voiceId.value.trim(),
      sttApiKey: form.sttApiKey?.value?.trim() || "",
      sttModel: form.sttModel?.value?.trim() || "whisper-1",
      autoSpeak,
    });
    phoneToast("语音已保存");
    phoneVoice?.syncMic?.();
    phoneVoice?.refreshSpeakButtons?.();
  });

  root.querySelector("[data-phone-hosted-voice-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const hostedVoiceType = String(form.hostedVoiceType?.value || "").trim();
    saveVoiceSettings({ hostedVoiceType });
    refreshHostedVoiceUi();
    phoneVoice?.refreshSpeakButtons?.();
    phoneToast(pt("lab.saveHostedVoice"));
  });

  root.querySelector("[data-phone-imagegen-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    saveImagegenSettings({
      baseUrl: form.baseUrl.value.trim(),
      apiKey: form.apiKey.value.trim(),
      model: form.model.value.trim() || "dall-e-3",
      defaultSize: form.defaultSize?.value || "1024x1024",
      provider: "openai-compatible",
      enabled: true,
    });
    phoneToast("生图配置已保存");
  });

  root.querySelector("[data-phone-memory-search]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = event.currentTarget.q?.value || "";
    renderMemory(q);
    refreshIcons();
  });

  const sessionSummarySheet = root.querySelector("[data-session-summary-sheet]");
  const sessionSummaryHost = sessionSummarySheet?.querySelector(".mini-pop-sheet__panel--session-summary")
    || sessionSummarySheet;
  if (sessionSummarySheet && sessionSummaryHost) {
    bindSessionSummaryPicker(sessionSummaryHost, {
      collectProviderConfig,
      getCharacterId: () => String(getChatFocus()?.characterId || getActiveCharacterId() || "").trim(),
      getCharacterName: () => {
        const id = String(getChatFocus()?.characterId || getActiveCharacterId() || "").trim();
        const character = getCharacterSync(id);
        return character?.name || character?.alias || "";
      },
      fileDrawer,
      onSaved: async () => {
        phoneToast(i18nT("mePanels.memory.summarizeDone"));
        await renderMemory();
        window.setTimeout(() => {
          sessionSummarySheet.hidden = true;
        }, 700);
      },
    });
    const openPhoneSummary = () => {
      sessionSummarySheet.hidden = false;
      sessionSummaryHost.refreshSessionSummary?.();
      refreshIcons(sessionSummarySheet);
    };
    root.querySelector("[data-phone-screen='memory'] [data-session-summary-open]")?.addEventListener("click", openPhoneSummary);
    sessionSummarySheet.querySelectorAll("[data-session-summary-close]").forEach((node) => {
      node.addEventListener("click", () => {
        sessionSummarySheet.hidden = true;
      });
    });
  }

  root.querySelector("[data-moment-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = root.querySelector("[data-moment-input]");
    const content = String(input?.value || "").trim();
    const image = pendingMomentImage;
    if (!content && !image) {
      phoneToast(pt("pop.momentNeedContent"));
      return;
    }
    const who = selectedMomentAuthor();
    moments.unshift({
      id: `moment-${Date.now()}`,
      author: who.author,
      authorType: who.authorType,
      authorId: who.authorId,
      authorAvatar: who.authorAvatar,
      sourceType: "local",
      shareWithCompanion: true,
      visibleToCharacterIds: who.authorType === "character"
        ? [who.authorId]
        : (getActiveCharacterId() ? [getActiveCharacterId()] : []),
      time: formatClock(),
      content,
      image,
      images: image ? [image] : [],
      likes: [],
      comments: [],
    });
    moments = saveMoments(moments, "publish");
    emitPhoneAppEvent("feed.post.created", {
      appId: "moments",
      momentId: moments[0]?.id || "",
      preview: (content || pt("pop.momentAddImage")).slice(0, 120),
    });
    closeMomentCompose();
    renderAllMoments();
  });

  function isOptimisticPhoneUser(item) {
    if (!item || item.role !== "user") return false;
    if (item.metadata?.pending || item.metadata?.failed) return true;
    return String(item.id || "").startsWith("phone-pending-");
  }

  function dedupePhoneUserMessages(list = []) {
    const out = [];
    const seenUser = new Map();
    for (const item of Array.isArray(list) ? list : []) {
      if (item?.role !== "user") {
        out.push(item);
        continue;
      }
      const key = String(item.content || "").trim();
      if (!key) {
        out.push(item);
        continue;
      }
      const prevIdx = seenUser.get(key);
      if (prevIdx == null) {
        seenUser.set(key, out.length);
        out.push(item);
        continue;
      }
      const prev = out[prevIdx];
      // Prefer the persisted (non-optimistic) row when two identical user bubbles race in.
      if (isOptimisticPhoneUser(prev) && !isOptimisticPhoneUser(item)) {
        out[prevIdx] = item;
      }
    }
    return out;
  }

  const onChatMessage = async (event) => {
    const record = normalizeMessage(event.detail?.message || event.detail?.record || {});
    await hydrateAttachmentPreview(record);
    if (record.content || isTokenMediaType(record.metadata?.mediaType)) {
      const parsed = parseTokenMessage(record.content, record.metadata);
      if (parsed.ok) {
        record.content = parsed.content;
        record.metadata = { ...record.metadata, mediaType: parsed.mediaType, token: parsed.token };
      } else if (parsed.display) {
        record.content = parsed.display.content;
        record.metadata = { ...record.metadata, mediaType: "text" };
      }
    }
    if (!record.content && !isTokenMediaType(record.metadata?.mediaType)) return;
    if (record.sessionId && record.sessionId !== getChatFocus().sessionId) {
      if (currentView === "pop" && currentPopTab === "chat" && popChatMode === "list") {
        renderSessionList();
      }
      return;
    }
    if (messages.some((item) => item.id === record.id)) {
      const idx = messages.findIndex((item) => item.id === record.id);
      if (idx >= 0) {
        messages[idx] = {
          ...messages[idx],
          ...record,
          metadata: {
            ...(messages[idx].metadata || {}),
            ...(record.metadata || {}),
            pending: false,
            failed: false,
          },
        };
      }
      messages = dedupePhoneUserMessages(messages);
      if (liveTurn && record.role !== "user" && record.id === liveTurn.messageId) {
        liveTurn = null;
      }
      if (currentView === "pop" && currentPopTab === "chat" && popChatMode === "thread") renderMessages();
      if (currentView === "pop" && currentPopTab === "chat" && popChatMode === "list") renderSessionList();
      return;
    }
    const contentKey = String(record.content || "").trim();
    const pendingIndex = record.role === "user"
      ? messages.findIndex((item) => (
        item.role === "user"
        && String(item.content || "").trim() === contentKey
        && isOptimisticPhoneUser(item)
      ))
      : -1;
    if (pendingIndex >= 0) {
      messages.splice(pendingIndex, 1, record);
    } else {
      messages.push(record);
    }
    messages = dedupePhoneUserMessages(messages);
    if (liveTurn && record.role !== "user" && record.id === liveTurn.messageId) {
      liveTurn = null;
    }
    if (currentView === "pop" && currentPopTab === "chat" && popChatMode === "thread") renderMessages();
    if (currentView === "pop" && currentPopTab === "chat" && popChatMode === "list") renderSessionList();
    if (record.role !== "user" && record.content && !record.metadata?.pending) {
      phoneVoice?.onAssistantReply?.(record.content);
      if (currentView === "pop" && currentPopTab === "chat" && popChatMode === "thread") {
        emitPhoneAppEvent("pop.message.read", {
          appId: "pop",
          messageId: record.id,
          role: record.role,
          sessionId: getChatFocus().sessionId || "",
        });
      }
    }
  };
  const onMomentsChanged = (event) => {
    moments = Array.isArray(event.detail?.moments) ? event.detail.moments : loadMoments();
    if (currentView === "moments") renderMoments();
    if (currentView === "pop" && currentPopTab === "moments") {
      renderMoments(root.querySelector("[data-phone-moments-inline]"));
    }
  };
  const onChatFocusChanged = () => {
    if (destroyed) return;
    if (companionTrackedSession?.sessionId) {
      finalizeCompanionSession(companionTrackedSession, "focus_changed");
    } else {
      syncCompanionTrackedSession();
    }
    syncPopChrome();
    if (currentView === "pop" && currentPopTab === "chat" && popChatMode === "thread") {
      refreshMessages();
    }
  };
  const onChatTurnProgress = (event) => applyLiveTurnProgress(event.detail || {});
  document.addEventListener("yueqi:chat-message", onChatMessage);
  document.addEventListener(CHAT_TURN_PROGRESS_EVENT, onChatTurnProgress);
  document.addEventListener("yueqi:moments-changed", onMomentsChanged);
  document.addEventListener(CHAT_FOCUS_CHANGED_EVENT, onChatFocusChanged);
  document.addEventListener("yueqi:wallet-changed", renderWalletPanel);
  const unsubscribeRuntime = runtime.subscribe(updateRuntime);

  renderHomeLayout();
  applyWidgets();
  applyWallpaper();
  homePager?.sync(pageIndex);
  // Factory default was lock-on + PIN 0000, which looked like a frozen white
  // screen. Only lock cold start when the user actually set a PIN.
  const factoryPin = !prefs.passcode || prefs.passcode === "0000";
  setLocked(prefs.passcodeEnabled === true && !factoryPin);
  updateGreeting();
  refreshMessages();
  ensurePhoneActionProposalHost();
  actionProposalUi?.refresh?.();
  renderWalletPanel();
  renderMoments();
  renderNowPlaying();
  startMomentsAutoPost({
    getProviderConfig: async () => {
      if (typeof collectProviderConfig === "function") {
        return collectProviderConfig();
      }
      const provider = phoneData.readProvider();
      return {
        kind: "OpenAI Compatible",
        baseUrl: provider.baseUrl || "",
        apiKey: await phoneData.readApiKey(),
        model: provider.model || "",
      };
    },
  });

  const unbindFeatureControl = mountFeatureControlUi(root, {
    openApp: (id) => openApp(id),
    phoneToast,
    rescheduleProactiveScheduler,
    setInAppFloatPreferredOn: setPetFloatOn,
    companionRuntime: runtime,
    wakeCompanionLife: (source) => tickCompanionLife(source),
    listAssistTasks: () => listAssistantTasks(),
    getOpenClawLoaded: () => Boolean(globalThis.__NYRA_OPENCLAW_SLICE_LOADED__),
  });
  const syncDevtoolsEntry = () => {
    const on = isDeveloperModeEnabled();
    root.querySelectorAll("[data-devtools-entry]").forEach((el) => {
      el.hidden = !on;
    });
  };
  syncDevtoolsEntry();
  // Settings hub may re-render; keep entry visible while developer mode is on.
  root.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-phone-open='settings'], [data-app-id='settings']")) {
      queueMicrotask(syncDevtoolsEntry);
    }
  });

  clockTimer = locked
    ? window.setInterval(updateLockClock, 1000)
    : window.setInterval(updateGreeting, 30000);
  const onPhoneOpenApp = (event) => {
    const appId = String(event.detail?.appId || "").trim();
    if (!appId) return;
    openApp(appId, event.detail || null);
  };
  window.addEventListener("yueqi:locale-changed", onLocaleChanged);
  window.addEventListener("yueqi:phone-open-app", onPhoneOpenApp);
  window.addEventListener("yueqi:product-access-changed", () => {
    void refreshPhoneSpeechRoutes({ force: true });
  });
  refreshLocaleUi(getLocale());
  refreshIcons();
  void refreshPhoneSpeechRoutes();

  return {
    setView,
    openApp,
    goBack,
    isInApp,
    openDmThread,
    openGroupThread,
    openDeepLink: openPhoneDeepLink,
    syncArtifactSurfaces,
    appendArtifactMessage,
    refreshTodayInbox: refreshTodayInboxWidget,
    setVisible(visible, { lock } = {}) {
      root.hidden = !visible;
      if (visible) {
        const factoryPin = !prefs.passcode || prefs.passcode === "0000";
        const shouldLock = lock === true
          || (lock !== false && prefs.passcodeEnabled === true && !factoryPin);
        setLocked(shouldLock);
        updateGreeting();
        renderNowPlaying();
        osNav.syncHistory();
        syncArtifactSurfaces().catch(() => {});
      }
    },
    refresh() {
      refreshMessages();
      renderMoments();
      renderNowPlaying();
      refreshTodayInboxWidget();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      finalizeCompanionSession(companionTrackedSession, "destroy");
      stopMomentsAutoPost();
      actionProposalUi?.destroy?.();
      actionProposalUi = null;
      unbindFeatureControl?.();
      window.clearInterval(clockTimer);
      window.clearTimeout(expandTimer);
      for (const previewUrl of attachmentPreviewUrls.values()) {
        if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      }
      attachmentPreviewUrls.clear();
      unbindLockSwipe?.();
      unbindIconEditor?.();
      unbindWidgetEditor?.();
      iconFaceSheet?.destroy?.();
      homePager?.destroy?.();
      osNav.detach();
      unregisterSystemBack?.();
      root.removeEventListener("pointerdown", onLockKeyPointerDown);
      root.removeEventListener("click", onRootClick);
      root.removeEventListener("selectstart", onSelectStart);
      root.removeEventListener("dragstart", onDragStart);
      root.removeEventListener("submit", onRootSubmit);
      document.removeEventListener("yueqi:chat-message", onChatMessage);
      document.removeEventListener(CHAT_TURN_PROGRESS_EVENT, onChatTurnProgress);
      document.removeEventListener("yueqi:moments-changed", onMomentsChanged);
      document.removeEventListener(CHAT_FOCUS_CHANGED_EVENT, onChatFocusChanged);
      document.removeEventListener("yueqi:wallet-changed", renderWalletPanel);
      unbindLifeWake?.();
      unbindDiaryDelivery?.();
      document.removeEventListener("yueqi:diary-saved", onDiaryArtifactSaved);
      document.removeEventListener("yueqi:diary-saved", refreshPhoneDiaryBook);
      document.removeEventListener(LISTEN_PLAY_EVENT, onListenPlayRequest);
      document.removeEventListener(CAPABILITY_OPEN_EVENT, onCapabilityOpen);
      document.removeEventListener("yueqi:pet-changed", onPhonePetChanged);
      document.removeEventListener(COMPANION_CHANGED_EVENT, onCompanionChanged);
      document.removeEventListener(CHARACTERS_CHANGED_EVENT, onCharactersChanged);
      document.removeEventListener(POP_CONTACTS_CHANGED_EVENT, onPopContactsChanged);
      window.removeEventListener("yueqi:locale-changed", onLocaleChanged);
      window.removeEventListener("yueqi:phone-open-app", onPhoneOpenApp);
      unsubscribeRuntime?.();
      phoneDiary?.destroy?.();
      phoneGallery?.destroy?.();
      phoneListen?.destroy?.();
      phoneReader?.destroy?.();
      phoneShop?.destroy?.();
      phoneCocreate?.destroy?.();
      phoneCalendar?.destroy?.();
      popChatPlugins?.destroy?.();
      storyApp?.destroy?.();
      scenarioTheater?.destroy?.();
      try {
        unsubLifecycleNotify?.();
        appLifecycle.unregister("theater");
      } catch {
        /* optional */
      }
      gamesLobby?.destroy?.();
      scrollPlayer?.destroy?.();
      adventureApp?.destroy?.();
      assetsHub?.destroy?.();
      qishiApp?.destroy?.();
      extRuntime?.destroy?.();
      gameShell?.destroy?.();
      gateUi?.destroy?.();
      phoneVoice?.destroy?.();
      root.replaceChildren();
    },
  };
}
