import { LOCAL_KEYS, RELEASE_CHANNEL, defaultLibrary, defaultProfile, DEFAULT_PROMPT_DEVELOPER,
  DEFAULT_PROMPT_SYSTEM, BUILTIN_CHARACTER_ID, BUILTIN_COMPANION_PROMPT_SYSTEM, WORLD_ENTRY_CATEGORIES, normalizeWorldCategory, seedMemories, seedWorldbook } from "./constants.js";
import { parseTokenMessage, renderTokenCardHtml, isRenderableTokenCard } from "./chat/token-message.js";
import { parseLocationMessage, renderLocationCardHtml } from "./chat/share-location.js";
import { messageTimelineLabel } from "./chat/message-timeline.js";
import { resolveDiaryMessageCard } from "./chat/diary-message.js";
import { resolveCapabilityActionCard } from "./chat/capability-message.js";
import { ensurePermission } from "./platform/permissions.js";
import { resolveGameMessageCard } from "./chat/game-message.js";
import { resolveCallMessageCard } from "./chat/call-message.js";
import { resolveAttachmentMessageCard } from "./chat/attachment-message.js";
import { mountChatFeedbackCenter, notifyChatFeedback } from "./chat/feedback.js";
import { renderTurnActivityHtml, bindTurnActivityFolds } from "./chat/turn-activity.js";
import { resolveMessageBodyParagraph, ensureMessageBubbleShell } from "./chat/message-body.js";
import {
  MESSAGE_REACTIONS,
  markMessageReadState,
  normalizeMessageState,
  persistMessageState,
  resolveReplyPreview,
  toggleMessageReaction,
} from "./chat/message-actions.js";
import {
  closeMessageMenus,
  messageMenuCopy,
  renderMessageMenuHtml,
  toggleMessageMenu,
} from "./chat/message-menu.js";
import {
  applyMessageDelete,
  applyMessageEdit,
  resolveMessageMenuActions,
} from "./chat/message-ops.js";
import { repairDeletedMessageEvidence } from "./chat/message-evidence-lifecycle.js";
import {
  createOpeningSetupCtaButton,
  isChatIntroNoteCollapsed,
  isOpeningIntroMessage,
  isPlatformPlaceholderGreeting,
  renderChatIntroNote,
  resolveChatIntroDestination,
  shouldPinChatIntroNote,
  toggleChatIntroNote,
  transcriptHasLivedChat,
} from "./chat/intro-note.js";
import { loadWallet, canAfford } from "./wallet/ledger.js";
import { ensureCharactersMigrated, getActiveCharacterId, getCharacter, getCharacterSync, COMPANION_CHANGED_EVENT, listCharacters, createCharacter, setActiveCharacterId } from "./characters/store.js";
import { ensureBuiltinNyraInitialContent } from "./characters/builtin-nyra-initial-content.js";
import { BUILTIN_NYRA_NAME } from "./characters/builtin-nyra-prompt.js";
import { getCompanionSurfaceModel } from "./relationship/surface-service.js";
import { resolveCharacterAvatarUrl } from "./characters/avatar.js";
import { collectedProfileFromStore, syncProfileStateToCharacter } from "./characters/profile.js";
import {
  getSharedCharacterEditorController,
  identityPatchFromProfileState,
} from "./characters/editor-controller.js";
import {
  bindOriginMemoryEditor,
  commitOriginMemoryEditor,
  hydrateOriginMemoryEditor,
} from "./characters/origin-memory-editor.js";
import {
  ensureDmConversation,
  getChatFocus,
  getCurrentSessionId,
  getLastGroupSpeakerMeta,
  initChatFocusFromActive,
  setLastGroupSpeakerId,
} from "./characters/session-context.js";
import { buildGroupRosterBlock, pickGroupSpeaker } from "./characters/group-chat.js";
import {
  getAvatarState,
  applyAvatarState,
  subscribeAvatarLook,
  resolveAvatarLookUrl,
  getAvatarActionPlayer,
  applyScene,
  playExpression,
} from "./avatar/character-page.js";
import { wirePageSections } from "./ui/page-sections.js";
import { wireSettingsRouter } from "./ui/settings-router.js";
import { createAccountController } from "./account/account-controller.js";
import { ensureLocalOfflineSession, isLocalOfflineSession, readProductAccess, writeProductAccess } from "./account/product-access.js";
import { installCreditsExhaustedDialog, installSidebarCredits, mountBillingPanel } from "./billing/ui/billing-panel.js";
import { openCharacterImportFlow } from "./characters/import-ui.js";
import { openQijianDraftUi } from "./qijian/qijian-ui.js";
import { mountPresetsManager } from "./presets/presets-ui.js";
import { mountRegexManager } from "./regex/regex-ui.js";
import { registerStudioAssist, openStudioAssist } from "./studio-assist/api-registry.js";
import { createLazyStudioAssistMount } from "./studio-assist/lazy-mount.js";
import { enhanceWorldbookEntriesDom, readScopeAppsFromEntry, worldbookScopeFieldsHtml } from "./worldbook/worldbook-ui.js";
import { wireChoiceGroups, refreshChoiceGroup, rebuildChoiceButtons } from "./ui/choice-sync.js";
import { ensureWorldPage, ensureCharacterPage, ensureAvatarRuntime } from "./lazy/loaders.js";
import {
  applyFeatureFlagsToUi,
  isFeatureEnabled,
  syncFeatureFlagsFromUi,
  wireFeatureFlagControls,
} from "./features/flags.js";
import { refreshIcons } from "./lib/icons.js";
import { applyI18n, getLocale, t, wireLanguageUi } from "./i18n/index.js";
import { companionDefaultDeveloper, companionDefaultSystem } from "./prompts/registry.js";
import { ensureLanguagePrefsMigrated } from "./i18n/language-prefs.js";
import { wireOnboardingWizard } from "./onboarding/wizard.js";
import { persistAppMode, resolveDefaultAppMode } from "./onboarding/app-mode.js";
import { startFirstLightIfNeeded } from "./first-light/index.js";
import {
  escapeHtml,
  formatLocalTime,
  getSelectedText,
  readLocalObject,
  safeFetch,
  setSelectByText,
  writeLocalObject,
} from "./lib/utils.js";
import { migrateEvents, eventsForDate, formatDateKey } from "./calendar/engine.js";
import { togetherDaysFromAnniversary } from "./calendar/anniversaries.js";
import { buildExternalContext, initTrackDrag, isWithinDnd } from "./integrations/context.js";
import {
  formatCoListenChatNotice,
  formatCoListenProgress,
  progressRatio,
  resolveCoListenAnnounce,
  snapshotFromAudio,
  STORED_DEFAULT_TRACK_TITLE,
} from "./library/co-listen.js";
import { createCoListenTabId, publishCoListenState } from "./library/co-listen-sync.js";
import {
  chapterFromProgress,
  getCoReadAnchor,
} from "./library/co-read.js";
import { createBookReader } from "./library/book-reader.js";
import { formatReadProgress } from "./library/books.js";
import { ensureBuiltinLibrary } from "./library/builtin-catalog.js";
import { matchPhotoRecall } from "./library/photo-recall.js";
import { inferTrackTags, getRecentPlays } from "./library/recent-plays.js";
import { applyGrantsToDom, grantsForPrompt, readGrantsFromDom } from "./integrations/registry.js";
import { parseCoordinates, reverseGeocode } from "./integrations/geocode.js";
import { initNativeBridge } from "./platform/native-bridge.js";
import { persistMediaFile, readMediaBlob, resolveNativeFileUrl } from "./platform/media-files.js";
import { requestNotificationAccess, showCompanionNotification } from "./platform/notifications.js";
import { getSecret, setSecret } from "./platform/secure-store.js";
import { isNativePlatform, getPlatform } from "./platform/runtime.js";

// Mark native / narrow shell early so CSS can fix chat layout before paint settles.
try {
  const root = document.documentElement;
  if (isNativePlatform()) {
    root.classList.add("is-native-app");
    root.dataset.platform = getPlatform() || "native";
  }
  if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1079px)").matches) {
    root.classList.add("is-compact-shell");
  }
} catch {
  /* ignore */
}
import { initNativeKv } from "./platform/kv-store.js";
import {
  buildExportPayload,
  buildFullBackupZip,
  collectSettings,
  downloadJson,
  downloadBackupZip,
  downloadNyraArchive,
  restoreImportPayload,
  restoreFullBackupZip,
} from "./memory/backup.js";
import { clearLocalModules } from "./memory/privacy.js";
import {
  buildNyraArchive,
  prepareNyraImport,
  buildImportPlan,
  commitNyraImport,
  messageForPortabilityError,
} from "./portability/index.js";
import { readMediaBytes } from "./platform/media-files.js";
import { appendCohabitEvent } from "./memory/cohabit-timeline.js";
import { deleteMemory, searchMemories, updateMemory } from "./memory/rag.js";
import { filterRowsByCompanionScope } from "./memory/companion-scope.js";
import {
  fileDrawer,
  searchPalace,
  getPalaceStatus,
  getTaxonomy,
  buildWakeUpContext,
  setWakeUpContext,
  consumeWakeUpBlock,
  listRooms,
  listDrawers,
  queryKg,
  palaceWingLabel,
  palaceRoomLabel,
  palaceRoomSummary,
} from "./memory/palace/index.js";
import {
  bindSessionSummaryPicker,
  closeSessionSummaryModal,
  openSessionSummaryModal,
} from "./memory/session-summary-ui.js";
import {
  applyProviderPreset,
  callModel,
  checkServerHealth,
  collectProviderConfig as readProviderConfig,
  fetchServerInfo,
} from "./model/client.js";
import { DIARY_STYLES, getDiaryStyle, getDiaryStyleLabel } from "./diary/styles.js";
import { resolveDiaryStyleId } from "./diary/fields.js";
import {
  deleteDiaryRecord,
  getDiaryById,
  getDiaryForDay,
  listDiaries,
  saveDiary,
  todayDiaryDay,
  toggleDiaryPin as setDiaryPin,
} from "./diary/records.js";
import { generateTodayDiary } from "./diary/generate.js";
import { initDiarySchedule, rescheduleDiary } from "./diary/schedule.js";
import { subscribeAppEvent } from "./world/app-events.js";
import { confirmAction, confirmOverwriteDiary, promptText } from "./ui/confirm.js";
import { createDiaryBook } from "./ui/diary-book.js";
import { createMemoryDiaryGallery } from "./ui/memory-diary-gallery.js";
import { memoryGalleryInnerHtml } from "./ui/memory-gallery-markup.js";
import { refreshPermissionUi, wirePermissionUi } from "./ui/permissions-ui.js";
import { applyTheme } from "./ui/theme.js";
import { wireApiWorkbench } from "./ui/api-workbench.js";
import { createCompanionRuntime } from "./runtime/companion-runtime.js";
import { mountCompanionFloat } from "./ui/companion-float.js";
import "./avatar/sprite-character.css";
import "./avatar/bubble-character.css";
import "./update/update-dialog.css";
import "./notices/notice-dialog.css";
import { startNoticeClient, refreshNotices } from "./notices/notice-client.js";
import { mountSmallPhone } from "./phone-shell/phone-shell.js";
import { mountPhoneGallery } from "./phone-shell/phone-gallery.js";
import {
  readLibrary as phoneDataReadLibrary,
  listPhotos as phoneDataListPhotos,
  createPhotoGroup as phoneDataCreatePhotoGroup,
  renamePhotoGroup as phoneDataRenamePhotoGroup,
  deletePhotoGroup as phoneDataDeletePhotoGroup,
  addPhotoToGroup as phoneDataAddPhotoToGroup,
  removePhoto as phoneDataRemovePhoto,
  displayPlaylistName,
  canonicalizePlaylistName,
} from "./phone-shell/phone-data.js";
import {
  listSemanticGalleryGroups,
  syncLibraryIntoVisualMemory,
  registerLibraryPhotoAsVisual,
  listRelationshipVisuals,
  RELATIONSHIP_VIEW_ID,
  VISUAL_GROUP_IDS,
  namespaceForGroupId,
  isSurfaceGroupId,
  ensureVisualMemoryGroups,
  removeVisualAssetsForPhoto,
  markVisualQaByMedia,
  surfaceForGroupId,
  kindForSurfaceSave,
} from "./visual-memory/index.js";
import { wireOverlayPresence } from "./ui/overlay-presence-wire.js";
import { isAndroidOverlaySupported } from "./platform/companion-overlay.js";
import { XINGLI_REPLY_ACTION_IDS } from "./avatar/xingli-action-map.js";
import { wireDesktopPresence, isInAppFloatPreferredOn } from "./ui/desktop-presence-wire.js";
import { wireCustomContact } from "./ui/custom-contact-wire.js";
import { wirePetLibrary } from "./ui/pet-library.js";
import { wirePetSizeControl } from "./ui/pet-size-control.js";
import {
  appendVoiceMessage,
  isCoListenEnabled,
  synthesizeAiVoiceBar,
  wireCompanionPresence,
} from "./ui/companion-presence-wire.js";
import {
  applyVoiceConfigToNodes,
  collectVoiceConfig,
  getVoiceSettings,
  isSttConfigured,
  isVoiceConfigured,
  resolveHostedVoiceType,
  saveVoiceSettings,
  setCharacterHostedVoice,
} from "./settings/voice-preferences.js";
import { needsHostedVoiceSetup, refreshHostedVoiceUi } from "./voice/hosted-voice-ui.js";
import { mountVoicePicker } from "./voice/voice-picker-ui.js";
import { recalledVoiceCatalog, resolveVoiceDisplayName } from "./voice/catalog.js";
import { startRecording, stopRecording } from "./voice/record.js";
import {
  canTranscribe,
  sttRoute,
  transcribeAudio,
  transcribeRecording,
} from "./voice/stt.js";
import {
  canSpeak,
  speechRoute,
  synthesizeSpeech,
  playSpeech,
} from "./voice/tts.js";
import { refreshDeviceSpeechSupport } from "./voice/device-speech.js";
import { refreshHostedSpeechStatus, SPEECH_ROUTE } from "./voice/speech-routing.js";
import {
  getDiarySettings,
  getPalaceSettings,
  getPromptSettings,
  getRagSettings,
  saveDiarySettings,
  savePalaceSettings,
  getSyncPreferences,
  savePromptSettings,
  saveRagSettings,
  saveSyncPreferences,
} from "./settings/preferences.js";
import {
  rescheduleProactiveScheduler,
  startProactiveScheduler,
  stopProactiveScheduler,
} from "./proactive/scheduler.js";
import { loadProactiveWakePrefs, LIFE_TICK_LIMITS } from "./proactive/config.js";
import { bindProactiveWakeControls, fillProactiveWakeControls, resetProactiveWakeControls } from "./proactive/ui.js";
import { bindCompanionLifeWakeListeners, wakeCompanionLife } from "./companion/life-wake.js";
import { bindPetPresenceBridge } from "./companion/pet-presence-bridge.js";
import {
  downloadCloudPayload,
  stripSecretsFromPayload,
  uploadCloudPayload,
  uploadNyraCloudArchive,
  restoreCloudThroughNyraPipeline,
} from "./sync/client.js";
import {
  assemblePrompt,
  buildModelMessages,
  formatCompiledPreview,
  formatSummaryPanel,
} from "./prompt/assemble.js";
import { finalizeModelRequest } from "./prompt/finalize.js";
import { formatTurnActionContext } from "./capabilities/registry.js";
import {
  COMPANION_PROMPT_VERSION,
  PROMPT_AUTHORITY_ORDER,
} from "./prompt/companion-contract-v2.js";
import { understandTurn } from "./turn-understanding/index.js";
import { createTemporalSnapshotV1 } from "./contracts/temporal-snapshot-v1.js";
import { buildLanguageContext } from "./i18n/language-context.js";
import { classifyRecall } from "./memory/palace/recall.js";
import { mountCompanionDebugConsole } from "./ui/companion-debug-console.js";
import {
  clearStore,
  countMessagesBySession,
  deleteRecord,
  getAllRecords,
  getMessagesBySession,
  getStorageMode,
  ingestMemory,
  normalizeMemory,
  openMemoryDb,
  saveChatMessage,
  storeRecord,
} from "./storage/db.js";
import {
  estimateSleptHours,
  fetchWeather,
  inferYesterdayTone,
  isLivedDailyWeather,
  isPlaceholderStatusLocation,
  isWithinSleepWindow,
} from "./status/weather.js";
import {
  formatAwakeState,
  formatSleepDisplay,
  formatWeatherDisplay,
  labelMood,
  labelTone,
} from "./status/labels.js";
import {
  buildLifeContextLine,
  formatCapabilityStatus,
  isModelConfigured,
  isSyncReady,
  resolveCapabilityLabel,
  scoreCapabilities,
} from "./status/capability.js";
import { wireCalendarPanel } from "./panels/calendar.js";
import { wireMePanel } from "./panels/me.js";
import { wireProfilePanel } from "./panels/profile.js";
import { wireLibraryPanel } from "./panels/library.js";
import { wireChatPanel } from "./panels/chat.js";
import { wireNavPanel } from "./panels/nav.js";
import { wireBranchSummaryInvalidation } from "./context/summary-invalidation.js";
import { ensureEconomyUiShell, mountEconomyUi } from "./economy/ui.js";

wireBranchSummaryInvalidation();

const releaseChannel = RELEASE_CHANNEL;
const localFallback = LOCAL_KEYS;
const economyUiRoot = ensureEconomyUiShell();

const panels = document.querySelectorAll("[data-panel]");
const tabs = document.querySelectorAll("[data-tab]");
const assistNavButtons = document.querySelectorAll("[data-assist-nav]");
const experienceModeButtons = document.querySelectorAll("[data-app-mode]");
const smallPhoneRoot = document.querySelector("[data-small-phone-root]");
const companionDebugRoot = document.querySelector("[data-companion-debug]");
const form = document.querySelector("#composerForm");
const input = document.querySelector("#messageInput");
const list = document.querySelector("#messageList");
const summaryPanel = document.querySelector("#summaryPanel");
let lastRenderedChatAt = "";
const drawer = document.querySelector("#featureDrawer");
const summaryMasters = document.querySelectorAll("[data-summary-master]");
const worldEntryList = document.querySelector("#worldEntryList");
const addWorldEntryButton = document.querySelector("[data-add-world-entry]");
const tokenInput = document.querySelector("[data-token-input]");
const tokenAddButton = document.querySelector("[data-token-add]");
const tokenList = document.querySelector("[data-token-list]");
const resetProfileButton = document.querySelector("[data-reset-profile]");
const trackList = document.querySelector("#trackList");
const eventList = document.querySelector("#eventList");
const bookList = document.querySelector("#bookList");
const addTrackButton = document.querySelector("[data-add-track]");
const addEventButton = document.querySelector("[data-add-event]");
const addBookButton = document.querySelector("[data-add-book]");
const importBookButton = document.querySelector("[data-import-book]");
const bookFileInput = document.querySelector("[data-book-file]");
const companionTabs = document.querySelector("[data-companion-tabs]");
const companionPage = document.querySelector("[data-panel='companion']");
const companionMemoryAction = document.querySelector("[data-companion-memory-action]");
const studioTabs = document.querySelector("[data-studio-tabs]");
const studioWorkspace = document.querySelector("[data-studio-workspace]");
const libraryTabs = document.querySelector("[data-library-tabs]");
const libraryPage = document.querySelector("[data-panel='library']");
const trackFileInput = document.querySelector("[data-track-file]");
const icsFileInput = document.querySelector("[data-ics-file]");
const importIcsButton = document.querySelector("[data-import-ics]");
const appGalleryRoot = document.querySelector("[data-app-gallery]");
const audioPlayer = document.querySelector("[data-audio-player]");
const audioToggle = document.querySelector("[data-audio-toggle]");
const nowTitle = document.querySelector("[data-now-title]");
const nowMeta = document.querySelector("[data-now-meta]");
const nowProgress = document.querySelector("[data-now-progress]");
const nowSeek = document.querySelector("[data-now-seek]");
const coListenToggle = document.querySelector("[data-co-listen]");
const coListenTell = document.querySelector("[data-co-listen-tell]");
const coListenSyncHint = document.querySelector("[data-co-listen-sync-hint]");
const coListenTabId = createCoListenTabId();
const coListenState = { applyingRemote: false, suppressAnnounce: false };
const calendarHeading = document.querySelector("[data-calendar-heading]");
const calendarMonthLabel = document.querySelector("[data-calendar-month]");
const calendarGrid = document.querySelector("[data-calendar-grid]");
const calendarPrev = document.querySelector("[data-calendar-prev]");
const calendarNext = document.querySelector("[data-calendar-next]");
const compilePromptButton = document.querySelector("[data-compile-prompt]");
const promptPreview = document.querySelector("[data-prompt-preview]");
const promptSystemInput = document.querySelector("[data-prompt-system]");
const promptDeveloperInput = document.querySelector("[data-prompt-developer]");
const promptBudgetSelect = document.querySelector("[data-prompt-budget]");
const promptOrderSelect = document.querySelector("[data-prompt-order]");
const anniversaryDateInput = document.querySelector("[data-anniversary-date]");
const anniversaryDateDisplay = document.querySelector("[data-anniversary-display]");
const syncStrategySelect = document.querySelector("[data-sync-strategy]");
const testApiButton = document.querySelector("[data-test-api]");
const apiResult = document.querySelector("[data-api-result]");
const storageStatus = document.querySelector("[data-storage-status]");
const devSearchButton = document.querySelector("[data-dev-search]");
const devQueryInput = document.querySelector("[data-dev-query]");
const searchResult = document.querySelector("[data-search-result]");
const syncMcpButton = document.querySelector("[data-sync-mcp]");
const memoryGallery = document.querySelector(
  '.companion-page [data-memory-gallery], [data-panel="companion"] [data-memory-gallery]',
);
let diaryBookRoot = memoryGallery?.querySelector("[data-diary-book]") || null;
const messageTotal = document.querySelector("[data-message-total]");
const diaryTotal = document.querySelector("[data-diary-total]");
const daysTotal = document.querySelector("[data-days-total]");
const aiMoodNode = document.querySelector("[data-ai-mood]");
const userWeatherNode = document.querySelector("[data-user-weather]");
const aiSleepNode = document.querySelector("[data-ai-sleep]");
const aiBpmNode = document.querySelector("[data-ai-bpm]");
const lifeContextNode = document.querySelector("[data-life-context]");
const roleStatusNode = document.querySelector("[data-role-status]");
const capabilityStatusNode = document.querySelector("[data-capability-status]");
const sleepAtInput = document.querySelector("[data-status-sleep-at]");
const wakeAtInput = document.querySelector("[data-status-wake-at]");
const locationInput = document.querySelector("[data-status-location]");
const weatherModeSelect = document.querySelector("[data-status-weather-mode]");
const statusInjectionToggle = document.querySelector("[data-status-injection]");
const statusPreview = document.querySelector("[data-status-preview]");
const loginStateNodes = document.querySelectorAll("[data-login-state]");
const loginToggleButtons = document.querySelectorAll("[data-login-toggle]");
const updateStateNodes = document.querySelectorAll("[data-update-state]");
const checkUpdateButtons = document.querySelectorAll("[data-check-update], [data-check-update-panel]");
const cloudStateNodes = document.querySelectorAll("[data-cloud-state]");
const cloudSaveButtons = document.querySelectorAll("[data-cloud-save]");
const communityButtons = document.querySelectorAll("[data-join-community]");
const updateResult = document.querySelector("[data-update-result]");
const openUpdateButton = document.querySelector("[data-open-update]");
const cloudResult = document.querySelector("[data-cloud-result]");
const providerKind = document.querySelector("[data-provider-kind]");
const providerBaseUrl = document.querySelector("[data-provider-base-url]");
const providerApiKey = document.querySelector("[data-provider-api-key]");
const providerModel = document.querySelector("[data-provider-model]");
const manualWeatherInput = document.querySelector("[data-status-manual-weather]");
const composerAttachButton = document.querySelector("[data-composer-attach]");
const composerAttachInput = document.querySelector("[data-composer-attach-input]");
const addDiaryButton = document.querySelector("[data-add-diary]");
const diaryModal = document.querySelector("#diaryModal");
const sessionSummaryModal = document.querySelector("#sessionSummaryModal");
const diaryForm = document.querySelector("#diaryForm");
const diaryTitleInput = document.querySelector("[data-diary-title]");
const diaryBodyInput = document.querySelector("[data-diary-body]");
const diaryStylePreference = document.querySelector("[data-diary-style-preference]");
const diaryStyleSelect = document.querySelector("[data-diary-style]");
const diaryGenerateButton = document.querySelector("[data-diary-generate]");
const diaryRegenerateButton = document.querySelector("[data-diary-regenerate]");
const diaryScheduleEnabled = document.querySelector("[data-diary-schedule-enabled]");
const diaryScheduleTime = document.querySelector("[data-diary-schedule-time]");
const diaryScheduleOverwrite = document.querySelector("[data-diary-schedule-overwrite]");
const memorySearchInput = document.querySelector("[data-memory-search]");
const memoryBrowser = document.querySelector("[data-memory-browser]");
const palaceMap = document.querySelector("[data-palace-map]");
const palaceStats = document.querySelector("[data-palace-stats]");
const palaceRecallMode = document.querySelector("[data-palace-recall-mode]");
const palaceEnabledToggle = document.querySelector("[data-palace-enabled]");
const memoryMasterToggle = document.querySelector("[data-memory-master]");
const palaceBrowseHead = document.querySelector("[data-palace-browse-head]");
const palaceBrowseTitle = document.querySelector("[data-palace-browse-title]");
const palaceBrowseBack = document.querySelector("[data-palace-browse-back]");
const palaceDrawerList = document.querySelector("[data-palace-drawer-list]");
const palaceKgList = document.querySelector("[data-palace-kg-list]");
const exportDataButton = document.querySelector("[data-export-data]");
const exportFullBackupButton = document.querySelector("[data-export-full-backup]");
const exportBackupNoMediaButton = document.querySelector("[data-export-backup-no-media]");
const clearLocalAppEventsButton = document.querySelector("[data-clear-local-app-events]");
const importDataInput = document.querySelector("[data-import-data]");
const importDataButton = document.querySelector("[data-import-data-trigger]");
const cloudRestoreButton = document.querySelector("[data-cloud-restore]");
const ragTopKInput = document.querySelector("[data-rag-topk]");
const ragScopeSelect = document.querySelector("[data-rag-scope]");
const ragDiaryStyleSelect = document.querySelector("[data-rag-diary-style]");
const calendarDayPanel = document.querySelector("[data-calendar-day-panel]");
const calendarDayTitle = document.querySelector("[data-calendar-day-title]");
const calendarDayEvents = document.querySelector("[data-calendar-day-events]");
const addCalendarDayEventButton = document.querySelector("[data-add-calendar-day-event]");
const dndStartInput = document.querySelector("[data-dnd-start]");
const dndEndInput = document.querySelector("[data-dnd-end]");
const voiceTtsProvider = document.querySelector("[data-voice-tts-provider]");
const voiceTtsApiKey = document.querySelector("[data-voice-tts-api-key]");
const voiceIdInput = document.querySelector("[data-voice-id]");
const voiceTtsModel = document.querySelector("[data-voice-tts-model]");
const voiceOpenaiVoice = document.querySelector("[data-voice-openai-voice]");
const voiceVolcAppId = document.querySelector("[data-voice-volc-app-id]");
const voiceVolcAccessToken = document.querySelector("[data-voice-volc-access-token]");
const voiceVolcVoiceType = document.querySelector("[data-voice-volc-voice-type]");
const voiceHostedVoiceType = document.querySelector("[data-voice-hosted-voice-type]");
const voiceSttProvider = document.querySelector("[data-voice-stt-provider]");
const voiceSttApiKey = document.querySelector("[data-voice-stt-api-key]");
const voiceSttModel = document.querySelector("[data-voice-stt-model]");
const voiceAutoSpeak = document.querySelector("[data-voice-auto-speak]");
const voiceTestSample = document.querySelector("[data-voice-test-sample]");
const testVoiceButton = document.querySelector("[data-test-voice]");
const testVoiceRecordButton = document.querySelector("[data-test-voice-record]");
const testVoiceSttButton = document.querySelector("[data-test-voice-stt]");
const voiceResult = document.querySelector("[data-voice-result]");
const composerMicButton = document.querySelector("[data-composer-mic]");
const retrySttButtons = document.querySelectorAll("[data-retry-stt]");
let voicePicker = null;

const providerNodes = { providerKind, providerBaseUrl, providerApiKey, providerModel };
const voiceNodes = {
  voiceTtsProvider,
  voiceTtsApiKey,
  voiceId: voiceIdInput,
  voiceTtsModel,
  voiceOpenaiVoice,
  voiceVolcAppId,
  voiceVolcAccessToken,
  voiceVolcVoiceType,
  voiceHostedVoiceType,
  voiceSttProvider,
  voiceSttApiKey,
  voiceSttModel,
  voiceAutoSpeak,
};
let currentDailyStatus = null;
let lastSummaryCompiled = null;
let companionRuntime = null;
let companionFloat = null;
const calendarState = { cursor: new Date(), selectedDate: "" };
let renderCalendarGrid = () => {};
const attachmentState = { pending: null };
let nowPlaying = null;
let lastCoListenAnnounceKey = "";

function syncRoleAvatarChrome(character = null) {
  const char = character || getCharacterSync(getActiveCharacterId());
  const label = (char?.name || char?.alias || "").trim() || t("character.fallbackName");
  const url = resolveCharacterAvatarUrl(char);
  const initial = (label.slice(0, 1) || "?");
  document.querySelectorAll("[data-role-avatar]").forEach((node) => {
    const indicator = node.querySelector(".presence-indicator");
    if (url) {
      node.replaceChildren();
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      node.append(img);
      if (indicator) node.append(indicator);
    } else {
      node.replaceChildren();
      const fallback = document.createElement("span");
      fallback.className = "role-avatar-fallback";
      fallback.textContent = initial;
      node.append(fallback);
      if (indicator) node.append(indicator);
    }
  });
}

function syncRoleNameChrome(name) {
  const label = (name || "").trim() || t("character.fallbackName");
  document.querySelectorAll("[data-role-name]").forEach((node) => {
    node.textContent = label;
  });
  syncRoleAvatarChrome();
  syncIdentityDossierHero({ name: label });
  companionRuntime?.refreshCharacter("character-name");
}

function syncIdentityDossierHero({ name, alias, character } = {}) {
  const char = character || getCharacterSync(getActiveCharacterId());
  const nameInput = document.querySelector("[data-identity-name-input]");
  const aliasInput = document.querySelector("[data-identity-alias-input]");
  const displayName = String(name ?? nameInput?.value ?? char?.name ?? "").trim()
    || t("character.fallbackName");
  const displayAlias = String(alias ?? aliasInput?.value ?? char?.alias ?? "").trim();
  const nameNode = document.querySelector("[data-identity-hero-name]");
  const aliasNode = document.querySelector("[data-identity-hero-alias]");
  const photo = document.querySelector("[data-identity-avatar]");
  if (nameNode) nameNode.textContent = displayName;
  if (aliasNode) {
    aliasNode.textContent = displayAlias
      ? `${t("character.dossierAliasPrefix")}${displayAlias}`
      : "";
    aliasNode.hidden = !displayAlias;
  }
  if (photo) {
    const url = resolveCharacterAvatarUrl(char);
    const initial = (displayName.slice(0, 1) || "?").toUpperCase();
    if (url) {
      photo.replaceChildren();
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      photo.append(img);
    } else {
      photo.replaceChildren();
      const fallback = document.createElement("span");
      fallback.className = "char-dossier__fallback";
      fallback.textContent = initial;
      photo.append(fallback);
    }
  }
}

function refreshCoListenUi(state = nowPlaying) {
  const nowPlayingEl = document.querySelector(".music-library .now-playing");
  const playing = Boolean(state?.title) && !state.paused;
  nowPlayingEl?.classList.toggle("is-playing", playing);

  const lucideIcon = audioToggle?.querySelector("[data-lucide]");
  if (lucideIcon) {
    const nextIcon = playing ? "pause" : "play";
    if (lucideIcon.getAttribute("data-lucide") !== nextIcon) {
      lucideIcon.setAttribute("data-lucide", nextIcon);
      lucideIcon.replaceChildren();
      refreshIcons();
    }
  }

  if (!state?.title) {
    if (nowTitle) nowTitle.textContent = t("listen.notPlaying");
    if (nowMeta) nowMeta.textContent = t("listen.importHint");
    if (nowProgress) {
      nowProgress.hidden = true;
      nowProgress.textContent = "0:00 / 0:00";
    }
    if (nowSeek) {
      nowSeek.value = "0";
      nowSeek.disabled = true;
    }
    if (coListenTell) coListenTell.disabled = true;
    const icon = audioToggle?.querySelector(".icon-fallback");
    if (icon) icon.textContent = "▶";
    updateCoListenSkipButtons(null);
    return;
  }
  if (nowTitle) nowTitle.textContent = state.title;
  if (nowMeta) {
    const status = state.paused ? t("listen.paused") : t("listen.listening");
    const playlist = displayPlaylistName(state.playlist) || t("listen.uncategorized");
    nowMeta.textContent = state.coListen
      ? `${status} · ${playlist}`
      : `${playlist} · ${t("listen.coListenOff")}`;
  }
  if (nowProgress) {
    nowProgress.hidden = false;
    nowProgress.textContent = formatCoListenProgress(state);
  }
  if (nowSeek) {
    nowSeek.disabled = !(state.durationSec > 0);
    if (!nowSeek.matches(":active")) {
      nowSeek.value = String(progressRatio(state));
    }
  }
  if (coListenTell) coListenTell.disabled = !state.title;
  const icon = audioToggle?.querySelector(".icon-fallback");
  if (icon) icon.textContent = state.paused ? "▶" : "Ⅱ";
  updateCoListenSkipButtons(state);
}

function updateCoListenSkipButtons(state = nowPlaying) {
  const prevBtn = document.querySelector("[data-audio-prev]");
  const nextBtn = document.querySelector("[data-audio-next]");
  if (!prevBtn && !nextBtn) return;
  const rows = Array.from(trackList?.querySelectorAll(".track-row") || []).filter((row) => row.dataset.mediaId);
  const mediaId = state?.mediaId || "";
  const idx = mediaId ? rows.findIndex((row) => row.dataset.mediaId === mediaId) : -1;
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx < 0 || idx >= rows.length - 1;
}

let lastCoListenPublishAt = 0;

function publishLocalCoListen(state = nowPlaying, { force = false } = {}) {
  if (!state?.coListen || coListenState.applyingRemote) return;
  const now = Date.now();
  if (!force && now - lastCoListenPublishAt < 900) return;
  lastCoListenPublishAt = now;
  publishCoListenState(coListenTabId, state);
}

async function announceCoListenIfNeeded(prev, next, extra = {}) {
  const announce = resolveCoListenAnnounce(prev, next, extra);
  if (!announce) return;
  const text = formatCoListenChatNotice(announce.state, announce.reason);
  if (!text) return;
  const key = `${announce.reason}:${announce.state.mediaId || announce.state.title}:${announce.state.paused}`;
  if (key === lastCoListenAnnounceKey) return;
  lastCoListenAnnounceKey = key;
  await addMessage(text, "system", { persist: false, skipVoice: true });
}

function syncCoListenFromAudio(baseOverrides = {}, { announce = false, enabledChanged = null } = {}) {
  const prev = nowPlaying;
  const base = {
    title: prev?.title || "",
    playlist: prev?.playlist || "",
    mediaId: prev?.mediaId || "",
    coListen: isCoListenEnabled(),
    ...baseOverrides,
  };
  nowPlaying = snapshotFromAudio(audioPlayer, base);
  refreshCoListenUi(nowPlaying);
  refreshLifeContextStrip();
  publishLocalCoListen(nowPlaying, { force: Boolean(announce || enabledChanged != null) });
  if (announce && !coListenState.suppressAnnounce) {
    announceCoListenIfNeeded(prev, nowPlaying, { enabledChanged });
  }
  return nowPlaying;
}
let memorySearchQuery = "";
let editingDiaryId = "";
let diaryGenerating = false;
const palaceBrowseRef = { wing: "", room: "" };
const micState = { active: false, pendingVoiceSubmit: false };
const pendingSttBlobRef = { current: null };
const lastVoiceTestBlobRef = { current: null };
let diaryBook = {
  render() {},
  open() {},
  openToDiaryId() {},
};
let memoryDiaryGallery = null;
let setCompanionSection = () => {};
let smallPhone = null;
let appGallery = null;
let companionDebugConsole = null;

function setAppMode(mode = "app", { persist = true } = {}) {
  const next = mode === "phone" ? "phone" : "app";
  const current = document.body.dataset.appMode;
  if (current && current !== next && persist) {
    if (!allowLeaveCharacterEditor()) return;
  }
  document.body.dataset.appMode = next;
  experienceModeButtons.forEach((button) => {
    const active = button.dataset.appMode === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (smallPhoneRoot) smallPhoneRoot.hidden = next !== "phone";
  smallPhone?.setVisible?.(next === "phone");
  if (next === "app") {
    companionRuntime?.setPanel(document.body.dataset.activePanel || "chat");
  }
  if (persist) persistAppMode(next);
  refreshIcons();
}

function wireExperienceModeSwitch() {
  experienceModeButtons.forEach((button) => {
    button.addEventListener("click", () => setAppMode(button.dataset.appMode));
  });
  setAppMode(resolveDefaultAppMode(), { persist: false });
}

function ensureAppMemoryGalleryMarkup() {
  if (!memoryGallery?.classList.contains("memory-layout--gallery")) return false;
  if (!memoryGallery.querySelector("[data-memory-feed]")) {
    memoryGallery.innerHTML = memoryGalleryInnerHtml();
  }
  diaryBookRoot = memoryGallery.querySelector("[data-diary-book]");
  return Boolean(diaryBookRoot);
}

function initDiaryBookUi() {
  ensureAppMemoryGalleryMarkup();
  diaryBook = createDiaryBook(diaryBookRoot, {
    async onPin(id) {
      await toggleDiaryPin(id);
    },
    onEdit(record) {
      openDiaryModal(normalizeMemory(record));
    },
    async onDelete(id) {
      if (!window.confirm(t("alerts.deleteDiary"))) return;
      await deleteDiary(id);
    },
    onOpen: () => refreshIcons(),
  });

  if (memoryGallery?.classList.contains("memory-layout--gallery")) {
    memoryDiaryGallery = createMemoryDiaryGallery(memoryGallery, {
      onOpenDiary(id) {
        diaryBook.openToDiaryId(id);
      },
      getDefaultStyleId: () => getDiarySettings().style || "literary",
      async onGenerateDiary(day, sourceButton, options = {}) {
        await generateDiaryNow({
          diaryDay: day,
          styleId: options.styleId,
          sourceButton,
          withImage: Boolean(options.withImage),
        });
      },
      onOpenCharacter() {
        document.querySelector('[data-companion-tab="character"]')?.click();
      },
    });
    memoryGallery.querySelectorAll("[data-diary-generate]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        memoryDiaryGallery?.openCompose?.({ sourceButton: button });
      });
    });
  }

  document.addEventListener("yueqi:diary-pin-request", (event) => {
    const id = event.detail?.id;
    if (id) toggleDiaryPin(id).catch(() => {});
  });
  document.addEventListener("yueqi:diary-edit-request", (event) => {
    const record = event.detail?.record;
    if (record) openDiaryModal(normalizeMemory(record));
  });
  document.addEventListener("yueqi:diary-delete-request", (event) => {
    const id = event.detail?.id;
    if (!id) return;
    if (!window.confirm(t("alerts.deleteDiary"))) return;
    deleteDiary(id).catch(() => {});
  });
  document.addEventListener("yueqi:diary-generate-request", (event) => {
    const detail = event.detail || {};
    generateDiaryNow({
      diaryDay: detail.diaryDay,
      styleId: detail.styleId,
      sourceButton: detail.sourceButton,
      withImage: Boolean(detail.withImage),
    }).catch(() => {});
  });
}

let characterEditorLeaveGuard = () => ({ allowed: true, hasUnsaved: false });

function setPanel(name) {
  const resolved = name === "profile" ? "me" : name;
  const current = document.body.dataset.activePanel;
  if (current === "me" && resolved !== "me") {
    if (!allowLeaveCharacterEditor()) return;
  }
  document.body.dataset.activePanel = resolved;
  assistNavButtons.forEach((button) => {
    button.classList.remove("is-active");
    button.removeAttribute("aria-current");
  });
  panels.forEach((panel) => {
    const active = panel.dataset.panel === resolved;
    panel.classList.toggle("is-active", active);
    panel.toggleAttribute("hidden", !active);
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });
  tabs.forEach((tab) => {
    const tabName = tab.dataset.tab === "profile" ? "me" : tab.dataset.tab;
    const active = tabName === resolved;
    tab.classList.toggle("is-active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  companionRuntime?.setPanel(resolved);
  if (resolved === "world") {
    ensureWorldPage().catch((error) => console.warn("world page lazy load failed", error));
  }
  if (resolved === "me") {
    ensureWorldPage().catch((error) => console.warn("world page lazy load failed", error));
    ensureCharacterPage().catch((error) => console.warn("character page lazy load failed", error));
  }
  if (resolved === "companion") {
    ensureCharacterPage().catch((error) => console.warn("character page lazy load failed", error));
  }
  if (resolved === "debug") companionDebugConsole?.refresh?.();
  if (resolved === "me") {
    window.dispatchEvent(new CustomEvent("yueqi.settings.home"));
  }
}

function messageClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = String(getLocale() || "zh-CN").toLowerCase().startsWith("en") ? "en-US" : "zh-CN";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatAttachmentSize(bytes = 0) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function appendChatTimelineMarker(createdAt, { force = false } = {}) {
  const current = String(createdAt || "").trim();
  if (!current) return;
  const label = force
    ? messageTimelineLabel("", current, { locale: getLocale() })
    : messageTimelineLabel(lastRenderedChatAt, current, { locale: getLocale() });
  lastRenderedChatAt = current;
  if (!label) return;
  const marker = document.createElement("time");
  marker.className = "chat-time-separator";
  marker.dateTime = current;
  marker.textContent = label;
  list.append(marker);
}

function deliveryStateFor(type, options = {}) {
  if (type !== "user") return "";
  const metadata = options.metadata || {};
  const explicit = String(options.deliveryState || metadata.deliveryState || "").trim();
  if (normalizeMessageState(metadata).readAt) return "read";
  if (explicit === "sending" || explicit === "failed" || explicit === "read" || explicit === "delivered") {
    return explicit;
  }
  if (metadata.failed) return "failed";
  if (metadata.pending) return "sending";
  return "delivered";
}

function deliveryCopy(state) {
  if (state === "sending") return t("pop.sending");
  if (state === "failed") return t("pop.sendFailed");
  if (state === "read") return String(getLocale() || "").toLowerCase().startsWith("en") ? "Read" : "已读";
  return t("pop.delivered");
}

function retryCopy() {
  return String(getLocale() || "").toLowerCase().startsWith("en") ? "Retry" : "重试";
}

/**
 * Only in-flight states get a visible marker. A delivered bubble says nothing:
 * the timeline separator already carries the clock, and read ticks were noise.
 */
function paintAppMessageDelivery(article, state = "delivered") {
  if (!(article instanceof HTMLElement) || !article.classList.contains("user")) return;
  const normalized = state === "sending" || state === "failed" || state === "read"
    ? state
    : "delivered";
  article.dataset.deliveryState = normalized;
  article.classList.toggle("is-pending", normalized === "sending");
  article.classList.toggle("is-failed", normalized === "failed");

  const inFlight = normalized === "sending" || normalized === "failed";
  let delivery = article.querySelector("[data-message-delivery]");
  if (!inFlight) {
    delivery?.remove();
  } else {
    if (!delivery) {
      delivery = document.createElement("span");
      delivery.dataset.messageDelivery = "";
      article.append(delivery);
    }
    delivery.className = `message-delivery is-${normalized}`;
    delivery.setAttribute("aria-label", deliveryCopy(normalized));
    delivery.innerHTML = `<i data-lucide="${normalized === "sending" ? "clock-3" : "circle-alert"}" aria-hidden="true"></i><span>${escapeHtml(deliveryCopy(normalized))}</span>`;
  }

  article.querySelector("[data-message-retry]")?.remove();
  if (normalized === "failed") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "message-retry";
    retry.dataset.messageRetry = article.dataset.messageId || "";
    retry.textContent = retryCopy();
    article.append(retry);
  }
  refreshIcons();
}

function updateMessageDeliveryState(messageId, state) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const article = list.querySelector(`.message.user[data-message-id="${CSS.escape(id)}"]`);
  if (!article) return false;
  paintAppMessageDelivery(article, state);
  return true;
}

function appendMessageFooter(article, { type, deliveryState }) {
  if (type === "system") return;
  if (type === "user") paintAppMessageDelivery(article, deliveryState);
}

function bindMessageDeepLink(button) {
  button.addEventListener("click", () => {
    const href = button.dataset.deepLink || "";
    if (!href) return;
    window.dispatchEvent(new CustomEvent("yueqi:deep-link", {
      detail: {
        deepLink: href,
        deliveryId: button.dataset.deliveryId || "",
        artifactId: button.dataset.artifactId || "",
        source: "desktop_pop_card",
      },
    }));
  });
}

function paintAppMessageState(article, state, type) {
  const normalized = normalizeMessageState({ messageState: state });
  article.classList.toggle("is-recalled", Boolean(normalized.recalledAt));
  let recalled = article.querySelector(".message-recalled-copy");
  if (normalized.recalledAt && !recalled) {
    recalled = document.createElement("p");
    recalled.className = "message-recalled-copy";
    recalled.textContent = t(type === "user" ? "appShell.chat.youRecalled" : "appShell.chat.theyRecalled");
    article.prepend(recalled);
  } else if (!normalized.recalledAt) {
    recalled?.remove();
  }

  let reactions = article.querySelector(".message-reactions");
  const entries = Object.entries(normalized.reactions);
  if (!entries.length) {
    reactions?.remove();
    return;
  }
  if (!reactions) {
    reactions = document.createElement("div");
    reactions.className = "message-reactions";
    article.insertBefore(reactions, article.querySelector(".message-menu"));
  }
  reactions.replaceChildren();
  entries.forEach(([emoji, actors]) => {
    const chip = document.createElement("span");
    chip.className = "message-reaction";
    chip.textContent = `${emoji} ${actors.length}`;
    reactions.append(chip);
  });
}

function appendAppMessageActions(article, {
  content,
  type,
  messageId,
  metadata,
  conversationSessionId,
}) {
  if (!messageId || type === "system") return;
  const reply = resolveReplyPreview(metadata);
  if (reply) {
    const quote = document.createElement("blockquote");
    quote.className = "message-reply-preview";
    quote.dataset.replyMessageId = reply.messageId;
    quote.innerHTML = `<strong>${t(reply.role === "user" ? "phone.pop.defaultYou" : "appShell.chat.them")}</strong><span>${escapeHtml(reply.text)}</span>`;
    article.prepend(quote);
  }

  const liveMetadata = {
    ...(metadata || {}),
    conversationSessionId: String(conversationSessionId || metadata?.conversationSessionId || ""),
  };
  const role = type === "user" ? "user" : "assistant";
  // The menu is built once, while an outgoing bubble is still pending, so its
  // availability cannot be decided here — asking for it then left every
  // freshly sent message without a menu until the next reload. CSS hides the
  // trigger while the bubble is in flight and the click handler re-checks.
  article.insertAdjacentHTML("beforeend", renderMessageMenuHtml(
    resolveMessageMenuActions({ role, metadata: liveMetadata }, {
      isLastAssistant: role === "assistant",
    }),
    { locale: getLocale() },
  ));
  article.classList.add("has-message-menu");
  paintAppMessageState(article, normalizeMessageState(liveMetadata), type);

  const menu = article.querySelector("[data-message-menu]");
  menu?.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-message-menu-trigger]");
    if (trigger) {
      // Regenerate only makes sense on the newest reply; re-check at open time.
      const regenerate = menu.querySelector('[data-message-action="regenerate"]');
      if (regenerate) {
        const replies = list.querySelectorAll(".message.ai");
        regenerate.hidden = article !== replies[replies.length - 1];
      }
      toggleMessageMenu(trigger, document);
      return;
    }
    const button = event.target.closest("[data-message-action]");
    if (!button) return;
    const action = button.dataset.messageAction;
    // A bubble still in flight, or one whose send failed, has nothing to edit or
    // answer yet. Removing it stays available: a send that never settles is
    // exactly the one that has to be clearable.
    const unsettled = article.classList.contains("is-pending") || article.classList.contains("is-failed");
    if (unsettled && action !== "delete") return;
    closeMessageMenus(document);
    const liveMessage = {
      id: messageId,
      sessionId: getCurrentSessionId(),
      role,
      content: article.dataset.messageContent || content,
      createdAt: article.dataset.createdAt,
      metadata: liveMetadata,
    };
    const sessionId = article.dataset.conversationSessionId || liveMetadata.conversationSessionId;

    if (action === "reply") {
      window.dispatchEvent(new CustomEvent("yueqi:chat-quote", {
        detail: { messageId, role, text: String(liveMessage.content || "").slice(0, 180) },
      }));
      return;
    }
    if (action === "regenerate") {
      const removed = await applyMessageDelete({
        message: liveMessage,
        conversationSessionId: sessionId,
        deleteRecord,
      });
      if (!removed.ok) {
        notifyChatFeedback(messageMenuCopy(getLocale()).deleteFailed, {
          tone: "danger",
          source: "message_menu",
        });
        return;
      }
      article.remove();
      window.dispatchEvent(new CustomEvent("yueqi.character.speak"));
      return;
    }
    if (action === "edit") {
      const copy = messageMenuCopy(getLocale());
      const next = await promptText({
        title: copy.editTitle,
        value: String(liveMessage.content || ""),
        confirmLabel: copy.save,
        cancelLabel: copy.cancel,
      });
      if (next === null) return;
      const result = await applyMessageEdit({
        message: liveMessage,
        text: next,
        conversationSessionId: sessionId,
        saveChatMessage,
      });
      if (!result.ok) {
        notifyChatFeedback(copy.editFailed, { tone: "danger", source: "message_menu" });
        return;
      }
      article.dataset.messageContent = result.content;
      const body = article.querySelector("p:not(.message-recalled-copy)");
      if (body) body.textContent = result.content;
      return;
    }
    if (action === "delete") {
      const copy = messageMenuCopy(getLocale());
      const confirmed = await confirmAction({
        title: copy.deleteTitle,
        message: copy.deleteConfirm,
        confirmLabel: copy.delete,
        cancelLabel: copy.cancel,
      });
      if (!confirmed) return;
      const result = await applyMessageDelete({
        message: liveMessage,
        conversationSessionId: sessionId,
        deleteRecord,
      });
      if (!result.ok) {
        notifyChatFeedback(copy.deleteFailed, { tone: "danger", source: "message_menu" });
        return;
      }
      article.remove();
      return;
    }

    const nextState = toggleMessageReaction(liveMetadata, MESSAGE_REACTIONS[0], "local");
    const result = await persistMessageState({
      message: liveMessage,
      messageState: nextState,
      conversationSessionId: sessionId,
      saveChatMessage,
    });
    if (!result.ok) {
      notifyChatFeedback(messageMenuCopy(getLocale()).reactFailed, {
        tone: "danger",
        source: "message_menu",
      });
      return;
    }
    liveMetadata.messageState = result.messageState;
    paintAppMessageState(article, result.messageState, type);
  });
}

let messageMenuDismissWired = false;
function wireMessageMenuDismiss() {
  if (messageMenuDismissWired) return;
  messageMenuDismissWired = true;
  // Anything that is not the trigger or a menu item dismisses, including the
  // popover's own padding — otherwise an open menu silently eats that click.
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-message-menu-trigger], [data-message-action]")) return;
    closeMessageMenus(document);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMessageMenus(document);
  });
}

let messageReadReceiptsWired = false;
function wireMessageReadReceipts() {
  if (messageReadReceiptsWired) return;
  messageReadReceiptsWired = true;
  document.addEventListener("yueqi:chat-message", (event) => {
    const assistant = event.detail?.message;
    if (assistant?.role !== "assistant" || !assistant.sessionId) return;
    void (async () => {
      const rows = await getMessagesBySession(assistant.sessionId, 160);
      const assistantIndex = rows.findIndex((row) => row.id === assistant.id);
      if (assistantIndex < 0) return;
      let previousAssistant = -1;
      for (let index = assistantIndex - 1; index >= 0; index -= 1) {
        if (rows[index].role === "assistant") {
          previousAssistant = index;
          break;
        }
      }
      const unreadUsers = rows
        .slice(previousAssistant + 1, assistantIndex)
        .filter((row) => row.role === "user" && !normalizeMessageState(row.metadata).readAt);
      for (const message of unreadUsers) {
        const state = markMessageReadState(message.metadata, assistant.createdAt);
        const result = await persistMessageState({
          message,
          messageState: state,
          saveChatMessage,
        });
        if (result.ok) updateMessageDeliveryState(message.id, "read");
      }
    })().catch((error) => console.warn("[yueqi.chat] read receipt update failed", error));
  });
}

async function addMessage(text, type = "ai", options = {}) {
  const article = document.createElement("article");
  article.className = `message ${type}`;
  const normalized = String(text || "");
  const createdAt = String(options.createdAt || new Date().toISOString());
  const messageId = String(options.id || "").trim();
  const conversationSessionId = String(
    options.conversationSessionId || options.metadata?.conversationSessionId || "",
  ).trim();
  const deliveryState = deliveryStateFor(type, options);
  if (messageId) article.dataset.messageId = messageId;
  if (conversationSessionId) article.dataset.conversationSessionId = conversationSessionId;
  article.dataset.createdAt = createdAt;
  if (type === "user") {
    article.dataset.retryText = String(options.retryText ?? normalized);
    article.dataset.deliveryState = deliveryState;
  }
  const stickerUrl = String(options.stickerUrl || options.metadata?.stickerUrl || "").trim();
  if (stickerUrl) article.dataset.retryStickerUrl = stickerUrl;
  const isSticker = Boolean(stickerUrl) && (type === "user" || options.metadata?.kind === "sticker");
  if (isSticker) article.classList.add("is-sticker");

  const token = options.metadata?.token;
  const mediaType = options.metadata?.mediaType || options.metadata?.kind || "";
  let attachmentCard = resolveAttachmentMessageCard(options.metadata || {});
  if (attachmentCard?.type === "image" && !attachmentCard.previewUrl && attachmentCard.mediaId) {
    try {
      const record = await getMediaRecord(attachmentCard.mediaId);
      const previewUrl = await resolveMediaUrl(record);
      attachmentCard = { ...attachmentCard, previewUrl };
    } catch {
      /* keep the durable file card when preview hydration fails */
    }
  }
  if (attachmentCard) {
    article.classList.add("has-attachment", `is-attachment-${attachmentCard.type}`);
  }
  const callCard = type === "system"
    ? resolveCallMessageCard(options.metadata || {}, normalized, { locale: getLocale() })
    : null;
  if (callCard) article.classList.add("is-call-record");
  const gameCard = type === "system"
    && !callCard
    ? resolveGameMessageCard(options.metadata || {}, normalized, { locale: getLocale() })
    : null;
  if (gameCard) article.classList.add("is-game-event", `is-game-${gameCard.type}`);
  const isActivity = !gameCard && type === "system" && (mediaType === "activity" || options.metadata?.kind === "activity");
  if (isActivity) article.classList.add("is-activity");
  const isArtifact = !attachmentCard && !isActivity && (mediaType === "artifact" || options.metadata?.kind === "artifact");
  if (isArtifact) article.classList.add("has-artifact");
  const isToken = !isArtifact && Boolean(token) && isRenderableTokenCard(mediaType, token);
  if (isToken) article.classList.add("has-token");
  const locationParsed = !attachmentCard && !isSticker && !isToken && !isArtifact
    ? parseLocationMessage(normalized, options.metadata || {})
    : { ok: false };
  const isLocation = locationParsed.ok;
  if (isLocation) {
    article.classList.add("has-location");
    article.dataset.retryLocation = JSON.stringify(options.metadata?.location || {
      title: locationParsed.title,
      subtitle: locationParsed.subtitle,
      lat: locationParsed.lat,
      lon: locationParsed.lon,
    });
  }

  const showSpeak = type === "ai"
    && normalized
    && options.skipVoice !== true
    && options.persist !== false
    && isFeatureEnabled("voice")
    && !isSticker
    && !isToken
    && !isLocation
    && !isArtifact
    && !attachmentCard;

  if (attachmentCard) {
    const card = document.createElement(attachmentCard.type === "image" ? "figure" : "div");
    card.className = `message-attachment-card is-${attachmentCard.type}`;
    card.dataset.mediaId = attachmentCard.mediaId;
    if (attachmentCard.type === "image") {
      if (attachmentCard.previewUrl) {
        const image = document.createElement("img");
        image.src = attachmentCard.previewUrl;
        image.alt = attachmentCard.name;
        image.loading = "lazy";
        card.append(image);
      } else {
        const placeholder = document.createElement("span");
        placeholder.className = "message-attachment-card__placeholder";
        placeholder.innerHTML = '<i data-lucide="image"></i>';
        card.append(placeholder);
      }
      const caption = document.createElement("figcaption");
      const name = document.createElement("strong");
      name.textContent = attachmentCard.name;
      const size = document.createElement("span");
      size.textContent = formatAttachmentSize(attachmentCard.size);
      caption.append(name, size);
      card.append(caption);
    } else {
      const icon = document.createElement("span");
      icon.className = "message-attachment-card__icon";
      icon.innerHTML = `<i data-lucide="${attachmentCard.type === "text" ? "file-text" : "file"}"></i>`;
      const body = document.createElement("span");
      body.className = "message-attachment-card__body";
      const name = document.createElement("strong");
      name.textContent = attachmentCard.name;
      const meta = document.createElement("span");
      meta.textContent = [
        t(attachmentCard.type === "text" ? "appShell.chat.textAttachment" : "appShell.chat.fileAttachment"),
        formatAttachmentSize(attachmentCard.size),
      ].join(" · ");
      body.append(name, meta);
      if (attachmentCard.preview) {
        const preview = document.createElement("p");
        preview.textContent = attachmentCard.preview;
        body.append(preview);
      }
      card.append(icon, body);
    }
    article.append(card);
    if (options.metadata?.source === "companion_selfie" && normalized) {
      const caption = document.createElement("p");
      caption.className = "message-attachment-caption";
      caption.textContent = normalized;
      article.append(caption);
    }
  } else if (callCard) {
    const card = document.createElement("div");
    card.className = `message-call-card is-${callCard.kind}`;
    const icon = document.createElement("span");
    icon.className = "message-call-card__icon";
    icon.innerHTML = `<i data-lucide="${callCard.kind === "voice" ? "phone" : "video"}"></i>`;
    const body = document.createElement("span");
    body.className = "message-call-card__body";
    const head = document.createElement("span");
    head.className = "message-call-card__head";
    const title = document.createElement("strong");
    title.textContent = callCard.title;
    const status = document.createElement("em");
    status.textContent = callCard.statusLabel;
    head.append(title, status);
    const duration = document.createElement("strong");
    duration.className = "message-call-card__duration";
    duration.textContent = callCard.duration;
    const meta = document.createElement("small");
    const started = callCard.startedAt ? messageClock(callCard.startedAt) : "";
    const turns = callCard.turnCount > 0 ? `${callCard.turnCount} 轮` : "";
    meta.textContent = [started, turns].filter(Boolean).join(" · ");
    body.append(head, duration);
    if (meta.textContent) body.append(meta);
    card.append(icon, body);
    article.append(card);
  } else if (gameCard) {
    const card = document.createElement("div");
    card.className = `message-game-card is-${gameCard.type}`;
    const head = document.createElement("span");
    head.className = "message-game-card__head";
    const eyebrow = document.createElement("span");
    eyebrow.innerHTML = `<i data-lucide="${gameCard.type === "end" ? "flag" : "gamepad-2"}"></i>${escapeHtml(gameCard.eyebrow)}`;
    const status = document.createElement("em");
    status.textContent = gameCard.status === "ended" ? "已结束" : "进行中";
    head.append(eyebrow, status);
    const title = document.createElement("strong");
    title.textContent = gameCard.title;
    card.append(head, title);
    const detail = gameCard.type === "start"
      ? gameCard.summary
      : (gameCard.result || (gameCard.type === "round" ? "" : gameCard.summary));
    if (detail) {
      const body = document.createElement("p");
      body.textContent = detail;
      card.append(body);
    }
    if (gameCard.canEnd) {
      const actions = document.createElement("span");
      actions.className = "message-game-card__actions";
      const end = document.createElement("button");
      end.type = "button";
      end.dataset.gameEnd = gameCard.runId;
      end.textContent = gameCard.endLabel;
      end.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("yueqi:chat-game-end", {
          detail: { runId: gameCard.runId, gameId: gameCard.gameId },
        }));
      });
      actions.append(end);
      card.append(actions);
    }
    article.append(card);
  } else if (isActivity) {
    const diary = resolveDiaryMessageCard(options.metadata || {}, { locale: getLocale() });
    if (diary) {
      article.classList.add("is-diary-activity");
      const card = document.createElement(diary.deepLink ? "button" : "div");
      card.className = "message-diary-card";
      if (card instanceof HTMLButtonElement) {
        card.type = "button";
        card.dataset.deepLink = diary.deepLink;
        card.dataset.deliveryId = String(options.metadata?.deliveryId || "");
        card.dataset.artifactId = String(options.metadata?.artifactId || "");
        bindMessageDeepLink(card);
      }
      const head = document.createElement("span");
      head.className = "message-diary-card__head";
      head.innerHTML = '<span><i data-lucide="book-open"></i> 日记</span>';
      if (diary.day) {
        const day = document.createElement("time");
        day.dateTime = diary.day;
        day.textContent = diary.day;
        head.append(day);
      }
      const title = document.createElement("strong");
      title.textContent = diary.title;
      card.append(head, title);
      if (diary.preview) {
        const preview = document.createElement("p");
        preview.textContent = diary.preview;
        card.append(preview);
      }
      if (diary.deepLink) {
        const action = document.createElement("span");
        action.className = "message-diary-card__action";
        action.textContent = diary.actionLabel;
        card.append(action);
      }
      article.append(card);
    } else {
      const capability = resolveCapabilityActionCard(options.metadata || {}, { locale: getLocale() });
      const note = document.createElement("div");
      note.className = "chat-activity-note";
      if (capability) note.classList.add("is-capability-action");
      const copy = document.createElement("span");
      copy.textContent = normalized;
      note.append(copy);
      if (capability?.needsPermission && capability.permissionId) {
        const action = document.createElement("button");
        action.type = "button";
        action.textContent = capability.actionLabel;
        action.dataset.requestPermission = capability.permissionId;
        action.dataset.capabilityId = capability.capabilityId;
        action.addEventListener("click", async () => {
          action.disabled = true;
          try {
            const result = await ensurePermission(capability.permissionId);
            const granted = result?.ok === true || result?.status === "granted" || result === "granted";
            action.textContent = granted
              ? (String(getLocale() || "").toLowerCase().startsWith("en") ? "Granted" : "已授权")
              : capability.actionLabel;
            if (granted) {
              document.dispatchEvent(new CustomEvent("yueqi:capability-open", {
                detail: { openApp: capability.openApp, intentId: capability.capabilityId, event: capability.event },
              }));
            }
          } finally {
            action.disabled = false;
          }
        });
        note.append(action);
      } else if (capability?.openApp || capability?.event) {
        const action = document.createElement("button");
        action.type = "button";
        action.textContent = capability.actionLabel;
        action.dataset.capabilityOpen = capability.openApp || "";
        action.dataset.capabilityEvent = capability.event || "";
        action.addEventListener("click", () => {
          document.dispatchEvent(new CustomEvent("yueqi:capability-open", {
            detail: {
              openApp: capability.openApp,
              intentId: capability.capabilityId,
              event: capability.event,
            },
          }));
          if (capability.event) {
            document.dispatchEvent(new CustomEvent(capability.event, { detail: { intentId: capability.capabilityId } }));
          }
        });
        note.append(action);
      } else {
        const actionLabel = String(options.metadata?.actionLabel || "").trim();
        const deepLink = String(options.metadata?.deepLink || "").trim();
        if (actionLabel && deepLink) {
          const action = document.createElement("button");
          action.type = "button";
          action.textContent = actionLabel;
          action.dataset.deepLink = deepLink;
          action.dataset.deliveryId = String(options.metadata?.deliveryId || "");
          action.dataset.artifactId = String(options.metadata?.artifactId || "");
          bindMessageDeepLink(action);
          note.append(action);
        }
      }
      article.append(note);
    }
  } else if (isArtifact) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "message-artifact";
    btn.dataset.deepLink = String(options.metadata?.deepLink || "");
    btn.dataset.deliveryId = String(options.metadata?.deliveryId || "");
    btn.dataset.artifactId = String(options.metadata?.artifactId || "");
    const title = document.createElement("strong");
    title.textContent = String(options.metadata?.artifactType || "内容");
    const body = document.createElement("span");
    body.textContent = normalized;
    btn.append(title, body);
    bindMessageDeepLink(btn);
    article.append(btn);
  } else if (isSticker) {
    const wrap = document.createElement("div");
    wrap.className = "message-sticker";
    const img = document.createElement("img");
    img.src = stickerUrl;
    img.alt = normalized || "表情";
    wrap.append(img);
    article.append(wrap);
  } else if (isToken) {
    const wallet = loadWallet();
    const wrap = document.createElement("div");
    wrap.className = "message-token";
    wrap.innerHTML = renderTokenCardHtml(token, {
      messageId: options.id || "",
      canPay: canAfford(Number(token.amount) || 0, wallet),
    });
    article.append(wrap);
  } else if (isLocation) {
    const wrap = document.createElement("div");
    wrap.className = "message-location-wrap";
    wrap.innerHTML = renderLocationCardHtml(locationParsed);
    article.append(wrap);
  } else if (showSpeak) {
    const row = document.createElement("div");
    row.className = "message-row";
    const p = document.createElement("p");
    p.dataset.messageBody = "true";
    p.textContent = normalized;
    row.append(p);
    const speakButton = document.createElement("button");
    speakButton.type = "button";
    speakButton.className = "message-speak";
    speakButton.dataset.speakMessage = "true";
    speakButton.setAttribute("aria-label", t("appShell.chat.speak"));
    // Stays tappable without a key: a disabled button gives a touch user no way
    // to learn that speech needs their own key.
    speakButton.title = speakButtonTitle();
    speakButton.innerHTML = '<i data-lucide="volume-2"></i><span class="icon-fallback">🔊</span>';
    row.append(speakButton);
    article.append(row);
  } else {
    const p = document.createElement("p");
    p.dataset.messageBody = "true";
    p.textContent = normalized;
    article.append(p);
  }

  if (type === "ai" && isOpeningIntroMessage(options.metadata, messageId)) {
    const setup = createOpeningSetupCtaButton(getLocale());
    if (setup) {
      article.classList.add("has-opening-setup");
      article.append(setup);
    }
  }

  if ((type === "ai" || type === "system") && options.metadata?.turnActivity) {
    const host = document.createElement("div");
    host.innerHTML = renderTurnActivityHtml(options.metadata.turnActivity);
    const activity = host.firstElementChild;
    if (activity) {
      const reply = article.querySelector(".message-reply-preview");
      const anchor = reply?.nextSibling
        || article.querySelector(
          "p, .message-row, .message-attachment-card, .message-sticker, .message-token, .message-location-wrap, .message-artifact",
        );
      if (anchor) article.insertBefore(activity, anchor);
      else article.prepend(activity);
      article.classList.add("has-turn-activity");
      ensureMessageBubbleShell(article, { psychology: true });
      bindTurnActivityFolds(article);
    }
  }

  appendChatTimelineMarker(createdAt);
  appendMessageFooter(article, { createdAt, type, deliveryState });
  appendAppMessageActions(article, {
    content: normalized,
    type,
    messageId,
    metadata: options.metadata || {},
    conversationSessionId,
  });
  list.append(article);
  list.scrollTop = list.scrollHeight;
  if (
    showSpeak
    || attachmentCard
    || isToken
    || isLocation
    || isArtifact
    || callCard
    || gameCard
    || article.classList.contains("is-diary-activity")
    || type === "user"
    || article.querySelector("[data-message-menu]")
  ) refreshIcons();

  const persistMeta = {
    ...(options.metadata || {}),
    ...(isSticker ? { kind: "sticker", mediaType: "sticker", stickerUrl } : {}),
    ...(isArtifact ? {
      kind: "artifact",
      mediaType: "artifact",
      artifactId: options.metadata?.artifactId,
      deepLink: options.metadata?.deepLink,
      deliveryId: options.metadata?.deliveryId,
      artifactType: options.metadata?.artifactType,
    } : {}),
  };

  if (options.persist !== false && (type === "user" || type === "ai" || type === "system")) {
    // Pop submit path writes via writeCompanionTurn with persist:false for UI.
    // Other surfaces (proactive, system inject helpers) persist here — V2 first.
    if (options.skipConversationWrite !== true && normalized) {
      try {
        const { writeCompanionTurn } = await import("./conversation/companion-write.js");
        // ownership from explicit options or chat focus only — never live getActiveCharacterId().
        const focus = getChatFocus();
        const characterId = String(
          options.characterId || options.companionId || focus?.characterId || "",
        ).trim();
        if (!characterId) {
          console.error("[yueqi.conversation] addMessage refused — missing companionId (no activeCharacter fallback)");
        } else {
          const role = type === "user" ? "user" : type === "system" ? "system" : "assistant";
          const written = await writeCompanionTurn({
            role,
            text: normalized,
            userId: options.userId || "local",
            companionId: characterId,
            characterId,
            relationshipId: options.relationshipId,
            chatSessionId: options.chatSessionId || getCurrentSessionId(),
            messageId: options.id,
            meta: { ...persistMeta, source: persistMeta.source || "app_add_message" },
            saveChatMessage,
          });
          if (!written.ok) {
            console.error("[yueqi.conversation] addMessage V2 write failed — refusing IDB-only", written.reason);
          }
        }
      } catch (error) {
        console.error("[yueqi.conversation] addMessage write failed", error);
      }
    } else if (type === "user" || type === "ai") {
      await saveChatMessage({
        id: options.id,
        sessionId: getCurrentSessionId(),
        role: type === "user" ? "user" : "assistant",
        content: normalized,
        metadata: persistMeta,
      });
    }
    if (type === "user" && normalized && options.skipCohabit !== true) {
      appendCohabitEvent({
        appId: "pop",
        kind: isSticker ? "sticker" : "chat",
        summary: isSticker ? `用户发了表情：${normalized.slice(0, 40)}` : `用户说：${normalized.slice(0, 80)}`,
        characterId: getChatFocus()?.characterId || getActiveCharacterId(),
      });
    }
  }

  return article;
}

async function submitExternalTurn(payload = {}) {
  let voiceText = "";
  const audioDataUrl = String(payload.audioDataUrl || "");
  if (audioDataUrl.startsWith("data:audio/")) {
    try {
      const audioBlob = await fetch(audioDataUrl).then((response) => response.blob());
      const result = await transcribeAudio(audioBlob, collectVoiceConfig(voiceNodes));
      voiceText = String(result?.text || "").trim();
    } catch (error) {
      console.warn("pet voice transcription failed", error);
      voiceText = "我刚才说了一段话，但语音转写失败了。请提醒我检查语音设置。";
    }
  }
  const imageDataUrl = String(payload.imageDataUrl || "");
  const stickerUrl = String(payload.stickerUrl || "").trim();
  const hasImage = imageDataUrl.startsWith("data:image/");
  const hasSticker = Boolean(stickerUrl);
  const externalAttachment = payload.attachment && typeof payload.attachment === "object"
    ? payload.attachment
    : null;

  const externalSource = String(payload.source || "").toLowerCase();
  const contextPurpose = payload.purpose === "deskpet"
    || /pet|overlay|screen_capture|desktop_presence/.test(externalSource)
    ? "deskpet"
    : "chat";
  if (!form || !input) return false;
  // Keep a phone-originated turn attached to the DM that was open when the
  // user tapped send. The chat form must not infer this from the mutable
  // active companion while another shell is repainting.
  const requestedCharacterId = String(payload.characterId || getChatFocus()?.characterId || "").trim();
  if (requestedCharacterId) form.dataset.contextCharacterId = requestedCharacterId;
  const requestedSessionId = String(payload.sessionId || getChatFocus()?.sessionId || "").trim();
  if (requestedSessionId) form.dataset.contextSessionId = requestedSessionId;
  form.dataset.contextPurpose = contextPurpose;
  form.dataset.contextAppId = contextPurpose === "deskpet" ? "deskpet" : "pop";
  if (payload.routeIntent) {
    form.dataset.routeIntent = String(payload.routeIntent);
  } else {
    delete form.dataset.routeIntent;
  }

  if (hasSticker) {
    attachmentState.pending = {
      type: "image",
      name: String(payload.stickerId || "表情"),
      dataUrl: stickerUrl,
      mime: "image/*",
      sticker: true,
      stickerId: payload.stickerId || "",
    };
  } else if (hasImage) {
    attachmentState.pending = {
      type: "image",
      name: `screen-${Date.now()}.jpg`,
      dataUrl: imageDataUrl,
      mime: "image/jpeg",
      source: payload.source || "screen_capture",
    };
  } else if (externalAttachment) {
    attachmentState.pending = externalAttachment;
  }

  const hasAttachment = Boolean(attachmentState.pending);
  const text = voiceText || String(payload.text || "").trim()
    || (hasSticker ? "[表情]" : "")
    || (hasImage ? "看看我现在的屏幕，跟我说说你注意到了什么。" : "");
  if (!text && !hasAttachment) return false;

  if (payload.location && typeof payload.location === "object") {
    form.dataset.pendingLocation = JSON.stringify(payload.location);
  }
  const messageId = String(payload.messageId || "").trim()
    || `ext-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  form.dataset.pendingMessageId = messageId;
  if (payload.replyTo && typeof payload.replyTo === "object") {
    window.dispatchEvent(new CustomEvent("yueqi:chat-quote", { detail: payload.replyTo }));
  }
  // Phone-shell sends already have an immutable DM focus. Switching the
  // underlying App panel here can rehydrate the legacy active companion while
  // the phone turn is being submitted, so keep the phone shell in place.
  if (document.body.dataset.appMode !== "phone") {
    setPanel("chat");
  }
  input.value = text;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("yueqi:chat-send-result", onResult);
      resolve(Boolean(ok));
    };
    const onResult = (event) => {
      if (String(event.detail?.messageId || "") !== messageId) return;
      finish(event.detail?.ok);
    };
    const timeoutId = window.setTimeout(() => finish(false), 20000);
    window.addEventListener("yueqi:chat-send-result", onResult);
    form.requestSubmit();
  });
}

window.addEventListener("yueqi:device-artifact", (event) => {
  const detail = event?.detail || {};
  submitExternalTurn({
    ...detail,
    source: detail.source || "device_capability",
  }).catch((error) => console.warn("device artifact delivery failed", error));
});

function speakButtonTitle() {
  if (!canSpeak()) return t("alerts.voiceNeedKey");
  if (speechRoute() === SPEECH_ROUTE.HOSTED && !resolveHostedVoiceType(getActiveCharacterId())) {
    return t("alerts.voiceNeedHostedVoice");
  }
  return t("appShell.chat.speak");
}

function refreshMessageSpeakButtons() {
  document.querySelectorAll("[data-speak-message]").forEach((button) => {
    const ready = canSpeak();
    button.hidden = !isFeatureEnabled("voice");
    button.disabled = false;
    button.title = speakButtonTitle();
    button.classList.toggle("is-needs-voice-setup", ready && needsHostedVoiceSetup());
  });
}

function syncVoiceProviderFields() {
  const ttsProvider = voiceTtsProvider?.value || "ElevenLabs";
  const sttProvider = voiceSttProvider?.value || "OpenAI Whisper";
  const volcTts = ttsProvider === "Volcengine";
  const volcStt = sttProvider === "Volcengine";
  document.querySelectorAll("[data-voice-volc-only]").forEach((node) => {
    node.hidden = !volcTts;
  });
  document.querySelectorAll("[data-voice-cloud-key], [data-voice-openai-only]").forEach((node) => {
    node.hidden = volcTts;
  });
  document.querySelectorAll("[data-voice-stt-openai-only]").forEach((node) => {
    node.hidden = volcStt;
  });
}

function syncVoiceControlsVisibility() {
  syncVoiceProviderFields();
  refreshHostedVoiceUi({ characterId: activeEditorCharacterId() || getActiveCharacterId() });
  const voiceOn = isFeatureEnabled("voice");
  const holdBtn = document.querySelector("[data-composer-hold]");
  const plusVoice = document.querySelector('[data-composer-plus-action="voice"]');
  if (composerMicButton) {
    composerMicButton.hidden = !voiceOn;
    composerMicButton.disabled = !voiceOn;
    composerMicButton.title = canTranscribe()
      ? t("appShell.chat.voiceInput")
      : t("alerts.voiceNeedKey");
  }
  if (holdBtn && !voiceOn) {
    holdBtn.hidden = true;
    holdBtn.classList.remove("is-recording");
  }
  if (plusVoice) plusVoice.hidden = !voiceOn;
  retrySttButtons.forEach((button) => {
    button.hidden = !voiceOn || !pendingSttBlobRef.current;
  });
  refreshMessageSpeakButtons();
}

function createSpeakButton() {
  const speakButton = document.createElement("button");
  speakButton.type = "button";
  speakButton.className = "message-speak";
  speakButton.dataset.speakMessage = "true";
  speakButton.setAttribute("aria-label", "朗读");
  speakButton.innerHTML = '<i data-lucide="volume-2"></i><span class="icon-fallback">🔊</span>';
  return speakButton;
}

function attachSpeakButtonToMessage(article) {
  if (!article || article.querySelector("[data-speak-message]") || !isFeatureEnabled("voice")) return;
  const paragraph = resolveMessageBodyParagraph(article);
  if (!paragraph) return;
  paragraph.dataset.messageBody = "true";
  if (paragraph.closest(".message-row")) {
    const row = paragraph.closest(".message-row");
    row.append(createSpeakButton());
    refreshMessageSpeakButtons();
    refreshIcons(article);
    return;
  }
  const row = document.createElement("div");
  row.className = "message-row";
  paragraph.replaceWith(row);
  row.append(paragraph);
  row.append(createSpeakButton());
  refreshMessageSpeakButtons();
  refreshIcons(article);
}

function setPendingSttBlob(blob) {
  pendingSttBlobRef.current = blob || null;
  if (testVoiceSttButton) testVoiceSttButton.hidden = !lastVoiceTestBlobRef.current;
  syncVoiceControlsVisibility();
}

async function transcribePendingRecording(blob = pendingSttBlobRef.current, { submit = false } = {}) {
  const targetBlob = blob;
  if (!targetBlob) throw new Error("没有待转写的录音。");
  if (!canTranscribe()) throw new Error(t("alerts.voiceNeedKey"));
  const { text } = await transcribeRecording(targetBlob, collectVoiceConfig(voiceNodes));
  setPendingSttBlob(null);
  if (submit) {
    if (input) input.value = text;
    form?.requestSubmit();
    return text;
  }
  if (input) input.value = text;
  return text;
}

function speechRouteLabel(route) {
  if (route === SPEECH_ROUTE.BYOK) return t("voicePanel.routeByok");
  if (route === SPEECH_ROUTE.HOSTED) return t("voicePanel.routeHosted");
  if (route === SPEECH_ROUTE.DEVICE) return t("voicePanel.routeDevice");
  return t("voicePanel.routeNone");
}

function renderVoiceStatus(extra = {}) {
  if (!voiceResult) return;
  const config = collectVoiceConfig(voiceNodes);
  const line = voiceResult.querySelector("[data-voice-status-line]") || voiceResult;
  const voiceName = resolveVoiceDisplayName(
    config,
    recalledVoiceCatalog("ElevenLabs", config.ttsApiKey) || [],
  );
  let text = "";
  if (extra.status === "testing") text = t("voicePanel.statusTesting");
  else if (extra.status === "recording") text = t("voicePanel.statusRecording");
  else if (extra.status === "transcribing") text = t("voicePanel.statusTranscribing");
  else if (extra.status === "ok") text = extra.error || t("voicePanel.statusOk");
  else if (extra.status === "error") text = extra.error || t("voicePanel.statusError");
  else if (extra.status === "recorded") text = extra.error || t("voicePanel.statusRecorded");
  else {
    const ttsLine = isVoiceConfigured(config)
      ? (voiceName
        ? t("voicePanel.statusTtsReady", { provider: config.ttsProvider, voice: voiceName })
        : t("voicePanel.statusTtsReadyPlain", { provider: config.ttsProvider }))
      : t("voicePanel.statusTtsNeedKey");
    const sttLine = isSttConfigured(config)
      ? t("voicePanel.statusSttReady")
      : t("voicePanel.statusSttNeedKey");
    text = [
      ttsLine,
      sttLine,
      t("voicePanel.statusRoute", {
        speak: speechRouteLabel(speechRoute(config)),
        hear: speechRouteLabel(sttRoute(config)),
      }),
    ].join("\n");
  }
  line.textContent = text;
}

function applyVoiceConfig(config = getVoiceSettings()) {
  applyVoiceConfigToNodes(config, voiceNodes);
  renderVoiceStatus();
  refreshMessageSpeakButtons();
  syncVoiceControlsVisibility();
  voicePicker?.refresh?.({ settings: config });
}

async function applyVoiceConfigAsync(config = getVoiceSettings()) {
  const next = { ...config };
  const ttsSecret = await getSecret("voice.ttsApiKey");
  const sttSecret = await getSecret("voice.sttApiKey");
  if (ttsSecret) next.ttsApiKey = ttsSecret;
  if (sttSecret) next.sttApiKey = sttSecret;
  // Migrate legacy plaintext voice keys out of local settings blob.
  if ((config.ttsApiKey || config.sttApiKey) && (!ttsSecret || !sttSecret)) {
    setSecret("voice.ttsApiKey", next.ttsApiKey || "").catch(() => {});
    setSecret("voice.sttApiKey", next.sttApiKey || "").catch(() => {});
    const { ttsApiKey: _t, sttApiKey: _s, ...rest } = config;
    saveVoiceSettings(rest);
  }
  applyVoiceConfig(next);
}

function persistVoiceConfig() {
  const config = collectVoiceConfig(voiceNodes);
  const { ttsApiKey, sttApiKey, ...rest } = config;
  saveVoiceSettings(rest);
  setSecret("voice.ttsApiKey", ttsApiKey).catch(() => {});
  setSecret("voice.sttApiKey", sttApiKey).catch(() => {});
  renderVoiceStatus();
  refreshMessageSpeakButtons();
  syncVoiceControlsVisibility();
  scheduleCapabilityRefresh();
}

voicePicker = mountVoicePicker({
  getSettings: () => collectVoiceConfig(voiceNodes),
  persist: persistVoiceConfig,
  onCatalog: () => renderVoiceStatus(),
});

async function ensureMicrophonePermission() {
  const result = await ensurePermission("microphone");
  await refreshPermissionUi();
  if (!result.ok && result.message) {
    window.alert(result.message);
  }
  return result.ok;
}

async function runVoiceRecordTest(durationMs = 3000) {
  if (!testVoiceRecordButton) return;
  const ok = await ensureMicrophonePermission();
  if (!ok) return;
  testVoiceRecordButton.disabled = true;
  renderVoiceStatus({ status: "recording" });
  try {
    await startRecording();
    await new Promise((resolve) => window.setTimeout(resolve, durationMs));
    const result = await stopRecording();
    lastVoiceTestBlobRef.current = result.blob || null;
    if (testVoiceSttButton) testVoiceSttButton.hidden = !lastVoiceTestBlobRef.current;
    renderVoiceStatus({
      status: "recorded",
      error: result.blob
        ? `录音 ${Math.round(result.durationMs / 100) / 10}s · ${Math.round(result.blob.size / 1024)}KB`
        : "未录到音频",
    });
  } catch (error) {
    renderVoiceStatus({ status: "error", error: error.message });
  } finally {
    testVoiceRecordButton.disabled = false;
  }
}

async function finishComposerRecording() {
  if (!micState.active) return;
  micState.active = false;
  composerMicButton?.classList.remove("is-recording");
  composerMicButton?.classList.add("is-transcribing");
  try {
    const result = await stopRecording();
    if (!result.blob || result.durationMs <= 400) return;
    if (!isFeatureEnabled("voice")) return;
    if (!canTranscribe()) {
      setPendingSttBlob(result.blob);
      window.alert(t("alerts.sttNeedKey"));
      return;
    }
    try {
      const text = await transcribePendingRecording(result.blob, { submit: false });
      await appendVoiceMessage(list, {
        text,
        role: "user",
        durationMs: result.durationMs,
        saveChatMessage,
        sessionId: getCurrentSessionId(),
        persist: false,
      });
      micState.pendingVoiceSubmit = true;
      if (input) input.value = text;
      form?.requestSubmit();
    } catch (error) {
      setPendingSttBlob(result.blob);
      window.alert(t("alerts.sttRetry", { error: error.message }));
    }
  } catch (error) {
    window.alert(error.message || t("alerts.recordFail"));
  } finally {
    composerMicButton?.classList.remove("is-transcribing");
  }
}

async function renderPersistedChatMessage(message, previousRenderedMessage = null) {
  const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const createdAt = String(message?.createdAt || new Date().toISOString());
  const content = String(message?.content || "");

  if (metadata.kind === "voice") {
    const voiceRole = message.role === "user" ? "user" : "assistant";
    const duplicatesPreviousText = previousRenderedMessage
      && previousRenderedMessage.role === voiceRole
      && previousRenderedMessage.content === content;
    if (duplicatesPreviousText) return previousRenderedMessage;
    appendChatTimelineMarker(createdAt);
    const article = await appendVoiceMessage(list, {
      text: content,
      role: message.role === "user" ? "user" : "ai",
      durationMs: metadata.durationMs || metadata.voiceDurationMs || 0,
      persist: false,
    });
    if (message.id) article.dataset.messageId = String(message.id);
    article.dataset.createdAt = createdAt;
    const voiceType = message.role === "user" ? "user" : "ai";
    const voiceSessionId = String(
      message.sessionId || metadata.conversationSessionId || getCurrentSessionId() || "",
    ).trim();
    if (voiceSessionId) article.dataset.conversationSessionId = voiceSessionId;
    appendMessageFooter(article, {
      createdAt,
      type: voiceType,
      deliveryState: deliveryStateFor(voiceType, { metadata }),
    });
    appendAppMessageActions(article, {
      content,
      type: voiceType,
      messageId: String(message.id || ""),
      metadata,
      conversationSessionId: voiceSessionId,
    });
    refreshIcons();
    return { role: voiceRole, content };
  }

  if (message.role === "system") {
    await addMessage(content, "system", {
      persist: false,
      id: message.id,
      createdAt,
      runtime: false,
      metadata,
    });
    return { role: "system", content };
  }

  if (message.role === "user") {
    await addMessage(content, "user", {
      persist: false,
      id: message.id,
      createdAt,
      runtime: false,
      metadata,
      stickerUrl: metadata.stickerUrl || "",
    });
    return { role: "user", content };
  }

  if (message.role === "assistant") {
    const parsed = (!metadata.token && content) ? parseTokenMessage(content, metadata) : null;
    await addMessage(content, "ai", {
      persist: false,
      id: message.id,
      createdAt,
      runtime: false,
      metadata: parsed?.ok
        ? { ...metadata, mediaType: parsed.mediaType, token: parsed.token, kind: parsed.mediaType }
        : metadata,
    });
    if (metadata.turnActivity) refreshIcons();
    return { role: "assistant", content };
  }

  return previousRenderedMessage;
}

async function loadChatHistory() {
  const focus = getChatFocus();
  const { sessionId } = focus;
  if (focus.kind === "group") {
    // group row already exists when focus was set
  } else {
    await ensureDmConversation(focus.characterId);
  }
  const messages = (await getMessagesBySession(sessionId, 200))
    .filter((message) => !isPlatformPlaceholderGreeting(message));
  list.querySelectorAll(".message, .chat-time-separator, [data-chat-intro-note]").forEach((node) => {
    // A history reload can land while the current turn is still streaming.
    // Wiping the in-flight bubble is how App chat can "succeed" in Conversation
    // V2 / the phone transcript while the visible App list stays empty.
    if (node.classList.contains("is-reply-progress") || node.classList.contains("is-tool-progress")) {
      return;
    }
    node.remove();
  });
  lastRenderedChatAt = "";

  const character = getCharacterSync(focus.characterId || getActiveCharacterId());
  const pinIntro = shouldPinChatIntroNote(messages, { character });
  if (pinIntro) {
    list.insertAdjacentHTML("afterbegin", renderChatIntroNote({
      locale: getLocale(),
      surface: "app",
      characterId: character?.id,
      characterName: character?.name,
      callUserAs: character?.alias,
      collapsed: isChatIntroNoteCollapsed(character?.id, { messages }),
    }));
    refreshIcons();
  }
  if (!messages.length) {
    try {
      const { hasFirstLightDoneV2 } = await import("./first-light/controller-v2.js");
      if (!hasFirstLightDoneV2()) {
        list.scrollTop = 0;
        return;
      }
    } catch {
      /* first-light optional */
    }
    if (focus.kind !== "group") {
      try {
        const { ensureCharacterOpeningMessage } = await import("./chat/ensure-opening.js");
        const { writeCompanionTurn } = await import("./conversation/companion-write.js");
        const seeded = await ensureCharacterOpeningMessage({
          character,
          sessionId,
          messages,
          writeCompanionTurn,
          saveChatMessage,
          locale: getLocale(),
        });
        if (seeded.wrote) {
          const seededMessages = (await getMessagesBySession(sessionId, 200))
            .filter((message) => !isPlatformPlaceholderGreeting(message));
          if (seededMessages.length) {
            let previousRenderedMessage = null;
            for (const message of seededMessages) {
              previousRenderedMessage = await renderPersistedChatMessage(message, previousRenderedMessage);
            }
            list.scrollTop = 0;
            refreshIcons();
            return;
          }
        }
      } catch (error) {
        console.warn("ensure character opening failed", error);
      }
    }
    list.scrollTop = 0;
    return;
  }

  let previousRenderedMessage = null;
  for (const message of messages) {
    previousRenderedMessage = await renderPersistedChatMessage(message, previousRenderedMessage);
  }
  if (transcriptHasLivedChat(messages)) list.scrollTop = list.scrollHeight;
  else list.scrollTop = 0;
  refreshIcons();
}

function openAppChatIntroDestination(action) {
  const destination = resolveChatIntroDestination(action, "app");
  if (!destination) return;
  if (destination.kind === "panel" || destination.kind === "app-panel") {
    setAppMode("app");
    setPanel(destination.value);
    return;
  }
  if (destination.kind === "settings") {
    document.dispatchEvent(new CustomEvent("yueqi:open-settings-route", {
      detail: { route: destination.value, source: "chat_intro" },
    }));
    return;
  }
  if (destination.kind === "phone-app") {
    window.dispatchEvent(new CustomEvent("yueqi.assist.open-app", {
      detail: { app: destination.value, source: "chat_intro" },
    }));
    return;
  }
  if (destination.kind === "assist") {
    window.dispatchEvent(new CustomEvent("yueqi.assist.open", {
      detail: { context: "chat_intro" },
    }));
  }
}

function setSummaryVisible(visible) {
  summaryPanel.hidden = !visible;
  summaryMasters.forEach((checkbox) => {
    checkbox.checked = visible;
  });
}

function collectProviderConfig() {
  return {
    ...readProviderConfig(providerNodes),
    billingSource: readProductAccess().mode === "subscription" ? "managed" : "byok",
  };
}

function syncProductModeUi() {
  const managed = readProductAccess().mode === "subscription";
  document.querySelectorAll("[data-provider-byok-only]").forEach((node) => { node.hidden = managed; });
  document.querySelectorAll("[data-provider-managed-only]").forEach((node) => { node.hidden = !managed; });
}
window.addEventListener("yueqi:product-access-changed", syncProductModeUi);
window.addEventListener("yueqi:product-access-changed", () => {
  refreshHostedSpeechStatus({ force: true }).then(() => {
    refreshMessageSpeakButtons();
    syncVoiceControlsVisibility();
  }).catch(() => {});
});
voiceTtsProvider?.addEventListener("change", () => {
  syncVoiceProviderFields();
  voicePicker?.refresh();
});
voiceSttProvider?.addEventListener("change", syncVoiceProviderFields);
voiceTtsApiKey?.addEventListener("blur", () => {
  voicePicker?.refresh();
});
document.querySelector('[data-api-open="voice"]')?.addEventListener("click", () => {
  queueMicrotask(() => voicePicker?.refresh());
});
voiceHostedVoiceType?.addEventListener("change", persistVoiceConfig);
document.addEventListener("change", (event) => {
  const select = event.target?.closest?.("[data-hosted-voice-select][data-hosted-voice-scope='character']");
  if (!select) return;
  const characterId = select.getAttribute("data-character-id") || activeEditorCharacterId() || getActiveCharacterId();
  setCharacterHostedVoice(characterId, select.value);
});

function isDefaultStatusLocation(value) {
  const raw = String(value || "").trim();
  return !raw || raw === "用户当前位置" || raw === "Current location";
}

/** Native date inputs follow OS locale chrome; mirror value into a localized text face. */
function formatAnniversaryDisplay(isoDate) {
  const raw = String(isoDate || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return "";
  return `${match[1]} / ${match[2]} / ${match[3]}`;
}

function syncAnniversaryDateDisplay() {
  if (!anniversaryDateDisplay) return;
  anniversaryDateDisplay.value = formatAnniversaryDisplay(anniversaryDateInput?.value);
  anniversaryDateDisplay.placeholder = t("character.anniversaryPlaceholder");
}

const LEGACY_DEFAULT_PROMPT_SYSTEM = "你是一个稳定、克制、会尊重边界的人机恋伴侣。回复要贴近当前情绪，不替用户做现实决定。";
const LEGACY_DEFAULT_PROMPT_DEVELOPER = "优先使用当前对话与今日状态；不替用户做现实决定；深度思考只输出摘要。";

function promptLangContext() {
  return { conversationLanguage: getLocale() === "en" ? "en-US" : "zh-CN" };
}

function localizedDefaultPrompt(kind) {
  const lang = promptLangContext();
  return kind === "system" ? companionDefaultSystem(lang) : companionDefaultDeveloper(lang);
}

function isCanonicalDefaultPrompt(kind, value) {
  const raw = String(value || "").trim();
  if (!raw) return true;
  const zh = kind === "system"
    ? companionDefaultSystem({ conversationLanguage: "zh-CN" })
    : companionDefaultDeveloper({ conversationLanguage: "zh-CN" });
  const en = kind === "system"
    ? companionDefaultSystem({ conversationLanguage: "en-US" })
    : companionDefaultDeveloper({ conversationLanguage: "en-US" });
  const legacy = kind === "system" ? LEGACY_DEFAULT_PROMPT_SYSTEM : LEGACY_DEFAULT_PROMPT_DEVELOPER;
  const constant = kind === "system" ? DEFAULT_PROMPT_SYSTEM : DEFAULT_PROMPT_DEVELOPER;
  return raw === zh || raw === en || raw === legacy || raw === constant;
}

function resolvePromptForUi(kind, stored) {
  const character = getCharacterSync(getActiveCharacterId());
  const isBuiltin = character?.id === BUILTIN_CHARACTER_ID || character?.source === "builtin";
  if (isCanonicalDefaultPrompt(kind, stored)) {
    if (kind === "system" && isBuiltin) return BUILTIN_COMPANION_PROMPT_SYSTEM;
    return "";
  }
  return String(stored || "");
}

function canonicalizePrompt(kind, value) {
  if (isCanonicalDefaultPrompt(kind, value)) return "";
  return String(value || "").trim();
}

// The editor exposes one Character Prompt. Legacy system/developer storage is
// still read for compatibility, but custom developer text is folded into that
// single editing surface instead of asking users to maintain two prompt boxes.
function unifiedCharacterPrompt(profile = {}) {
  const system = String(profile.promptSystem || "").trim();
  const developer = String(profile.promptDeveloper || "").trim();
  if (!developer || isCanonicalDefaultPrompt("developer", developer) || system.includes(developer)) {
    return system;
  }
  return [system, developer].filter(Boolean).join("\n\n");
}

function refreshPromptSummary() {
  const summary = document.querySelector("[data-prompt-summary]");
  if (!summary) return;
  const system = String(promptSystemInput?.value || "").replace(/\s+/g, " ").trim();
  const preview = system.slice(0, 72);
  summary.textContent = preview
    ? t("character.promptSummarySystem", { text: preview + (system.length > 72 ? "…" : "") })
    : t("character.promptEditHint");
}

function canonicalizeStatusLocation(value) {
  return isDefaultStatusLocation(value) ? "用户当前位置" : String(value || "").trim();
}

function displayStatusLocation(value) {
  return isDefaultStatusLocation(value) ? t("character.locationDefault") : String(value || "").trim();
}

function collectProfileState() {
  const fields = Array.from(document.querySelectorAll(".identity-editor .edit-field input, .identity-editor .edit-field select, .identity-editor .edit-field textarea"));
  return {
    fields: fields.map((field, index) => {
      const raw = String(field.value ?? "");
      if (index <= 1) {
        const trimmed = raw.trim();
        if (trimmed === "Unnamed" || trimmed === "未命名") return "未命名";
      }
      return raw;
    }),
    ranges: Array.from(document.querySelectorAll(".range-editor [data-range-value]")).map((range) => range.value),
    tokens: Array.from(tokenList?.querySelectorAll("button") || []).map((button) => button.textContent.replace("×", "").trim()).filter(Boolean),
    promptSystem: canonicalizePrompt("system", promptSystemInput?.value),
    // Product UI is a single field; developer slot stays empty (merged into system).
    promptDeveloper: "",
    anniversaryDate: anniversaryDateInput?.value || "",
    genderIdentity: String(document.querySelector("[data-character-gender]")?.value || "").trim(),
    pronouns: String(document.querySelector("[data-character-pronouns]")?.value || "").trim(),
    ownBoundaries: String(document.querySelector("[data-character-boundaries]")?.value || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    status: {
      sleepAt: sleepAtInput?.value || "03:00",
      wakeAt: wakeAtInput?.value || "10:30",
      location: canonicalizeStatusLocation(locationInput?.value),
      weatherMode: weatherModeSelect?.value || "定位天气",
      manualWeather: manualWeatherInput?.value || defaultProfile.status.manualWeather,
      injectionEnabled: statusInjectionToggle?.checked !== false,
    },
  };
}

function applyPromptSettingsToUi() {
  const prompt = getPromptSettings();
  if (promptBudgetSelect) promptBudgetSelect.value = String(prompt.budget || 1800);
  if (promptOrderSelect) {
    promptOrderSelect.value = (prompt.order || []).join(",");
  }
}

function applyProfileState(profile = readLocalObject(localFallback.profileKey, null) || defaultProfile) {
  const fields = Array.from(document.querySelectorAll(".identity-editor .edit-field input, .identity-editor .edit-field select, .identity-editor .edit-field textarea"));
  fields.forEach((field, index) => {
    let next = profile.fields?.[index] ?? defaultProfile.fields[index] ?? field.value;
    if (index <= 1 && String(next || "").trim() === "未命名") next = t("character.unnamed");
    field.value = next;
  });
  document.querySelectorAll(".range-editor [data-range-value]").forEach((range, index) => {
    range.value = profile.ranges?.[index] ?? defaultProfile.ranges[index] ?? range.value;
    const output = range.parentElement.querySelector("em");
    if (output) output.textContent = range.value;
  });
  if (tokenList) {
    tokenList.innerHTML = "";
    (profile.tokens?.length ? profile.tokens : defaultProfile.tokens).forEach(addToken);
  }
  if (profile.status) {
    if (sleepAtInput) sleepAtInput.value = profile.status.sleepAt || "03:00";
    if (wakeAtInput) wakeAtInput.value = profile.status.wakeAt || "10:30";
    if (locationInput) locationInput.value = displayStatusLocation(profile.status.location || "用户当前位置");
    if (weatherModeSelect) weatherModeSelect.value = profile.status.weatherMode || "定位天气";
    if (manualWeatherInput) manualWeatherInput.value = profile.status.manualWeather || defaultProfile.status.manualWeather;
    if (statusInjectionToggle) statusInjectionToggle.checked = profile.status.injectionEnabled !== false;
    toggleManualWeatherField(profile.status.weatherMode || weatherModeSelect?.value);
  }
  if (promptSystemInput) {
    promptSystemInput.value = resolvePromptForUi("system", unifiedCharacterPrompt(profile));
  }
  if (promptDeveloperInput) {
    promptDeveloperInput.value = "";
  }
  if (anniversaryDateInput) anniversaryDateInput.value = profile.anniversaryDate || defaultProfile.anniversaryDate || "";
  const activeCharacter = getCharacterSync(getActiveCharacterId());
  const identity = activeCharacter?.selfIdentity || activeCharacter?.profileV2?.selfIdentity || {};
  const genderNode = document.querySelector("[data-character-gender]");
  const pronounsNode = document.querySelector("[data-character-pronouns]");
  const boundsNode = document.querySelector("[data-character-boundaries]");
  if (genderNode) genderNode.value = identity.genderIdentity || profile.genderIdentity || "";
  if (pronounsNode) {
    pronounsNode.value = Array.isArray(identity.pronouns)
      ? identity.pronouns.join("、")
      : (profile.pronouns || "");
  }
  const hostedVoiceSelect = document.querySelector("[data-hosted-voice-select][data-hosted-voice-scope='character']");
  if (hostedVoiceSelect) {
    hostedVoiceSelect.setAttribute("data-character-id", getActiveCharacterId());
  }
  refreshHostedVoiceUi({ characterId: getActiveCharacterId() });
  if (boundsNode) {
    const bounds = activeCharacter?.persona?.ownBoundaries
      || activeCharacter?.profile?.ownBoundaries
      || profile.ownBoundaries
      || [];
    boundsNode.value = Array.isArray(bounds) ? bounds.join("\n") : String(bounds || "");
  }
  syncAnniversaryDateDisplay();
  syncRoleNameChrome(profile.fields?.[0] || defaultProfile.fields[0]);
  syncIdentityDossierHero({
    name: profile.fields?.[0],
    alias: profile.fields?.[1],
    character: activeCharacter,
  });
  applyPromptSettingsToUi();
  refreshPromptSummary();
  refreshIcons();
}

function persistProfileState() {
  const state = collectProfileState();
  writeLocalObject(localFallback.profileKey, state);
  const targetId = getActiveCharacterId() || getChatFocus().characterId;
  syncNonIdentityProfileStateToCharacter(state, targetId).catch((error) => {
    console.warn("syncNonIdentityProfileStateToCharacter failed", error);
  });
  triggerAutoSync();
}

async function syncNonIdentityProfileStateToCharacter(profileState, characterId) {
  const id = String(characterId || "").trim();
  if (!id) return null;
  const existing = getCharacterSync(id) || (await getCharacter(id));
  if (!existing) return null;
  const fields = Array.isArray(existing.profile?.fields)
    ? [...existing.profile.fields]
    : [...defaultProfile.fields];
  return syncProfileStateToCharacter({
    ...profileState,
    fields,
    promptSystem: existing.profile?.promptSystem,
    promptDeveloper: existing.profile?.promptDeveloper,
  }, id);
}

const appCharacterEditor = getSharedCharacterEditorController();
appCharacterEditor.bindShell("app");
characterEditorLeaveGuard = () => appCharacterEditor.confirmNavigation();
let originMemoriesDirty = false;
let originMemoryHydrateGen = 0;

function originMemoryEditorHost() {
  return document.querySelector("[data-origin-memory-editor]");
}

function markOriginMemoriesDirty() {
  originMemoriesDirty = true;
  syncCharacterEditorActions();
}

async function hydrateActiveOriginMemories() {
  const host = originMemoryEditorHost();
  const id = activeEditorCharacterId();
  if (!host) return null;
  const gen = ++originMemoryHydrateGen;
  const result = await hydrateOriginMemoryEditor(host, id);
  if (gen !== originMemoryHydrateGen) return result;
  originMemoriesDirty = false;
  syncCharacterEditorActions();
  return result;
}

async function commitActiveOriginMemories() {
  const host = originMemoryEditorHost();
  const id = activeEditorCharacterId();
  const character = getCharacterSync(id);
  const result = await commitOriginMemoryEditor(host, id, {
    role: character?.name || character?.profile?.fields?.[0] || "",
  });
  if (!result?.skipped) originMemoriesDirty = false;
  return result;
}

function allowLeaveCharacterEditor() {
  const nav = characterEditorLeaveGuard();
  if (nav.allowed && !originMemoriesDirty) return true;
  return window.confirm(t("character.unsavedChanges"));
}

function syncCharacterEditorActions() {
  const unsaved = Boolean(appCharacterEditor.hasUnsaved) || originMemoriesDirty;
  try {
    globalThis.__yueqiCharacterEditorUnsaved = unsaved;
  } catch {
    /* verify / node */
  }
  document.querySelectorAll("[data-character-unsaved]").forEach((node) => {
    node.hidden = !unsaved;
  });
}

function activeEditorCharacterId() {
  return String(getActiveCharacterId() || getChatFocus()?.characterId || "").trim();
}

function profileStateFromWorking(working) {
  const profile = working?.profile && typeof working.profile === "object" ? { ...working.profile } : {};
  const fields = Array.isArray(profile.fields) ? [...profile.fields] : [...defaultProfile.fields];
  if (working?.name) fields[0] = working.name;
  if (working?.alias) fields[1] = working.alias;
  return { ...profile, fields };
}

function showCharacterEditorSaveError(result) {
  const message = result?.conflict
    ? t("character.saveConflict")
    : t("character.saveFailed");
  const node = document.querySelector("[data-prompt-preview]") || capabilityStatusNode;
  if (node) {
    node.textContent = message;
    if ("hidden" in node) node.hidden = !message;
  } else window.alert(message);
}

async function openActiveCharacterEditor() {
  const id = activeEditorCharacterId();
  if (!id) return null;
  const state = await appCharacterEditor.open(id);
  if (state.working) applyProfileState(profileStateFromWorking(state.working));
  await hydrateActiveOriginMemories();
  syncCharacterEditorActions();
  return state;
}

async function persistCharacterIdentityDraft() {
  const state = collectProfileState();
  writeLocalObject(localFallback.profileKey, state);
  const targetId = activeEditorCharacterId();
  if (!targetId) return null;
  if (appCharacterEditor.characterId !== targetId) {
    await appCharacterEditor.open(targetId);
  }
  const next = await appCharacterEditor.patch(identityPatchFromProfileState(state));
  syncCharacterEditorActions();
  return next;
}

async function saveCharacterEditor() {
  await persistCharacterIdentityDraft();
  const result = await appCharacterEditor.save();
  if (!result?.ok) {
    syncCharacterEditorActions();
    showCharacterEditorSaveError(result);
    return result;
  }
  await commitActiveOriginMemories();
  if (result.working) applyProfileState(profileStateFromWorking(result.working));
  await hydrateActiveOriginMemories();
  syncCharacterEditorActions();
  return result;
}

async function discardCharacterEditor() {
  const state = appCharacterEditor.discard();
  if (state.working) applyProfileState(profileStateFromWorking(state.working));
  await hydrateActiveOriginMemories();
  syncCharacterEditorActions();
  return state;
}

function setCharacterEditorMode(nextMode) {
  const state = appCharacterEditor.setMode(nextMode);
  document.querySelectorAll("[data-editor-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.editorMode === state.mode);
  });
  const host = document.querySelector("[data-character-editor-mode]");
  if (host) host.dataset.mode = state.mode;
  return state;
}

function toggleManualWeatherField(mode = weatherModeSelect?.value) {
  if (!manualWeatherInput) return;
  manualWeatherInput.hidden = mode !== "手动天气";
}

async function applyProviderConfigAsync(config = readLocalObject(localFallback.providerKey, null) || {}) {
  syncProductModeUi();
  if (providerKind) providerKind.value = config.kind || "OpenAI Compatible";
  if (providerBaseUrl) providerBaseUrl.value = config.baseUrl || "";
  if (providerModel) providerModel.value = config.model || "";
  if (providerApiKey) {
    const secret = await getSecret("provider.apiKey");
    const legacyKey = config.apiKey || "";
    providerApiKey.value = secret || legacyKey;
    // Migrate legacy plaintext localStorage keys into session/native secret store.
    if (!secret && legacyKey) {
      setSecret("provider.apiKey", legacyKey).catch(() => {});
      const { apiKey: _drop, ...rest } = config;
      writeLocalObject(localFallback.providerKey, rest);
    }
  }
  renderProviderStatus();
}

function persistProviderConfig() {
  const config = collectProviderConfig();
  const { apiKey, ...rest } = config;
  writeLocalObject(localFallback.providerKey, rest);
  setSecret("provider.apiKey", apiKey).catch(() => {});
  renderProviderStatus();
  scheduleCapabilityRefresh();
}

function renderProviderStatus(extra = {}) {
  renderProviderStatusAsync(extra).catch(() => {});
}

async function renderProviderStatusAsync(extra = {}) {
  if (!apiResult) return;
  const config = collectProviderConfig();
  const managed = config.billingSource === "managed";
  const configured = managed || Boolean(config.baseUrl && config.apiKey && config.model);
  const serverOnline = await checkServerHealth();
  const serverInfo = await fetchServerInfo();
  apiResult.textContent = `status: ${extra.status || (configured ? "configured" : "needs_config")}
mode: ${managed ? "managed" : "developer_byok"}
provider: ${managed ? "server" : config.kind}
base_url: ${managed ? "server-managed" : (config.baseUrl || "-")}
model: ${managed ? "server-managed" : (config.model || "-")}
server: ${serverOnline ? "online" : "offline"}
service: ${serverInfo.service || "-"}
latency: ${extra.latencyMs ? `${extra.latencyMs}ms` : "-"}
last_error: ${extra.error || "-"}`;
}

function applySyncSettingsToUi() {
  const sync = getSyncPreferences();
  if (syncStrategySelect) syncStrategySelect.value = sync.strategy || "local_wins";
  refreshChoiceGroup("sync-strategy");
}

async function exportLocalPayload() {
  return buildExportPayload({
    collectProfileState,
    collectLibraryState,
    getEcosystemState,
    getAllRecords,
    normalizeMemory,
    collectWorldbookEntries,
    currentDailyStatus,
    collectSettings,
    getAvatarState,
    listCharactersForBackup: listCharacters,
  });
}

function getNyraExportDeps() {
  return {
    collectProfileState,
    collectLibraryState,
    getEcosystemState,
    getAllRecords,
    normalizeMemory,
    collectWorldbookEntries,
    currentDailyStatus,
    collectSettings,
    getAvatarState,
    listCharactersForBackup: listCharacters,
    readMediaBytes,
  };
}

/** Primary user-facing export: sealed .nyra archive. */
async function exportNyraBackup(options = {}) {
  return buildNyraArchive(getNyraExportDeps(), {
    passphrase: options.passphrase ?? "",
    includeMedia: options.includeMedia !== false,
  });
}

async function exportFullBackupZip() {
  return buildFullBackupZip(getNyraExportDeps());
}

async function exportFullBackupZipNoMedia() {
  return buildFullBackupZip(getNyraExportDeps(), { includeMedia: false });
}

function clearLocalAppEvents() {
  clearLocalModules(["appEvents"]);
}

function formatNyraPreviewText(preview) {
  if (!preview) return "";
  const lines = [
    t("appShell.backup.contains"),
    ``,
    t("appShell.backup.characters", { count: preview.characterCount || 0 }),
    t("appShell.backup.messages", { count: preview.messageCount || 0 }),
    t("appShell.backup.memories", { count: preview.memoryCount || 0 }),
    t("appShell.backup.media", { count: preview.mediaCount || 0 }),
    t("appShell.backup.books", { count: preview.bookCount || 0 }),
    t("appShell.backup.music", { count: preview.musicCount || 0 }),
    preview.hasSettings ? t("appShell.backup.settings") : "",
    ``,
    t("appShell.backup.createdAt", { value: preview.createdAt || "—" }),
    t("appShell.backup.version", { value: preview.appVersion || "—" }),
  ].filter((line, index, arr) => line !== "" || arr[index - 1] !== "");
  if (preview.warnings?.includes("legacy_format_migrated")) {
    lines.push("", t("appShell.backup.legacyUpgrade"));
  }
  if (preview.warnings?.some((w) => String(w).includes("stripped"))) {
    lines.push(t("appShell.backup.serverUnaffected"));
  }
  return lines.join("\n");
}

async function importNyraOrLegacyFile(file, opts = {}) {
  const name = String(file?.name || "").toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let input = bytes;
  if (name.endsWith(".json") || file.type === "application/json") {
    input = JSON.parse(new TextDecoder().decode(bytes));
  }
  const prepared = await prepareNyraImport(input, {
    fileName: file.name,
    passphrase: opts.passphrase ?? "",
  });
  const mode = opts.mode
    || (window.confirm(`${formatNyraPreviewText(prepared.preview)}\n\n确定：完全替换本地数据\n取消后再选「合并」`)
      ? "replace"
      : (window.confirm("改为合并到当前月栖？\n取消则中止导入。") ? "merge" : null));
  if (!mode) throw Object.assign(new Error("已取消导入。"), { code: "archive_cancelled" });
  const plan = buildImportPlan(prepared, mode, null);
  const handlers = {
    ...getRestoreHandlers(),
    exportLocalPayload,
    getAllRecords,
    readMediaBytes,
    afterCommit: async () => {
      await renderMemoryState();
      await loadChatHistory();
      refreshIcons?.();
    },
  };
  return commitNyraImport(plan, handlers);
}

async function uploadCloudBackup(state) {
  if (!state.token || state.token.startsWith("local-")) {
    throw new Error("offline account");
  }
  const built = await exportNyraBackup({ includeMedia: true });
  const result = await uploadNyraCloudArchive(state.token, built.bytes, {
    archiveId: built.archiveId,
    exportedAt: built.createdAt,
  });
  saveSyncPreferences({ lastSyncedAt: result.updatedAt });
  return result;
}

async function restoreCloudBackup(state) {
  const result = await restoreCloudThroughNyraPipeline(state.token, {
    ...getRestoreHandlers(),
    exportLocalPayload,
    getAllRecords,
    readMediaBytes,
    afterCommit: async () => {
      await renderMemoryState();
      await loadChatHistory();
    },
  }, { mode: "replace" });
  saveSyncPreferences({ lastSyncedAt: result.updatedAt || new Date().toISOString() });
  state.cloudMessage = `已从云端恢复：${formatLocalTime(result.updatedAt)}。`;
  saveEcosystemState(state);
  renderEcosystemState(state);
  return result;
}

function getRestoreHandlers() {
  return {
    writeLocalObject,
    localFallback,
    clearStore,
    storeRecord,
    normalizeMemory,
    saveEcosystemState,
    getEcosystemState,
    applyProfileState,
    renderLibraryState,
    renderWorldbookEntries,
    renderMemoryState,
    loadChatHistory,
    onDiarySettingsRestored: () => {
      applyDiaryScheduleToUi();
      applyDiaryStylePreferenceToUi();
      rescheduleDiary();
    },
    onPromptSettingsRestored: () => {
      applyPromptSettingsToUi();
    },
    applyAvatarState,
    onSyncSettingsRestored: () => {
      applySyncSettingsToUi();
    },
    onVoiceSettingsRestored: async () => {
      await applyVoiceConfigAsync();
      syncVoiceControlsVisibility();
    },
  };
}

const {
  getEcosystemState,
  saveEcosystemState,
  renderEcosystemState,
  logoutAccount,
  submitAuth,
  setAuthFormMode,
  setAuthFormType,
  syncAuthLegalConsent,
  sendAuthRegisterCode,
  changeProductMode,
  changeHostedTier,
  toggleLogin,
  checkForUpdate,
  wireUpdateLinks,
  triggerAutoSync,
  toggleCloudSave,
  openCommunityEntry,
} = createAccountController({
  localFallback,
  loginStateNodes,
  loginToggleButtons,
  cloudStateNodes,
  updateStateNodes,
  openUpdateButton,
  updateResult,
  cloudResult,
  scheduleCapabilityRefresh,
  restoreCloudBackup,
  uploadCloudBackup,
  translate: t,
});

installCreditsExhaustedDialog();
installSidebarCredits();
const billingPanel = mountBillingPanel(document.querySelector("[data-billing-account-panel]"), {
  locale: getLocale(),
  getToken: () => getEcosystemState().token,
  onSummary(summary) {
    const state = getEcosystemState();
    state.billingBalance = summary.balance;
    state.billingReserved = summary.reserved;
    state.memberSince = summary.memberSince;
    saveEcosystemState(state);
    writeProductAccess({ credits: summary.balance });
  },
});
window.addEventListener("yueqi:auth-changed", () => { void billingPanel.refresh(); });

async function buildDailyStatus(now = new Date()) {
  const sleepAt = sleepAtInput?.value || "03:00";
  const wakeAt = wakeAtInput?.value || "10:30";
  const weatherMode = weatherModeSelect?.value || "定位天气";
  const location = canonicalizeStatusLocation(locationInput?.value);
  const manualWeather = manualWeatherInput?.value || defaultProfile.status.manualWeather;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const asleep = isWithinSleepWindow(nowMinutes, sleepAt, wakeAt);
  const sleptHours = estimateSleptHours(nowMinutes, sleepAt, wakeAt);
  const yesterdayTone = await inferYesterdayTone(async () => {
    const records = (await getAllRecords("memories")).map(normalizeMemory);
    const charId = String(getChatFocus()?.characterId || getActiveCharacterId() || "").trim();
    if (!charId) return [];
    return filterRowsByCompanionScope(records, {
      companionId: charId,
      userId: "local",
      allowGlobal: false,
    });
  });
  const weather = await fetchWeather(location, weatherMode, manualWeather);
  const weatherMood = weather.condition === "rain" ? "安静" : weather.condition === "clear" ? "清醒" : "平静";
  const mood = asleep ? "浅眠" : yesterdayTone === "牵挂" ? "惦记" : weatherMood;
  const bpm = asleep ? 62 : mood === "惦记" ? 78 : mood === "清醒" ? 72 : 68;

  return {
    date: now.toISOString().slice(0, 10),
    sleepAt,
    wakeAt,
    asleep,
    sleepHours: Number(sleptHours.toFixed(1)),
    mood,
    bpm,
    weather,
    location,
    yesterdayTone,
    injectionEnabled: statusInjectionToggle?.checked !== false,
    updatedAt: now.toISOString(),
  };
}

function readDailyStatusForPreview() {
  const cached = currentDailyStatus || readLocalObject(localFallback.statusKey, null);
  if (cached) return cached;
  return {
    date: new Date().toISOString().slice(0, 10),
    sleepAt: "03:00",
    wakeAt: "10:30",
    asleep: false,
    sleepHours: 0,
    mood: "平静",
    bpm: 68,
    weather: { condition: "unknown", label: "" },
    location: "",
    yesterdayTone: "",
    injectionEnabled: false,
    updatedAt: "",
  };
}

async function fileDrawerAndRender(record) {
  const normalized = await fileDrawer(record);
  await renderMemoryState();
  triggerAutoSync();
  return normalized;
}

async function ingestMemoryAndRender(record) {
  return fileDrawerAndRender(record);
}

async function compilePrompt(query, opts = {}) {
  const focus = getChatFocus();
  const preview = opts.preview === true || opts.purpose === "debug_preview";
  const turnSnapshot = opts.turnSnapshot && typeof opts.turnSnapshot === "object"
    ? opts.turnSnapshot
    : null;
  // The immutable turn snapshot is authoritative; execution scope is the fallback.
  const frozenCharacterId = String(
    turnSnapshot?.speakerCharacterId
      || opts.characterId
      || opts.executionScope?.characterId
      || "",
  ).trim();
  const frozenSessionId = String(
    turnSnapshot?.sessionId
      || opts.sessionId
      || opts.executionScope?.sessionId
      || "",
  ).trim();
  let profileId = frozenCharacterId || focus.characterId || getActiveCharacterId();
  let groupRoster = "";
  const conversationKind = opts.conversationKind
    || opts.executionScope?.conversationKind
    || (focus.kind === "group" ? "group" : "dm");
  const participantIds = Array.isArray(opts.participantIds)
    ? opts.participantIds
    : (Array.isArray(turnSnapshot?.participants)
      ? turnSnapshot.participants
        .map((participant) => String(participant?.characterId || "").trim())
        .filter(Boolean)
    : (Array.isArray(opts.executionScope?.participantIds)
      ? opts.executionScope.participantIds
      : (focus.kind === "group" ? (focus.memberIds || []) : [])));
  const sessionId = frozenSessionId || getCurrentSessionId();
  if (conversationKind === "group") {
    const history = await getMessagesBySession(sessionId || focus.sessionId, 40);
    const speakerId = String(turnSnapshot?.speakerCharacterId || "").trim()
      || pickGroupSpeaker(query, participantIds, history);
    setLastGroupSpeakerId(speakerId);
    if (!frozenCharacterId) profileId = speakerId || profileId;
    groupRoster = buildGroupRosterBlock(participantIds, speakerId || profileId);
  } else {
    setLastGroupSpeakerId("");
  }
  return assemblePrompt({
    query,
    refreshDailyStatus: preview
      ? async () => readDailyStatusForPreview()
      : refreshDailyStatus,
    searchPalace,
    searchMemories,
    getAllRecords,
    characterRecord: getCharacterSync(profileId),
    collectExternalContext: () => collectExternalContext(query),
    sessionId,
    groupRoster,
    appId: opts.appId || (opts.purpose === "deskpet" ? "deskpet" : "pop"),
    characterId: profileId,
    purpose: opts.purpose || "chat",
    preview,
    presetId: turnSnapshot?.preset?.id || "",
    turnIntent: opts.turnIntent || (String(query || "").trim() ? "user_message" : "continue"),
    conversationKind,
    participantIds,
    capabilityRuntimeSnapshot: opts.capabilityRuntimeSnapshot || null,
    wakeUpBlock: preview ? "" : consumeWakeUpBlock(),
  });
}

async function buildCompanionDebugPreview(text) {
  const query = String(text || "").trim();
  const focus = getChatFocus();
  const characterId = String(focus?.characterId || getActiveCharacterId() || "").trim();
  const sessionId = String(getCurrentSessionId() || focus?.sessionId || "").trim();
  const conversationKind = focus?.kind === "group" ? "group" : "dm";
  const participantIds = conversationKind === "group" ? (focus?.memberIds || []) : [];
  const turnExecutionId = `debug-${Date.now().toString(36)}`;
  const scope = {
    turnExecutionId,
    userId: "local",
    characterId,
    companionId: characterId,
    relationshipId: characterId ? `relationship:${characterId}` : "",
    sessionId,
    conversationId: sessionId,
    conversationKind,
    participantIds,
    purpose: "debug_preview",
    appId: "pop",
  };

  const compiled = await compilePrompt(query, {
    turnIntent: "user_message",
    purpose: scope.purpose,
    appId: scope.appId,
    characterId,
    sessionId,
    conversationKind,
    participantIds,
    executionScope: scope,
    preview: true,
  });
  const understood = await understandTurn({
    text: query,
    turnId: turnExecutionId,
    snapshot: createTemporalSnapshotV1({ locale: getLocale() || "zh-CN" }),
    scope: {
      userId: scope.userId,
      companionId: characterId,
      relationshipId: scope.relationshipId,
      conversationId: sessionId,
    },
  });
  const proposals = understood?.understanding?.actionProposals || [];
  const dryRunDispatch = {
    ok: true,
    mode: "dry_run",
    executed: false,
    calendarWrite: false,
    results: proposals.map((proposal) => ({
      ok: true,
      executed: false,
      status: "dry_run_not_executed",
      proposalId: proposal.proposalId,
      capabilityId: proposal.capabilityId,
      operation: proposal.operation,
      risk: proposal.risk,
      exactEffect: proposal.exactEffect || proposal.title || "",
    })),
    pendingApproval: proposals.filter((proposal) => proposal.requiresApproval),
  };

  const messages = await buildModelMessages(compiled, query, sessionId);
  const actionContext = formatTurnActionContext({
    understanding: understood?.understanding || null,
    dispatch: dryRunDispatch,
  }, buildLanguageContext());
  if (actionContext) {
    const userIndex = messages.findLastIndex?.((item) => item.role === "user") ?? -1;
    messages.splice(userIndex >= 0 ? userIndex : messages.length, 0, {
      role: "system",
      content: actionContext,
      blockId: "runtime_context",
      provenance: "runtime.action_context",
    });
  }
  const profile = compiled?.contextEnvelope?.request?.profile || {};
  const finalized = finalizeModelRequest(messages, {
    totalContextTokens: profile.totalInputTokens || 8000,
    outputReserveTokens: profile.outputReserveTokens || 1800,
    providerMode: "preview",
  });
  const recall = classifyRecall(query);

  return {
    turnExecutionId,
    scope,
    route: { route: "chat", action: "debug_preview" },
    retrieval: compiled?.contextEnvelope?.trace || null,
    prompt: {
      contractVersion: compiled?.contractVersion || COMPANION_PROMPT_VERSION,
      authorityOrder: compiled?.authorityOrder || PROMPT_AUTHORITY_ORDER,
      turnIntent: "user_message",
      recall,
      recallDepth: recall.depth,
      recallReason: recall.reason,
      whyRecall: recall.whyRecall || recall.reason,
      turnExecutionId,
      characterId,
      characterName: compiled?.character?.name || "",
      runtimeCapabilities: compiled?.runtimeCapabilities || "",
      canonicalOrder: compiled?.canonical?.order || [],
      blocks: compiled?.inspector?.blocks || [],
      messages: finalized.messages,
      budget: finalized.ledger,
      preparedModelRequest: finalized.prepared,
    },
    understanding: understood?.understanding || null,
    capabilities: dryRunDispatch,
    model: {
      called: false,
      maxOutputTokens: finalized.maxOutputTokens,
      reason: "debug_preview_no_model_call",
    },
  };
}

function syncBookAnchorToLibrary(anchor) {
  if (!anchor?.excerpt || !bookList) return;
  const rows = Array.from(bookList.querySelectorAll(".book-row"));
  const row = rows.find((item) => (item.dataset.title || item.querySelector("[data-book-title]")?.textContent) === anchor.title)
    || rows[0];
  if (!row) return;
  row.dataset.excerpt = anchor.excerpt;
  row.dataset.chapter = anchor.chapter || "";
  const progressLabel = row.querySelector("[data-book-progress]");
  if (progressLabel && anchor.chapter) {
    if (!progressLabel.textContent || progressLabel.textContent === "待读" || progressLabel.textContent === "未读") {
      progressLabel.textContent = anchor.chapter;
    }
  }
  persistLibraryState();
}

function applyBookProgressToRow({ mediaId = "", title = "", scrollRatio = 0, progress = "", chapter = "" } = {}) {
  if (!bookList) return;
  const rows = Array.from(bookList.querySelectorAll(".book-row"));
  const row = rows.find((item) => (mediaId && item.dataset.mediaId === mediaId)
    || (item.dataset.title || item.querySelector("[data-book-title]")?.textContent) === title)
    || null;
  if (!row) return;
  row.dataset.scrollRatio = String(scrollRatio || 0);
  if (chapter) row.dataset.chapter = chapter;
  const progressLabel = row.querySelector("[data-book-progress]");
  if (progressLabel) progressLabel.textContent = progress || formatReadProgress(scrollRatio);
}

function getProactiveSchedulerDeps() {
  return {
    isFeatureEnabled,
    collectLibraryState,
    collectExternalGrants,
    collectCharacterProfile,
    collectProviderConfig,
    buildDiaryDeps,
    refreshDailyStatus,
    isWithinDnd,
    addMessage,
    ingestMemoryAndRender,
    showCompanionNotification,
    beginSummaryGeneration,
    isSummaryGenerationCurrent,
    updateSegmentSummary,
    getRuntimeState: () => companionRuntime?.getState() || {},
    getProactiveFrequency: () => loadProactiveWakePrefs().probability,
    getAnniversaryDate: () => collectProfileState().anniversaryDate,
    getActiveCharacterId,
  };
}

let summaryGeneration = 0;
let capabilityRefreshTimer = 0;

function beginSummaryGeneration() {
  summaryGeneration += 1;
  return summaryGeneration;
}

function isSummaryGenerationCurrent(token) {
  return token === summaryGeneration;
}

function writeSummaryPanel(status, compiled, segment = null, generation = null) {
  if (!summaryPanel || !isFeatureEnabled("summary")) return;
  if (generation != null && !isSummaryGenerationCurrent(generation)) return;
  lastSummaryCompiled = compiled;
  summaryPanel.innerHTML = formatSummaryPanel(status, compiled, segment);
}

function updateSegmentSummary({
  generation,
  status,
  segmentIndex,
  segmentTotal,
  segmentText,
  eventTitle,
} = {}) {
  if (!summaryPanel || !isFeatureEnabled("summary")) return;
  if (generation != null && !isSummaryGenerationCurrent(generation)) return;
  const compiled = {
    memories: [],
    worldbook: [],
    historyTurns: 0,
    palaceSkipped: true,
  };
  const text = eventTitle ? `「${eventTitle}」${segmentText || ""}` : segmentText;
  companionRuntime?.recordProactivePart({
    text,
    eventTitle,
    segmentIndex,
    segmentTotal,
    status: status || currentDailyStatus,
  });
  applyScene("proactive", { status: status || currentDailyStatus }).catch(() => {
    getAvatarActionPlayer()?.comfort?.();
  });
  summaryPanel.innerHTML = formatSummaryPanel(status || currentDailyStatus, compiled, {
    segmentIndex,
    segmentTotal,
    segmentText: text,
  });
}

function scheduleCapabilityRefresh(delayMs = 160) {
  window.clearTimeout(capabilityRefreshTimer);
  capabilityRefreshTimer = window.setTimeout(() => {
    refreshCapabilityStatus().catch(() => {});
  }, delayMs);
}

function refreshLifeContextStrip() {
  if (!lifeContextNode) return;
  const library = collectLibraryState();
  const grants = collectExternalGrants();
  const todayKey = formatDateKey(new Date());
  const eventsToday = eventsForDate(library.events || [], todayKey);
  lifeContextNode.textContent = buildLifeContextLine({
    nowPlaying,
    eventsToday,
    albumCount: (library.photos || []).length,
    grants,
  });
  try {
    const surface = getCompanionSurfaceModel({
      companionId: getActiveCharacterId(),
      surface: "app",
      locale: getLocale(),
    });
    if (surface?.fingerprint) {
      lifeContextNode.dataset.continuityFingerprint = String(surface.fingerprint);
    } else {
      delete lifeContextNode.dataset.continuityFingerprint;
    }
  } catch {
    delete lifeContextNode.dataset.continuityFingerprint;
  }
  companionRuntime?.updateLifeContext(lifeContextNode.textContent);
}

async function refreshCapabilityStatus() {
  if (!capabilityStatusNode) {
    refreshLifeContextStrip();
    return;
  }
  const config = collectProviderConfig();
  const modelConfigured = isModelConfigured(config);
  const voiceConfigured = isVoiceConfigured(collectVoiceConfig(voiceNodes));
  const grants = collectExternalGrants();
  const score = scoreCapabilities({
    modelConfigured,
    voiceConfigured,
    syncReady: isSyncReady(getEcosystemState(), getSyncPreferences()),
    grants,
  });
  const serverOnline = modelConfigured ? await checkServerHealth() : false;
  const label = resolveCapabilityLabel({
    modelConfigured,
    serverOnline,
    localOfflineSession: isLocalOfflineSession(),
  });
  capabilityStatusNode.textContent = formatCapabilityStatus(score, { text: t(label.key) });
  capabilityStatusNode.dataset.kind = label.kind;
  companionRuntime?.updateCapability({
    text: capabilityStatusNode.textContent,
    kind: label.kind,
    score,
  });
  refreshLifeContextStrip();
}

function renderDailyStatus(status) {
  currentDailyStatus = status;
  const moodLabel = labelMood(status.mood);
  const weatherLabel = isLivedDailyWeather(status.weather) ? formatWeatherDisplay(status.weather) : "";
  const sleepLabel = formatSleepDisplay(status);
  const toneLabel = labelTone(status.yesterdayTone);
  if (aiMoodNode) aiMoodNode.textContent = moodLabel;
  if (userWeatherNode) userWeatherNode.textContent = weatherLabel;
  if (aiSleepNode) aiSleepNode.textContent = sleepLabel;
  if (aiBpmNode) aiBpmNode.textContent = `${status.bpm}bpm`;
  if (roleStatusNode) {
    roleStatusNode.textContent = [moodLabel, weatherLabel, sleepLabel, `${status.bpm}bpm`].filter(Boolean).join(" · ");
  }
  if (statusPreview) {
    const locationLabel = isPlaceholderStatusLocation(status.location)
      ? ""
      : status.location;
    statusPreview.textContent = [
      formatAwakeState(status.asleep),
      `${status.sleepAt} ${t("status.sleep.sleepAt")} / ${status.wakeAt} ${t("status.sleep.wakeAt")}`,
      toneLabel ? `${t("status.sleep.yesterday")}: ${toneLabel}` : "",
      locationLabel,
      weatherLabel,
    ].filter(Boolean).join(" · ");
  }
  refreshLifeContextStrip();
  companionRuntime?.updateDailyStatus({
    ...status,
    mood: moodLabel,
    weather: { ...(status.weather || {}), label: weatherLabel },
    yesterdayTone: toneLabel,
  });
}

async function refreshDailyStatus(force = false) {
  const cached = readLocalObject(localFallback.statusKey);
  const today = new Date().toISOString().slice(0, 10);
  // A previous manual-weather preview must never survive after the user has
  // switched back to location mode. Rebuild that cache so the prompt receives
  // "weather unavailable" instead of an invented leftover such as rain 20°.
  const locateMode = /定位天气|locate/i.test(String(weatherModeSelect?.value || ""));
  const staleManualWeather = locateMode
    && String(cached?.weather?.source || "").toLowerCase() === "manual";
  const shouldRebuild = force || !cached || cached.date !== today || staleManualWeather;
  const next = shouldRebuild ? await buildDailyStatus() : cached;
  writeLocalObject(localFallback.statusKey, next);
  renderDailyStatus(next);
  return next;
}

function collectDailyStatusContext() {
  if (!currentDailyStatus || currentDailyStatus.injectionEnabled === false) return null;
  const weather = isLivedDailyWeather(currentDailyStatus.weather)
    ? currentDailyStatus.weather?.label || ""
    : "";
  const location = isPlaceholderStatusLocation(currentDailyStatus.location)
    ? ""
    : String(currentDailyStatus.location || "").trim();
  return {
    mood: currentDailyStatus.mood,
    asleep: currentDailyStatus.asleep,
    sleep: `${currentDailyStatus.sleepAt}-${currentDailyStatus.wakeAt}, slept ${currentDailyStatus.sleepHours}h`,
    ...(weather ? { weather } : {}),
    ...(location ? { location } : {}),
    ...(currentDailyStatus.yesterdayTone ? { yesterdayTone: currentDailyStatus.yesterdayTone } : {}),
  };
}

function collectCharacterProfile(characterId) {
  const id = String(characterId || "").trim() || getChatFocus().characterId || getActiveCharacterId();
  const fromStore = collectedProfileFromStore(id);
  if (fromStore) return fromStore;

  const fields = Array.from(document.querySelectorAll(".identity-editor .edit-field input, .identity-editor .edit-field select, .identity-editor .edit-field textarea"));
  return {
    name: fields[0]?.value || defaultProfile.fields[0] || t("character.fallbackName"),
    alias: fields[1]?.value || defaultProfile.fields[1] || t("character.fallbackAlias"),
    identity: fields[2]?.value || defaultProfile.fields[2] || "",
    model: fields[3]?.value || defaultProfile.fields[3] || "",
    base: fields[4]?.value || defaultProfile.fields[4],
    ranges: Array.from(document.querySelectorAll(".range-editor [data-range-value]")).map((range) => range.value),
    tokens: Array.from(tokenList?.querySelectorAll("button") || []).map((button) => button.textContent.replace("×", "").trim()).filter(Boolean),
  };
}

async function applyRuntimeTurn(turn = {}) {
  const actions = Array.isArray(turn.actions) ? turn.actions : [];
  const startAction = actions.find((item) => item?.at !== "end" && item?.id)?.id || "";
  const player = getAvatarActionPlayer();
  if (startAction && !["talking_default", "idle_default"].includes(startAction)) {
    await player?.play?.("reacting", { actionId: startAction, force: true });
    return;
  }
  if (turn.expression) {
    const expressionAction = await playExpression(turn.expression, turn.emotion || "");
    if (expressionAction) return;
  }
  await player?.talking?.();
}

function collectExternalContext(query = "") {
  const library = collectLibraryState();
  const grants = collectExternalGrants();
  const coords = parseCoordinates(locationInput?.value || currentDailyStatus?.location);
  const locationLabel = coords ? locationInput?.value || currentDailyStatus?.location : locationInput?.value;
  const photoRecall = matchPhotoRecall(query, library.photos || []);
  const contextGrants = grants;
  return buildExternalContext({
    grants: contextGrants,
    library: {
      ...library,
      selectedDay: calendarState.selectedDate ? { date: calendarState.selectedDate } : library.selectedDay,
    },
    query,
    locationLabel,
    nowPlaying,
    recentPlays: getRecentPlays(5),
    coReadAnchor: getCoReadAnchor(),
    photoRecall,
  });
}

function collectLibraryState() {
  const saved = readLocalObject(localFallback.libraryKey, null) || defaultLibrary;
  const live = phoneDataReadLibrary();
  const liveTracks = Array.isArray(live.tracks) ? live.tracks : [];
  const liveBooks = Array.isArray(live.books) ? live.books : [];
  const tracksFromDom = Array.from(trackList?.querySelectorAll(".track-row") || []).map((row) => {
    const id = row.dataset.trackId || "";
    const stored = liveTracks.find((t) => (id && t.id === id)
      || (row.dataset.mediaId && t.mediaId === row.dataset.mediaId))
      || null;
    // Rows are rendered from the store and only own their order, so the store
    // wins wherever the DOM snapshot could be stale — otherwise a persist
    // triggered mid-download rewinds cache progress or blanks a title.
    const title = String(row.dataset.title || stored?.title || "").trim()
      || STORED_DEFAULT_TRACK_TITLE;
    const playlist = canonicalizePlaylistName(row.dataset.playlist || stored?.playlist || "");
    const tags = inferTrackTags({
      title,
      playlist,
      mood: row.dataset.mood || "",
      genre: row.dataset.genre || "",
    });
    return {
      ...(stored || {}),
      id: id || stored?.id || "",
      title,
      playlist,
      mediaId: stored?.mediaId || row.dataset.mediaId || "",
      fileName: stored?.fileName || row.dataset.fileName || "",
      sourceUrl: stored?.sourceUrl || row.dataset.sourceUrl || "",
      artist: stored?.artist || row.dataset.artist || "",
      license: stored?.license || row.dataset.license || "",
      licenseUrl: stored?.licenseUrl || row.dataset.licenseUrl || "",
      builtin: Boolean(stored?.builtin) || row.dataset.builtin === "1",
      cacheState: stored?.cacheState || row.dataset.cacheState || "",
      cacheProgress: Number(stored?.cacheProgress ?? row.dataset.cacheProgress) || 0,
      cacheBytes: Number(stored?.cacheBytes ?? row.dataset.cacheBytes) || 0,
      mood: tags.mood,
      genre: tags.genre,
    };
  });
  const booksFromDom = Array.from(bookList?.querySelectorAll(".book-row") || []).map((row) => {
    const progress = row.querySelector("[data-book-progress]")?.textContent || "待读";
    const title = row.dataset.title || row.querySelector("[data-book-title]")?.textContent || "未命名书籍";
    const id = row.dataset.bookId || "";
    const prev = liveBooks.find((b) => (id && b.id === id)
      || (row.dataset.mediaId && b.mediaId === row.dataset.mediaId)
      || b.title === title)
      || null;
    return {
      ...(prev || {}),
      id: id || prev?.id || "",
      title,
      author: row.dataset.author || row.querySelector("[data-book-author]")?.textContent || "未知作者",
      progress,
      chapter: row.dataset.chapter || chapterFromProgress(progress),
      excerpt: row.dataset.excerpt || prev?.excerpt || "",
      synopsis: row.dataset.synopsis || prev?.synopsis || "",
      fileId: row.dataset.fileId || prev?.fileId || "",
      format: row.dataset.format || prev?.format || "",
      mediaId: row.dataset.mediaId || prev?.mediaId || "",
      bundledPath: row.dataset.bundledPath || prev?.bundledPath || "",
      builtin: row.dataset.builtin === "1" || Boolean(prev?.builtin),
      scrollRatio: Number(row.dataset.scrollRatio) || Number(prev?.scrollRatio) || 0,
    };
  });
  return {
    // If App DOM list is empty (panel not hydrated) keep phone-data shelf.
    tracks: tracksFromDom.length ? tracksFromDom : liveTracks,
    events: Array.from(eventList?.querySelectorAll(".event-row") || []).map((row) => {
      const title = row.dataset.title || row.querySelector("[data-event-title]")?.textContent || "新提醒";
      return {
        id: row.dataset.eventId || "",
        time: row.dataset.time || "21:00",
        title,
        prompt: row.dataset.prompt || "",
        mode: row.dataset.mode || "proactive_message",
        type: "generic",
        date: row.dataset.date || "",
      };
    }),
    photos: (() => {
      const photos = Array.isArray(live.photos) ? live.photos : [];
      if (photos.length) return photos;
      return Array.isArray(saved.photos) ? saved.photos : [];
    })(),
    photoGroups: (() => {
      const groups = Array.isArray(live.photoGroups) ? live.photoGroups : [];
      if (groups.length) return groups;
      return Array.isArray(saved.photoGroups) ? saved.photoGroups : [];
    })(),
    books: booksFromDom.length ? booksFromDom : liveBooks,
    grants: collectExternalGrants(),
    notificationSettings: {
      dndStart: dndStartInput?.value || saved.notificationSettings?.dndStart || "22:00",
      dndEnd: dndEndInput?.value || saved.notificationSettings?.dndEnd || "08:00",
    },
    selectedDay: calendarState.selectedDate ? { date: calendarState.selectedDate } : saved.selectedDay || null,
  };
}

function collectWorldbookEntries() {
  return Array.from(worldEntryList?.querySelectorAll(".world-entry") || []).map((entry, index) => {
    const selects = entry.querySelectorAll("select");
    const inputs = entry.querySelectorAll("input[type='text']");
    const range = entry.querySelector("[data-world-priority]") || entry.querySelector("input[type='range']");
    const enabled = entry.querySelector("[data-world-enabled]") || entry.querySelector("input[type='checkbox']");
    const categorySelect = entry.querySelector("[data-world-category]") || selects[0];
    const slotSelect = entry.querySelector("[data-world-slot]") || selects[1];
    return {
      id: entry.dataset.entryId || `world-${Date.now()}-${index}`,
      category: normalizeWorldCategory(getSelectedText(categorySelect)),
      title: entry.querySelector("[data-world-title]")?.value || inputs[0]?.value || "未命名条目",
      triggers: String(entry.querySelector("[data-world-triggers]")?.value || inputs[1]?.value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      injectSlot: slotSelect?.value || "world_context",
      content: entry.querySelector("[data-world-content]")?.value || entry.querySelector("textarea")?.value || "",
      priority: Number(range?.value || 6),
      enabled: enabled?.checked !== false,
      scopeApps: readScopeAppsFromEntry(entry),
    };
  });
}

function worldCategoryLabel(name) {
  const map = {
    氛围: "mePanels.worldbook.catAtmosphere",
    地点: "mePanels.worldbook.catPlace",
    人物: "mePanels.worldbook.catPeople",
    规则: "mePanels.worldbook.catRules",
  };
  return map[name] ? t(map[name]) : name;
}

function worldCategoryOptionsHtml(selected) {
  const current = normalizeWorldCategory(selected);
  return WORLD_ENTRY_CATEGORIES.map(
    (name) => `<option value="${escapeHtml(name)}"${name === current ? " selected" : ""}>${escapeHtml(worldCategoryLabel(name))}</option>`
  ).join("");
}

function syncWorldEntrySummary(entry) {
  if (!entry) return;
  const title = entry.querySelector("[data-world-title]")?.value?.trim() || t("mePanels.worldbook.unnamedEntry");
  const categorySelect = entry.querySelector("[data-world-category]");
  const category = worldCategoryLabel(categorySelect?.value || getSelectedText(categorySelect) || "");
  const triggers = String(entry.querySelector("[data-world-triggers]")?.value || "").trim();
  const priority = entry.querySelector("[data-world-priority]")?.value || "";
  const titleEl = entry.querySelector("[data-world-summary-title]");
  const metaEl = entry.querySelector("[data-world-summary-meta]");
  if (titleEl) titleEl.textContent = title;
  if (metaEl) {
    metaEl.textContent = [category, triggers, priority ? `权重 ${priority}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
}

function setWorldEntryOpen(entry, open) {
  if (!entry) return;
  entry.classList.toggle("is-open", open);
  const body = entry.querySelector(".world-entry__body");
  const fold = entry.querySelector("[data-world-fold]");
  if (body) body.hidden = !open;
  if (fold) fold.setAttribute("aria-expanded", String(open));
}

function createWorldEntry(entry = {}, opts = {}) {
  const article = document.createElement("article");
  article.className = "world-entry";
  article.dataset.entryId = entry.id || `world-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const priority = Number(entry.priority || 6);
  const category = normalizeWorldCategory(entry.category);
  const slot = entry.injectSlot || "world_context";
  const open = opts.open === true;
  article.innerHTML = `
    <div class="world-entry__bar">
      <button type="button" class="world-entry__fold" data-world-fold aria-expanded="${open}">
        <span class="world-entry__chevron" aria-hidden="true"></span>
        <span class="world-entry__summary-copy">
          <strong data-world-summary-title></strong>
          <small data-world-summary-meta></small>
        </span>
      </button>
      <label class="world-entry__enable">
        <input type="checkbox" data-world-enabled ${entry.enabled === false ? "" : "checked"} aria-label="${escapeHtml(t("mePanels.worldbook.enableAria"))}" />
      </label>
    </div>
    <div class="world-entry__body"${open ? "" : " hidden"}>
      <div class="entry-fields">
        <label><span>${escapeHtml(t("mePanels.worldbook.type"))}</span><select data-world-category>${worldCategoryOptionsHtml(category)}</select></label>
        <label><span>${escapeHtml(t("mePanels.worldbook.title"))}</span><input type="text" data-world-title /></label>
        <label><span>${escapeHtml(t("mePanels.worldbook.keywords"))}</span><input type="text" data-world-triggers placeholder="${escapeHtml(t("mePanels.worldbook.keywordsPlaceholder"))}" /></label>
        <label><span>${escapeHtml(t("mePanels.worldbook.writeTo"))}</span><select data-world-slot>
          <option value="world_context"${slot === "world_context" ? " selected" : ""}>${escapeHtml(t("mePanels.worldbook.catScene"))}</option>
          <option value="character_context"${slot === "character_context" ? " selected" : ""}>${escapeHtml(t("mePanels.worldbook.catCharacter"))}</option>
          <option value="reply_policy"${slot === "reply_policy" ? " selected" : ""}>${escapeHtml(t("mePanels.worldbook.catReply"))}</option>
        </select></label>
        ${worldbookScopeFieldsHtml(entry)}
      </div>
      <textarea rows="3" data-world-content></textarea>
      <footer>
        <label class="mini-toggle"><input type="range" min="1" max="10" value="${priority}" data-world-priority /><span data-world-priority-label>${escapeHtml(t("mePanels.worldbook.weight", { n: priority }))}</span></label>
        <button type="button" data-remove-entry><i data-lucide="trash-2"></i><span class="icon-fallback">⌫</span><span>${escapeHtml(t("mePanels.worldbook.delete"))}</span></button>
      </footer>
    </div>
  `;
  article.querySelector("[data-world-title]").value = entry.title || t("mePanels.worldbook.newEntry");
  article.querySelector("[data-world-triggers]").value = (entry.triggers || [t("mePanels.worldbook.defaultKeyword")]).join(", ");
  article.querySelector("[data-world-content]").value = entry.content || t("mePanels.worldbook.defaultBody");
  syncWorldEntrySummary(article);
  setWorldEntryOpen(article, open);
  const priorityInput = article.querySelector("[data-world-priority]");
  const priorityLabel = article.querySelector("[data-world-priority-label]");
  priorityInput?.addEventListener("input", () => {
    if (priorityLabel) priorityLabel.textContent = t("mePanels.worldbook.weight", { n: priorityInput.value });
    syncWorldEntrySummary(article);
  });
  article.querySelectorAll("[data-world-title], [data-world-triggers], [data-world-category]").forEach((field) => {
    field.addEventListener("input", () => syncWorldEntrySummary(article));
    field.addEventListener("change", () => syncWorldEntrySummary(article));
  });
  return article;
}

function renderWorldbookEntries(entries) {
  if (!worldEntryList) return;
  worldEntryList.innerHTML = "";
  entries.forEach((entry) => worldEntryList.append(createWorldEntry(entry)));
  refreshIcons();
}

async function persistWorldbookEntries() {
  const entries = collectWorldbookEntries();
  await clearStore("worldbook");
  await Promise.all(entries.map((entry) => storeRecord("worldbook", entry)));
  return entries;
}

function persistLibraryState() {
  writeLocalObject(localFallback.libraryKey, collectLibraryState());
  triggerAutoSync();
  scheduleCapabilityRefresh(220);
  refreshLifeContextStrip();
}

function getRagSearchOptions(overrides = {}) {
  const rag = getRagSettings();
  const companionId = String(
    overrides.companionId
      || overrides.characterId
      || getChatFocus()?.characterId
      || getActiveCharacterId()
      || "",
  ).trim();
  return {
    topK: overrides.topK ?? rag.topK,
    scope: overrides.scope ?? rag.scope,
    diaryStyle: overrides.diaryStyle ?? rag.diaryStyle,
    companionId,
    characterId: companionId,
  };
}

function applyRagSettingsToUi() {
  const rag = getRagSettings();
  if (ragTopKInput) {
    const allowed = ["2", "4", "6", "8", "12"];
    const top = String(rag.topK);
    ragTopKInput.value = allowed.includes(top) ? top : "4";
  }
  if (ragScopeSelect) ragScopeSelect.value = rag.scope;
  if (ragDiaryStyleSelect) {
    ragDiaryStyleSelect.value = rag.diaryStyle || "";
    ragDiaryStyleSelect.disabled = rag.scope !== "diary";
  }
  ["rag-topk", "rag-scope", "rag-diary-style"].forEach(refreshChoiceGroup);
}

async function storeMediaFile(file, kind) {
  const id = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let filePath = String(file?.nativePath || "").trim();
  let fallbackPreviewUrl = "";
  let persistenceFailed = false;
  if (!filePath) {
    try {
      filePath = await persistMediaFile(id, file);
    } catch (error) {
      // An OEM/WebView filesystem failure must not block a message that can
      // still be delivered inline. Keep the blob fallback for IndexedDB.
      console.warn("[yueqi.media] filesystem persistence failed; using record fallback", error);
      persistenceFailed = true;
    }
  }
  if (persistenceFailed && isNativePlatform() && String(file?.type || "").startsWith("image/")) {
    try {
      fallbackPreviewUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("preview_read_failed"));
        reader.readAsDataURL(file);
      });
    } catch {
      fallbackPreviewUrl = "";
    }
  }
  const text = kind === "book" ? await file.text() : "";
  const record = {
    id,
    kind,
    name: file.name,
    type: file.type,
    size: file.size,
    createdAt: new Date().toISOString(),
    filePath: filePath || "",
    blob: filePath ? null : (file instanceof Blob ? file : null),
    ...(fallbackPreviewUrl ? { previewUrl: fallbackPreviewUrl } : {}),
    ...(text ? { text } : {}),
  };
  await storeRecord("media", record);
  return record;
}

async function getMediaRecord(id) {
  if (!id) return null;
  const records = await getAllRecords("media");
  return records.find((record) => record.id === id) || null;
}

async function resolveMediaUrl(record) {
  if (typeof record?.previewUrl === "string" && record.previewUrl.startsWith("data:image/")) {
    return record.previewUrl;
  }
  if (record?.filePath) {
    const nativeUrl = await resolveNativeFileUrl(record.filePath);
    if (nativeUrl) return nativeUrl;
  }
  const blob = await readMediaBlob(record);
  if (!blob) return "";
  try {
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

let renderTrackRow = () => document.createElement("article");
let refreshTrackListChrome = () => {};
let renderEventRow = () => document.createElement("article");
let renderBookRow = () => document.createElement("article");
let openEventEditor = () => {};
let findEventRow = () => null;

function updateCompanionHeader(tabId) {
  if (!companionMemoryAction) return;
  companionMemoryAction.hidden = tabId !== "memory";
}

async function renderLibraryState(state = readLocalObject(localFallback.libraryKey, null) || defaultLibrary) {
  const migrated = {
    ...state,
    events: migrateEvents(state.events || defaultLibrary.events),
  };
  if (trackList) {
    trackList.innerHTML = "";
    state.tracks.forEach((track) => trackList.append(renderTrackRow(track)));
    refreshTrackListChrome();
  }
  if (eventList) {
    eventList.innerHTML = "";
    migrated.events
      .slice()
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
      .forEach((event) => eventList.append(renderEventRow(event)));
  }
  if (bookList) {
    bookList.innerHTML = "";
    (state.books || defaultLibrary.books || []).forEach((book) => bookList.append(renderBookRow(book)));
  }
  await appGallery?.refresh?.();
  // Builtin shelf rows are device resources. Do not promote an unread
  // excerpt into yueqi.coReadAnchor.v1 — that becomes「一起看」and the
  // model treats catalog copy as a lived shared reading session.
  applyExternalGrants(migrated.grants || defaultLibrary.grants);
  if (dndStartInput) dndStartInput.value = migrated.notificationSettings?.dndStart || defaultLibrary.notificationSettings.dndStart;
  if (dndEndInput) dndEndInput.value = migrated.notificationSettings?.dndEnd || defaultLibrary.notificationSettings.dndEnd;
  renderCalendarGrid();
  rescheduleProactiveScheduler();
  initTrackDrag(trackList, persistLibraryState);
  refreshIcons();
}

function collectExternalGrants() {
  return grantsForPrompt(readGrantsFromDom(), isFeatureEnabled("external"));
}

function applyExternalGrants(grants = {}) {
  applyGrantsToDom(grantsForPrompt(grants, isFeatureEnabled("external")));
}

function formatMemoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "今天";
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function formatDiaryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "今天";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function memorySourceLabel(source) {
  if (source === "diary.memory") return t("appShell.memorySources.diary");
  if (source === "chat.memory" || source === "chat") return t("appShell.memorySources.chat");
  if (source === "call.session") return t("appShell.memorySources.call");
  if (source === "profile") return t("appShell.memorySources.profile");
  if (source === "worldbook" || source === "worldbook.memory") return t("appShell.memorySources.worldbook");
  if (source === "system.proactive") return t("appShell.memorySources.proactive");
  if (source === "book.chunk") return t("appShell.memorySources.book");
  return t("appShell.memorySources.fragment");
}

function isNoiseMemory(record) {
  const text = String(record.rawText || "");
  if (/语音转写失败/.test(text)) return true;
  if (/请提醒我检查语音设置/.test(text)) return true;
  if (/发送了一帧画面/.test(text) && /共 0 轮|共 1 轮/.test(text) && text.length < 80) return true;
  return false;
}

function browsableMemories(records = []) {
  return records
    .filter((record) => !isNoiseMemory(record))
    .sort((a, b) => {
      const score = (record) => {
        if (record.source === "diary.memory") return 3;
        if (record.source === "call.session") return 2;
        if (record.source === "chat.memory") return 1;
        return 0;
      };
      const byType = score(b) - score(a);
      if (byType) return byType;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function memoryRecordTitle(record) {
  if (record.title) return record.title;
  const text = String(record.rawText || "");
  if (record.source === "call.session") {
    const line = text.split("\n").find(Boolean) || t("appShell.memorySources.call");
    return line.length > 22 ? `${line.slice(0, 22)}…` : line;
  }
  const firstSentence = text.split(/[。！？\n]/).find(Boolean) || memorySourceLabel(record.source);
  return firstSentence.length > 18 ? `${firstSentence.slice(0, 18)}…` : firstSentence;
}

function diaryTitle(record) {
  if (record.title) return record.title;
  const firstSentence = record.rawText.split(/[。！？\n]/).find(Boolean) || t("appShell.diary.untitled");
  return firstSentence.length > 18 ? `${firstSentence.slice(0, 18)}…` : firstSentence;
}

function getSelectedDiaryStyleId() {
  return getDiarySettings().style || "literary";
}

function resolveDiaryStyleIdForRecord(record) {
  return resolveDiaryStyleId(record, getSelectedDiaryStyleId());
}

function diaryStyleBadge(record) {
  const style = getDiaryStyle(resolveDiaryStyleIdForRecord(record));
  return `<span class="diary-style-badge">${style.emoji} ${style.label}</span>`;
}

function diaryTagsForStyle(styleId) {
  return getDiaryStyle(styleId).tags;
}

function buildDiaryDeps() {
  return {
    sessionId: getCurrentSessionId(),
    getMessagesBySession,
    getAllRecords,
    normalizeMemory,
    currentDailyStatus,
    collectProviderConfig,
    collectCharacterProfile,
  };
}

function fillDiaryStyleSelect(select, selectedId = getSelectedDiaryStyleId()) {
  if (!select) return;
  select.innerHTML = DIARY_STYLES.map(
    (style) => `<option value="${escapeHtml(style.id)}">${escapeHtml(getDiaryStyleLabel(style))}</option>`
  ).join("");
  select.value = selectedId;
}

function populateRagDiaryStyleFilter() {
  const select = document.querySelector("[data-rag-diary-style]");
  const chips = document.querySelector("[data-rag-diary-style-chips]");
  if (!select && !chips) return;
  const selected = select?.value ?? "";
  const options = [
    { value: "", label: t("mePanels.memory.scopeAll") },
    ...DIARY_STYLES.map((style) => ({ value: style.id, label: getDiaryStyleLabel(style) })),
  ];
  if (select) {
    select.innerHTML = options
      .map((opt) => `<option value="${escapeHtml(opt.value)}"${opt.value === selected ? " selected" : ""}>${escapeHtml(opt.label)}</option>`)
      .join("");
    if ([...select.options].some((opt) => opt.value === selected)) select.value = selected;
  }
  if (chips) {
    rebuildChoiceButtons(chips, options, { selected: select?.value ?? selected });
  }
  refreshChoiceGroup("rag-diary-style");
}

function populateDiaryStyleSelect(selectedId = getSelectedDiaryStyleId()) {
  fillDiaryStyleSelect(diaryStylePreference, selectedId);
  fillDiaryStyleSelect(diaryStyleSelect, selectedId);
  const chips = document.querySelector("[data-diary-style-chips]");
  if (chips) {
    rebuildChoiceButtons(
      chips,
      DIARY_STYLES.map((style) => ({ value: style.id, label: getDiaryStyleLabel(style) })),
      { selected: selectedId }
    );
  }
  refreshChoiceGroup("diary-style-pref");
  populateRagDiaryStyleFilter();
}

function applyDiaryStylePreferenceToUi() {
  populateDiaryStyleSelect(getSelectedDiaryStyleId());
}

function wireDiaryStylePreference() {
  diaryStylePreference?.addEventListener("change", () => {
    saveDiarySettings({ style: diaryStylePreference.value });
    populateDiaryStyleSelect(diaryStylePreference.value);
    rescheduleDiary();
  });
}

function applyDiaryScheduleToUi() {
  const settings = getDiarySettings();
  if (diaryScheduleEnabled) diaryScheduleEnabled.checked = settings.scheduleEnabled === true;
  if (diaryScheduleTime) {
    diaryScheduleTime.value = settings.scheduleTime || "23:00";
    diaryScheduleTime.disabled = !diaryScheduleEnabled?.checked;
  }
  if (diaryScheduleOverwrite) {
    diaryScheduleOverwrite.checked = settings.scheduleOverwrite !== false;
  }
}

function wireDiaryScheduleControls() {
  const persistSchedule = () => {
    saveDiarySettings({
      scheduleEnabled: diaryScheduleEnabled?.checked === true,
      scheduleTime: diaryScheduleTime?.value || "23:00",
      scheduleOverwrite: diaryScheduleOverwrite?.checked !== false,
    });
    applyDiaryScheduleToUi();
    rescheduleDiary();
  };

  diaryScheduleEnabled?.addEventListener("change", persistSchedule);
  diaryScheduleTime?.addEventListener("change", persistSchedule);
  diaryScheduleOverwrite?.addEventListener("change", persistSchedule);
}

async function runScheduledDiaryGenerate() {
  const settings = getDiarySettings();
  const diaryDay = todayDiaryDay();
  const companionId = String(getActiveCharacterId() || "").trim();
  const existing = await getDiaryForDay(diaryDay, companionId);
  if (existing && settings.scheduleOverwrite === false) {
    return { saved: false, reason: "exists_no_overwrite" };
  }

  const styleId = settings.style || getSelectedDiaryStyleId();
  const generated = await generateTodayDiaryContent(styleId);
  if (!generated?.ok || !generated.title || !generated.body) {
    console.warn("[yueqi.diary] scheduled generate skipped", generated?.reason || generated?.message);
    return {
      saved: false,
      reason: generated?.reason || generated?.message || "generate_failed",
      error: generated?.reason || generated?.message || "generate_failed",
    };
  }
  const saved = await saveDiary({
    id: existing?.id,
    title: generated.title,
    body: generated.body,
    styleId: generated.styleId || styleId,
    diaryDay,
    roleName: collectCharacterProfile().name,
    weight: 1.42,
    pinned: existing ? undefined : false,
    companionId,
    characterId: companionId,
  });
  const persisted = await getDiaryForDay(diaryDay, companionId);
  if (!persisted || String(persisted.id || "") !== String(saved?.id || existing?.id || "")) {
    return { saved: false, reason: "save_unconfirmed" };
  }
  await renderMemoryState();
  triggerAutoSync();
  refreshIcons();
  return { saved: true, diaryId: persisted.id };
}

function syncMemoryMasterToggle() {
  if (!memoryMasterToggle) return;
  const ragOn = isFeatureEnabled("memoryRag");
  const palaceOn = getPalaceSettings().enabled !== false;
  memoryMasterToggle.checked = ragOn && palaceOn;
}

function wireMemoryMasterToggle() {
  if (!memoryMasterToggle) return;
  syncMemoryMasterToggle();
  memoryMasterToggle.addEventListener("change", () => {
    const on = memoryMasterToggle.checked;
    const ragInput = document.querySelector("[data-settings-features] [data-feature-rag]");
    if (ragInput) {
      ragInput.checked = on;
      syncFeatureFlagsFromUi(ragInput);
    }
    if (palaceEnabledToggle) {
      palaceEnabledToggle.checked = on;
    }
    savePalaceSettings({ enabled: on });
    syncMemoryMasterToggle();
  });
}

async function generateTodayDiaryContent(styleId = getSelectedDiaryStyleId()) {
  return generateTodayDiary(styleId, buildDiaryDeps());
}

function renderDiaryBook(records) {
  const diaryRecords = (Array.isArray(records) ? records : [])
    .filter((record) => record?.source === "diary.memory");
  diaryBook.render(diaryRecords);
}

async function renderPalacePanel() {
  const status = await getPalaceStatus();
  const settings = getPalaceSettings();
  const kgPanel = document.querySelector("[data-palace-kg-panel]");
  const kgCount = document.querySelector("[data-palace-kg-count]");
  const mapLabel = document.querySelector("[data-palace-map-label]");

  if (palaceStats) {
    palaceStats.innerHTML = `
      <article><span>${escapeHtml(t("mePanels.memory.statRecallable"))}</span><strong>${status.drawers}</strong><small>${escapeHtml(t("mePanels.memory.unitItems"))}</small></article>
      <article><span>${escapeHtml(t("mePanels.memory.statPartitions"))}</span><strong>${status.wings}</strong><small>${escapeHtml(t("mePanels.memory.unitGroups"))}</small></article>
      <article><span>${escapeHtml(t("mePanels.memory.statClues"))}</span><strong>${status.kgFacts || 0}</strong><small>${escapeHtml(t("mePanels.memory.unitItems"))}</small></article>
    `;
  }

  if (palaceEnabledToggle) {
    palaceEnabledToggle.checked = settings.enabled !== false;
  }
  if (palaceRecallMode) {
    palaceRecallMode.value = settings.recallMode || "protocol";
  }
  refreshChoiceGroup("palace-recall");
  syncMemoryMasterToggle();

  if (palaceKgList) {
    const facts = await queryKg({});
    palaceKgList.innerHTML = "";
    if (kgCount) kgCount.textContent = facts.length ? t("mePanels.countItems", { n: facts.length }) : "";
    if (kgPanel) kgPanel.hidden = facts.length === 0;
    facts.slice(0, 12).forEach((fact) => {
      const item = document.createElement("article");
      item.className = "palace-kg-item";
      item.innerHTML = `
        <strong>${escapeHtml(fact.subject)}</strong>
        <span>${escapeHtml(fact.predicate)}: ${escapeHtml(fact.object)}</span>
        <small>${escapeHtml(fact.validFrom?.slice(0, 10) || t("mePanels.memory.recentlyUpdated"))}</small>
      `;
      palaceKgList.append(item);
    });
  }

  if (palaceBrowseRef.room) {
    if (mapLabel) mapLabel.hidden = true;
    await renderPalaceRoomDrawers(palaceBrowseRef.wing, palaceBrowseRef.room);
    return;
  }

  if (palaceBrowseRef.wing) {
    if (mapLabel) mapLabel.hidden = true;
    await renderPalaceRooms(palaceBrowseRef.wing);
    return;
  }

  if (mapLabel) mapLabel.hidden = false;
  await renderPalaceWings();
}

async function renderPalaceWings() {
  if (!palaceMap) return;
  const taxonomy = await getTaxonomy();
  palaceBrowseHead?.setAttribute("hidden", "");
  palaceDrawerList?.setAttribute("hidden", "");
  palaceMap.hidden = false;

  palaceMap.innerHTML = "";
  Object.entries(taxonomy).forEach(([wing, rooms]) => {
    const total = Object.values(rooms).reduce((sum, room) => sum + room.drawers, 0);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "palace-map-card";
    card.dataset.palaceWing = wing;
    card.innerHTML = `
      <span>${escapeHtml(palaceWingLabel(wing))}</span>
      <strong>${total}</strong>
      <small>${escapeHtml(palaceRoomSummary(rooms))}</small>
    `;
    palaceMap.append(card);
  });
}

async function renderPalaceRooms(wing) {
  if (!palaceMap) return;
  const rooms = await listRooms(wing);
  palaceBrowseHead?.removeAttribute("hidden");
  if (palaceBrowseTitle) palaceBrowseTitle.textContent = palaceWingLabel(wing);
  palaceDrawerList?.setAttribute("hidden", "");
  palaceMap.hidden = false;
  palaceMap.innerHTML = "";

  rooms.forEach((room) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "palace-map-card";
    card.dataset.palaceRoom = room.name;
    card.innerHTML = `
      <span>${escapeHtml(palaceRoomLabel(room.name))}</span>
      <strong>${Number(room.drawers) || 0}</strong>
      <small>${escapeHtml(t("mePanels.memory.unitMemories"))}</small>
    `;
    palaceMap.append(card);
  });
}

async function renderPalaceRoomDrawers(wing, room) {
  if (!palaceDrawerList) return;
  const drawers = await listDrawers({ wing, room, limit: 24 });
  palaceBrowseHead?.removeAttribute("hidden");
  if (palaceBrowseTitle) {
    palaceBrowseTitle.textContent = `${palaceWingLabel(wing)} · ${palaceRoomLabel(room)}`;
  }
  palaceMap.hidden = true;
  palaceDrawerList.hidden = false;
  palaceDrawerList.innerHTML = "";

  drawers.forEach((record) => {
    const item = document.createElement("article");
    item.className = "palace-drawer-item";
    const rawText = String(record.rawText || "");
    item.innerHTML = `
      <header>
        <strong>${escapeHtml(memoryRecordTitle(record))}</strong>
        <span>${escapeHtml(`${formatMemoryDate(record.createdAt)} · ${memorySourceLabel(record.source)}`)}</span>
      </header>
      <p>${escapeHtml(rawText.slice(0, 140))}${rawText.length > 140 ? "…" : ""}</p>
    `;
    palaceDrawerList.append(item);
  });

  if (!drawers.length) {
    palaceDrawerList.innerHTML = `<p class="palace-kg-empty">${escapeHtml(t("mePanels.memory.emptyDrawers"))}</p>`;
  }
}

function resetPalaceBrowse() {
  palaceBrowseRef.wing = "";
  palaceBrowseRef.room = "";
}

async function renderMemoryBrowser(records) {
  if (!memoryBrowser) return;
  const pool = browsableMemories(records);
  const query = memorySearchQuery.trim();
  const hits = query
    ? (
        await searchPalace(query, { topK: 12, force: true, ...getRagSearchOptions() })
      ).results.filter((record) => !isNoiseMemory(record))
    : pool.slice(0, 16);
  memoryBrowser.innerHTML = "";
  if (!hits.length) {
    memoryBrowser.innerHTML = `<p class="memory-browser-empty">${
      t(query ? "appShell.diary.noResults" : "appShell.diary.empty")
    }</p>`;
    return;
  }
  hits.forEach((record) => {
    const styleHint = record.source === "diary.memory"
      ? ` · ${getDiaryStyle(resolveDiaryStyleIdForRecord(record)).label}`
      : "";
    const rawText = String(record.rawText || "");
    const item = document.createElement("article");
    item.className = "memory-browser-item";
    item.innerHTML = `
      <header>
        <strong>${escapeHtml(memoryRecordTitle(record))}</strong>
        <span>${escapeHtml(`${formatMemoryDate(record.createdAt)} · ${memorySourceLabel(record.source)}${styleHint}`)}</span>
      </header>
      <p>${escapeHtml(rawText.slice(0, 120))}${rawText.length > 120 ? "…" : ""}</p>
      <footer>
        <button type="button" data-toggle-memory-pin="${escapeHtml(record.id)}">${t(record.pinned ? "appShell.diary.unpin" : "appShell.diary.pin")}</button>
        <button type="button" data-delete-memory="${escapeHtml(record.id)}">${t("common.delete")}</button>
      </footer>
    `;
    memoryBrowser.append(item);
  });
}

async function renderMemoryState() {
  const memories = (await getAllRecords("memories")).map(normalizeMemory);
  // The diary repository may be authoritative without duplicating full diary
  // rows into generic memories. The diary UI must read through the diary API.
  const diaryRecords = await listDiaries(getActiveCharacterId());
  const diaryCount = diaryRecords.length;
  const sessionMessageCount = await countMessagesBySession(getCurrentSessionId());
  const firstMemoryTime = memories.reduce((oldest, record) => {
    const time = new Date(record.createdAt).getTime();
    return Number.isNaN(time) ? oldest : Math.min(oldest, time);
  }, Date.now());
  const anniversaryDays = togetherDaysFromAnniversary(collectProfileState().anniversaryDate);
  const togetherDays = anniversaryDays ?? Math.max(1, Math.ceil((Date.now() - firstMemoryTime) / 86400000) + 1);
  if (messageTotal) messageTotal.textContent = String(sessionMessageCount);
  if (diaryTotal) diaryTotal.textContent = String(diaryCount);
  if (daysTotal) daysTotal.textContent = String(togetherDays);
  renderGallery(diaryRecords, { togetherDays });
  await renderPalacePanel();
  renderDiaryBook(diaryRecords);
  await renderMemoryBrowser(memories);
  if (storageStatus && !storageStatus.hasAttribute("hidden")) {
    const rag = getRagSettings();
    const palaceStatus = await getPalaceStatus();
    const searchable = memories.filter((record) => record.searchable).length;
    storageStatus.textContent = `${getPalaceSettings().enabled === false ? "记忆整理已暂停" : "记忆整理已开启"} · 可检索 ${searchable} 条 · 每次想起 ${rag.topK} 条 · 线索 ${palaceStatus.kgFacts || 0}`;
  }
}

async function openAppDiaryRecord(diaryId = "") {
  setPanel("companion");
  setCompanionSection("memory");
  await renderMemoryState();
  const id = String(diaryId || "").trim();
  if (!id) return false;
  const saved = await getDiaryById(id).catch(() => null);
  if (!saved) return false;
  const opened = diaryBook.openToDiaryId(saved.id);
  if (!opened) diaryBook.close?.();
  return opened;
}

function renderGallery(records, { togetherDays } = {}) {
  if (!memoryGallery) return;

  // Modern Memory tab: editorial gallery + week strip (App + Phone share createMemoryDiaryGallery).
  if (memoryDiaryGallery || memoryGallery.classList.contains("memory-layout--gallery")) {
    if (!memoryDiaryGallery) return;
    const diaryRecords = (Array.isArray(records) ? records : [])
      .filter((record) => record?.source === "diary.memory");
    memoryDiaryGallery.render(diaryRecords, { togetherDays });
    try {
      applyI18n(memoryGallery);
    } catch {
      /* ignore */
    }
    return;
  }

  // Legacy pinned-tile gallery (pre–memory-layout markup only).
  const pinned = records
    .filter((record) => record.source === "diary.memory" && record.pinned)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  memoryGallery.innerHTML = "";
  pinned.forEach((record) => {
    const item = document.createElement("article");
    item.dataset.diaryId = record.id;
    item.innerHTML = `<span>${escapeHtml(formatMemoryDate(record.createdAt))}</span><strong>${escapeHtml(record.rawText.slice(0, 34))}${record.rawText.length > 34 ? "。" : ""}</strong>`;
    item.addEventListener("click", () => diaryBook.openToDiaryId(record.id));
    memoryGallery.append(item);
  });
}

async function toggleDiaryPin(id) {
  await setDiaryPin(id);
  await renderMemoryState();
  triggerAutoSync();
  refreshIcons();
}

async function deleteDiary(id) {
  await deleteDiaryRecord(id);
  await renderMemoryState();
  triggerAutoSync();
  refreshIcons();
}

async function toggleMemoryPin(id) {
  const records = await getAllRecords("memories");
  const target = records.find((record) => record.id === id);
  if (!target) return;
  await updateMemory(id, { pinned: !target.pinned });
  await renderMemoryState();
  triggerAutoSync();
  refreshIcons();
}

async function seedLocalData() {
  const memories = await getAllRecords("memories");
  if (!memories.length) {
    await Promise.all(seedMemories.map((record) => storeRecord("memories", normalizeMemory(record))));
  } else {
    const existingIds = new Set(memories.map((record) => record.id));
    const missingSeeds = seedMemories.filter((record) => !existingIds.has(record.id));
    await Promise.all(missingSeeds.map((record) => storeRecord("memories", normalizeMemory(record))));
  }
  const worldbook = await getAllRecords("worldbook");
  if (!worldbook.length) {
    await Promise.all(seedWorldbook.map((entry) => storeRecord("worldbook", entry)));
    renderWorldbookEntries(seedWorldbook);
  } else {
    renderWorldbookEntries(worldbook);
  }
  await renderMemoryState();
}

async function applyLocationFromCoords(latitude, longitude) {
  if (!locationInput) return;
  const geo = await reverseGeocode(latitude, longitude);
  locationInput.value = geo.label;
  persistProfileState();
  await refreshDailyStatus(true);
}

async function requestLocationPermission() {
  if (!("geolocation" in navigator)) throw new Error("当前环境不支持定位。");
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  });
  await applyLocationFromCoords(position.coords.latitude, position.coords.longitude);
}

async function requestNotificationPermission() {
  await requestNotificationAccess();
}

function buildPermissionRequestHandlers(permissionId) {
  if (permissionId === "location") {
    return {
      onLocationGranted: async (coords) => {
        await applyLocationFromCoords(coords.latitude, coords.longitude);
      },
    };
  }
  if (permissionId === "notification") {
    return { requestNotification: requestNotificationPermission };
  }
  return {};
}

async function openFileImport(inputNode) {
  if (!inputNode) return;
  // File inputs are backed by the OS document/photo picker. The picker grants
  // access only to the selected item, so do not ask for broad storage or photo
  // library permission before opening it.
  inputNode.click();
}

function removeEditableItem(button, selector) {
  const item = button.closest(selector);
  if (!item) return;
  item.classList.add("is-removing");
  window.setTimeout(() => item.remove(), 180);
}

function addToken(text) {
  const value = text.trim();
  if (!value || !tokenList || !tokenInput) return;
  const button = document.createElement("button");
  button.type = "button";
  button.append(document.createTextNode(value));
  const icon = document.createElement("i");
  icon.dataset.lucide = "x";
  const fallback = document.createElement("span");
  fallback.className = "icon-fallback";
  fallback.textContent = "×";
  button.append(icon, fallback);
  tokenList.append(button);
  tokenInput.value = "";
  refreshIcons();
}

function builtinRestoreProfile() {
  return {
    ...defaultProfile,
    fields: [BUILTIN_NYRA_NAME, BUILTIN_NYRA_NAME, "", "", ""],
    promptSystem: BUILTIN_COMPANION_PROMPT_SYSTEM,
    promptDeveloper: "",
  };
}

function resetProfile() {
  const character = getCharacterSync(getActiveCharacterId());
  const isBuiltin = character?.id === BUILTIN_CHARACTER_ID || character?.source === "builtin";
  const restore = isBuiltin
    ? builtinRestoreProfile()
    : (character?.profile ? { ...defaultProfile, ...character.profile } : defaultProfile);
  applyProfileState(restore);
  syncAnniversaryDateDisplay();
  savePromptSettings({ budget: 1800, order: ["character", "worldbook", "memory", "daily", "external"] });
  applyPromptSettingsToUi();
  appCharacterEditor.discard();
  persistProfileState();
  void persistCharacterIdentityDraft().then(() => saveCharacterEditor());
  refreshPromptSummary();
  refreshIcons();
}

memoryBrowser?.addEventListener("click", async (event) => {
  const pinButton = event.target.closest("[data-toggle-memory-pin]");
  if (pinButton) {
    await toggleMemoryPin(pinButton.dataset.toggleMemoryPin);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-memory]");
  if (!deleteButton) return;
  if (!window.confirm(t("alerts.deleteMemory"))) return;
  await deleteMemory(deleteButton.dataset.deleteMemory);
  await renderMemoryState();
  triggerAutoSync();
  refreshIcons();
});

diaryGenerateButton?.addEventListener("click", (event) => {
  event.preventDefault();
  if (memoryDiaryGallery?.openCompose) {
    memoryDiaryGallery.openCompose({ sourceButton: diaryGenerateButton });
    return;
  }
  generateDiaryNow();
});

async function generateDiaryNow(opts = {}) {
  if (diaryGenerating) {
    notifyChatFeedback("日记正在生成，请稍等。", {
      tone: "neutral",
      source: "diary_generate",
    });
    return;
  }

  const diaryDay = opts.diaryDay || todayDiaryDay();
  const companionId = String(getActiveCharacterId() || "").trim();
  const existing = await getDiaryForDay(diaryDay, companionId);
  if (existing) {
    const overwrite = await confirmOverwriteDiary();
    if (!overwrite) return;
  }

  diaryGenerating = true;
  const styleId = opts.styleId || getSelectedDiaryStyleId();
  const sourceButton = opts.sourceButton || diaryGenerateButton;
  const label = sourceButton?.querySelector?.("span:last-child") || null;
  const previousLabel = label?.textContent;
  if (label) label.textContent = "生成中…";
  if (sourceButton && "disabled" in sourceButton) sourceButton.disabled = true;
  try {
    const generated = await generateTodayDiaryContent(styleId);
    if (!generated?.ok || !generated.title || !generated.body) {
      const message = generated?.message || "日记生成失败，未写入档案。";
      if (label) label.textContent = message;
      notifyChatFeedback(message, {
        tone: "danger",
        source: "diary_generate",
      });
      window.setTimeout(() => {
        if (label && previousLabel) label.textContent = previousLabel;
      }, 2800);
      return;
    }
    const savedResult = await saveDiary({
      id: existing?.id,
      title: generated.title,
      body: generated.body,
      styleId: generated.styleId || styleId,
      diaryDay,
      roleName: collectCharacterProfile().name,
      weight: 1.42,
      pinned: existing ? undefined : false,
      companionId,
      characterId: companionId,
    });
    // withImage is accepted by compose UI; cover generation is not wired yet.
    await renderMemoryState();
    const saved = await getDiaryForDay(diaryDay, companionId);
    if (!saved || String(saved.id || "") !== String(savedResult?.id || existing?.id || "")) {
      throw new Error("save_unconfirmed");
    }
    diaryBook.openToDiaryId(saved.id);
    document.dispatchEvent(new CustomEvent("yueqi:diary-changed", {
      detail: { action: "saved", id: saved.id, diaryDay },
    }));
    if (label) label.textContent = "已写入档案";
    notifyChatFeedback("日记已写入档案。", {
      tone: "success",
      source: "diary_generate",
    });
    window.setTimeout(() => {
      if (label && previousLabel) label.textContent = previousLabel;
    }, 2200);
    triggerAutoSync();
    refreshIcons();
  } catch (error) {
    if (label && previousLabel) label.textContent = previousLabel;
    notifyChatFeedback(`日记没有写入档案：${String(error?.message || "执行失败").slice(0, 160)}`, {
      tone: "danger",
      source: "diary_generate",
    });
    console.error(error);
  } finally {
    diaryGenerating = false;
    if (sourceButton && "disabled" in sourceButton) sourceButton.disabled = false;
  }
}

function openDiaryModal(record = null, draft = null) {
  if (!diaryModal) return;
  editingDiaryId = record?.id || "";
  const styleId = draft?.styleId || resolveDiaryStyleIdForRecord(record);
  populateDiaryStyleSelect(styleId);
  if (diaryTitleInput) diaryTitleInput.value = draft?.title || record?.title || "";
  if (diaryBodyInput) diaryBodyInput.value = draft?.rawText || record?.rawText || "";
  diaryModal.classList.add("is-open");
  diaryModal.setAttribute("aria-hidden", "false");
  diaryTitleInput?.focus();
}

function closeDiaryModal() {
  if (!diaryModal) return;
  editingDiaryId = "";
  diaryModal.classList.remove("is-open");
  diaryModal.setAttribute("aria-hidden", "true");
  if (diaryForm) diaryForm.reset();
}

addDiaryButton?.addEventListener("click", openDiaryModal);

diaryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = diaryTitleInput?.value.trim() || t("appShell.diary.untitled");
  const body = diaryBodyInput?.value.trim();
  if (!body) return;
  const styleId = diaryStyleSelect?.value || getSelectedDiaryStyleId();
  await saveDiary({
    id: editingDiaryId || undefined,
    title,
    body,
    styleId,
    diaryDay: todayDiaryDay(),
    roleName: collectCharacterProfile().name,
    weight: editingDiaryId ? undefined : 1.2,
    pinned: editingDiaryId ? undefined : false,
  });
  await renderMemoryState();
  closeDiaryModal();
  triggerAutoSync();
  refreshIcons();
});

diaryRegenerateButton?.addEventListener("click", async () => {
  if (diaryGenerating) return;
  diaryGenerating = true;
  const styleId = diaryStyleSelect?.value || getSelectedDiaryStyleId();
  const previousLabel = diaryRegenerateButton.textContent;
  diaryRegenerateButton.disabled = true;
  diaryRegenerateButton.textContent = "生成中…";
  try {
    const generated = await generateTodayDiaryContent(styleId);
    if (!generated?.ok || !generated.title || !generated.body) {
      window.alert?.(generated?.message || "日记生成失败，未写入模板内容。");
      return;
    }
    if (diaryTitleInput) diaryTitleInput.value = generated.title;
    if (diaryBodyInput) diaryBodyInput.value = generated.body;
  } finally {
    diaryGenerating = false;
    diaryRegenerateButton.disabled = false;
    diaryRegenerateButton.textContent = previousLabel;
  }
});

diaryStyleSelect?.addEventListener("change", () => {
  saveDiarySettings({ style: diaryStyleSelect.value });
  populateDiaryStyleSelect(diaryStyleSelect.value);
});

diaryModal?.querySelectorAll("[data-diary-close]").forEach((button) => {
  button.addEventListener("click", closeDiaryModal);
});

if (sessionSummaryModal) {
  bindSessionSummaryPicker(sessionSummaryModal, {
    collectProviderConfig,
    getCharacterId: () => String(getChatFocus()?.characterId || getActiveCharacterId() || "").trim(),
    getCharacterName: () => {
      const id = String(getChatFocus()?.characterId || getActiveCharacterId() || "").trim();
      const character = getCharacterSync(id);
      return character?.name || character?.alias || "";
    },
    fileDrawer: fileDrawerAndRender,
    onSaved: async () => {
      await renderMemoryState();
      window.setTimeout(() => closeSessionSummaryModal(sessionSummaryModal), 900);
    },
  });
  const openSummary = () => openSessionSummaryModal(sessionSummaryModal);
  document.querySelectorAll("[data-session-summary-open]").forEach((button) => {
    if (button.closest("[data-phone-root], .mini-phone, [data-phone-screen]")) return;
    button.addEventListener("click", openSummary);
  });
  sessionSummaryModal.querySelectorAll("[data-session-summary-close]").forEach((node) => {
    node.addEventListener("click", () => closeSessionSummaryModal(sessionSummaryModal));
  });
  window.addEventListener("yueqi:locale-changed", () => {
    sessionSummaryModal.refreshSessionSummary?.();
  });
}


// --- Panel wiring (X5-1) ---
const calendarApi = wireCalendarPanel({
  calendarState,
  calendarPrev,
  calendarNext,
  calendarHeading,
  calendarMonthLabel,
  calendarGrid,
  calendarDayPanel,
  calendarDayTitle,
  calendarDayEvents,
  addCalendarDayEventButton,
  eventList,
  collectLibraryState,
  persistLibraryState,
  renderEventRow: (...args) => renderEventRow(...args),
  openEventEditor: (...args) => openEventEditor(...args),
  findEventRow: (...args) => findEventRow(...args),
  rescheduleProactiveScheduler,
  refreshIcons,
});
renderCalendarGrid = calendarApi.renderCalendarGrid;

wireNavPanel({
  tabs,
  drawer,
  setPanel,
  refreshIcons,
  canCloseDrawer: () => allowLeaveCharacterEditor(),
  onExplore: () => {
    setAppMode("phone");
    window.dispatchEvent(new CustomEvent("yueqi.explore.navigate", { detail: { tab: "chat" } }));
  },
});
const apiWorkbench = wireApiWorkbench();

companionDebugConsole = mountCompanionDebugConsole(companionDebugRoot, {
  buildPreview: buildCompanionDebugPreview,
});

wireMePanel({
  exportDataButton,
  exportFullBackupButton,
  exportBackupNoMediaButton,
  clearLocalAppEventsButton,
  importDataButton,
  importDataInput,
  cloudRestoreButton,
  loginToggleButtons,
  checkUpdateButtons,
  cloudSaveButtons,
  communityButtons,
  exportLocalPayload,
  exportNyraBackup,
  exportFullBackupZip,
  exportFullBackupZipNoMedia,
  clearLocalAppEvents,
  downloadJson,
  downloadBackupZip,
  downloadNyraArchive,
  importNyraOrLegacyFile,
  t,
  restoreImportPayload,
  restoreFullBackupZip,
  getRestoreHandlers,
  triggerAutoSync,
  refreshIcons,
  getEcosystemState,
  saveEcosystemState,
  renderEcosystemState,
  restoreCloudBackup,
  renderMemoryState,
  toggleLogin,
  submitAuth,
  setAuthFormMode,
  setAuthFormType,
  syncAuthLegalConsent,
  sendAuthRegisterCode,
  logoutAccount,
  changeProductMode,
  changeHostedTier,
  checkForUpdate,
  toggleCloudSave,
  openCommunityEntry,
});

wireProfilePanel({
  sleepAtInput,
  wakeAtInput,
  locationInput,
  weatherModeSelect,
  manualWeatherInput,
  statusInjectionToggle,
  providerKind,
  providerBaseUrl,
  providerApiKey,
  providerModel,
  providerNodes,
  dndStartInput,
  dndEndInput,
  ragTopKInput,
  ragScopeSelect,
  ragDiaryStyleSelect,
  anniversaryDateInput,
  syncStrategySelect,
  promptSystemInput,
  promptDeveloperInput,
  promptBudgetSelect,
  promptOrderSelect,
  memorySearchInput,
  palaceRecallMode,
  palaceEnabledToggle,
  syncMemoryMasterToggle,
  palaceBrowseBack,
  palaceMap,
  palaceBrowseRef,
  tokenAddButton,
  tokenInput,
  tokenList,
  worldEntryList,
  addWorldEntryButton,
  resetProfileButton,
  compilePromptButton,
  promptPreview,
  testApiButton,
  apiResult,
  testVoiceButton,
  testVoiceRecordButton,
  testVoiceSttButton,
  voiceTestSample,
  voiceNodes,
  lastVoiceTestBlobRef,
  devSearchButton,
  devQueryInput,
  searchResult,
  syncMcpButton,
  persistProfileState,
  persistCharacterIdentityDraft,
  saveCharacterEditor,
  discardCharacterEditor,
  setCharacterEditorMode,
  syncRoleNameChrome,
  collectCharacterProfile,
  toggleManualWeatherField,
  refreshDailyStatus,
  persistProviderConfig,
  applyProviderPreset,
  persistLibraryState,
  rescheduleProactiveScheduler,
  saveRagSettings,
  applyRagSettingsToUi,
  renderMemoryState,
  saveSyncPreferences,
  applySyncSettingsToUi,
  renderEcosystemState,
  savePromptSettings,
  applyPromptSettingsToUi,
  savePalaceSettings,
  renderPalacePanel,
  resetPalaceBrowse,
  setMemorySearchQuery: (value) => { memorySearchQuery = value; },
  addToken,
  persistWorldbookEntries,
  createWorldEntry,
  setWorldEntryOpen,
  refreshIcons,
  resetProfile,
  compilePrompt: (query, opts = {}) => compilePrompt(query, {
    ...opts,
    preview: true,
    purpose: "debug_preview",
  }),
  formatCompiledPreview,
  renderProviderStatus,
  collectProviderConfig,
  callModel,
  persistVoiceConfig,
  renderVoiceStatus,
  synthesizeSpeech,
  collectVoiceConfig,
  playSpeech,
  runVoiceRecordTest,
  transcribeAudio,
  readGrantsFromDom,
  applyGrantsToDom,
  refreshPermissionUi,
  scheduleCapabilityRefresh,
  wirePermissionUi,
  buildPermissionRequestHandlers,
  releaseChannel,
  getEcosystemState,
  collectExternalGrants,
  safeFetch,
  searchPalace,
  memorySourceLabel,
  formatMemoryDate,
  removeEditableItem,
});

bindOriginMemoryEditor(document.querySelector(".identity-editor") || originMemoryEditorHost(), {
  onDirty: () => markOriginMemoriesDirty(),
});

const bookReader = createBookReader({
  getMediaRecord,
  readMediaBlob,
  setPanel,
  input,
  form,
  persistLibraryState,
  onProgressSaved: applyBookProgressToRow,
  onAnchorSaved: (anchor) => {
    syncBookAnchorToLibrary(anchor);
    refreshIcons();
  },
  refreshIcons,
});

const libraryApi = wireLibraryPanel({
  calendarState,
  trackList,
  eventList,
  bookList,
  addTrackButton,
  addEventButton,
  addBookButton,
  importBookButton,
  importIcsButton,
  trackFileInput,
  bookFileInput,
  icsFileInput,
  audioPlayer,
  audioToggle,
  nowTitle,
  nowSeek,
  coListenToggle,
  coListenTell,
  coListenSyncHint,
  coListenTabId,
  coListenState,
  persistLibraryState,
  renderCalendarGrid: () => renderCalendarGrid(),
  rescheduleProactiveScheduler,
  refreshIcons,
  openFileImport,
  removeEditableItem,
  storeMediaFile,
  storeRecord,
  getAllRecords,
  getMediaRecord,
  resolveMediaUrl,
  refreshCoListenUi,
  publishLocalCoListen,
  announceCoListenIfNeeded,
  syncCoListenFromAudio,
  applyExternalGrants,
  collectExternalGrants,
  renderMemoryState,
  scheduleCapabilityRefresh,
  refreshLifeContextStrip,
  setPanel,
  input,
  form,
  getNowPlaying: () => nowPlaying,
  setNowPlaying: (value) => { nowPlaying = value; },
  collectProviderConfig,
  readMediaBlob,
  bookReader,
});
renderTrackRow = libraryApi.renderTrackRow;
refreshTrackListChrome = libraryApi.refreshTrackListChrome;
renderEventRow = libraryApi.renderEventRow;
renderBookRow = libraryApi.renderBookRow;
openEventEditor = libraryApi.openEventEditor;
findEventRow = libraryApi.findEventRow;

function createSharedGalleryDeps({ onMutate } = {}) {
  const notify = () => {
    persistLibraryState();
    onMutate?.();
  };
  const companionId = () => String(getActiveCharacterId() || "").trim();
  const locale = () => (String(getLocale() || "").toLowerCase().startsWith("en") ? "en" : "zh");
  const isLockedGroup = (id) => (
    id === RELATIONSHIP_VIEW_ID
    || Object.values(VISUAL_GROUP_IDS).includes(id)
    || id === "pg-ai-studio"
    || isSurfaceGroupId(id)
  );

  async function hydratePhotos(photos = []) {
    return Promise.all((photos || []).map(async (photo) => {
      const record = photo.mediaId ? await getMediaRecord(photo.mediaId) : null;
      return {
        ...photo,
        url: record ? await resolveMediaUrl(record) : "",
      };
    }));
  }

  return {
    listGroups: async () => {
      const cid = companionId();
      // Ensure locked groups; only refresh assets already owned by this companion.
      ensureVisualMemoryGroups({ locale: locale() });
      if (cid) syncLibraryIntoVisualMemory(cid, { locale: locale() });
      const library = phoneDataReadLibrary();
      const allPhotos = await hydratePhotos(library.photos || []);
      const groups = listSemanticGalleryGroups({
        locale: locale(),
        companionId: cid,
      });
      return groups.map((group) => {
        if (group.id === RELATIONSHIP_VIEW_ID && cid) {
          const rel = listRelationshipVisuals(cid);
          const mediaIds = new Set(rel.map((a) => a.mediaId));
          return {
            ...group,
            photos: allPhotos.filter((photo) => mediaIds.has(photo.mediaId)),
          };
        }
        return {
          ...group,
          photos: allPhotos.filter((photo) => photo.groupId === group.id),
        };
      });
    },
    listPhotosInGroup: async (groupId) => {
      const cid = companionId();
      const library = phoneDataReadLibrary();
      if (groupId === RELATIONSHIP_VIEW_ID) {
        if (!cid) return [];
        const rel = listRelationshipVisuals(cid);
        const mediaIds = new Set(rel.map((a) => a.mediaId));
        return hydratePhotos((library.photos || []).filter((photo) => mediaIds.has(photo.mediaId)));
      }
      const photos = (library.photos || []).filter((photo) => photo.groupId === groupId);
      return hydratePhotos(photos);
    },
    createGroup: (name) => {
      const group = phoneDataCreatePhotoGroup(name);
      notify();
      return group;
    },
    renameGroup: (id, name) => {
      if (isLockedGroup(id)) return null;
      const group = phoneDataRenamePhotoGroup(id, name);
      notify();
      return group;
    },
    deleteGroup: (id) => {
      if (isLockedGroup(id)) return;
      phoneDataDeletePhotoGroup(id);
      notify();
    },
    addPhotosToGroup: async (groupId, files) => {
      if (groupId === RELATIONSHIP_VIEW_ID) return [];
      const list = Array.from(files || []);
      const cid = companionId();
      for (const file of list) {
        if (!file?.type?.startsWith("image/")) continue;
        const media = await storeMediaFile(file, "image");
        const title = String(file.name || "新图片").replace(/\.[^.]+$/, "").slice(0, 24) || "新图片";
        const photo = phoneDataAddPhotoToGroup(groupId, {
          title,
          tone: ["rose", "green", "blue", "gold"][Math.floor(Math.random() * 4)],
          mediaId: media.id,
          summary: "",
          companionId: cid,
        });
        if (photo && cid) {
          const ns = namespaceForGroupId(groupId) || "life";
          const surface = surfaceForGroupId(groupId);
          registerLibraryPhotoAsVisual(photo, {
            companionId: cid,
            sourceType: "user_import",
            kind: surface ? kindForSurfaceSave(surface) : undefined,
            significance: "saved",
            qaStatus: ns === "identity" ? "pending" : "n/a",
            overwriteQa: true,
          });
        }
      }
      applyExternalGrants({ ...collectExternalGrants(), album: true, 相册: true });
      notify();
      return phoneDataListPhotos(groupId);
    },
    removePhoto: (id) => {
      const library = phoneDataReadLibrary();
      const photo = (library.photos || []).find((row) => row.id === id);
      phoneDataRemovePhoto(id);
      if (photo) {
        removeVisualAssetsForPhoto({
          companionId: companionId() || photo.companionId || "",
          libraryPhotoId: photo.id,
          mediaId: photo.mediaId,
        });
      }
      notify();
    },
    markIdentityQa: (mediaId, qaStatus) => {
      const cid = companionId();
      if (!cid || !mediaId) return null;
      return markVisualQaByMedia(cid, mediaId, qaStatus);
    },
  };
}

appGallery = mountPhoneGallery(appGalleryRoot, {
  ...createSharedGalleryDeps({
    onMutate: () => {
      /* phone gallery refreshes when opened */
    },
  }),
  onHome: () => {},
});
appGallery?.refresh?.();

function collectRuntimeCatalog() {
  const avatar = getAvatarState();
  return {
    actionIds: [...new Set([
      ...(avatar.actions || []).map((item) => item.id),
      ...XINGLI_REPLY_ACTION_IDS,
    ])],
    expressionIds: (avatar.expressions || []).map((item) => item.id),
  };
}

wireChatPanel({
  form,
  input,
  list,
  summaryMasters,
  composerAttachButton,
  composerAttachInput,
  composerMicButton,
  retrySttButtons,
  attachmentState,
  storeMediaFile,
  getMediaRecord,
  readMediaBlob,
  micState,
  getCompanionRuntime: () => companionRuntime,
  setSummaryVisible,
  refreshDailyStatus,
  addMessage,
  updateMessageDeliveryState,
  fileDrawerAndRender,
  compilePrompt,
  beginSummaryGeneration,
  writeSummaryPanel,
  isSummaryGenerationCurrent,
  attachSpeakButtonToMessage,
  refreshMessageSpeakButtons,
  collectProviderConfig,
  scheduleCapabilityRefresh,
  renderProviderStatus,
  triggerAutoSync,
  ensureMicrophonePermission,
  finishComposerRecording,
  transcribePendingRecording,
  pendingSttBlobRef,
  getRuntimeCatalog: collectRuntimeCatalog,
  applyRuntimeTurn,
  getSessionId: getCurrentSessionId,
});


async function bootstrapApp() {
  mountChatFeedbackCenter(document);
  wireMessageReadReceipts();
  wireMessageMenuDismiss();
  refreshIcons();
  try {
    ensureLanguagePrefsMigrated();
  } catch {
    /* optional */
  }
  if (isNativePlatform()) {
    await initNativeKv(Object.values(LOCAL_KEYS));
  }
  ensureLocalOfflineSession();
  wireLanguageUi({
    manageGate: false,
    onChange: () => {
      syncRoleNameChrome(collectCharacterProfile().name);
      refreshCoListenUi(nowPlaying);
      scheduleCapabilityRefresh();
      refreshIcons();
      // Rebuild weather/mood labels for the new UI language (cache may be Chinese).
      refreshDailyStatus(true).catch(() => {});
    },
  });
  wireChoiceGroups();
  applyTheme();
  applyFeatureFlagsToUi();
  wireFeatureFlagControls(() => {
    if (!isFeatureEnabled("summary")) setSummaryVisible(false);
    rescheduleProactiveScheduler();
    syncVoiceControlsVisibility();
    syncMemoryMasterToggle();
  });
  wireMemoryMasterToggle();
  applyProfileState();
  try {
    await openMemoryDb();
  } catch {
    // localStorage fallback handled in storage module
  }
  // Older builds removed chat rows but left their derived memory searchable.
  // Reconcile Conversation V2 tombstones after both localStorage and the memory
  // database are available; this is idempotent and must not block boot.
  repairDeletedMessageEvidence().catch((error) => {
    console.warn("[yueqi.memory] deleted-message repair skipped", error);
  });
  // Speech route discovery: whether the gateway offers cloud speech, and whether
  // this device has a usable system voice. Both only affect control labels.
  Promise.all([
    refreshHostedSpeechStatus(),
    refreshDeviceSpeechSupport(),
  ]).then(() => {
    refreshMessageSpeakButtons();
    syncVoiceControlsVisibility();
  }).catch(() => {});
  try {
    await ensureCharactersMigrated();
    await initChatFocusFromActive();
    const active = getCharacterSync(getActiveCharacterId());
    if (active?.profile) applyProfileState(active.profile);
    await openActiveCharacterEditor();
  } catch (error) {
    console.warn("ensureCharactersMigrated failed", error);
  }
  await ensureAvatarRuntime();
  companionRuntime = createCompanionRuntime({
    collectCharacterProfile,
    getCompanionCharacterId: getActiveCharacterId,
    refreshDailyStatus,
    resolveAvatarLookUrl,
    getAvatarLook: () => {
      const avatar = getAvatarState();
      const look = (avatar.looks || []).find((item) => item.id === avatar.currentLookId) || avatar.looks?.[0];
      return {
        lookId: look?.id || "",
        lookName: look?.name || "",
        mediaId: look?.mediaId || "",
        display: avatar.display || {},
      };
    },
    onAiSpeaking: ({ actionId, expression } = {}) => {
      if (expression) {
        Promise.resolve(playExpression(expression)).catch(() => {});
      }
      const player = getAvatarActionPlayer();
      if (actionId && !["talking_default", "idle_default"].includes(actionId)) {
        Promise.resolve(player?.play?.("reacting", { actionId })).catch(() => {});
        return;
      }
      player?.talking?.();
    },
    onAiIdle: () => getAvatarActionPlayer()?.idle?.(),
  });
  const economyUi = mountEconomyUi(economyUiRoot, { setPanel });
  document.addEventListener(COMPANION_CHANGED_EVENT, () => {
    if (document.body.dataset.activePanel === "economy") economyUi?.refresh?.();
  });
  document.addEventListener(COMPANION_CHANGED_EVENT, () => {
    companionRuntime?.refreshCharacter?.("companion-changed");
    const active = getCharacterSync(getActiveCharacterId());
    if (active?.name) syncRoleNameChrome(active.name);
    else syncRoleAvatarChrome(active);
    void openActiveCharacterEditor();
  });
  smallPhone = mountSmallPhone({
    root: smallPhoneRoot,
    runtime: companionRuntime,
    getRecentMessages: () => getMessagesBySession(getCurrentSessionId(), 80),
    sendMessage: (text, meta = {}) => submitExternalTurn({
      text,
      source: "small_phone",
      characterId: meta.characterId || getChatFocus()?.characterId || "",
      sessionId: meta.sessionId || "",
      stickerUrl: meta.stickerUrl || "",
      stickerId: meta.stickerId || "",
      location: meta.location || null,
      messageId: meta.messageId || "",
      replyTo: meta.replyTo || null,
      attachment: meta.attachment || null,
      routeIntent: meta.routeIntent || "",
    }),
    getPhotos: async () => Promise.all((collectLibraryState().photos || []).map(async (photo) => {
      const record = photo.mediaId ? await getMediaRecord(photo.mediaId) : null;
      return {
        ...photo,
        url: record ? await resolveMediaUrl(record) : "",
      };
    })),
    listPhotoGroups: () => createSharedGalleryDeps().listGroups(),
    listPhotosInGroup: (groupId) => createSharedGalleryDeps().listPhotosInGroup(groupId),
    createPhotoGroup: (name) => createSharedGalleryDeps({
      onMutate: () => appGallery?.refresh?.(),
    }).createGroup(name),
    renamePhotoGroup: (id, name) => createSharedGalleryDeps({
      onMutate: () => appGallery?.refresh?.(),
    }).renameGroup(id, name),
    deletePhotoGroup: (id) => createSharedGalleryDeps({
      onMutate: () => appGallery?.refresh?.(),
    }).deleteGroup(id),
    addPhotosToGroup: (groupId, files) => createSharedGalleryDeps({
      onMutate: () => appGallery?.refresh?.(),
    }).addPhotosToGroup(groupId, files),
    removePhoto: (id) => createSharedGalleryDeps({
      onMutate: () => appGallery?.refresh?.(),
    }).removePhoto(id),
    markIdentityQa: (mediaId, qaStatus) => createSharedGalleryDeps({
      onMutate: () => appGallery?.refresh?.(),
    }).markIdentityQa?.(mediaId, qaStatus),
    getDiaries: () => listDiaries(getActiveCharacterId()).then((items) => items.map((item) => ({
      ...item,
      body: item.rawText,
      date: item.diaryDay,
    }))),
    getNowPlaying: () => nowPlaying,
    setNowPlaying: (value) => { nowPlaying = value; },
    getMediaRecord,
    readMediaBlob,
    resolveMediaUrl,
    storeMediaFile,
    switchToAppMode: () => setAppMode("app"),
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
  });
  // Local QA scripts need the same mounted controller that native/navigation
  // events use. Keep it out of production builds; never expose provider data.
  if (import.meta.env.DEV || globalThis.__YUEQI_E2E_EXPERIENCE_STUB__ === true) {
    globalThis.__yueqiPhone = smallPhone;
  }
  wireExperienceModeSwitch();
  const onFirstLightComplete = async (result) => {
    try {
      await loadChatHistory();
      refreshIcons();
      if (result?.characterId) {
        const savedName = result?.character?.name
          || getCharacterSync(result.characterId)?.name
          || collectCharacterProfile().name;
        syncRoleNameChrome(savedName);
      }
      rescheduleProactiveScheduler();
    } catch (error) {
      console.warn("first light complete refresh failed", error);
    }
  };
  wireOnboardingWizard({
    setAppMode,
    onLocaleChange: () => {
      syncRoleNameChrome(collectCharacterProfile().name);
      refreshCoListenUi(nowPlaying);
      scheduleCapabilityRefresh();
      refreshIcons();
    },
    onComplete: () => {
      refreshIcons();
      try {
        renderEcosystemState();
      } catch {
        /* optional */
      }
      void startFirstLightIfNeeded({ onComplete: onFirstLightComplete });
    },
  });
  void startFirstLightIfNeeded({ onComplete: onFirstLightComplete });
  const restartFirstLight = async ({ open = true } = {}) => {
    const { resetFirstLight, saveFirstLightState } = await import("./first-light/state.js");
    const { resetFirstLightV2 } = await import("./first-light/controller-v2.js");
    resetFirstLight();
    resetFirstLightV2();
    // Stamp updatedAt so the next boot treats this as in progress instead of
    // re-completing it through the legacy migration path.
    saveFirstLightState({ stage: "WELCOME" });
    if (open) await startFirstLightIfNeeded({ onComplete: onFirstLightComplete, force: true });
  };
  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element
      ? event.target.closest("[data-reset-first-light]")
      : null;
    if (!trigger) return;
    if (!window.confirm(t("onboard.resetFirstLightConfirm"))) return;
    void restartFirstLight();
  });
  // Settings → 重新引导 replays the product gate, so First Light must follow it.
  window.addEventListener("yueqi:onboarding-full-reset", () => {
    void restartFirstLight({ open: false });
  });
  companionRuntime.setPanel(document.body.dataset.activePanel || "chat");
  companionRuntime.refreshLook?.("init-look");
  subscribeAvatarLook((look) => {
    companionRuntime.refreshLook?.("avatar-look", look);
  });
  const desktopPresence = wireDesktopPresence({
    companionRuntime,
    getActiveCharacterId,
    refreshIcons,
    onSubmitTurn: submitExternalTurn,
  });
  companionFloat = mountCompanionFloat({
    runtime: companionRuntime,
    onSubmitTurn: submitExternalTurn,
    onToggleScreenWatch: () => desktopPresence.toggleScreenWatch?.(),
    getScreenWatchState: () => desktopPresence.getScreenWatchState?.(),
    onOrbTap: () => getAvatarActionPlayer()?.react?.("react_tap"),
    onHide: () => desktopPresence.hideInAppFloat?.(),
  });
  wireOverlayPresence({
    companionRuntime,
    getActiveCharacterId,
    hideInAppFloat: () => {
      const float = document.querySelector("[data-companion-float]");
      if (!float) return;
      float.dataset.systemOverlay = "1";
      float.classList.add("is-system-overlay-hidden");
      float.classList.remove("is-open");
      float.setAttribute("aria-expanded", "false");
      const panel = float.querySelector("[data-companion-float-panel]");
      if (panel) panel.hidden = true;
    },
    showInAppFloat: () => {
      const float = document.querySelector("[data-companion-float]");
      if (!float) return;
      delete float.dataset.systemOverlay;
      // 用户主动隐藏后，系统悬浮降级不得擅自把浮宠再打开
      if (!isInAppFloatPreferredOn()) return;
      if (window.yueqiDesktop?.isDesktop) return;
      float.classList.remove("is-system-overlay-hidden");
      float.removeAttribute("aria-hidden");
    },
    refreshIcons,
    onQuickMessage: submitExternalTurn,
  });
  window.yueqiDesktop?.onPetTurn?.((payload) => {
    submitExternalTurn(payload).catch((error) => console.warn("pet turn failed", error));
  });
  // CP-AV6 — pet-v2 deepLink opens concrete route + records opened receipt in appEvents
  window.yueqiDesktop?.onPetV2DeepLink?.((payload) => {
    const href = String(payload?.deepLink || payload?.route?.deepLink || "").trim();
    if (!href || !payload?.ok) return;
    if (typeof smallPhone?.openDeepLink === "function") {
      setPanel("phone");
      smallPhone.setVisible?.(true);
      smallPhone.openDeepLink(href, {
        artifactId: payload.artifactId || payload.route?.artifactId || "",
      }).catch((error) => console.warn("[pet-v2] deepLink route failed", error));
    } else {
      // Router stub when phone shell not ready — still emit receipt below.
      console.info("[pet-v2] deepLink stub open", href);
    }
  });
  window.yueqiDesktop?.onPetV2OpenedReceipt?.((receipt) => {
    if (!receipt || receipt.type !== "artifact.opened") return;
    import("./world/app-events.js")
      .then(({ emitAppEvent }) => {
        emitAppEvent("artifact.opened", {
          artifactId: receipt.artifactId,
          deepLink: receipt.deepLink,
          at: receipt.at,
          source: "pet-v2",
        });
      })
      .catch((error) => console.warn("[pet-v2] opened receipt emit failed", error));
  });
  bindPetPresenceBridge({
    getActiveCharacterId,
    companionRuntime,
    onPresenceChange: () => {
      desktopPresence.pushState?.().catch(() => {});
    },
  });
  wireCustomContact();
  const companionPetRoot = document.querySelector('[data-panel="companion"]') || document;
  wirePetLibrary(companionPetRoot);
  wirePetSizeControl(companionPetRoot);
  if (window.yueqiDesktop?.isDesktop || !isInAppFloatPreferredOn()) {
    document.querySelector("[data-companion-float]")?.classList.add("is-system-overlay-hidden");
  }
  refreshCoListenUi(nowPlaying);
  applyRagSettingsToUi();
  applySyncSettingsToUi();
  applyDiaryStylePreferenceToUi();
  wireDiaryStylePreference();
  applyDiaryScheduleToUi();
  wireDiaryScheduleControls();
  initDiaryBookUi();
  toggleManualWeatherField(weatherModeSelect?.value);
  await applyProviderConfigAsync();
  await applyVoiceConfigAsync();
  syncVoiceControlsVisibility();
  apiWorkbench.refreshStatus();
  await refreshCapabilityStatus();
  wireCompanionPresence({
    list,
    setPanel,
    input,
    form,
    collectProviderConfig,
    collectProfileState,
    addMessage,
    fileDrawerAndRender,
    saveChatMessage,
    sessionId: getCurrentSessionId,
    getSessionId: getCurrentSessionId,
    getActiveCharacterId,
    refreshIcons,
  });
  wireUpdateLinks();
  initNativeBridge({
    onResume: async () => {
      const wakeUp = await buildWakeUpContext();
      setWakeUpContext(wakeUp);
      await refreshDailyStatus(true);
      companionRuntime?.update({ lastIntent: "刚刚回到前台，状态已更新" }, "app-resume");
      wakeCompanionLife("open_app", getProactiveSchedulerDeps(), { limits: LIFE_TICK_LIMITS });
      triggerAutoSync();
      rescheduleDiary();
      rescheduleProactiveScheduler();
      await renderPalacePanel();
      await syncDesktopArtifactSurfaces().catch(() => {});
      await desktopPresence.refresh().catch(() => {});
      await refreshPermissionUi(document).catch(() => {});
      // Forced updates must reappear if the user returns without installing.
      checkForUpdate({ prompt: true }).catch(() => {});
      refreshNotices().catch(() => {});
    },
    onDeepLink: (href, detail = {}) => {
      const economyProductPrefix = "yueqi://economy/product/";
      if (String(href || "").startsWith(economyProductPrefix)) {
        const productId = decodeURIComponent(String(href).slice(economyProductPrefix.length));
        setPanel("economy");
        document.dispatchEvent(new CustomEvent("yueqi:economy-open-product", { detail: { productId } }));
        return;
      }
      // Prefer phone-shell router (Today Inbox / Pop / diary book).
      if (document.body.dataset.appMode === "phone" && typeof smallPhone?.openDeepLink === "function") {
        setPanel("phone");
        smallPhone.setVisible?.(true);
        smallPhone.openDeepLink(href, detail).catch((error) => {
          console.warn("[yueqi.deeplink] phone route failed", error);
        });
        return;
      }
      import("./artifacts/index.js").then(async ({ openArtifactDeepLink }) => {
        await openArtifactDeepLink(href, {
          deliveryId: detail.deliveryId || "",
          openDiary: openAppDiaryRecord,
          openGallery: async (mediaId) => {
            setPanel("gallery");
            const id = String(mediaId || "").trim();
            if (id) await appGallery?.openToMediaId?.(id);
            else appGallery?.refresh?.();
          },
          openPhoneApp: (appId) => {
            if (appId === "diary") {
              setPanel("companion");
              setCompanionSection("memory");
            }
            else if (appId === "gallery") setPanel("gallery");
            else if (appId === "pop") setPanel("chat");
            else setPanel("phone");
          },
          focusPop: () => setPanel("chat"),
          onToast: (msg) => console.info("[yueqi.deeplink]", msg),
        });
      }).catch((error) => console.warn("[yueqi.deeplink] route failed", error));
    },
  });

  async function syncDesktopArtifactSurfaces() {
    const companionId = getChatFocus()?.characterId || getActiveCharacterId();
    try {
      const { flushPopDeliveries, flushSystemNotificationDeliveries } = await import("./artifacts/index.js");
      // Production delivery has one durable Conversation V2 projection. Injected
      // writers are reserved for tests/legacy adapters and would duplicate cards.
      await flushPopDeliveries({ companionId });
      await flushSystemNotificationDeliveries({ companionId });
    } catch (error) {
      console.warn("[yueqi.delivery] desktop flush failed", error);
    }
    try {
      await smallPhone?.refreshTodayInbox?.();
    } catch {
      /* phone optional */
    }
  }

  document.addEventListener("yueqi:diary-saved", () => {
    syncDesktopArtifactSurfaces().catch(() => {});
  });
  document.addEventListener("yueqi:capability-open", (event) => {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    const app = String(detail.openApp || "").trim();
    try {
      if (document.body.dataset.appMode === "phone" || app) {
        document.body.dataset.appMode = document.body.dataset.appMode || "phone";
        smallPhone?.setVisible?.(true);
        if (app) smallPhone?.setView?.(app);
      }
      if (detail.event) {
        document.dispatchEvent(new CustomEvent(String(detail.event), { detail }));
      }
    } catch (error) {
      console.warn("[yueqi.capability] desktop open failed", error);
    }
  });
  document.addEventListener("yueqi:selfie-created", () => {
    syncDesktopArtifactSurfaces().catch(() => {});
  });
  document.addEventListener("yueqi:gift-sent", () => {
    syncDesktopArtifactSurfaces().catch(() => {});
  });
  document.addEventListener("yueqi:experience-delivered", () => {
    syncDesktopArtifactSurfaces().catch(() => {});
  });
  document.addEventListener("yueqi:photo-saved", () => {
    syncDesktopArtifactSurfaces().catch(() => {});
  });
  document.addEventListener("yueqi:transfer-settled", () => {
    syncDesktopArtifactSurfaces().catch(() => {});
  });
  subscribeAppEvent("diary.created", () => {
    syncDesktopArtifactSurfaces().catch(() => {});
  });
  syncDesktopArtifactSurfaces().catch(() => {});
  try {
    // already opened early; keep call idempotent for native/sqlite path
    await openMemoryDb();
  } catch {
    // localStorage fallback handled in storage module
  }
  try {
    await ensureDmConversation(getChatFocus().characterId || getActiveCharacterId());
  } catch (error) {
    console.warn("ensureDmConversation failed", error);
  }
  try {
    await ensureBuiltinLibrary({ storeMediaFile });
  } catch (error) {
    console.warn("[yueqi.library] builtin seed failed", error);
  }
  await renderLibraryState(phoneDataReadLibrary());
  await refreshPermissionUi();
  try {
    await ensureBuiltinNyraInitialContent();
  } catch (error) {
    console.warn("[yueqi.nyra] initial worldbook/history seed failed", error);
  }
  await hydrateActiveOriginMemories();
  await seedLocalData();
  await loadChatHistory();
  document.addEventListener("yueqi:chat-focus-changed", () => {
    loadChatHistory().catch((error) => console.warn("reload chat on focus failed", error));
  });
  document.addEventListener("yueqi:chat-history-changed", () => {
    loadChatHistory().catch((error) => console.warn("reload chat after activity projection failed", error));
  });
  await refreshDailyStatus(true);
  // World / character UI load on first visit (X5-2 lazy chunks)
  if (document.body.dataset.activePanel === "world") {
    await ensureWorldPage();
  }
  if (document.body.dataset.activePanel === "me" || document.body.dataset.activePanel === "companion") {
    await ensureCharacterPage();
  } else {
    // Warm character helpers without blocking first paint when not on those panels
    ensureCharacterPage().catch(() => {});
  }
  setCompanionSection = wirePageSections({
    tabRoot: companionTabs,
    sectionRoot: companionPage,
    tabName: "companion-tab",
    sectionName: "companion-section",
    defaultTab: "memory",
    onChange: (tabId) => {
      if (tabId !== "memory") diaryBook.close?.();
      updateCompanionHeader(tabId);
    },
  });
  let currentSettingsRoute = "";
  const settingsRouter = wireSettingsRouter({
    root: document.querySelector("[data-panel='me']"),
    defaultRoute: "",
    beforeLeave: (from, to) => {
      const editorRoutes = new Set(["identity", "prompt"]);
      if (!editorRoutes.has(from) || editorRoutes.has(to)) return true;
      return allowLeaveCharacterEditor();
    },
    onChange: (route) => {
      currentSettingsRoute = route || "";
      const isAssist = route === "assist";
      assistNavButtons.forEach((button) => {
        button.classList.toggle("is-active", isAssist);
        if (isAssist) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      if (isAssist) {
        tabs.forEach((tab) => {
          tab.classList.remove("is-active");
          tab.removeAttribute("aria-current");
        });
        document.body.dataset.activePanel = "assist";
      } else if (document.body.dataset.activePanel === "assist") {
        document.body.dataset.activePanel = "me";
        tabs.forEach((tab) => {
          const active = tab.dataset.tab === "me";
          tab.classList.toggle("is-active", active);
          if (active) tab.setAttribute("aria-current", "page");
          else tab.removeAttribute("aria-current");
        });
      }
      if (route === "prompt" || route === "identity") refreshPromptSummary();
      refreshIcons?.();
    },
  });
  window.addEventListener("yueqi.settings.home", () => settingsRouter.setRoute(""));
  document.querySelector("[data-open-prompt-editor]")?.addEventListener("click", () => {
    settingsRouter.setRoute("prompt");
  });
  promptSystemInput?.addEventListener("input", refreshPromptSummary);
  promptDeveloperInput?.addEventListener("input", refreshPromptSummary);
  anniversaryDateInput?.addEventListener("change", syncAnniversaryDateDisplay);
  anniversaryDateInput?.addEventListener("input", syncAnniversaryDateDisplay);
  syncAnniversaryDateDisplay();

  function softToast(msg) {
    const node = document.querySelector("[data-prompt-preview]") || capabilityStatusNode;
    if (node) {
      const prev = node.textContent;
      const prevHidden = node.hidden;
      const next = String(msg || "");
      node.textContent = next;
      if ("hidden" in node) node.hidden = !next.trim();
      window.setTimeout(() => {
        if (node.textContent === next) {
          node.textContent = prev;
          if ("hidden" in node) node.hidden = prevHidden;
        }
      }, 2200);
    }
  }

  const presetsApi = mountPresetsManager(document.querySelector("[data-presets-mount]"), {
    onToast: softToast,
  });
  window.addEventListener("yueqi.assist.presets-changed", () => presetsApi?.refresh?.());

  const assistApi = createLazyStudioAssistMount(document.querySelector("[data-assist-mount]"), {
    collectProviderConfig,
    onToast: softToast,
    onNavigateSettings: (viewId) => settingsRouter.setRoute(viewId),
  });
  registerStudioAssist(assistApi);

  assistNavButtons.forEach((button) => {
    button.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("yueqi.assist.open", {
        detail: { context: "assist" },
      }));
      drawer?.classList.remove("is-open");
      drawer?.setAttribute("aria-hidden", "true");
    });
  });

  window.addEventListener("yueqi.assist.open", (event) => {
    if (document.body.dataset.appMode === "phone") {
      openStudioAssist({
        context: event.detail?.context || "assist",
        seed: event.detail?.seed || "",
      });
      return;
    }
    const context = event.detail?.context || currentSettingsRoute || "assist";
    setAppMode("app");
    setPanel("me");
    settingsRouter.setRoute("assist");
    openStudioAssist({ context, seed: event.detail?.seed || "" });
  });

  window.addEventListener("yueqi.assist.open-app", (event) => {
    const app = String(event.detail?.app || "home");
    setAppMode("phone");
    window.setTimeout(() => smallPhone?.setView?.(app), 0);
  });

  window.addEventListener("yueqi.assist.open-panel", (event) => {
    if (document.body.dataset.appMode === "phone") return;
    setAppMode("app");
    setPanel(String(event.detail?.panel || "chat"));
  });

  window.addEventListener("yueqi.assist.switch-mode", (event) => {
    // 小手机沉浸态不允许被助手切回 App 版
    if (document.body.dataset.appMode === "phone" && event.detail?.mode !== "phone") return;
    setAppMode(event.detail?.mode === "phone" ? "phone" : "app");
  });

  // User-initiated UI version switch (status bar / 设置 → 界面版本)
  window.addEventListener("yueqi.ui.switch-mode", (event) => {
    setAppMode(event.detail?.mode === "phone" ? "phone" : "app");
  });

  mountRegexManager(document.querySelector("[data-regex-mount]"), {
    onToast: softToast,
    onOpenAssist: (ctx = {}) => {
      setAppMode("app");
      setPanel("me");
      settingsRouter.setRoute("assist");
      openStudioAssist({ context: "regex", ...ctx });
    },
  });

  document.querySelector("[data-create-character]")?.addEventListener("click", () => {
    void (async () => {
      try {
        const created = await createCharacter({ name: t("character.newName") });
        setActiveCharacterId(created.id);
        if (created.profile) applyProfileState(created.profile);
        await openActiveCharacterEditor();
        softToast(t("character.createdToast"));
      } catch (error) {
        softToast(error?.message || t("character.createFailed"));
      }
    })();
  });

  document.querySelector("[data-import-character]")?.addEventListener("click", () => {
    openCharacterImportFlow({
      onToast: softToast,
      getEditingCharacterId: () => getActiveCharacterId(),
      onImported: async (character) => {
        if (character?.id && character.id === getActiveCharacterId() && character.profile) {
          applyProfileState(character.profile);
          await openActiveCharacterEditor();
        }
      },
      onPackImported: () => softToast("已导入角色视觉包"),
    });
  });

  document.querySelector("[data-open-qijian]")?.addEventListener("click", () => {
    openQijianDraftUi({
      characterId: getActiveCharacterId(),
      onToast: softToast,
      collectProfileState,
      applyProfileState,
      hasApiKey: async () => readProductAccess().mode === "subscription"
        || Boolean(await getSecret("provider.apiKey")),
      callModel: async (prompt) => {
        const config = collectProviderConfig();
        const result = await callModel(config, [
          { role: "system", content: "你是栖笺，只输出 JSON。" },
          { role: "user", content: prompt },
        ], {
          stream: false,
          businessPurpose: "worldbook.qijian_generate",
          capability: "chat",
        });
        return result.content || "";
      },
    });
  });

  document.querySelector("[data-disable-all-world]")?.addEventListener("click", async () => {
    worldEntryList?.querySelectorAll("[data-world-enabled]").forEach((box) => {
      box.checked = false;
    });
    await persistWorldbookEntries();
    softToast(t("mePanels.worldbook.disabledAllToast"));
  });

  enhanceWorldbookEntriesDom(worldEntryList || document);
  document.addEventListener("yueqi:open-settings-route", (event) => {
    if (document.body.dataset.appMode === "phone") {
      const route = event.detail?.route;
      if (route === "worldbook") smallPhone?.setView?.("worldbook");
      else if (route === "presets") smallPhone?.setView?.("presets");
      else if (route === "regex") smallPhone?.setView?.("regex");
      else if (route === "cloud" || route === "backup") smallPhone?.setView?.("backup");
      else if (route === "identity" || route === "behavior" || route === "theme") smallPhone?.setView?.("profile");
      else smallPhone?.setView?.("settings");
      return;
    }
    const route = event.detail?.route;
    if (!route) return;
    setAppMode("app");
    setPanel("me");
    window.setTimeout(() => {
      document.querySelector(`[data-settings-route='${route}']`)?.click();
    }, 80);
  });

  document.addEventListener("click", (event) => {
    const introNote = event.target.closest("[data-chat-intro-toggle]")?.closest("[data-chat-intro-note]");
    if (introNote && document.body.dataset.appMode !== "phone") {
      toggleChatIntroNote(introNote);
      return;
    }
    const introAction = event.target.closest("[data-chat-intro-action]")?.dataset?.chatIntroAction;
    if (
      introAction
      && document.body.dataset.appMode !== "phone"
      && event.target.closest(".chat-intro-note.is-app, .opening-setup-cta")
    ) {
      openAppChatIntroDestination(introAction);
      return;
    }
    const panel = event.target.closest("[data-open-app-panel]")?.dataset?.openAppPanel;
    if (!panel) return;
    if (document.body.dataset.appMode === "phone") return;
    setAppMode("app");
    setPanel(panel);
  });
  wirePageSections({
    tabRoot: studioTabs,
    sectionRoot: studioWorkspace,
    tabName: "studio-tab",
    sectionName: "studio-section",
    defaultTab: "looks",
  });
  wirePageSections({
    tabRoot: libraryTabs,
    sectionRoot: libraryPage,
    tabName: "library-tab",
    sectionName: "library-section",
    defaultTab: "music",
    onChange: (tabId) => {
      if (tabId === "album") appGallery?.refresh?.();
    },
  });
  ensureLocalOfflineSession();
  renderEcosystemState();
  renderProviderStatus();
  checkForUpdate().catch(() => {});
  startNoticeClient();

  initDiarySchedule({
    getSettings: getDiarySettings,
    runGenerate: runScheduledDiaryGenerate,
    onSaved: () => {
      syncDesktopArtifactSurfaces().catch(() => {});
    },
  });

  startProactiveScheduler(getProactiveSchedulerDeps());
  bindCompanionLifeWakeListeners(getProactiveSchedulerDeps());
  const onWakePrefsChange = () => {
    try {
      rescheduleProactiveScheduler();
    } catch {
      /* ignore */
    }
  };
  bindProactiveWakeControls(document, { onChange: onWakePrefsChange });
  document.querySelector("[data-proactive-wake-reset]")?.addEventListener("click", () => {
    resetProactiveWakeControls(document, { onChange: onWakePrefsChange });
  });

  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    const host = window.location.hostname;
    const isLocal = host === "127.0.0.1" || host === "localhost" || host === "[::1]";
    // Dev: never register SW — cache-first sw.js breaks Vite modules and causes blank/startup errors.
    if (!isLocal) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("yueqi:locale-changed", () => {
    renderEcosystemState();
    const seedGreeting = messageList?.querySelector("#seed-greeting p, [data-message-id='seed-greeting'] p");
    if (seedGreeting) seedGreeting.textContent = t("chat.greeting");
    if (currentDailyStatus && summaryPanel && isFeatureEnabled("summary")) {
      summaryPanel.innerHTML = formatSummaryPanel(currentDailyStatus, lastSummaryCompiled || {});
    }
    if (currentDailyStatus) renderDailyStatus(currentDailyStatus);
    else refreshDailyStatus(true).catch(() => {});
    document.querySelectorAll(".identity-editor .field-grid .edit-field input[type='text']").forEach((input, index) => {
      if (index > 1) return;
      const raw = String(input.value || "").trim();
      if (raw === "未命名" || raw === "Unnamed") input.value = t("character.unnamed");
    });
    const loc = document.querySelector("[data-status-location]");
    if (loc) {
      const raw = String(loc.value || "").trim();
      if (!raw || raw === "用户当前位置" || raw === "Current location") {
        loc.value = t("character.locationDefault");
      }
    }
    populateDiaryStyleSelect(getSelectedDiaryStyleId());
    fillProactiveWakeControls(document);
    refreshPermissionUi(document).catch(() => {});
    if (promptSystemInput && isCanonicalDefaultPrompt("system", promptSystemInput.value)) {
      promptSystemInput.value = resolvePromptForUi("system", promptSystemInput.value);
    }
    if (promptDeveloperInput && isCanonicalDefaultPrompt("developer", promptDeveloperInput.value)) {
      promptDeveloperInput.value = "";
    }
    refreshPromptSummary();
    syncAnniversaryDateDisplay();
    refreshCoListenUi?.();
    renderMemoryState?.().catch(() => {});
    desktopPresence?.refresh?.().catch(() => {});
  });
}

export { bootstrapApp };
