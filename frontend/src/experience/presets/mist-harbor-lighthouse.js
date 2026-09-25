/**
 * 雾港灯塔 — original ExperiencePackage sample for W6 Studio round-trip.
 * Distinct from the rain-station open sample: different premise, openings, lore, and asset ids.
 */

import { createExperiencePackage } from "../schema.js";
import { localizeExperiencePackage } from "../localize.js";

export const MIST_HARBOR_PACKAGE_ID = "exp-mist-harbor-lighthouse";

const SHARED_LORE = [
  {
    id: "lore-mist-harbor-fog",
    title: "薄雾航道",
    keys: ["雾", "航道", "码头", "潮"],
    secondaryKeys: ["灯塔", "汽笛", "锚"],
    content:
      "黎明前的渔港：雾贴着水面，灯塔间歇扫过。潮声比人声更早到。语气安静，留白给用户选择靠近或远望。",
    scope: "experience",
    enabled: true,
    priority: 80,
    constant: true,
    matchMode: "any",
    insertPosition: "before_scenario",
    role: "system",
    sourcePackageId: MIST_HARBOR_PACKAGE_ID,
  },
  {
    id: "lore-mist-lighthouse-keep",
    title: "灯塔值守",
    keys: ["灯塔", "值守", "值班", "光"],
    content: "ta偶尔替人值守灯塔。光圈扫过不算剧情节点，只是共同经历的节奏。",
    scope: "experience",
    enabled: true,
    priority: 55,
    constant: false,
    matchMode: "any",
    insertPosition: "after_scenario",
    role: "system",
    sourcePackageId: MIST_HARBOR_PACKAGE_ID,
  },
  {
    id: "lore-mist-tea-thermos",
    title: "温热的保温瓶",
    keys: ["茶", "保温瓶", "喝", "暖"],
    content: "码头常备一瓶不烫口的茶。递出去是关心，不是强制用户接受。",
    scope: "experience",
    enabled: true,
    priority: 45,
    constant: false,
    matchMode: "any",
    insertPosition: "after_scenario",
    role: "system",
    sourcePackageId: MIST_HARBOR_PACKAGE_ID,
  },
];

/**
 * @returns {ReturnType<typeof createExperiencePackage>}
 */
export function createMistHarborLighthousePackage() {
  return createExperiencePackage({
    schemaVersion: 1,
    id: MIST_HARBOR_PACKAGE_ID,
    version: "1.0.0",
    title: "雾港灯塔",
    subtitle: "潮声先到，灯塔后醒；你们可以一起值守，也可以只是路过。",
    synopsis:
      "黎明薄雾中的渔港灯塔。同一角色与用户共同经历一段可自由推进的开放情境。开场关系不同，后续不得强制合流。",
    cover: "/assets/scenes/mist-harbor-lighthouse/cover.png",
    tags: ["雾港", "灯塔", "开放剧情", "黎明"],
    contentRating: "teen",
    author: "月栖工坊样板",
    compatibleCharacterRules: { requireSameCharacter: false },
    cast: {
      leadName: "对方",
      persona: "雾港灯塔边的人。按开场关系重设，不是用户日常聊天里的陪伴。",
    },
    playerRole: "被潮声叫醒的同行者",
    scenarioOverride:
      "黎明雾港灯塔。禁止固定剧情树；承认用户真实行动并产生因果后续。灯塔光圈只是节奏，不是合流点。",
    openings: [
      {
        id: "opening-chance-meeting",
        title: "擦肩而过",
        teaser: "你路过码头，ta在雾里拧保温瓶盖；低熟识、可走可留。",
        relationshipPremise: "几乎不熟。雾把距离拉近，信任仍薄。",
        initialSceneState: {
          location: "雾港码头栈桥",
          locationHint: "雾港码头栈桥",
          timeOfDay: "dawn",
          weather: "mist",
          weatherHint: "mist",
          participants: ["user", "lead"],
          participantPositions: { user: "pier_edge", lead: "near_thermos" },
          relationshipPremise: "擦肩而过的陌生人",
          tensionBand: "low",
          emotionalTone: "quiet",
          activeGoal: "确认彼此是否愿意停一停",
          unresolvedThreads: ["ta为何值守到黎明", "雾何时散"],
          establishedFacts: ["雾很浓", "灯塔间歇扫光", "保温瓶还温热"],
          inventoryHints: ["保温瓶"],
          visualState: { backgroundId: "mist_harbor", sceneId: "mist-harbor-lighthouse" },
          safetyState: { contentRating: "teen" },
          tension: 1,
          flags: ["opening_chance_meeting"],
          turnIndex: 0,
        },
        openingTurns: [
          {
            role: "assistant",
            narration: "雾把栈桥尽头抹成灰白。ta拧开瓶盖，热气很快散掉。",
            dialogue: "……路过？灯塔那边风更小一点。",
            performance: {
              emotion: "calm",
              expressionId: "soft_gaze",
              actionId: "greet",
              backgroundId: "mist_harbor",
            },
          },
        ],
        suggestedActions: [
          { text: "接过ta递来的杯盖", intent: "accept_warmth" },
          { text: "只是问雾何时散", intent: "ask_weather" },
          { text: "说自己还有船要赶", intent: "leave_soft" },
        ],
        initialPerformance: {
          emotion: "calm",
          expressionId: "soft_gaze",
          actionId: "greet",
          backgroundId: "mist_harbor",
          camera: { shot: "medium", transition: "soft" },
        },
        enabledLoreIds: ["lore-mist-harbor-fog", "lore-mist-tea-thermos"],
        directorAgenda: {
          softGoals: ["让用户感到被允许停留或离开"],
          avoidances: ["逼用户上灯塔", "固定合流"],
          tensionGuidance: "保持低张力",
          unresolvedClues: ["ta值守的原因"],
          endingHint: "用户可随时离开码头",
          notes: "",
        },
      },
      {
        id: "opening-shared-watch",
        title: "共同值守",
        teaser: "你们约好替人值一班灯塔；熟悉、有默契，仍可自由改写这一夜。",
        relationshipPremise: "已有轻熟识。值守是共同任务，不是剧情锁。",
        initialSceneState: {
          location: "雾港灯塔值班室",
          locationHint: "雾港灯塔值班室",
          timeOfDay: "dawn",
          weather: "mist",
          weatherHint: "mist",
          participants: ["user", "lead"],
          participantPositions: { user: "logbook_desk", lead: "lamp_window" },
          relationshipPremise: "约定共同值守的同伴",
          tensionBand: "low",
          emotionalTone: "warm",
          activeGoal: "把这一班值守过完，并回应彼此状态",
          unresolvedThreads: ["下一班谁来换", "雾中是否有船影"],
          establishedFacts: ["日志本翻到空白页", "灯塔机械正常", "茶还剩半瓶"],
          inventoryHints: ["日志本", "保温瓶"],
          visualState: { backgroundId: "lighthouse_cabin", sceneId: "mist-harbor-lighthouse" },
          safetyState: { contentRating: "teen" },
          tension: 1,
          flags: ["opening_shared_watch"],
          turnIndex: 0,
        },
        openingTurns: [
          {
            role: "assistant",
            narration: "值班室窗玻璃结了一层薄雾。ta把日志本推到你手边。",
            dialogue: "你先写，还是我先听潮？",
            performance: {
              emotion: "warm",
              expressionId: "soft_smile",
              actionId: "offer",
              backgroundId: "lighthouse_cabin",
            },
          },
        ],
        suggestedActions: [
          { text: "先写一页日志", intent: "write_log" },
          { text: "一起到窗外看潮", intent: "watch_tide" },
          { text: "问ta累不累", intent: "care" },
        ],
        initialPerformance: {
          emotion: "warm",
          expressionId: "soft_smile",
          actionId: "offer",
          backgroundId: "lighthouse_cabin",
          camera: { shot: "medium", transition: "soft" },
        },
        enabledLoreIds: [
          "lore-mist-harbor-fog",
          "lore-mist-lighthouse-keep",
          "lore-mist-tea-thermos",
        ],
        directorAgenda: {
          softGoals: ["共享值守节奏", "允许用户改变计划"],
          avoidances: ["把值守写成任务失败惩罚"],
          tensionGuidance: "温和上升",
          unresolvedClues: ["雾中船影"],
          endingHint: "换班或雾散皆可收束",
          notes: "",
        },
      },
      {
        id: "opening-after-storm",
        title: "风暴之后",
        teaser: "昨夜风大，灯塔外绳结散了；关系偏紧，需要一起收拾残局。",
        relationshipPremise: "经历过共同紧张。信任在，但情绪未完全落地。",
        initialSceneState: {
          location: "雾港灯塔外廊",
          locationHint: "雾港灯塔外廊",
          timeOfDay: "dawn",
          weather: "clearing_mist",
          weatherHint: "clearing_mist",
          participants: ["user", "lead"],
          participantPositions: { user: "rope_coil", lead: "railing" },
          relationshipPremise: "风暴后仍站在一起的人",
          tensionBand: "rising",
          emotionalTone: "tender",
          activeGoal: "收拾残局并确认彼此是否还好",
          unresolvedThreads: ["绳结为何松开", "ta有没有说完的话"],
          establishedFacts: ["昨夜风很大", "外廊湿滑", "灯仍亮着"],
          inventoryHints: ["湿绳", "备用手套"],
          visualState: { backgroundId: "lighthouse_gallery", sceneId: "mist-harbor-lighthouse" },
          safetyState: { contentRating: "teen" },
          tension: 2,
          flags: ["opening_after_storm"],
          turnIndex: 0,
        },
        openingTurns: [
          {
            role: "assistant",
            narration: "雾退了一寸。ta把湿绳盘好，指节还有点发白。",
            dialogue: "……还好你在。绳子我一个人盘不完。",
            performance: {
              emotion: "tender",
              expressionId: "tired_smile",
              actionId: "lean_close",
              backgroundId: "lighthouse_gallery",
            },
          },
        ],
        suggestedActions: [
          { text: "一起盘绳", intent: "help_rope" },
          { text: "先让ta进屋里暖手", intent: "care_warm" },
          { text: "问昨夜ta怕不怕", intent: "ask_feelings" },
        ],
        initialPerformance: {
          emotion: "tender",
          expressionId: "tired_smile",
          actionId: "lean_close",
          backgroundId: "lighthouse_gallery",
          camera: { shot: "close", transition: "soft" },
        },
        enabledLoreIds: ["lore-mist-harbor-fog", "lore-mist-lighthouse-keep"],
        directorAgenda: {
          softGoals: ["让紧张缓下来", "承认昨夜共同经历"],
          avoidances: ["复述固定灾难旁白"],
          tensionGuidance: "从 rising 缓降",
          unresolvedClues: ["未说完的话"],
          endingHint: "收拾完或回值班室皆可",
          notes: "",
        },
      },
    ],
    embeddedLorebook: SHARED_LORE,
    directorPolicy: {
      rules: [
        "禁止固定剧情树推进或台词合流",
        "承认用户具体行动并产生因果后续",
        "suggestedActions 每轮由模型生成，0–3 条自然语言",
        "ending.mayEnd 仅柔和提示，不强制谢幕",
      ],
      defaultAgenda: {
        softGoals: ["与用户共同度过这段雾港黎明"],
        avoidances: ["固定剧情树推进"],
        tensionGuidance: "随用户行动升降",
        unresolvedClues: [],
        endingHint: "用户可随时暂停或谢幕",
        notes: "",
      },
    },
    responseContract: {
      schemaVersion: 2,
      instructions:
        "输出 JSON：display.narration/dialogue、performance、suggestedActions（无节点 id）、scenePatch（白名单）、ending.mayEnd。",
    },
    initialAssets: {
      backgroundId: "mist_harbor",
      sceneId: "mist-harbor-lighthouse",
      soundId: "harbor_tide_soft",
    },
    rendererProfile: "immersive-stage-v1",
    memoryPolicy: {
      requireUserAccept: true,
      allowTypes: ["shared_event", "promise", "preference", "unresolved_thread"],
    },
    permissions: {
      allowCustomCss: false,
      allowExternalResources: true,
      allowArbitraryJs: false,
    },
    resources: [
      {
        id: "res-cover",
        license: "CC-BY-NC-4.0",
        source: "yueqi-original-studio-sample",
        url: "/assets/scenes/mist-harbor-lighthouse/cover.png",
        hash: "",
        note: "原创样板封面引用（可缺资源，仅校验字段）",
      },
      {
        id: "res-tide-loop",
        license: "original",
        source: "yueqi-original-studio-sample",
        url: "/assets/scenes/mist-harbor-lighthouse/tide-loop.ogg",
        hash: "",
        note: "潮声循环引用",
      },
    ],
    migration: {
      note: "W6 original sample — not derived from the rain-station package.",
    },
  });
}

/** Display fields follow locale when read */
export function getMistHarborLighthousePackage(locale) {
  return localizeExperiencePackage(createMistHarborLighthousePackage(), locale);
}

export const MIST_HARBOR_LIGHTHOUSE_PACKAGE = getMistHarborLighthousePackage();
