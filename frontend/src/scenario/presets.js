/** Built-in scenario scripts — CEV2 §6.3: 夜雨车站 / 屋顶晚风 / 雨天咖啡馆
 *
 * W3: `script-rain-station` beat graph (`nextByChoice` / `nextByKeyword` / beatCursor)
 * is **migration / read-only / devDemo only**. Production immersive open of 夜雨车站
 * must use ExperiencePackage (`src/experience/presets/night-rain-station.js`) via
 * Experience Runtime — never the offline fixed plot tree.
 */

import { localizeScenarioPreset } from "./localize.js";

const CHOICE_LEAN = { id: "lean-in", text: "靠近一点", intent: "closeness" };
const CHOICE_ASK = { id: "ask", text: "轻轻问一句", intent: "curious" };
const CHOICE_SILENCE = { id: "silence", text: "先不说话", intent: "pause" };
const CHOICE_SHARE = { id: "share", text: "说一句真心话", intent: "confide" };
const CHOICE_STAY = { id: "stay", text: "再站一会儿", intent: "linger" };

/** @type {ReadonlyArray<object>} */
export const SCENARIO_PRESETS = Object.freeze([
  {
    id: "script-rain-station",
    title: "夜雨车站",
    premise: "末班车误点，雨里只剩一把伞和一句没说完的话。",
    mood: "rain",
    backgroundId: "rain_station",
    sceneId: "night-rain-station",
    durationHint: "开放 · 可长谈",
    emotionTag: "克制 · 雨夜",
    openingBeat: "雨打在站台顶棚上。远处灯黄得发旧，你们并肩站着，谁也没先开口。",
    castHint: "语气克制，留白；雨声是第三角色。",
    tags: ["雨夜", "车站"],
    source: "preset",
    /** @deprecated W3 production uses ExperiencePackage; graph kept for migration/devDemo */
    productionRuntime: "experience",
    experiencePackageId: "exp-night-rain-station",
    startBeatId: "rs-1",
    branchMode: true,
    /** Graph below: DEV_DEMO / migration only — not production immersive authority */
    _graphUsage: "migration_readonly_devDemo_only",
    endings: [
      { id: "share-umbrella", summary: "你们把伞偏向同一边，把没说完的话留到下一班车。" },
      { id: "quiet-wait", summary: "雨声替你们说完了。站台灯下，肩并肩就够了。" },
    ],
    /**
     * LEGACY graph beats (devDemo / forceOfflineFixed only).
     * Production: Experience Runtime + free input; no nextByChoice confluence.
     */
    beats: [
      {
        beatId: "rs-1",
        narration: "雨丝斜过灯柱。有人把伞柄往你这边递了半寸。",
        dialogue: "{name}侧过脸，声音被雨稀释：「……车还要多久？」",
        emotion: "neutral",
        expressionId: "neutral",
        actionId: "greet",
        backgroundId: "rain_station",
        sceneId: "night-rain-station",
        choices: [CHOICE_LEAN, CHOICE_ASK, CHOICE_SILENCE],
        stateDelta: { tension: 0, intimacy: 0, trust: 0, flags: ["opened"] },
        echoHint: true,
        nextByChoice: {
          "lean-in": "rs-2-near",
          ask: "rs-2-ask",
          silence: "rs-2-quiet",
          _default: "rs-2-near",
        },
        nextByKeyword: [
          { keys: ["靠近", "伞", "挤"], beatId: "rs-2-near" },
          { keys: ["问", "多久", "车"], beatId: "rs-2-ask" },
          { keys: ["沉默", "不说话", "静"], beatId: "rs-2-quiet" },
        ],
      },
      {
        beatId: "rs-2-near",
        narration: "伞沿又偏近一寸，雨声忽然贴着耳廓。",
        dialogue: "{name}低声：「这样……会不会好一点。雨太大了。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "lean_close",
        choices: [CHOICE_SHARE, CHOICE_STAY, CHOICE_ASK],
        stateDelta: { tension: 0, intimacy: 1, trust: 0, flags: ["branch_near"] },
        nextByChoice: {
          share: "rs-3",
          stay: "rs-3",
          ask: "rs-3",
          _default: "rs-3",
        },
      },
      {
        beatId: "rs-2-ask",
        narration: "广播含糊地响了一声，又吞回去。",
        dialogue: "{name}看着时刻表，又看你：「误点。好处是……还能站在这儿问一句真话。」",
        emotion: "neutral",
        expressionId: "neutral",
        actionId: "thinking",
        choices: [CHOICE_SHARE, CHOICE_LEAN, CHOICE_SILENCE],
        stateDelta: { tension: 1, intimacy: 0, trust: 1, flags: ["branch_ask"] },
        nextByChoice: {
          share: "rs-3",
          "lean-in": "rs-3",
          silence: "rs-3",
          _default: "rs-3",
        },
      },
      {
        beatId: "rs-2-quiet",
        narration: "你们谁都没再开口。雨替你们把沉默填满。",
        dialogue: "{name}只把伞稳住，目光落在铁轨上：「……也行。先听雨。」",
        emotion: "shy",
        expressionId: "shy",
        actionId: "shy_look_away",
        choices: [CHOICE_LEAN, CHOICE_SHARE, CHOICE_STAY],
        stateDelta: { tension: -1, intimacy: 0, trust: 1, flags: ["branch_quiet"] },
        nextByChoice: {
          "lean-in": "rs-3",
          share: "rs-3",
          stay: "rs-3",
          _default: "rs-3",
        },
      },
      {
        beatId: "rs-3",
        narration: "站台灯闪了一下。像有人催你们做决定。",
        dialogue: "{name}终于抬眼：「有句话我刚才差点说出口……你想听，还是想再站一会儿？」",
        emotion: "shy",
        expressionId: "shy",
        actionId: "shy_look_away",
        choices: [CHOICE_SHARE, CHOICE_STAY, CHOICE_SILENCE],
        stateDelta: { tension: 1, intimacy: 0, trust: 1, flags: ["almost"] },
        nextByChoice: {
          share: "rs-4-words",
          stay: "rs-4-linger",
          silence: "rs-4-linger",
          _default: "rs-4-linger",
        },
        nextByKeyword: [
          { keys: ["真心", "说", "听", "话"], beatId: "rs-4-words" },
          { keys: ["站", "再", "等", "不急"], beatId: "rs-4-linger" },
        ],
      },
      {
        beatId: "rs-4-words",
        narration: "伞沿滴下水珠，落在鞋尖前，像标点。",
        dialogue: "{name}声音很轻：「其实我……希望误点再久一点。这样你就还在。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "talking_default",
        choices: [CHOICE_LEAN, CHOICE_STAY, CHOICE_ASK],
        stateDelta: { tension: 0, intimacy: 1, trust: 1, flags: ["said"] },
        nextByChoice: {
          "lean-in": "rs-5",
          stay: "rs-5",
          ask: "rs-5",
          _default: "rs-5",
        },
      },
      {
        beatId: "rs-4-linger",
        narration: "风把雨丝吹斜。你们肩并肩，像故意把时间拉长。",
        dialogue: "{name}把伞又偏近一点：「那就再站一会儿。车来了再走，也来得及。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "lean_close",
        choices: [CHOICE_SHARE, CHOICE_LEAN, CHOICE_SILENCE],
        stateDelta: { tension: 0, intimacy: 1, trust: 0, flags: ["linger"] },
        nextByChoice: {
          share: "rs-5",
          "lean-in": "rs-5",
          silence: "rs-5",
          _default: "rs-5",
        },
      },
      {
        beatId: "rs-5",
        narration: "远处车灯终于亮起，却像故意慢吞吞。",
        dialogue: "{name}看着光点：「要是你不嫌湿……今晚走到这儿，也算完整。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "lean_close",
        choices: [CHOICE_STAY, CHOICE_SHARE, CHOICE_LEAN],
        stateDelta: { tension: 0, intimacy: 1, trust: 0, flags: [] },
        memoryCandidate: "夜雨车站，伞下并肩等车。",
        nextByChoice: {
          stay: "rs-6",
          share: "rs-6",
          "lean-in": "rs-6",
          _default: "rs-6",
        },
      },
      {
        beatId: "rs-6",
        narration: "雨小了一点。铁轨的凉意爬上脚踝。",
        dialogue: "{name}侧耳听了一会儿：「你听，雨声也在换气。」",
        emotion: "warm",
        expressionId: "comfort_look",
        actionId: "comfort",
        choices: [CHOICE_ASK, CHOICE_STAY, CHOICE_SILENCE],
        stateDelta: { tension: -1, intimacy: 0, trust: 1, flags: [] },
        nextByChoice: {
          ask: "rs-7",
          stay: "rs-7",
          silence: "rs-7",
          _default: "rs-7",
        },
      },
      {
        beatId: "rs-7",
        narration: "广播又响，这次清楚了半句，又被雨吞掉。",
        dialogue: "{name}笑了笑：「下一班还早。我们还有一点舞台时间。」",
        emotion: "happy",
        expressionId: "soft_smile",
        actionId: "talking_default",
        choices: [CHOICE_LEAN, CHOICE_SHARE, CHOICE_STAY],
        stateDelta: { tension: 0, intimacy: 1, trust: 0, flags: [] },
        nextByChoice: {
          "lean-in": "rs-8",
          share: "rs-8",
          stay: "rs-8",
          _default: "rs-8",
        },
      },
      {
        beatId: "rs-8",
        narration: "站台只剩你们的呼吸和伞骨轻轻一颤。",
        dialogue: "{name}轻声：「谢幕也没关系。记得这雨，就够了。」",
        emotion: "warm",
        expressionId: "comfort_look",
        actionId: "comfort",
        choices: [CHOICE_STAY, CHOICE_LEAN],
        stateDelta: { tension: -1, intimacy: 1, trust: 1, flags: ["ready_finale"] },
        suggestEnding: true,
        memoryCandidate: "在夜雨车站把没说完的话留给下一班车。",
        nextByChoice: {
          stay: "rs-8",
          "lean-in": "rs-8",
          _default: "rs-8",
        },
      },
    ],
  },
  {
    id: "script-rooftop",
    title: "屋顶晚风",
    premise: "夏天屋顶，城市在脚下发亮，有人想把秘密说出来。",
    mood: "night",
    backgroundId: "rooftop_night",
    durationHint: "约 6–8 分钟",
    emotionTag: "轻松 · 紧张",
    openingBeat: "风把衣角掀起一点。楼顶的灯坏了一盏，影子就更长。",
    castHint: "轻松里藏一点紧张；别急着给答案。",
    tags: ["屋顶", "夏夜"],
    source: "preset",
    endings: [
      { id: "tell-secret", summary: "秘密说出口后，风反而更轻。你们对着城市发呆了一会儿。" },
      { id: "keep-wind", summary: "秘密还留着，但并肩看灯的夜晚已经写进记忆。" },
    ],
    beats: [
      {
        beatId: "rt-1",
        narration: "风声先到，脚步声后到。城市在脚下一格一格亮着。",
        dialogue: "{name}抬手比了比远方：「今天的风……像故意把人往这儿推。」",
        emotion: "happy",
        expressionId: "soft_smile",
        actionId: "greet",
        backgroundId: "rooftop_night",
        choices: [CHOICE_ASK, CHOICE_STAY, CHOICE_SILENCE],
        stateDelta: { tension: 0, intimacy: 0, trust: 0, flags: ["rooftop"] },
        echoHint: true,
        byChoice: {
          ask: { dialogue: "{name}想了想：「你想听远方的风，还是听我心里那点动静？」" },
          stay: { dialogue: "{name}点点头：「那就多站一会儿。灯坏了也没关系。」" },
          silence: { dialogue: "{name}也不催，只把衣角按住：「……风自己会说。」" },
        },
      },
      {
        beatId: "rt-2",
        narration: "坏掉的灯管偶尔闪一下，又安静。",
        dialogue: "{name}抱着膝盖：「我有件事……想说，又怕说完风就变了。」",
        emotion: "shy",
        expressionId: "shy",
        actionId: "shy_look_away",
        choices: [CHOICE_SHARE, CHOICE_LEAN, CHOICE_ASK],
        stateDelta: { tension: 1, intimacy: 0, trust: 0, flags: ["secret_near"] },
        byChoice: {
          share: { dialogue: "{name}吸了口气：「那我先说一半——其实我一直想和你这样站着。」" },
          "lean-in": { dialogue: "{name}肩膀轻轻碰你：「别急。你在，我就敢慢一点。」" },
          ask: { dialogue: "{name}看着你：「你要是问，我就答。答不全也没关系。」" },
        },
      },
      {
        beatId: "rt-3",
        narration: "远处有人放烟火，细小得像一颗星掉进楼缝。",
        dialogue: "{name}看着你：「你要是愿意听，我就慢一点讲。」",
        emotion: "neutral",
        expressionId: "neutral",
        actionId: "talking_default",
        choices: [CHOICE_SHARE, CHOICE_SILENCE, CHOICE_STAY],
        stateDelta: { tension: 0, intimacy: 1, trust: 1, flags: [] },
      },
      {
        beatId: "rt-4",
        narration: "风停了一秒，又重新绕过你们的肩。",
        dialogue: "{name}把秘密放得很轻：「其实我……一直想和你这样站着。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "lean_close",
        choices: [CHOICE_LEAN, CHOICE_SHARE, CHOICE_STAY],
        stateDelta: { tension: 0, intimacy: 1, trust: 0, flags: ["said"] },
        memoryCandidate: "屋顶晚风里，有人把秘密说得很轻。",
      },
      {
        beatId: "rt-5",
        narration: "城市还在亮。你们不必立刻下楼。",
        dialogue: "{name}笑了笑：「今晚就演到风停吧。」",
        emotion: "warm",
        expressionId: "comfort_look",
        actionId: "react_tap",
        choices: [CHOICE_STAY, CHOICE_LEAN],
        stateDelta: { tension: -1, intimacy: 1, trust: 1, flags: ["ready_finale"] },
        suggestEnding: true,
        memoryCandidate: "夏夜屋顶，城市在脚下，秘密被晚风接住。",
      },
    ],
  },
  {
    id: "script-cafe",
    title: "雨天咖啡馆",
    premise: "靠窗座位只剩一张，窗外雨停停走走，话题却绕不开。",
    mood: "warm",
    backgroundId: "cafe_rain",
    durationHint: "约 6–8 分钟",
    emotionTag: "温柔 · 日常",
    openingBeat: "玻璃杯壁上凝着水珠。店里放着很轻的爵士，像怕吵到你们。",
    castHint: "温柔、观察入微；咖啡香与雨声交替。",
    tags: ["咖啡", "日常"],
    source: "preset",
    endings: [
      { id: "same-cup", summary: "雨还没停。你们把话题绕回杯子里，决定下次还坐这张窗边。" },
      { id: "walk-rain", summary: "结账时雨又大了。你们相视一笑，决定把伞留给彼此。" },
    ],
    beats: [
      {
        beatId: "cf-1",
        narration: "窗外雨丝细得像线。杯沿升起一小缕热气。",
        dialogue: "{name}把菜单轻轻推过来：「靠窗这张……好像就剩我们了。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "greet",
        backgroundId: "cafe_rain",
        choices: [CHOICE_ASK, CHOICE_SHARE, CHOICE_SILENCE],
        stateDelta: { tension: 0, intimacy: 0, trust: 0, flags: ["cafe"] },
        echoHint: true,
        byChoice: {
          ask: { dialogue: "{name}歪头：「你想点什么？还是……先问我今天怎么了？」" },
          share: { dialogue: "{name}托着腮：「那我先说——其实我一路都在找这张位子。」" },
          silence: { dialogue: "{name}也不催，只把杯子转了半圈：「雨声刚好够填空白。」" },
        },
      },
      {
        beatId: "cf-2",
        narration: "爵士换了一首更慢的。勺子碰杯壁，轻轻一声。",
        dialogue: "{name}托着腮：「你今天话比平时少。是雨的关系，还是我的关系？」",
        emotion: "neutral",
        expressionId: "neutral",
        actionId: "thinking",
        choices: [CHOICE_ASK, CHOICE_LEAN, CHOICE_SHARE],
        stateDelta: { tension: 0, intimacy: 0, trust: 1, flags: [] },
      },
      {
        beatId: "cf-3",
        narration: "雨忽然密了一阵，玻璃上画出短暂的河。",
        dialogue: "{name}望着窗外：「有些话适合配雨声。你听得见的话，我就说。」",
        emotion: "shy",
        expressionId: "shy",
        actionId: "shy_look_away",
        choices: [CHOICE_SHARE, CHOICE_STAY, CHOICE_SILENCE],
        stateDelta: { tension: 1, intimacy: 1, trust: 0, flags: ["rain_talk"] },
      },
      {
        beatId: "cf-4",
        narration: "店员远远走过，没有打扰。咖啡香更近了。",
        dialogue: "{name}把杯子转向你：「其实我只是想……多占你一会儿。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "lean_close",
        choices: [CHOICE_LEAN, CHOICE_SHARE, CHOICE_STAY],
        stateDelta: { tension: 0, intimacy: 1, trust: 1, flags: [] },
        memoryCandidate: "雨天咖啡馆靠窗，话题绕不开。",
      },
      {
        beatId: "cf-5",
        narration: "雨又变细。玻璃上的河慢慢干成雾。",
        dialogue: "{name}轻声：「这一幕就停在热气散尽之前，好不好？」",
        emotion: "warm",
        expressionId: "comfort_look",
        actionId: "comfort",
        choices: [CHOICE_STAY, CHOICE_LEAN],
        stateDelta: { tension: -1, intimacy: 1, trust: 0, flags: ["ready_finale"] },
        suggestEnding: true,
        memoryCandidate: "雨天咖啡馆，把未说完的话留在窗边。",
      },
    ],
  },
  {
    id: "script-exam-eve",
    title: "考试前夜",
    premise: "台灯还亮着，笔记摊开，有人说「再陪我一会儿」。",
    mood: "warm",
    backgroundId: "cafe_rain",
    durationHint: "约 6 分钟",
    emotionTag: "安抚",
    openingBeat: "时钟跳到很晚。纸页边角卷起，窗外偶尔有车灯扫过。",
    castHint: "安抚优先，不说教；短句更有力。",
    tags: ["备考", "陪伴"],
    source: "preset",
    endings: [
      { id: "sleep-soon", summary: "台灯灭了一半。你们约好明天见面，把紧张留给夜色。" },
    ],
    beats: [
      {
        beatId: "ex-1",
        narration: "笔尖停在某一行，久到墨点洇开。",
        dialogue: "{name}小声：「再陪我一会儿……就一会儿。」",
        emotion: "warm",
        expressionId: "comfort_look",
        actionId: "comfort",
        choices: [CHOICE_STAY, CHOICE_ASK, CHOICE_SILENCE],
        stateDelta: { tension: 0, intimacy: 1, trust: 0, flags: [] },
      },
      {
        beatId: "ex-2",
        narration: "窗外车灯扫过，又暗下去。",
        dialogue: "{name}把笔记推开一点：「有你在，字就不那么晃。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "talking_default",
        choices: [CHOICE_LEAN, CHOICE_STAY],
        stateDelta: { tension: -1, intimacy: 0, trust: 1, flags: [] },
        suggestEnding: true,
        memoryCandidate: "考试前夜，台灯下的陪伴。",
      },
    ],
  },
  {
    id: "script-reunion",
    title: "重逢",
    premise: "三年后再见，旧地方还在，人也还在，话说不完。",
    mood: "city",
    backgroundId: "rooftop_night",
    durationHint: "约 6 分钟",
    emotionTag: "克制怀念",
    openingBeat: "巷口的旧招牌还挂着。你们对视了一秒，都先笑了。",
    castHint: "克制怀念，不煽情堆砌；动作比宣言重要。",
    tags: ["重逢", "回忆"],
    source: "preset",
    endings: [
      { id: "walk-on", summary: "旧招牌下，你们把三年缩成一句「还好你还在」。" },
    ],
    beats: [
      {
        beatId: "ru-1",
        narration: "风穿过巷口，招牌轻轻晃。",
        dialogue: "{name}先开口：「……还好。你还是这个样子。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "greet",
        choices: [CHOICE_ASK, CHOICE_SHARE, CHOICE_SILENCE],
        stateDelta: { tension: 0, intimacy: 0, trust: 1, flags: ["reunion"] },
      },
      {
        beatId: "ru-2",
        narration: "话说到一半，又都被笑打断。",
        dialogue: "{name}看着你：「今晚不必说完。能站在这儿，就已经像演出过了。」",
        emotion: "warm",
        expressionId: "soft_smile",
        actionId: "lean_close",
        choices: [CHOICE_STAY, CHOICE_LEAN],
        stateDelta: { tension: -1, intimacy: 1, trust: 0, flags: [] },
        suggestEnding: true,
        memoryCandidate: "三年后重逢，旧地方还在。",
      },
    ],
  },
]);

export function getPresetScript(id) {
  const raw = SCENARIO_PRESETS.find((item) => item.id === id) || null;
  return raw ? localizeScenarioPreset(raw) : null;
}

export function getPresetBeats(id) {
  const script = getPresetScript(id);
  return Array.isArray(script?.beats) ? script.beats : [];
}

export function getPresetBeatById(scriptId, beatId) {
  const beats = getPresetBeats(scriptId);
  return beats.find((item) => item.beatId === beatId) || null;
}

export function getPresetScriptMeta(id) {
  const script = getPresetScript(id);
  if (!script) return null;
  return {
    backgroundId: script.backgroundId || "",
    sceneId: script.sceneId || "",
    endings: script.endings || [],
    durationHint: script.durationHint || "",
    emotionTag: script.emotionTag || "",
    startBeatId: script.startBeatId || script.beats?.[0]?.beatId || "",
    branchMode: Boolean(script.branchMode),
  };
}

export function pickFinaleSummary(scriptId, run) {
  const meta = getPresetScriptMeta(scriptId);
  const endings = meta?.endings || [];
  if (!endings.length) {
    const script = getPresetScript(scriptId);
    return `《${script?.title || "这一幕"}》演完了。`;
  }
  const intimacy = Number(run?.directorState?.intimacy) || 0;
  const index = intimacy >= 2 ? 0 : Math.min(1, endings.length - 1);
  return endings[index]?.summary || endings[0].summary;
}
