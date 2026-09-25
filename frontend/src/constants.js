import {
  BUILTIN_NYRA_CHARACTER_PROMPT,
} from "./characters/builtin-nyra-prompt.js";

export const MEMORY_DB = "yueqi-companion-local";
// Version 8 adds the repository stores used by First Light V2 and tool runs.
// Keeping these stores in IndexedDB avoids falling back to a shared legacy key
// during an onboarding commit.
export const MEMORY_DB_VERSION = 8;
/** Builtin companion seeded from legacy yueqi.profile.v1 */
export const BUILTIN_CHARACTER_ID = "char-xingli";
export const CHARACTERS_MIGRATED_KEY = "yueqi.characters.migrated.v1";
export const EMBEDDING_SIZE = 64;
export const APP_VERSION = String(import.meta.env?.VITE_APP_VERSION || "1.0.0");
/** Backup payload version. */
export const SYNC_PAYLOAD_VERSION = 2;
export const UPDATE_CHANNEL = "stable";
export const DEFAULT_SESSION_ID = "default-session";
export const CHAT_HISTORY_LIMIT = 20;
export const CHAT_TOKEN_BUDGET = 8000;

export const LOCAL_KEYS = {
  onboardingKey: "yueqi.onboarding.v1",
  appModeKey: "yueqi.app.mode",
  appModeChosenKey: "yueqi.app.mode.chosen",
  memoryKey: "yueqi.memories.v1",
  worldKey: "yueqi.worldbook.v1",
  statusKey: "yueqi.dailyStatus.v1",
  ecosystemKey: "yueqi.ecosystem.v1",
  profileKey: "yueqi.profile.v1",
  libraryKey: "yueqi.library.v1",
  providerKey: "yueqi.provider.v1",
  mediaKey: "yueqi.media.v1",
  resourcesKey: "yueqi.resources.v1",
  featuresKey: "yueqi.features.v1",
  /** Product cutover profile: legacy | internal_v1 | production_v1 (default legacy until C8) */
  cutoverProfileKey: "yueqi.cutover.profile.v1",
  /** C5 migration ledger (versioned runs: sourceSummary, result, quarantine, failures) */
  migrationLedgerKey: "yueqi.memory.migration.ledger.v1",
  weatherCacheKey: "yueqi.weather.cache.v1",
  chatMessagesKey: "yueqi.chat.messages.v1",
  palaceKgKey: "yueqi.palace.kg.v1",
  settingsKey: "yueqi.settings.v1",
  avatarKey: "yueqi.avatar.v1",
  voiceKey: "yueqi.voice.v1",
  recentPlaysKey: "yueqi.recentPlays.v1",
  coReadAnchorKey: "yueqi.coReadAnchor.v1",
  coListenStateKey: "yueqi.coListenState.v1",
  momentsCoverKey: "yueqi.moments.cover.v1",
  activeCharacterKey: "yueqi.activeCharacterId",
  charactersKey: "yueqi.characters.v1",
  walletKey: "yueqi.wallet.v1",
  shopOrdersKey: "yueqi.shop.orders.v1",
  shopInventoryKey: "yueqi.shop.inventory.v1",
  shopWishlistKey: "yueqi.shop.wishlist.v1",
  chatIntroNoteCollapsedKey: "yueqi.chat.introNoteCollapsed.v1",
};

export const RELEASE_CHANNEL = {
  owner: "azhimiao",
  repo: "Nyra-yueqi",
  endpoint: "",
  localEndpoint: "",
  serviceBase: "",
  fallbackVersion: "1.0.0",
  fallbackDownloadUrl: "https://download.memprism.com/nyra-latest.apk",
  fallbackNotes: "Nyra / 月栖 release channel.",
};

export const DEFAULT_FEATURES = {
  promptAssembly: true,
  worldbook: true,
  memoryRag: true,
  summary: true,
  proactive: true,
  external: true,
  voice: true,
  // Companion intelligence W0+ (off by default — no behavior change until enabled)
  temporalContextV1: false,
  turnUnderstandingV1: false,
  relationshipContinuityV1: false,
  palaceProjectionV1: false,
  webRetrievalV1: false,
  // Unified memory (off by default)
  // Note: palaceProjectionOnlyV1 is distinct from palaceProjectionV1 (companion-intel);
  // do not rename or alias them. 
  unifiedMemoryAdaptersV1: false,
  memoryProjectionOutboxV1: false,
  diaryRepositoryV1: false,
  palaceProjectionOnlyV1: false,
  contextGraphProjectionOnlyV1: false,
  singleBrokerRetrievalV1: false,
  unifiedMemoryForgetV1: false,
};

export const VOICE_TTS_PROVIDERS = ["ElevenLabs", "OpenAI", "Volcengine"];
export const VOICE_STT_PROVIDERS = ["OpenAI Whisper", "Volcengine"];

export const DEFAULT_VOICE = {
  ttsProvider: "ElevenLabs",
  ttsApiKey: "",
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  ttsModel: "eleven_multilingual_v2",
  openaiVoice: "alloy",
  volcSpeechAppId: "",
  volcSpeechAccessToken: "",
  volcSpeechVoiceType: "",
  hostedVoiceType: "",
  hostedVoiceByCharacterId: {},
  sttProvider: "OpenAI Whisper",
  sttApiKey: "",
  sttModel: "whisper-1",
  autoSpeak: false,
  phoneVoiceEnabled: true,
};

/** Fallback only when no Character Identity card exists — personality-neutral. */
export const DEFAULT_PROMPT_SYSTEM =
  "你是月栖中的数字角色。人格以角色卡为准；没有角色卡时保持克制连贯，不要套用默认温柔陪伴人格。不替用户做现实决定。";

export const DEFAULT_PROMPT_DEVELOPER =
  "优先使用角色卡、世界书、本地记忆与今日状态；外部上下文仅在授权后使用。深度思考只输出摘要，不暴露完整推理。回合机制由运行时单独注入，此处不重复。";

/**
 * Official builtin companion card. The legacy id stays stable for database
 * compatibility; no placeholder character identity is exposed to the model.
 */
export const BUILTIN_COMPANION_PROMPT_SYSTEM = BUILTIN_NYRA_CHARACTER_PROMPT;

// Runtime truth rules have their own block. The authored builtin Character
// Prompt is intentionally the only Nyra-specific model-facing supplement.
export const BUILTIN_COMPANION_PROMPT_DEVELOPER = "";

export const DEFAULT_INJECTION_ORDER = ["character", "worldbook", "memory", "daily", "external"];

/** 世界书条目类型：只描述「这条在讲什么」，不是触发方式 */
export const WORLD_ENTRY_CATEGORIES = ["氛围", "地点", "人物", "规则"];

export function normalizeWorldCategory(category) {
  const raw = String(category || "").trim();
  if (WORLD_ENTRY_CATEGORIES.includes(raw)) return raw;
  if (raw === "世界观" || raw === "触发词" || raw === "场景") return "氛围";
  if (raw === "地点场景") return "地点";
  if (raw === "角色" || raw === "人设") return "人物";
  if (raw === "边界" || raw === "回复规则") return "规则";
  return "氛围";
}

export const RANGE_LABELS = ["甜度", "主动频率", "占有欲", "现实提醒"];

/** Empty product baseline — no demo tracks / books / calendar seeds for ship. */
export const defaultLibrary = {
  tracks: [],
  events: [],
  photos: [],
  photoGroups: [],
  books: [],
  grants: {
    calendar: true,
    location: true,
    music: false,
    album: false,
    notification: true,
  },
  notificationSettings: {
    dndStart: "22:00",
    dndEnd: "08:00",
  },
  selectedDay: null,
};

export const defaultProfile = {
  fields: [
    "未命名",
    "",
    "",
    "",
    "",
  ],
  ranges: ["50", "50", "50", "50"],
  tokens: [],
  promptSystem: DEFAULT_PROMPT_SYSTEM,
  promptDeveloper: DEFAULT_PROMPT_DEVELOPER,
  anniversaryDate: "",
  status: {
    sleepAt: "03:00",
    wakeAt: "10:30",
    location: "用户当前位置",
    weatherMode: "定位天气",
    manualWeather: "",
    injectionEnabled: true,
  },
};

/** 不内置示范记忆 / 林星梨日记种子 */
export const seedMemories = [];

/** 不内置示范世界书 */
export const seedWorldbook = [];
