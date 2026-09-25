/**
 * 夜雨车站 — ExperiencePackage with THREE full opening snapshots (§7 / §14 W3).
 *
 * NOT a beat graph: openings are full initial snapshots only.
 * Premise / lore / agenda migrated from legacy rain-station content.
 * Legacy graph in `src/scenario/presets.js` remains migration / read-only / devDemo only.
 */

import { createExperiencePackage } from "../schema.js";
import { localizeExperiencePackage } from "../localize.js";

export const NIGHT_RAIN_PACKAGE_ID = "exp-night-rain-station";
export const NIGHT_RAIN_LEGACY_SCRIPT_ID = "script-rain-station";

const SHARED_LORE = [
  {
    id: "lore-rain-station-platform",
    title: "末班站台",
    keys: ["车站", "站台", "末班", "雨"],
    secondaryKeys: ["伞", "铁轨", "广播"],
    content:
      "雨夜末班站台：顶棚漏雨声、旧黄灯、时刻表偶尔误点。雨是第三角色。语气克制，留白。",
    scope: "experience",
    enabled: true,
    priority: 80,
    constant: true,
    matchMode: "any",
    insertPosition: "before_scenario",
    role: "system",
    sourcePackageId: NIGHT_RAIN_PACKAGE_ID,
  },
  {
    id: "lore-rain-umbrella",
    title: "一把伞",
    keys: ["伞", "靠近", "挤"],
    content: "现场往往只有一把伞。把伞柄偏近是关心，不是强制剧情节点。",
    scope: "experience",
    enabled: true,
    priority: 60,
    constant: false,
    matchMode: "any",
    insertPosition: "after_scenario",
    role: "system",
    sourcePackageId: NIGHT_RAIN_PACKAGE_ID,
  },
  {
    id: "lore-rain-delay",
    title: "误点广播",
    keys: ["误点", "多久", "车", "广播"],
    content: "广播含糊，误点是常态。时间被拉长，对话可以慢慢发生。",
    scope: "experience",
    enabled: true,
    priority: 50,
    constant: false,
    matchMode: "any",
    insertPosition: "after_scenario",
    role: "system",
    sourcePackageId: NIGHT_RAIN_PACKAGE_ID,
  },
];

/**
 * @returns {ReturnType<typeof createExperiencePackage>}
 */
export function createNightRainStationPackage() {
  return createExperiencePackage({
    schemaVersion: 1,
    id: NIGHT_RAIN_PACKAGE_ID,
    version: "1.0.0",
    title: "夜雨车站",
    subtitle: "末班车误点，雨里只剩一把伞和一句没说完的话。",
    synopsis:
      "雨夜站台的一场独立情景。角色和关系按开场重设，不接着日常陪伴聊天。三开场关系不同，后续不得强制合流。",
    cover: "/assets/scenes/night-rain-station/cover.png",
    tags: ["雨夜", "车站", "开放剧情"],
    contentRating: "teen",
    author: "月栖",
    compatibleCharacterRules: { requireSameCharacter: false },
    cast: {
      leadName: "对方",
      persona:
        "雨夜末班站台上的人。语气克制，留白。按所选开场关系存在：初遇的陌生人、争吵未解的恋人、或多年后重逢的旧识。不是用户日常聊天里的陪伴。",
    },
    playerRole: "与ta同撑一把伞的人",
    scenarioOverride:
      "末班车误点的雨夜站台。雨声是第三角色。禁止把用户拉回预制主线；承认用户真实行动并产生因果后续。禁止沿用陪伴开场白、日常称呼或月栖共同生活设定。",
    legacyScriptId: NIGHT_RAIN_LEGACY_SCRIPT_ID,
    openings: [
      {
        id: "opening-first-meeting",
        title: "初次相遇",
        teaser: "陌生人在末班车前共享一把伞；低信任、强观察感。",
        relationshipPremise:
          "你们几乎不认识。伞下距离很近，信任却很低。ta观察你，也等你先给出安全信号。",
        initialSceneState: {
          location: "雨夜末班站台",
          locationHint: "雨夜末班站台",
          timeOfDay: "night",
          weather: "rain",
          weatherHint: "rain",
          participants: ["user", "lead"],
          participantPositions: { user: "under_umbrella_edge", lead: "holding_umbrella" },
          relationshipPremise: "初次相遇的陌生人，共享一把伞",
          tensionBand: "low",
          emotionalTone: "observant",
          activeGoal: "在低信任中试探是否可以靠近",
          unresolvedThreads: ["ta为何把伞递过来半寸", "末班是否真的误点"],
          establishedFacts: ["雨很大", "站台灯黄旧", "只有一把伞"],
          inventoryHints: ["一把伞"],
          visualState: { backgroundId: "rain_station", sceneId: "night-rain-station" },
          safetyState: { contentRating: "teen" },
          tension: 1,
          flags: ["opening_first_meeting"],
          turnIndex: 0,
        },
        openingTurns: [
          {
            role: "assistant",
            narration: "雨丝斜过灯柱。有人把伞柄往你这边递了半寸。",
            dialogue: "……车还要多久？",
            performance: {
              emotion: "neutral",
              expressionId: "neutral",
              actionId: "greet",
              backgroundId: "rain_station",
            },
          },
        ],
        suggestedActions: [
          { text: "把伞往ta那边偏一点", intent: "care" },
          { text: "轻轻问ta是否等很久了", intent: "curious" },
          { text: "先不说话，听雨", intent: "pause" },
        ],
        initialPerformance: {
          emotion: "neutral",
          expressionId: "neutral",
          actionId: "greet",
          backgroundId: "rain_station",
          camera: { shot: "medium", transition: "soft" },
        },
        enabledLoreIds: [
          "lore-rain-station-platform",
          "lore-rain-umbrella",
          "lore-rain-delay",
        ],
        creatorNote: "低信任开场：观察感强，不急着告白。",
        directorAgenda: {
          softGoals: ["确认对方是否危险", "在雨里找到一点并肩的理由"],
          avoidances: ["突然亲密告白", "强迫用户按剧情树选项走"],
          tensionGuidance: "张力缓慢上升；用户拒绝或离开时立即承认。",
          unresolvedClues: ["伞为何只剩一把", "ta今晚为何独自等车"],
          endingHint: "可在用户明确告别或雨停后柔和建议收尾。",
          notes: "自由输入优先；快捷行动每轮由模型生成。",
        },
      },
      {
        id: "opening-lovers-quarrel",
        title: "恋人争吵后",
        teaser: "两人已是恋人，刚经历一次未解决争执；熟悉但紧张。",
        relationshipPremise:
          "你们是恋人。刚才有过一次没吵完的争执。熟悉彼此，但空气紧绷，谁也不愿先认错得太满。",
        initialSceneState: {
          location: "雨夜末班站台",
          locationHint: "雨夜末班站台",
          timeOfDay: "night",
          weather: "rain",
          weatherHint: "rain",
          participants: ["user", "lead"],
          participantPositions: { user: "arm_length", lead: "holding_umbrella_stiff" },
          relationshipPremise: "恋人，争吵未解",
          tensionBand: "rising",
          emotionalTone: "tense",
          activeGoal: "在不撕破脸的前提下把没说完的话说完或先冷静",
          unresolvedThreads: ["刚才争执的真正原因", "谁先道歉"],
          establishedFacts: ["你们是恋人", "刚吵过", "仍共撑一把伞"],
          inventoryHints: ["一把伞", "未发出的消息"],
          visualState: { backgroundId: "rain_station", sceneId: "night-rain-station" },
          safetyState: { contentRating: "teen" },
          tension: 2,
          flags: ["opening_lovers_quarrel", "unresolved_fight"],
          turnIndex: 0,
        },
        openingTurns: [
          {
            role: "assistant",
            narration: "伞沿滴水。ta没有看你，只把时刻表盯成模糊的光斑。",
            dialogue: "……你刚才那句，还作数吗。",
            performance: {
              emotion: "shy",
              expressionId: "shy",
              actionId: "shy_look_away",
              backgroundId: "rain_station",
            },
          },
        ],
        suggestedActions: [
          { text: "先承认自己语气重了", intent: "repair" },
          { text: "说清楚真正在意的点", intent: "clarify" },
          { text: "提议先并肩听一会儿雨", intent: "pause" },
        ],
        initialPerformance: {
          emotion: "shy",
          expressionId: "shy",
          actionId: "shy_look_away",
          backgroundId: "rain_station",
          camera: { shot: "close", transition: "soft" },
        },
        enabledLoreIds: ["lore-rain-station-platform", "lore-rain-umbrella"],
        creatorNote: "熟悉但紧张：不要用初次相遇的客套。",
        directorAgenda: {
          softGoals: ["被听见", "确认关系还在", "避免再次升级争吵"],
          avoidances: ["假装什么都没发生", "用固定和好台词糊弄"],
          tensionGuidance: "张力偏高；用户温柔可缓，用户离开则接受裂痕。",
          unresolvedClues: ["争执核心尚未说透"],
          endingHint: "和解、冷战搁置或分开等车都可以是合法收尾。",
          notes: "引用日常共同记忆时要当真。",
        },
      },
      {
        id: "opening-years-later",
        title: "多年后重逢",
        teaser: "有共同旧记忆但长期分别；克制、试探、怀旧。",
        relationshipPremise:
          "你们曾很熟，分开很久。旧地方还在。克制、试探、怀旧交织；不默认仍是恋人。",
        initialSceneState: {
          location: "雨夜末班站台",
          locationHint: "雨夜末班站台",
          timeOfDay: "night",
          weather: "rain",
          weatherHint: "rain",
          participants: ["user", "lead"],
          participantPositions: { user: "two_steps_away", lead: "under_eave" },
          relationshipPremise: "多年后重逢，旧识未断",
          tensionBand: "low",
          emotionalTone: "nostalgic",
          activeGoal: "确认对方是否还愿意被认出来",
          unresolvedThreads: ["分开这些年各自怎样", "今晚是否只是偶遇"],
          establishedFacts: ["这里是旧地方", "你们曾一起等过车", "已分别多年"],
          inventoryHints: ["旧车站记忆"],
          visualState: { backgroundId: "rain_station", sceneId: "night-rain-station" },
          safetyState: { contentRating: "teen" },
          tension: 1,
          flags: ["opening_years_later", "reunion"],
          turnIndex: 0,
        },
        openingTurns: [
          {
            role: "assistant",
            narration: "灯闪了一下。ta看见你，脚步顿住，像怕认错人。",
            dialogue: "……还是这里。你也误点了吗。",
            performance: {
              emotion: "warm",
              expressionId: "soft_smile",
              actionId: "thinking",
              backgroundId: "rain_station",
            },
          },
        ],
        suggestedActions: [
          { text: "叫出ta从前的昵称", intent: "recall" },
          { text: "说没想到会再见面", intent: "honest" },
          { text: "先问ta要不要共伞", intent: "care" },
        ],
        initialPerformance: {
          emotion: "warm",
          expressionId: "soft_smile",
          actionId: "thinking",
          backgroundId: "rain_station",
          camera: { shot: "wide", transition: "soft" },
        },
        enabledLoreIds: ["lore-rain-station-platform", "lore-rain-delay"],
        creatorNote: "怀旧克制：勿瞬间回到热恋口吻。",
        directorAgenda: {
          softGoals: ["确认记忆是否共享", "试探现在的距离"],
          avoidances: ["假装从未分开", "强制复合"],
          tensionGuidance: "缓慢升温或保持礼貌距离均可。",
          unresolvedClues: ["分开的真实原因是否要提起"],
          endingHint: "可以交换联系方式、沉默告别、或再站一会儿。",
          notes: "旧记忆必须与用户陈述一致，禁止随意重置。",
        },
      },
    ],
    embeddedLorebook: SHARED_LORE,
    directorPolicy: {
      styleHint: "语气克制，留白；雨声是第三角色。自由输入优先。",
      rules: [
        "禁止固定剧情树推进或台词合流",
        "承认用户具体行动并产生因果后续",
        "suggestedActions 每轮由模型生成，0–3 条自然语言",
        "ending.mayEnd 仅柔和提示，不强制谢幕",
        "至少稳定支持 30 轮",
      ],
      defaultAgenda: {
        softGoals: ["与用户共同度过这段雨夜"],
        avoidances: ["固定剧情树推进"],
        tensionGuidance: "随用户行动升降",
        unresolvedClues: [],
        endingHint: "用户可随时暂停或谢幕",
        notes: "",
      },
    },
    responseContract: {
      schemaVersion: 3,
      instructions:
        "只输出 JSON：按阅读顺序给出 contentBlocks（narration/dialogue/inner），并给出 performance、suggestedActions（无节点 id）、scenePatch（白名单）和 ending.mayEnd。",
    },
    initialAssets: {
      backgroundId: "rain_station",
      sceneId: "night-rain-station",
    },
    rendererProfile: "immersive-stage-v1",
    memoryPolicy: { requireUserAccept: true },
    permissions: {},
    migration: {
      fromLegacyScriptId: NIGHT_RAIN_LEGACY_SCRIPT_ID,
      note: "旧固定图仅供演示旗标路径；生产走本 ExperiencePackage。",
    },
  });
}

/** Frozen singleton for registerPackage — display fields follow app locale at read time via localizeExperiencePackage */
export function getNightRainStationPackage(locale) {
  return localizeExperiencePackage(createNightRainStationPackage(), locale);
}

export const NIGHT_RAIN_STATION_PACKAGE = getNightRainStationPackage();
