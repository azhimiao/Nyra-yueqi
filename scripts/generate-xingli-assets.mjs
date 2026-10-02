#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { XINGLI_ACTION_IDS } from "../src/avatar/xingli-action-map.js";
import { getPetGenerationProfile } from "./pet-character-profiles.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_ID = (() => {
  const index = process.argv.indexOf("--profile");
  return index >= 0 ? String(process.argv[index + 1] || "xingli") : "xingli";
})();
const PROFILE = getPetGenerationProfile(PROFILE_ID);
const SOURCE_DIR = path.join(ROOT, ...PROFILE.sourceDir);
const CANVAS_SIZE = 1536;
const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com";
const DEFAULT_MODEL = "doubao-seedream-5-0-pro-260628";
const DEFAULT_FALLBACK_MODELS = Object.freeze([
  "doubao-seedream-5-0-260128",
  "doubao-seedream-5-0-lite-260128",
  "doubao-seedream-4-5-251128",
]);
const REQUEST_TIMEOUT_MS = 120_000;
const REQUEST_RETRIES = 3;
const SEMANTIC_ATTEMPTS = 3;
const SAFE_CANVAS_SCALE = 0.96;
const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;
const MAGENTA = Object.freeze([255, 0, 255, 255]);

const CHARACTER_BIBLE = PROFILE.characterBible.join("；");

const IMAGE_RULES = [
  "画面中只能有一个角色，完整显示头发、双手、双腿和鞋，任何部位都不能裁切",
  "正方形固定镜头，人物中心固定，脚底接近画布底部但与边缘保留足够间距",
    "背景必须完全透明；如果当前模型不能直接输出透明通道，才使用单一、均匀、无阴影的纯品红色 #FF00FF，角色任何部位不得出现品红色；不得使用棋盘格、渐变、地面、地影、道具背景或装饰",
  "这是透明悬浮窗桌宠素材，动作必须轻松舒适、重心可信、关节角度自然、肢体受力合理，在小尺寸观看时姿态清楚",
  "禁止文字、签名、Logo、边框、水印和额外人物",
  "手指数量正确，肢体完整，服装结构清晰",
].join("；");

const NEGATIVE_RULES = [
  "禁止未成年、儿童体型、幼儿感、校服、制服暗示或任何年龄不明设定",
  "禁止写实模特比例、六头身以上比例、成熟强势脸、塑料3D、公仔渲染或真人照片质感",
  "禁止改变参考图中的发长、发色、瞳色、脸型、服装结构、鞋、发饰、挂件和主配色",
  "禁止性感姿势、暴露服装、透视、夸张胸腰臀或身体商品化表现",
  "禁止关节反折、脱臼感、扭颈、脊柱过度弯曲、肢体穿插、衣物穿模、悬吊、勒住、疼痛、恐惧或身体不适表现",
  "禁止额外人物、额外肢体、多手、多腿、错误手指、身体裁切、头像特写、家具、地面和投影",
].join("；");

const LOCK_VARIANTS = Object.freeze(PROFILE.lockVariants.slice());

// Codex 对齐：站姿对齐 lock；循环/成对帧对齐前帧；坐卧只去影+缩放，禁止按站姿高度硬拉。
const BASE_POSE_TASKS = [
  {
    id: "talk_0",
    file: "poses/talk_0.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "说话循环第一关键姿势：嘴巴自然半开，右手在胸前做轻柔解释手势，双脚和身体中心不移动",
  },
  {
    id: "talk_1",
    file: "poses/talk_1.png",
    refs: ["lock", "talk_0"],
    lockPose: true,
    postprocess: { registerTo: "talk_0" },
    motion: "说话循环第二关键姿势：把图二视为上一帧，严格保持其全身姿势、人物像素高度、头部大小、手脚位置、重心、脚底基线和画面中心完全不变；只把嘴巴自然多张开一点，并让眼神略亮。禁止改变手势、头部角度、身体轮廓或镜头距离，确保两帧循环时没有缩放、位移和呼吸式脉冲",
  },
  {
    id: "listen",
    file: "poses/listen.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "认真倾听：上半身轻微向用户倾斜，头部小幅侧倾，一只手靠近耳边，闭嘴并保持温柔目光",
  },
  {
    id: "thinking",
    file: "poses/thinking.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "思考：一只手轻触下巴，视线略微上移，另一只手自然垂下，姿势克制，不做夸张漫画动作",
  },
  {
    id: "greet_0",
    file: "poses/greet_0.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "挥手动作第一关键姿势：右手刚抬到肩膀高度，掌心开始朝向用户，身体微微前倾，友好微笑",
  },
  {
    id: "greet_1",
    file: "poses/greet_1.png",
    refs: ["lock", "greet_0"],
    postprocess: { registerTo: "greet_0" },
    motion: "挥手动作极值姿势：右手举到头部侧上方，掌心清楚朝向用户，手腕自然摆动，明亮欢迎微笑",
  },
  {
    id: "react_0",
    file: "poses/react_0.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "被点击反应第一关键姿势：像收到轻柔提醒一样身体小幅回弹，双手自然靠近胸前，眼睛微微睁大，惊喜可爱但没有受惊、疼痛或防御感",
  },
  {
    id: "react_1",
    file: "poses/react_1.png",
    refs: ["lock", "react_0"],
    postprocess: { registerTo: "react_0" },
    motion: "被点击反应第二关键姿势：身体轻轻弹起，双脚仍完整可见，开心闭眼微笑，双手略微张开",
  },
  {
    id: "comfort",
    file: "poses/comfort.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "安慰用户的恋人式安抚：保持定妆图的4.8头身、全身视觉尺寸和正交感镜头，神情关心，头部轻轻侧倾约5度；一只手平放在自己胸口表示陪伴，另一只手自然垂在身侧或轻握裙边，肩膀放松，双脚稳定落在原站姿基线。禁止向镜头伸手、拥抱姿势、近景、广角、透视缩短、头手放大、腿部缩短或身体冲出画面",
  },
  {
    id: "welcome_home",
    file: "poses/welcome_home.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "欢迎回家：眼睛亮起，身体向前迈小半步，双臂自然展开，露出真诚而克制的开心笑容",
  },
  {
    id: "lean_close",
    file: "poses/lean_close.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "亲密靠近：保持全身入镜，上半身朝镜头轻轻靠近，双手放在身后，持续目光接触和温柔微笑",
  },
  {
    id: "shy",
    file: "poses/shy.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "害羞移开视线：脸颊轻微泛红，目光短暂看向侧下方，一只手整理耳边头发，身体轻微内收",
  },
  {
    id: "selfie",
    file: "poses/selfie.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "自拍：一只手举起简洁无品牌手机，另一只手做小幅V字手势，面向手机自然微笑，完整全身",
  },
  {
    id: "sit",
    file: "poses/sit.png",
    refs: ["lock"],
    postprocess: { stripNeutralShadow: true },
    motion: "稳定的正面略偏三分之四悬空坐姿：角色像坐在屏幕下沿，骨盆与大腿后侧形成明确承重点，髋部约90度、膝部约90度，膝盖构成清楚的桌沿转折；双膝并拢略朝一侧，双小腿从膝盖自然悬垂，双脚离开站姿基线且不踩地，双手轻放膝上，背部自然直立。保持4.8头身和完整全身。画面里只能出现角色身体，臀部后方和腿下方必须是纯背景，绝对不画椅子、坐垫、桌面、桌沿、玻璃板、地面、横线、接触阴影或投影，不能看起来像站立或深蹲",
  },
  {
    id: "sleep",
    file: "poses/sleep.png",
    refs: ["lock"],
    postprocess: { scale: 0.8, stripNeutralShadow: true },
    motion: "舒适侧卧睡眠：保持4.8头身半Q比例、定妆图的身体体积和完整横向全身；躯干长轴接近水平，与画布水平线夹角不超过20度，头在画面左侧并由弯曲手臂承托，鞋在画面右侧，身体由悬浮窗底部的隐形柔软平面自然承托。脊柱放松，双膝并拢轻屈但不能蜷成坐姿，裙摆完整覆盖臀部、大腿和腿根，袜子与鞋完整可见。表情安稳；禁止坐着打盹、抱膝、蹲坐、竖直躯干和近大远小；透明成品中只能保留角色，绝对不画地面、接触阴影、投影、灰色垫片、床铺、枕头或家具",
  },
  {
    id: "drag",
    file: "poses/drag.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "桌宠被用户拖动窗口时的轻微惯性姿势：角色整体像随透明窗口平移，仍保持轻松自然站姿，身体和发梢仅向移动反方向小幅倾斜，双脚可轻微离开原基线；绝不表现被手抓住、拎起、吊挂、勒住、失重、疼痛或恐惧，不画鼠标、手或吊绳",
  },
  {
    id: "stand_to_sit_mid",
    file: "poses/stand_to_sit_mid.png",
    refs: ["lock"],
    postprocess: { registerTo: "lock" },
    motion: "站立到坐下过程中的半蹲关键帧：她还完全没有坐下，骨盆清楚悬在空中并且明显高于膝盖；双脚仍平放在原站姿基线，间距约一个脚掌，脚跟不抬起，双膝沿脚尖方向只弯曲约35度，髋部向后下方移动约一个头部高度，躯干只前倾约10度保持平衡，一只手轻扶裙摆。保持4.8头身、定妆图人物尺寸和正交感镜头，动作像缓慢坐向身后桌沿的安全中间步骤；禁止坐姿、双腿悬垂、深蹲、跪姿、悬空、扭膝或透视缩放",
  },
  {
    id: "sit_to_sleep_mid",
    file: "poses/sit_to_sleep_mid.png",
    refs: ["lock", "sit"],
    postprocess: { scale: 0.82, stripNeutralShadow: true, registerTo: "sit" },
    motion: "从图二坐姿开始向侧卧过渡的舒适侧坐关键帧：她仍以坐姿为主，骨盆保持在原坐姿承重点，躯干相对竖直方向只侧倾约25度，离水平躺下还很远；靠近支撑面的一只手掌和前臂自然承重，另一只手放在腰腹前，双膝始终并拢并向同一侧收起，小腿平行斜向侧下方；裙摆自然闭合并向下垂落，完整保持日常居家穿着的覆盖范围，不出现翻起、分叉或意外空隙。保持4.8头身、图二人物尺寸、头部大小、服装和正交感镜头，完整全身；禁止卧姿、展示性造型、仰拍、近景、腿鞋放大、双膝分开、跌倒、扭转、地面、投影或灰色垫片",
  },
];
function adaptMotionForProfile(motion) {
  let next = String(motion || "");
  for (const [from, to] of PROFILE.motionReplacements || []) next = next.split(from).join(to);
  return next;
}
const POSE_TASKS = Object.freeze(BASE_POSE_TASKS.map((task) => ({
  ...task,
  motion: adaptMotionForProfile(task.motion),
})));

/** Standing (or near-standing) poses that must stay within lock silhouette budget after retouch. */
const STANDING_CONSISTENCY_IDS = Object.freeze([
  "talk_0", "talk_1", "listen", "thinking", "greet_0", "greet_1",
  "react_0", "react_1", "comfort", "welcome_home", "lean_close", "shy",
  "selfie", "drag", "stand_to_sit_mid",
]);

const FRAME_PLAN = Object.freeze({
  idle_loop: [{ name: "idle_000.png", from: "lock" }],
  talk_loop: [
    { name: "talk_000.png", from: "talk_0" },
    { name: "talk_001.png", from: "talk_1" },
  ],
  listen: [{ name: "listen_000.png", from: "listen" }],
  thinking: [{ name: "thinking_000.png", from: "thinking" }],
  greet: [
    { name: "greet_000.png", from: "greet_0" },
    { name: "greet_001.png", from: "greet_1" },
    { name: "greet_002.png", from: "greet_0" },
  ],
  react_tap: [
    { name: "react_tap_000.png", from: "react_0" },
    { name: "react_tap_001.png", from: "react_1" },
  ],
  comfort: [{ name: "comfort_000.png", from: "comfort" }],
  welcome_home: [{ name: "welcome_home_000.png", from: "welcome_home" }],
  lean_close: [{ name: "lean_close_000.png", from: "lean_close" }],
  shy_look_away: [{ name: "shy_look_away_000.png", from: "shy" }],
  selfie: [{ name: "selfie_000.png", from: "selfie" }],
  sit_idle: [{ name: "sit_idle_000.png", from: "sit" }],
  sleep_loop: [{ name: "sleep_000.png", from: "sleep" }],
  drag: [{ name: "drag_000.png", from: "drag" }],
  stand_to_sit: [
    { name: "stand_to_sit_000.png", from: "lock" },
    { name: "stand_to_sit_001.png", from: "stand_to_sit_mid" },
    { name: "stand_to_sit_002.png", from: "sit" },
  ],
  sit_to_sleep: [
    { name: "sit_to_sleep_000.png", from: "sit" },
    { name: "sit_to_sleep_001.png", from: "sit_to_sleep_mid" },
    { name: "sit_to_sleep_002.png", from: "sleep" },
  ],
});

const CLIP_TIMING = Object.freeze({
  idle_loop: { fps: 1, frame_durations_ms: [1800], hold_ms: 0, crossfade_ms: 0 },
  talk_loop: { fps: 2, frame_durations_ms: [500, 500], hold_ms: 0, crossfade_ms: 90 },
  listen: { fps: 1, frame_durations_ms: [1400], hold_ms: 1400, crossfade_ms: 100 },
  thinking: { fps: 1, frame_durations_ms: [1600], hold_ms: 1600, crossfade_ms: 100 },
  greet: { fps: 4, frame_durations_ms: [260, 480, 260], hold_ms: 0, crossfade_ms: 80 },
  react_tap: { fps: 4, frame_durations_ms: [260, 620], hold_ms: 0, crossfade_ms: 70 },
  comfort: { fps: 1, frame_durations_ms: [1700], hold_ms: 1700, crossfade_ms: 110 },
  welcome_home: { fps: 1, frame_durations_ms: [1600], hold_ms: 1600, crossfade_ms: 100 },
  lean_close: { fps: 1, frame_durations_ms: [1500], hold_ms: 1500, crossfade_ms: 100 },
  shy_look_away: { fps: 1, frame_durations_ms: [1500], hold_ms: 1500, crossfade_ms: 100 },
  selfie: { fps: 1, frame_durations_ms: [1700], hold_ms: 1700, crossfade_ms: 100 },
  sit_idle: { fps: 1, frame_durations_ms: [1800], hold_ms: 0, crossfade_ms: 0 },
  sleep_loop: { fps: 1, frame_durations_ms: [2200], hold_ms: 0, crossfade_ms: 0 },
  drag: { fps: 1, frame_durations_ms: [1200], hold_ms: 1200, crossfade_ms: 70 },
  stand_to_sit: { fps: 4, frame_durations_ms: [240, 520, 320], hold_ms: 0, crossfade_ms: 80 },
  sit_to_sleep: { fps: 4, frame_durations_ms: [260, 620, 420], hold_ms: 0, crossfade_ms: 90 },
});

function usage() {
  return [
    "Usage:",
    "  npm run generate:xingli -- --profile xingli|yueqi-female|yueqi-male --stage lock [--candidate 1|2|3] [--reference PATH] [--select 1|2|3] [--force]",
    "  npm run generate:xingli -- --profile ID --stage poses --select 1|2|3 [--only ID[,ID...]] [--force]",
    "  npm run generate:xingli -- --profile ID --stage qa --select 1|2|3",
    "",
    "Stages:",
    "  lock   Generate character-lock candidates for the selected pet profile.",
    "         Optionally copy one candidate to character_lock.png with --select N.",
    "  poses  Select one candidate and generate the 16-clip / 24-key-pose source pack.",
    "  qa     Re-validate existing poses: alpha QA + standing consistency vs lock (no API calls).",
    "",
    "Env: set XINGLI_REMBG_PYTHON to a Python with rembg+isnet-anime for production matting.",
    "     Production generation always fails closed when isnet-anime is unavailable.",
    "",
    "The generator resumes verified outputs by default. --force is required to replace them.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    stage: "",
    select: 0,
    candidate: 0,
    references: [],
    only: [],
    force: false,
    requireRembg: true,
    profile: PROFILE_ID,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") args.help = true;
    else if (value === "--force") args.force = true;
    else if (value === "--require-rembg") args.requireRembg = true;
    else if (value === "--profile") { args.profile = String(argv[++index] || "").trim(); }
    else if (value === "--stage") args.stage = String(argv[++index] || "").trim().toLowerCase();
    else if (value === "--select") args.select = Number(argv[++index]);
    else if (value === "--candidate") args.candidate = Number(argv[++index]);
    else if (value === "--reference") args.references.push(path.resolve(String(argv[++index] || "")));
    else if (value === "--only") {
      args.only.push(...String(argv[++index] || "").split(",").map((item) => item.trim()).filter(Boolean));
    }
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (args.help) return args;
  if (args.profile !== PROFILE_ID) throw new Error("--profile must be parsed before the generator starts");
  if (!new Set(["lock", "poses", "qa"]).has(args.stage)) {
    throw new Error("--stage must be lock, poses, or qa");
  }
  if ((args.stage === "poses" || args.stage === "qa") && ![1, 2, 3].includes(args.select)) {
    throw new Error(`--stage ${args.stage} requires --select 1, 2, or 3`);
  }
  if (args.select && ![1, 2, 3].includes(args.select)) {
    throw new Error("--select must be 1, 2, or 3");
  }
  if (args.candidate && ![1, 2, 3].includes(args.candidate)) {
    throw new Error("--candidate must be 1, 2, or 3");
  }
  if (args.stage === "poses" && (args.candidate || args.references.length)) {
    throw new Error("--candidate and --reference are only valid for --stage lock");
  }
  if (args.stage === "lock" && args.only.length) {
    throw new Error("--only is only valid for --stage poses");
  }
  const unknownPoseIds = args.only.filter((id) => !POSE_TASKS.some((task) => task.id === id));
  if (unknownPoseIds.length) throw new Error(`Unknown --only pose ids: ${unknownPoseIds.join(", ")}`);
  args.only = [...new Set(args.only)];
  return args;
}

async function loadEnvFile() {
  try {
    const text = await fs.readFile(path.join(ROOT, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function resolveConfig() {
  const primaryModel = String(process.env.ARK_IMAGE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const configuredFallbacks = String(
    process.env.ARK_IMAGE_FALLBACK_MODELS
      || process.env.ARK_IMAGE_FALLBACK_MODEL
      || DEFAULT_FALLBACK_MODELS.join(","),
  ).split(",").map((value) => value.trim()).filter(Boolean);
  const models = [...new Set([primaryModel, ...configuredFallbacks])];
  const configuredBase = String(process.env.ARK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return {
    apiKey: String(process.env.ARK_API_KEY || "").trim(),
    apiBaseUrl: configuredBase.endsWith("/api/v3") ? configuredBase : `${configuredBase}/api/v3`,
    models,
  };
}

function lockPrompt(index) {
  return [
    CHARACTER_BIBLE,
    `这是三张候选中的第${index}张；${LOCK_VARIANTS[index - 1]}`,
    "如果提供了参考三视图，必须严格继承其中的脸、发型、发饰、服装结构、挂件、鞋与配色；不要复制白底，不要生成三视图，重新绘制一张单人正面全身定妆图",
    "用途是透明悬浮桌宠的唯一角色定妆锁图；保持成年设定、参考图的Q版比例和稳定身份",
    IMAGE_RULES,
    NEGATIVE_RULES,
  ].join("。") + "。";
}

function posePrompt(task) {
  const referenceNote = task.refs.length > 1
    ? "图一是不可改变身份的定妆锁；其余参考图只用于动作连续性。"
    : "参考图是不可改变身份的唯一角色定妆锁。";
  const poseEditingRule = task.lockPose
    ? "图二是必须逐像素级贴近的动作上一帧；保持其角色外轮廓、全身姿势、比例、尺寸、位置和基线，只修改动作要求明确允许的局部表情"
    : "参考图只用于锁定角色身份、服装与动作端点；不得机械复制端点姿势，必须按目标动作重新绘制自然完整的双手和双脚，五指自然、关节清楚，双腿和鞋之间保留清晰间隙";
  return [
    referenceNote,
    CHARACTER_BIBLE,
    `动作要求：${task.motion}`,
    "必须保持参考图的脸型、发型、发色、瞳色、成年体型、头身比、服装结构、饰件、鞋、线稿、配色和光源完全一致；只改变动作中明确指定的姿势和表情",
    poseEditingRule,
    "保持与定妆图一致的人物视觉尺寸和身体体积；站姿脚底基线稳定，坐卧姿势与悬浮窗底边形成可信的隐形支撑关系，动作转换前后重心连续",
    IMAGE_RULES,
    NEGATIVE_RULES,
  ].join("。") + "。";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.part-${process.pid}`;
  await fs.rm(temporary, { force: true });
  await fs.writeFile(temporary, data);
  try {
    await fs.rename(temporary, filePath);
  } catch (error) {
    if (!["EEXIST", "EPERM"].includes(error?.code)) throw error;
    await fs.rm(filePath, { force: true });
    await fs.rename(temporary, filePath);
  }
}

async function atomicWriteJson(filePath, value) {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw new Error(`Unable to read ${path.relative(ROOT, filePath)}: ${error.message}`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeErrorMessage(value, apiKey = "") {
  let text = String(value || "Unknown Ark error").slice(0, 600);
  if (apiKey) text = text.split(apiKey).join("[redacted]");
  return text.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "[redacted-image]");
}

class ArkError extends Error {
  constructor(message, { status = 0, code = "", retriable = false, modelUnavailable = false } = {}) {
    super(message);
    this.name = "ArkError";
    this.status = status;
    this.code = code;
    this.retriable = retriable;
    this.modelUnavailable = modelUnavailable;
  }
}

async function fetchTextWithTimeout(url, init, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBytesWithTimeout(url, init, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const declaredLength = Number(response.headers.get("content-length")) || 0;
    if (declaredLength > MAX_DOWNLOAD_BYTES) throw new Error("Generated image exceeds 32 MiB");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error("Generated image exceeds 32 MiB");
    return { response, bytes };
  } finally {
    clearTimeout(timer);
  }
}

async function fileToDataUrl(filePath) {
  let bytes = await fs.readFile(filePath);
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error(`Reference is too large: ${path.basename(filePath)}`);
  if (path.extname(filePath).toLowerCase() === ".png") {
    try {
      const png = PNG.sync.read(bytes, { checkCRC: true });
      let hasTransparent = false;
      for (let offset = 3; offset < png.data.length; offset += 4) {
        if (png.data[offset] < 250) { hasTransparent = true; break; }
      }
      if (hasTransparent) {
        for (let offset = 0; offset < png.data.length; offset += 4) {
          const alpha = png.data[offset + 3] / 255;
          png.data[offset] = Math.round((png.data[offset] * alpha) + (255 * (1 - alpha)));
          png.data[offset + 1] = Math.round(png.data[offset + 1] * alpha);
          png.data[offset + 2] = Math.round((png.data[offset + 2] * alpha) + (255 * (1 - alpha)));
          png.data[offset + 3] = 255;
        }
        bytes = encodePng(png);
      }
    } catch {
      // Leave non-PNG or malformed reference handling to the API.
    }
  }
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function downloadGeneratedImage(url) {
  let response;
  let bytes;
  try {
    ({ response, bytes } = await fetchBytesWithTimeout(url, { method: "GET", redirect: "follow" }));
  } catch (error) {
    throw new ArkError(`Generated image download failed: ${safeErrorMessage(error.message)}`, {
      retriable: true,
    });
  }
  if (!response.ok) throw new ArkError(`Generated image download failed (${response.status})`, {
    status: response.status,
    retriable: response.status === 429 || response.status >= 500,
  });
  return bytes;
}

async function requestArkImage(config, model, prompt, referencePaths) {
  const referenceData = [];
  for (const referencePath of referencePaths) referenceData.push(await fileToDataUrl(referencePath));
  const body = {
    model,
    prompt,
    size: "2K",
    response_format: "url",
    watermark: false,
    sequential_image_generation: "disabled",
  };
  if (referenceData.length) body.image = referenceData.length === 1 ? referenceData[0] : referenceData;

  let response;
  let responseText;
  try {
    ({ response, text: responseText } = await fetchTextWithTimeout(`${config.apiBaseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    }));
  } catch (error) {
    throw new ArkError(`Ark request failed: ${safeErrorMessage(error.message, config.apiKey)}`, {
      retriable: true,
    });
  } finally {
    referenceData.length = 0;
    delete body.image;
  }

  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (!response.ok) throw new ArkError(`Ark returned non-JSON error (${response.status})`, {
      status: response.status,
      retriable: response.status === 429 || response.status >= 500,
    });
  }
  if (!response.ok) {
    const code = String(payload?.error?.code || payload?.code || "");
    const message = safeErrorMessage(payload?.error?.message || payload?.message || `HTTP ${response.status}`, config.apiKey);
    const modelUnavailable = /model|endpoint/i.test(`${code} ${message}`)
      && /not.?found|not.?open|not activated|invalid|unsupported|unavailable|permission|forbidden/i.test(`${code} ${message}`);
    throw new ArkError(`Ark ${response.status}${code ? ` ${code}` : ""}: ${message}`, {
      status: response.status,
      code,
      retriable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
      modelUnavailable,
    });
  }

  const item = payload?.data?.[0];
  if (item?.b64_json) {
    const bytes = Buffer.from(item.b64_json, "base64");
    if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error("Generated image exceeds 32 MiB");
    return bytes;
  }
  if (item?.url) return downloadGeneratedImage(item.url);
  throw new ArkError("Ark response contained no generated image");
}

async function generateWithModelFallback(config, prompt, referencePaths) {
  let lastError = null;
  for (let modelIndex = 0; modelIndex < config.models.length; modelIndex += 1) {
    const model = config.models[modelIndex];
    for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt += 1) {
      try {
        return { bytes: await requestArkImage(config, model, prompt, referencePaths), model };
      } catch (error) {
        lastError = error;
        const canRetry = error?.retriable && attempt < REQUEST_RETRIES;
        if (canRetry) {
          const delay = 900 * (2 ** (attempt - 1));
          console.warn(`  Ark ${model} attempt ${attempt} failed; retrying in ${delay}ms: ${safeErrorMessage(error.message, config.apiKey)}`);
          await sleep(delay);
          continue;
        }
        const hasFallback = modelIndex + 1 < config.models.length;
        if (hasFallback && (error?.modelUnavailable || error?.retriable)) {
          console.warn(`  Ark model ${model} unavailable; falling back to ${config.models[modelIndex + 1]}.`);
          break;
        }
        throw error;
      }
    }
  }
  throw lastError || new Error("No Ark image model succeeded");
}

function decodeRaster(bytes) {
  if (bytes.length < 16) throw new Error("Generated image is empty or truncated");
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    const png = PNG.sync.read(bytes, { checkCRC: true });
    return { width: png.width, height: png.height, data: Buffer.from(png.data) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    return { width: image.width, height: image.height, data: Buffer.from(image.data) };
  }
  throw new Error("Ark returned an unsupported image format; expected PNG or JPEG");
}

function sampleBilinear(source, sourceX, sourceY, output, outputIndex) {
  const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(sourceX)));
  const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(sourceY)));
  const x1 = Math.min(source.width - 1, x0 + 1);
  const y1 = Math.min(source.height - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, sourceX - x0));
  const fy = Math.max(0, Math.min(1, sourceY - y0));
  const samples = [
    { index: (y0 * source.width + x0) * 4, weight: (1 - fx) * (1 - fy) },
    { index: (y0 * source.width + x1) * 4, weight: fx * (1 - fy) },
    { index: (y1 * source.width + x0) * 4, weight: (1 - fx) * fy },
    { index: (y1 * source.width + x1) * 4, weight: fx * fy },
  ];
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const sample of samples) {
    const normalizedAlpha = source.data[sample.index + 3] / 255;
    const weight = sample.weight * normalizedAlpha;
    alpha += weight;
    red += source.data[sample.index] * weight;
    green += source.data[sample.index + 1] * weight;
    blue += source.data[sample.index + 2] * weight;
  }
  output[outputIndex + 3] = Math.round(alpha * 255);
  if (alpha > 0) {
    output[outputIndex] = Math.round(red / alpha);
    output[outputIndex + 1] = Math.round(green / alpha);
    output[outputIndex + 2] = Math.round(blue / alpha);
  }
}

function normalizeCanvas(source) {
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height)
    || source.width < 512 || source.height < 512 || source.width > 8192 || source.height > 8192) {
    throw new Error(`Unexpected generated dimensions: ${source.width}x${source.height}`);
  }
  const aspect = source.width / source.height;
  if (aspect < 0.82 || aspect > 1.22) {
    throw new Error(`Generated image is not close enough to square: ${source.width}x${source.height}`);
  }

  let transparentEdge = 0;
  let edgeSamples = 0;
  for (let x = 0; x < source.width; x += Math.max(1, Math.floor(source.width / 128))) {
    for (const y of [0, source.height - 1]) {
      edgeSamples += 1;
      if (source.data[(y * source.width + x) * 4 + 3] < 32) transparentEdge += 1;
    }
  }
  const hasTransparentBackground = transparentEdge / Math.max(1, edgeSamples) > 0.35;
  const target = new PNG({ width: CANVAS_SIZE, height: CANVAS_SIZE, colorType: 6 });
  if (!hasTransparentBackground) {
    for (let offset = 0; offset < target.data.length; offset += 4) {
      target.data[offset] = MAGENTA[0];
      target.data[offset + 1] = MAGENTA[1];
      target.data[offset + 2] = MAGENTA[2];
      target.data[offset + 3] = MAGENTA[3];
    }
  }

  // Keep a small, deterministic gutter around every generated frame. Seedream can
  // honor "full body" while still placing a shoe or strand of hair on the source
  // edge; the gutter prevents that valid pose from being rejected after keying.
  const scale = Math.min(
    (CANVAS_SIZE * SAFE_CANVAS_SCALE) / source.width,
    (CANVAS_SIZE * SAFE_CANVAS_SCALE) / source.height,
  );
  const drawWidth = Math.max(1, Math.round(source.width * scale));
  const drawHeight = Math.max(1, Math.round(source.height * scale));
  const offsetX = Math.floor((CANVAS_SIZE - drawWidth) / 2);
  const offsetY = Math.floor((CANVAS_SIZE - drawHeight) / 2);
  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = ((y + 0.5) / scale) - 0.5;
    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = ((x + 0.5) / scale) - 0.5;
      sampleBilinear(source, sourceX, sourceY, target.data, ((offsetY + y) * CANVAS_SIZE + offsetX + x) * 4);
    }
  }
  return target;
}

function isMagentaLike(red, green, blue) {
  return red >= 150 && blue >= 150 && green <= 150
    && ((red + blue) / 2 - green) >= 65;
}

function removeMagentaBackground(png) {
  const width = png.width;
  const height = png.height;
  const pixelCount = width * height;
  let transparentEdges = 0;
  let edgeCount = 0;
  let magentaEdges = 0;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;

  const sampleEdge = (x, y) => {
    const offset = (y * width + x) * 4;
    const alpha = png.data[offset + 3];
    edgeCount += 1;
    if (alpha < 24) transparentEdges += 1;
    const red = png.data[offset];
    const green = png.data[offset + 1];
    const blue = png.data[offset + 2];
    if (alpha >= 24 && isMagentaLike(red, green, blue)) {
      magentaEdges += 1;
      redTotal += red;
      greenTotal += green;
      blueTotal += blue;
    }
  };
  const stride = 4;
  for (let x = 0; x < width; x += stride) {
    sampleEdge(x, 0);
    sampleEdge(x, height - 1);
  }
  for (let y = stride; y < height - stride; y += stride) {
    sampleEdge(0, y);
    sampleEdge(width - 1, y);
  }

  if (transparentEdges / Math.max(1, edgeCount) > 0.55 && magentaEdges / Math.max(1, edgeCount) < 0.1) {
    for (let offset = 0; offset < png.data.length; offset += 4) {
      if (png.data[offset + 3] === 0) {
        png.data[offset] = 248;
        png.data[offset + 1] = 248;
        png.data[offset + 2] = 248;
      }
    }
    return { mode: "already-transparent", background: null };
  }
  if (magentaEdges / Math.max(1, edgeCount) < 0.45) {
    throw new Error("Generated image did not provide a reliable pure-magenta edge background");
  }

  const background = [
    Math.round(redTotal / magentaEdges),
    Math.round(greenTotal / magentaEdges),
    Math.round(blueTotal / magentaEdges),
  ];
  const outside = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const colorDistance = (offset) => Math.sqrt(
    (png.data[offset] - background[0]) ** 2
      + (png.data[offset + 1] - background[1]) ** 2
      + (png.data[offset + 2] - background[2]) ** 2,
  );
  const traversable = (index) => {
    const offset = index * 4;
    if (png.data[offset + 3] < 24) return true;
    return isMagentaLike(png.data[offset], png.data[offset + 1], png.data[offset + 2])
      && colorDistance(offset) <= 165;
  };
  const seed = (index) => {
    if (!outside[index] && traversable(index)) {
      outside[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) seed(index - 1);
    if (x + 1 < width) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y + 1 < height) seed(index + width);
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (!outside[index]) continue;
    const offset = index * 4;
    const originalAlpha = png.data[offset + 3] / 255;
    const distance = colorDistance(offset);
    const foregroundCoverage = Math.max(0, Math.min(1, (distance - 22) / 128));
    const alpha = originalAlpha * foregroundCoverage;
    if (alpha <= 0.01) {
      png.data[offset] = 248;
      png.data[offset + 1] = 248;
      png.data[offset + 2] = 248;
      png.data[offset + 3] = 0;
      continue;
    }
    const inverse = 1 - foregroundCoverage;
    png.data[offset] = Math.max(0, Math.min(255,
      Math.round((png.data[offset] - background[0] * inverse) / foregroundCoverage)));
    png.data[offset + 1] = Math.max(0, Math.min(255,
      Math.round((png.data[offset + 1] - background[1] * inverse) / foregroundCoverage)));
    png.data[offset + 2] = Math.max(0, Math.min(255,
      Math.round((png.data[offset + 2] - background[2] * inverse) / foregroundCoverage)));
    png.data[offset + 3] = Math.round(alpha * 255);
  }

  // The importer keys near-white background pixels before consulting alpha.
  // Keep invisible RGB near white so a transparent frame cannot become black.
  for (let offset = 0; offset < png.data.length; offset += 4) {
    if (png.data[offset + 3] === 0) {
      png.data[offset] = 248;
      png.data[offset + 1] = 248;
      png.data[offset + 2] = 248;
    }
  }
  return { mode: "magenta-edge-flood", background };
}

function removeVividEdgeChromaBackground(png) {
  const samples = [];
  const add = (x, y) => {
    const offset = ((y * png.width) + x) * 4;
    samples.push([png.data[offset], png.data[offset + 1], png.data[offset + 2]]);
  };
  const stride = Math.max(1, Math.floor(Math.min(png.width, png.height) / 384));
  for (let x = 0; x < png.width; x += stride) { add(x, 0); add(x, png.height - 1); }
  for (let y = stride; y < png.height - stride; y += stride) { add(0, y); add(png.width - 1, y); }
  const median = (channel) => samples.map((sample) => sample[channel]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  const background = [median(0), median(1), median(2)];
  const sorted = [...background].sort((a, b) => b - a);
  // Seedream preserves the requested chroma *family* but commonly shades it
  // into a broad red/magenta studio gradient.  Treat that as a matte when it
  // is strongly channel-dominant; the flood fill below still limits removal
  // to pixels connected to the canvas edge, so skin, hair and clothing inside
  // the outlined subject cannot be erased merely because their hue is warm.
  if (sorted[0] < 150 || sorted[0] - sorted[1] < 42) return null;
  const distance = (offset) => Math.sqrt(
    ((png.data[offset] - background[0]) ** 2)
    + ((png.data[offset + 1] - background[1]) ** 2)
    + ((png.data[offset + 2] - background[2]) ** 2)
  );
  const support = samples.filter((sample) => Math.sqrt(
    ((sample[0] - background[0]) ** 2)
    + ((sample[1] - background[1]) ** 2)
    + ((sample[2] - background[2]) ** 2)
  ) <= 138).length / Math.max(1, samples.length);
  if (support < 0.34) return null;

  const total = png.width * png.height;
  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const dominantChannel = background.indexOf(Math.max(...background));
  const traversable = (index) => {
    const offset = index * 4;
    const channels = [png.data[offset], png.data[offset + 1], png.data[offset + 2]];
    const others = channels.filter((_, channel) => channel !== dominantChannel);
    return distance(offset) <= 232
      && channels[dominantChannel] - Math.max(...others) >= 100;
  };
  const seed = (index) => {
    if (outside[index] || !traversable(index)) return;
    outside[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < png.width; x += 1) { seed(x); seed(((png.height - 1) * png.width) + x); }
  for (let y = 1; y < png.height - 1; y += 1) { seed(y * png.width); seed((y * png.width) + png.width - 1); }
  while (head < tail) {
    const index = queue[head++];
    const x = index % png.width;
    const y = Math.floor(index / png.width);
    if (x > 0) seed(index - 1);
    if (x + 1 < png.width) seed(index + 1);
    if (y > 0) seed(index - png.width);
    if (y + 1 < png.height) seed(index + png.width);
  }
  if (tail < total * 0.16) return null;
  for (let index = 0; index < total; index += 1) {
    if (!outside[index]) continue;
    const offset = index * 4;
    // Remove the edge-connected chroma region as a binary matte. Estimating a
    // fractional foreground coverage from a generated gradient over-corrects
    // red into a cyan halo. Runtime atlas downsampling supplies the final
    // antialiasing without recoloring pale clothes or dark hair.
    png.data[offset] = 0;
    png.data[offset + 1] = 0;
    png.data[offset + 2] = 0;
    png.data[offset + 3] = 0;
  }
  return { mode: "vivid-edge-chroma-flood", background, support: Number(support.toFixed(4)) };
}

function removeUniformSecondaryBackground(png) {
  const total = png.width * png.height;
  let opaque = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha <= 24) continue;
      opaque += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (opaque / total <= 0.7 || maxX < minX || maxY < minY) return null;

  const samples = [];
  const addSample = (x, y) => {
    const offset = (y * png.width + x) * 4;
    if (png.data[offset + 3] > 24) {
      samples.push([png.data[offset], png.data[offset + 1], png.data[offset + 2]]);
    }
  };
  for (let x = minX; x <= maxX; x += 3) {
    addSample(x, minY);
    addSample(x, maxY);
  }
  for (let y = minY + 3; y < maxY; y += 3) {
    addSample(minX, y);
    addSample(maxX, y);
  }
  if (samples.length < 64) throw new Error("Generated image has no reliable uniform backdrop samples");

  const medianChannel = (channel) => {
    const values = samples.map((sample) => sample[channel]).sort((left, right) => left - right);
    return values[Math.floor(values.length / 2)];
  };
  const background = [medianChannel(0), medianChannel(1), medianChannel(2)];
  const distanceAt = (offset) => Math.sqrt(
    (png.data[offset] - background[0]) ** 2
      + (png.data[offset + 1] - background[1]) ** 2
      + (png.data[offset + 2] - background[2]) ** 2,
  );
  const uniformSamples = samples.filter((sample) => Math.sqrt(
    (sample[0] - background[0]) ** 2
      + (sample[1] - background[1]) ** 2
      + (sample[2] - background[2]) ** 2,
  ) <= 36).length;
  if (uniformSamples / samples.length < 0.65) {
    throw new Error("Generated image retained a non-uniform or scenic background");
  }

  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  // Expand the non-background outline by two pixels before flood filling. This
  // closes tiny JPEG/antialias gaps that otherwise let a pale studio matte leak
  // into white jackets, socks and hair highlights.
  const barrier = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    if (png.data[offset + 3] > 24 && distanceAt(offset) > 56) barrier[index] = 1;
  }
  const closedBarrier = new Uint8Array(barrier);
  for (let index = 0; index < total; index += 1) {
    if (!barrier[index]) continue;
    const x = index % png.width;
    const y = Math.floor(index / png.width);
    for (let oy = -2; oy <= 2; oy += 1) {
      for (let ox = -2; ox <= 2; ox += 1) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx >= 0 && nx < png.width && ny >= 0 && ny < png.height) {
          closedBarrier[ny * png.width + nx] = 1;
        }
      }
    }
  }
  let head = 0;
  let tail = 0;
  const traversable = (index) => {
    const offset = index * 4;
    return !closedBarrier[index] && (png.data[offset + 3] <= 24 || distanceAt(offset) <= 56);
  };
  const seed = (index) => {
    if (!outside[index] && traversable(index)) {
      outside[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = minX; x <= maxX; x += 1) {
    seed(minY * png.width + x);
    seed(maxY * png.width + x);
  }
  for (let y = minY; y <= maxY; y += 1) {
    seed(y * png.width + minX);
    seed(y * png.width + maxX);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % png.width;
    const y = Math.floor(index / png.width);
    if (x > 0) seed(index - 1);
    if (x + 1 < png.width) seed(index + 1);
    if (y > 0) seed(index - png.width);
    if (y + 1 < png.height) seed(index + png.width);
  }

  let removed = 0;
  for (let index = 0; index < total; index += 1) {
    if (!outside[index]) continue;
    const offset = index * 4;
    const originalAlpha = png.data[offset + 3] / 255;
    if (originalAlpha <= 0.01) continue;
    const foregroundCoverage = Math.max(0, Math.min(1, (distanceAt(offset) - 8) / 48));
    const alpha = originalAlpha * foregroundCoverage;
    removed += 1;
    if (alpha <= 0.01) {
      png.data[offset] = 248;
      png.data[offset + 1] = 248;
      png.data[offset + 2] = 248;
      png.data[offset + 3] = 0;
      continue;
    }
    const inverse = 1 - foregroundCoverage;
    png.data[offset] = Math.max(0, Math.min(255,
      Math.round((png.data[offset] - background[0] * inverse) / foregroundCoverage)));
    png.data[offset + 1] = Math.max(0, Math.min(255,
      Math.round((png.data[offset + 1] - background[1] * inverse) / foregroundCoverage)));
    png.data[offset + 2] = Math.max(0, Math.min(255,
      Math.round((png.data[offset + 2] - background[2] * inverse) / foregroundCoverage)));
    png.data[offset + 3] = Math.round(alpha * 255);
  }
  if (removed < total * 0.1) throw new Error("Uniform backdrop removal did not isolate the character");
  return {
    mode: "uniform-edge-flood",
    background,
    edgeSupport: Number((uniformSamples / samples.length).toFixed(4)),
  };
}

function countCheckerboardResidue(png) {
  // Detect baked checkerboard fake-transparency (Codex lesson): alternating gray tiles inside opaque/mid-alpha.
  let hits = 0;
  const step = 4;
  for (let y = 0; y < png.height - step; y += step) {
    for (let x = 0; x < png.width - step; x += step) {
      const samples = [];
      for (const [dx, dy] of [[0, 0], [step, 0], [0, step], [step, step]]) {
        const offset = ((y + dy) * png.width + (x + dx)) * 4;
        const alpha = png.data[offset + 3];
        // Baked checkerboards matter only in the antialiased matte fringe.
        // Opaque garment patterns (the female default has pale blue diamonds)
        // are legitimate identity detail and must never trip this detector.
        if (alpha < 24 || alpha > 220) {
          samples.length = 0;
          break;
        }
        const luminance = (png.data[offset] + png.data[offset + 1] + png.data[offset + 2]) / 3;
        const spread = Math.max(png.data[offset], png.data[offset + 1], png.data[offset + 2])
          - Math.min(png.data[offset], png.data[offset + 1], png.data[offset + 2]);
        if (spread > 28) {
          samples.length = 0;
          break;
        }
        samples.push(luminance);
      }
      if (samples.length !== 4) continue;
      const diagonalA = Math.abs(samples[0] - samples[3]);
      const diagonalB = Math.abs(samples[1] - samples[2]);
      const pairA = Math.abs(samples[0] - samples[1]);
      const pairB = Math.abs(samples[2] - samples[3]);
      const mean = (samples[0] + samples[1] + samples[2] + samples[3]) / 4;
      if (mean < 120 || mean > 230) continue;
      if (diagonalA < 18 && diagonalB < 18 && pairA > 28 && pairB > 28) hits += 1;
      if (pairA < 18 && pairB < 18 && diagonalA > 28 && diagonalB > 28) hits += 1;
    }
  }
  return hits;
}

function analyzeInteriorTransparency(png) {
  const width = png.width;
  const height = png.height;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const isTransparent = (index) => png.data[(index * 4) + 3] < 24;
  let head = 0;
  let tail = 0;
  const enqueue = (index) => {
    if (visited[index] || !isTransparent(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue(((height - 1) * width) + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue((y * width) + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  let components = 0;
  let pixels = 0;
  let largest = 0;
  let fragmentedComponents = 0;
  let fragmentedPixels = 0;
  for (let seed = 0; seed < total; seed += 1) {
    if (visited[seed] || !isTransparent(seed)) continue;
    let componentPixels = 0;
    head = 0;
    tail = 0;
    visited[seed] = 1;
    queue[tail++] = seed;
    while (head < tail) {
      const index = queue[head++];
      componentPixels += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const visit = (next) => {
        if (visited[next] || !isTransparent(next)) return;
        visited[next] = 1;
        queue[tail++] = next;
      };
      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
    if (componentPixels < 4) continue;
    components += 1;
    pixels += componentPixels;
    largest = Math.max(largest, componentPixels);
    // Large enclosed spaces between arms, hair, clothes and legs are a normal
    // part of a character silhouette. Only count the small islands that are
    // characteristic of a damaged segmentation mask.
    if (componentPixels <= 512) {
      fragmentedComponents += 1;
      fragmentedPixels += componentPixels;
    }
  }
  return { components, pixels, largest, fragmentedComponents, fragmentedPixels };
}

function analyzeFrame(png) {
  let foreground = 0;
  let transparent = 0;
  let magentaResidue = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const alpha = png.data[offset + 3];
      if (alpha < 16) transparent += 1;
      if (alpha <= 24) continue;
      foreground += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (alpha > 96 && isMagentaLike(png.data[offset], png.data[offset + 1], png.data[offset + 2])
        && Math.abs(png.data[offset] - png.data[offset + 2]) < 45
        && png.data[offset + 1] < 80) magentaResidue += 1;
    }
  }
  const total = png.width * png.height;
  if (foreground < total * 0.025) throw new Error("QA rejected frame: foreground character is missing or too small");
  if (foreground > total * 0.7) {
    throw new Error("QA rejected frame: opaque or non-uniform background remains");
  }
  if (transparent < total * 0.1) throw new Error("QA rejected frame: transparent background is insufficient");
  if (minX <= 1 || minY <= 1 || maxX >= png.width - 2 || maxY >= png.height - 2) {
    throw new Error("QA rejected frame: character or artifact touches the canvas edge");
  }
  if (Math.max(maxX - minX + 1, maxY - minY + 1) < 520) {
    throw new Error("QA rejected frame: character silhouette is too small");
  }
  if (magentaResidue > foreground * 0.01) {
    throw new Error("QA rejected frame: too much keyed magenta remains inside the visible subject");
  }
  const checkerboardHits = countCheckerboardResidue(png);
  if (checkerboardHits > 12) {
    throw new Error(`QA rejected frame: checkerboard fake-transparency residue (${checkerboardHits} tiles)`);
  }
  const interiorTransparency = analyzeInteriorTransparency(png);
  // Interior voids are reported for contact-sheet review. They cannot be a
  // reliable hard gate: hair strands, fingers, ribbons and garment line art
  // legitimately create hundreds of enclosed regions in anime illustrations.
  return {
    foregroundRatio: Number((foreground / total).toFixed(4)),
    transparentRatio: Number((transparent / total).toFixed(4)),
    magentaResidue,
    checkerboardHits,
    interiorTransparency,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    centerX: minX + ((maxX - minX) / 2),
    footY: maxY,
  };
}

function encodePng(png) {
  return PNG.sync.write(png, {
    bitDepth: 8,
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
    deflateStrategy: 3,
  });
}

function stripNeutralCastShadows(png) {
  let removedPixels = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3];
    if (alpha <= 8) continue;
    const red = png.data[offset];
    const green = png.data[offset + 1];
    const blue = png.data[offset + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const luminance = (red + green + blue) / 3;
    if (maximum - minimum > 18 || luminance < 105 || luminance > 205) continue;
    png.data[offset] = 248;
    png.data[offset + 1] = 248;
    png.data[offset + 2] = 248;
    png.data[offset + 3] = 0;
    removedPixels += 1;
  }
  return { mode: "neutral-shadow-strip", removedPixels };
}

function scaleTransparentSubject(png, factor) {
  if (!Number.isFinite(factor) || factor <= 0 || factor > 1) {
    throw new Error(`Invalid transparent-subject scale: ${factor}`);
  }
  if (factor === 1) return { png, metadata: null };
  const before = analyzeFrame(png);
  const sourceBounds = before.bounds;
  const drawWidth = Math.max(1, Math.round(sourceBounds.width * factor));
  const drawHeight = Math.max(1, Math.round(sourceBounds.height * factor));
  const gutterBottom = Math.max(48, png.height - (sourceBounds.y + sourceBounds.height));
  const offsetX = Math.round((png.width - drawWidth) / 2);
  const offsetY = Math.max(24, png.height - gutterBottom - drawHeight);
  const target = new PNG({ width: png.width, height: png.height, colorType: 6 });
  for (let offset = 0; offset < target.data.length; offset += 4) {
    target.data[offset] = 248;
    target.data[offset + 1] = 248;
    target.data[offset + 2] = 248;
    target.data[offset + 3] = 0;
  }
  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = sourceBounds.y + (((y + 0.5) / factor) - 0.5);
    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = sourceBounds.x + (((x + 0.5) / factor) - 0.5);
      sampleBilinear(png, sourceX, sourceY, target.data, ((offsetY + y) * target.width + offsetX + x) * 4);
    }
  }
  return {
    png: target,
    metadata: {
      mode: "transparent-subject-scale",
      factor,
      sourceBounds,
      targetBounds: { x: offsetX, y: offsetY, width: drawWidth, height: drawHeight },
    },
  };
}

function registerTransparentSubject(png, referencePng) {
  const source = analyzeFrame(png).bounds;
  const reference = analyzeFrame(referencePng).bounds;
  const factor = reference.height / source.height;
  if (!Number.isFinite(factor) || factor < 0.75 || factor > 1.25) {
    throw new Error(`Registration scale ${factor.toFixed(4)} is outside the continuity safety range`);
  }
  const drawWidth = Math.max(1, Math.round(source.width * factor));
  const drawHeight = Math.max(1, Math.round(source.height * factor));
  const referenceCenterX = reference.x + ((reference.width - 1) / 2);
  const referenceBottom = reference.y + reference.height - 1;
  const offsetX = Math.round(referenceCenterX - ((drawWidth - 1) / 2));
  const offsetY = Math.round(referenceBottom - drawHeight + 1);
  if (offsetX < 2 || offsetY < 2 || offsetX + drawWidth >= png.width - 2 || offsetY + drawHeight >= png.height - 2) {
    throw new Error("Registered subject would touch the canvas edge");
  }
  const target = new PNG({ width: png.width, height: png.height, colorType: 6 });
  for (let offset = 0; offset < target.data.length; offset += 4) {
    target.data[offset] = 248;
    target.data[offset + 1] = 248;
    target.data[offset + 2] = 248;
    target.data[offset + 3] = 0;
  }
  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = source.y + (((y + 0.5) / factor) - 0.5);
    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = source.x + (((x + 0.5) / factor) - 0.5);
      sampleBilinear(png, sourceX, sourceY, target.data, ((offsetY + y) * target.width + offsetX + x) * 4);
    }
  }
  return {
    png: target,
    metadata: {
      mode: "transparent-subject-registration",
      factor: Number(factor.toFixed(6)),
      sourceBounds: source,
      referenceBounds: reference,
      targetBounds: { x: offsetX, y: offsetY, width: drawWidth, height: drawHeight },
    },
  };
}

async function removeBackgroundWithAnimeModel(bytes, { requireRembg = false } = {}) {
  const source = decodeRaster(bytes);
  let transparentPixels = 0;
  for (let offset = 3; offset < source.data.length; offset += 4) {
    if (source.data[offset] < 24) transparentPixels += 1;
  }
  if (transparentPixels / Math.max(1, source.width * source.height) >= 0.1) {
    return { bytes, mode: "trusted-source-alpha" };
  }
  // A pure chroma matte is more deterministic than semantic segmentation for
  // white clothes, pale hair and thin accessories. Seedream is explicitly
  // asked for #FF00FF; preserve that source and let the flood-fill keyer below
  // remove only edge-connected matte pixels.
  let edgeSamples = 0;
  let magentaSamples = 0;
  const sampleEdge = (x, y) => {
    const offset = ((y * source.width) + x) * 4;
    edgeSamples += 1;
    if (isMagentaLike(source.data[offset], source.data[offset + 1], source.data[offset + 2])) {
      magentaSamples += 1;
    }
  };
  const stride = Math.max(1, Math.floor(Math.min(source.width, source.height) / 384));
  for (let x = 0; x < source.width; x += stride) {
    sampleEdge(x, 0);
    sampleEdge(x, source.height - 1);
  }
  for (let y = stride; y < source.height - stride; y += stride) {
    sampleEdge(0, y);
    sampleEdge(source.width - 1, y);
  }
  if (magentaSamples / Math.max(1, edgeSamples) >= 0.72) {
    return { bytes, mode: "pure-magenta-key" };
  }
  const vividCanvas = new PNG({ width: source.width, height: source.height, colorType: 6 });
  source.data.copy(vividCanvas.data);
  const vividCleanup = removeVividEdgeChromaBackground(vividCanvas);
  if (vividCleanup) {
    return {
      bytes: encodePng(vividCanvas),
      mode: "source-vivid-chroma-key",
      background: vividCleanup.background,
    };
  }
  // Some Ark models ignore the requested magenta matte and return a pale
  // studio/checker backdrop.  Key that backdrop from the edge *before* the
  // semantic anime segmenter sees the frame.  Because the flood cannot cross
  // the character's dark outline, white jackets and pale hair remain intact.
  const uniformCanvas = new PNG({ width: source.width, height: source.height, colorType: 6 });
  source.data.copy(uniformCanvas.data);
  try {
    const uniformCleanup = removeUniformSecondaryBackground(uniformCanvas);
    if (uniformCleanup && PROFILE_ID !== "yueqi-female" && PROFILE_ID !== "yueqi-male") {
      return {
        bytes: encodePng(uniformCanvas),
        mode: "source-uniform-matte-key",
        background: uniformCleanup.background,
      };
    }
  } catch {
    // A scenic or strongly non-uniform edge is not safe to color-key; continue
    // to the anime segmenter, which will either pass QA or trigger regeneration.
  }
  // The two Yueqi defaults deliberately continue into the anime-trimap +
  // GrabCut path. Their white garments and pale hair are too close to a studio
  // matte for colour-only keying, while the refined trimap preserves them.
  // Seedream often returns a perfectly flat white/gray studio matte instead
  // of the requested chroma color. Key that edge-connected matte directly
  // before semantic segmentation; this preserves pale hair and white clothes
  // that isnet-anime can mistake for background.
  const bundledVenv = path.join(ROOT, ".tmp", "rembg-venv", "Scripts", "python.exe");
  const python = String(process.env.XINGLI_REMBG_PYTHON || ((await exists(bundledVenv)) ? bundledVenv : "")).trim();
  if (!python) {
    if (requireRembg) {
      throw new Error(
        "Desktop-pet quality path requires rembg isnet-anime. Set XINGLI_REMBG_PYTHON or create .tmp/rembg-venv; local color-key fallback is not accepted.",
      );
    }
    return { bytes, mode: "local-keying" };
  }

  const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), "xingli-rembg-"));
  const inputPath = path.join(temporaryRoot, "input.image");
  const outputPath = path.join(temporaryRoot, "output.png");
  try {
    await fs.writeFile(inputPath, bytes);
    await new Promise((resolve, reject) => {
      const child = spawn(python, [
        path.join(ROOT, "scripts", "remove-anime-background.py"),
        inputPath,
        outputPath,
      ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Anime background removal timed out"));
      }, 10 * 60 * 1000);
      child.stderr.on("data", (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-8000);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`Anime background removal failed (${code}): ${stderr.trim()}`));
      });
    });
    return { bytes: await fs.readFile(outputPath), mode: "rembg-isnet-anime" };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function decontaminateNeutralMatteEdges(png, matte = [184, 184, 184]) {
  let correctedPixels = 0;
  let clearedPixels = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alphaByte = png.data[offset + 3];
    if (alphaByte <= 2) {
      png.data[offset] = 0;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 0;
      png.data[offset + 3] = 0;
      clearedPixels += 1;
      continue;
    }
    if (alphaByte >= 252) continue;
    const alpha = alphaByte / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const observed = png.data[offset + channel];
      const restored = (observed - (matte[channel] * (1 - alpha))) / alpha;
      png.data[offset + channel] = Math.max(0, Math.min(255, Math.round(restored)));
    }
    correctedPixels += 1;
  }
  return { mode: "straight-alpha-neutral-despill", correctedPixels, clearedPixels };
}

function restoreInteriorSubjectPixels(png, original, matte = [184, 184, 184]) {
  const width = png.width;
  const height = png.height;
  if (original.width !== width || original.height !== height) {
    throw new Error("Interior-alpha repair requires aligned source and segmented canvases");
  }
  const total = width * height;
  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const isTransparent = (index) => png.data[(index * 4) + 3] < 24;
  const enqueue = (index) => {
    if (outside[index] || !isTransparent(index)) return;
    outside[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue(((height - 1) * width) + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue((y * width) + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  let restoredPixels = 0;
  for (let index = 0; index < total; index += 1) {
    if (outside[index] || !isTransparent(index)) continue;
    const offset = index * 4;
    const distance = Math.sqrt(
      ((original.data[offset] - matte[0]) ** 2)
      + ((original.data[offset + 1] - matte[1]) ** 2)
      + ((original.data[offset + 2] - matte[2]) ** 2),
    );
    if (distance < 42) continue;
    png.data[offset] = original.data[offset];
    png.data[offset + 1] = original.data[offset + 1];
    png.data[offset + 2] = original.data[offset + 2];
    png.data[offset + 3] = 255;
    restoredPixels += 1;
  }
  return { mode: "source-guided-interior-alpha-repair", restoredPixels };
}

function restoreChromaKeyInteriorPixels(png, original, background) {
  const width = png.width;
  const height = png.height;
  if (original.width !== width || original.height !== height) {
    throw new Error("Chroma interior repair requires aligned source and keyed canvases");
  }
  const total = width * height;
  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const isTransparent = (index) => png.data[(index * 4) + 3] < 24;
  const enqueue = (index) => {
    if (outside[index] || !isTransparent(index)) return;
    outside[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue(((height - 1) * width) + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue((y * width) + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  const dominantChannel = background.indexOf(Math.max(...background));
  let restoredPixels = 0;
  for (let index = 0; index < total; index += 1) {
    if (outside[index] || !isTransparent(index)) continue;
    const offset = index * 4;
    const channels = [original.data[offset], original.data[offset + 1], original.data[offset + 2]];
    const others = channels.filter((_, channel) => channel !== dominantChannel);
    const remainsMatte = channels[dominantChannel] - Math.max(...others) >= 48;
    if (remainsMatte) continue;
    png.data[offset] = channels[0];
    png.data[offset + 1] = channels[1];
    png.data[offset + 2] = channels[2];
    png.data[offset + 3] = 255;
    restoredPixels += 1;
  }
  return { mode: "source-guided-chroma-interior-repair", restoredPixels };
}

function repairSmallInteriorAlphaHoles(png, maxArea = 512) {
  const width = png.width;
  const height = png.height;
  const total = width * height;
  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  const isTransparent = (index) => png.data[(index * 4) + 3] < 24;
  let head = 0;
  let tail = 0;
  const enqueueOutside = (index) => {
    if (outside[index] || !isTransparent(index)) return;
    outside[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueueOutside(x);
    enqueueOutside(((height - 1) * width) + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueOutside(y * width);
    enqueueOutside((y * width) + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueueOutside(index - 1);
    if (x + 1 < width) enqueueOutside(index + 1);
    if (y > 0) enqueueOutside(index - width);
    if (y + 1 < height) enqueueOutside(index + width);
  }

  const visited = new Uint8Array(outside);
  let repairedComponents = 0;
  let repairedPixels = 0;
  for (let seed = 0; seed < total; seed += 1) {
    if (visited[seed] || !isTransparent(seed)) continue;
    head = 0;
    tail = 0;
    visited[seed] = 1;
    queue[tail++] = seed;
    const pixels = [];
    const border = [];
    while (head < tail) {
      const index = queue[head++];
      pixels.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next < 0) continue;
        if (isTransparent(next)) {
          if (!visited[next]) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        } else {
          border.push(next);
        }
      }
    }
    if (pixels.length > maxArea || !border.length) continue;
    const sums = [0, 0, 0, 0];
    for (const index of border) {
      const offset = index * 4;
      sums[0] += png.data[offset];
      sums[1] += png.data[offset + 1];
      sums[2] += png.data[offset + 2];
      sums[3] += png.data[offset + 3];
    }
    const fill = sums.map((value) => Math.round(value / border.length));
    for (const index of pixels) {
      const offset = index * 4;
      png.data[offset] = fill[0];
      png.data[offset + 1] = fill[1];
      png.data[offset + 2] = fill[2];
      png.data[offset + 3] = Math.max(192, fill[3]);
    }
    repairedComponents += 1;
    repairedPixels += pixels.length;
  }
  return { mode: "small-interior-alpha-hole-repair", maxArea, repairedComponents, repairedPixels };
}

async function normalizeGeneratedImage(bytes, postprocess = {}, registrationReference = null, options = {}) {
  const originalCanvas = normalizeCanvas(decodeRaster(bytes));
  const segmented = await removeBackgroundWithAnimeModel(bytes, options);
  const decoded = decodeRaster(segmented.bytes);
  let png = normalizeCanvas(decoded);
  const chromaCleanup = removeMagentaBackground(png);
  const backdropCleanup = segmented.mode === "trusted-source-alpha"
    || segmented.mode === "pure-magenta-key"
    || segmented.mode === "source-vivid-chroma-key"
    || segmented.mode === "source-uniform-matte-key"
    ? null
    : removeUniformSecondaryBackground(png);
  const interiorAlphaRepair = segmented.mode === "rembg-isnet-anime"
    ? restoreInteriorSubjectPixels(png, originalCanvas)
    : segmented.mode === "source-vivid-chroma-key"
      ? restoreChromaKeyInteriorPixels(png, originalCanvas, segmented.background)
      : { mode: "not-required", restoredPixels: 0 };
  const neutralShadowCleanup = postprocess.stripNeutralShadow ? stripNeutralCastShadows(png) : null;
  let subjectScale = null;
  if (postprocess.scale) {
    const scaled = scaleTransparentSubject(png, postprocess.scale);
    png = scaled.png;
    subjectScale = scaled.metadata;
  }
  let subjectRegistration = null;
  if (postprocess.registerTo) {
    if (!registrationReference) throw new Error(`Missing registration reference for ${postprocess.registerTo}`);
    const registered = registerTransparentSubject(png, registrationReference);
    png = registered.png;
    subjectRegistration = registered.metadata;
  }
  // Color-keyed source mattes preserve the subject exactly; generic hole
  // filling can mistake legitimate gaps between hair, sleeves and limbs for
  // segmentation damage.  Reserve that repair for semantic segmentation.
  const smallHoleRepair = segmented.mode === "rembg-isnet-anime"
    ? repairSmallInteriorAlphaHoles(png)
    : { mode: "not-required", maxArea: 0, repairedComponents: 0, repairedPixels: 0 };
  const matteColor = chromaCleanup?.background
    || backdropCleanup?.background
    || segmented.background
    || [184, 184, 184];
  const directMatteModes = new Set([
    "pure-magenta-key",
    "source-vivid-chroma-key",
    "source-uniform-matte-key",
  ]);
  const alphaEdgeCleanup = directMatteModes.has(segmented.mode)
    ? { mode: "preserved-direct-matte-edge", correctedPixels: 0, clearedPixels: 0 }
    : decontaminateNeutralMatteEdges(png, matteColor);
  const qa = analyzeFrame(png);
  const output = encodePng(png);
  return {
    output,
    qa: {
      ...qa,
      cleanup: {
        segmentation: segmented.mode,
        chroma: chromaCleanup,
        backdrop: backdropCleanup,
        neutralShadow: neutralShadowCleanup,
        interiorAlphaRepair,
        smallHoleRepair,
        alphaEdge: alphaEdgeCleanup,
        subjectScale,
        subjectRegistration,
      },
    },
    inputDimensions: `${decoded.width}x${decoded.height}`,
  };
}

async function validateExistingFrame(filePath) {
  const bytes = await fs.readFile(filePath);
  if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${path.relative(SOURCE_DIR, filePath)} is not a PNG`);
  }
  if (bytes.readUInt32BE(16) !== CANVAS_SIZE || bytes.readUInt32BE(20) !== CANVAS_SIZE
    || bytes[24] !== 8 || bytes[25] !== 6) {
    throw new Error(`${path.relative(SOURCE_DIR, filePath)} must be 1536x1536 8-bit RGBA`);
  }
  const png = PNG.sync.read(bytes, { checkCRC: true });
  return { bytes, qa: analyzeFrame(png), hash: sha256(bytes) };
}

function artifactFingerprint(prompt, inputHashes, postprocess = {}) {
  const payload = { prompt, inputHashes, canvas: CANVAS_SIZE, key: "neutral-rembg-v4-consistency" };
  if (Object.keys(postprocess).length) payload.postprocess = postprocess;
  return sha256(JSON.stringify(payload));
}

async function generateArtifact({
  key,
  outputPath,
  prompt,
  referencePaths,
  state,
  config,
  force,
  postprocess = {},
  registrationReferencePath = null,
  requireRembg = false,
  extraPrompt = "",
}) {
  const inputHashes = [];
  for (const referencePath of referencePaths) inputHashes.push(sha256(await fs.readFile(referencePath)));
  const fingerprint = artifactFingerprint(prompt, inputHashes, postprocess);
  const previous = state.entries[key];
  const registrationReference = registrationReferencePath
    ? PNG.sync.read(await fs.readFile(registrationReferencePath), { checkCRC: true })
    : null;

  if (await exists(outputPath)) {
    if (force) {
      console.log(`  replace ${path.relative(SOURCE_DIR, outputPath)}`);
    } else {
      const existing = await validateExistingFrame(outputPath);
      if (previous?.fingerprint === fingerprint && previous?.outputHash === existing.hash) {
        console.log(`  reuse ${path.relative(SOURCE_DIR, outputPath)}`);
        return { ...previous, qa: existing.qa, skipped: true };
      }
      throw new Error(`${path.relative(SOURCE_DIR, outputPath)} is not tracked by the current generation state or no longer matches it; rerun with --force`);
    }
  }

  let lastError = null;
  for (let semanticAttempt = 1; semanticAttempt <= SEMANTIC_ATTEMPTS; semanticAttempt += 1) {
    const attemptPrompt = semanticAttempt === 1
      ? `${prompt}${extraPrompt ? ` ${extraPrompt}` : ""}`
      : `${prompt}${extraPrompt ? ` ${extraPrompt}` : ""} 上一次输出未通过固定画布、透明主体或与定妆图一致性验收；这次必须严格保持透明背景或单一#FF00FF纯品红背景、完整角色、画布边距，以及与定妆图相近的人物像素高度、脚底基线和水平中心。`;
    try {
      const generated = await generateWithModelFallback(config, attemptPrompt, referencePaths);
      const rawDebugDir = path.join(SOURCE_DIR, ".state", "raw");
      await fs.mkdir(rawDebugDir, { recursive: true });
      await atomicWrite(
        path.join(rawDebugDir, `${key.replace(/[^a-z0-9_-]+/gi, "-")}-attempt-${semanticAttempt}.png`),
        generated.bytes,
      );
      const normalized = await normalizeGeneratedImage(
        generated.bytes,
        postprocess,
        registrationReference,
        { requireRembg },
      );
      await atomicWrite(outputPath, normalized.output);
      const entry = {
        fingerprint,
        promptHash: sha256(prompt),
        inputHashes,
        outputHash: sha256(normalized.output),
        output: path.relative(SOURCE_DIR, outputPath).replaceAll("\\", "/"),
        model: generated.model,
        inputDimensions: normalized.inputDimensions,
        qa: normalized.qa,
        completedAt: new Date().toISOString(),
      };
      state.entries[key] = entry;
      console.log(`  saved ${entry.output} (${generated.model}; matte=${normalized.qa?.cleanup?.segmentation || "?"})`);
      return entry;
    } catch (error) {
      lastError = error;
      if (semanticAttempt < SEMANTIC_ATTEMPTS && !(error instanceof ArkError && !error.retriable)) {
        console.warn(`  output attempt ${semanticAttempt} failed QA; regenerating: ${safeErrorMessage(error.message, config.apiKey)}`);
        if (/fragmented alpha cutout/i.test(String(error?.message || ""))) {
          extraPrompt = `${extraPrompt} 输出必须直接带干净透明通道；角色身体、头发和浅色衣服内部必须完全实心，不得出现透明孔洞、锯齿碎屑或背景色穿透。`;
        }
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error(`Unable to generate ${key}`);
}

function resolvePoseReference(referenceId, selectedLock) {
  if (referenceId === "lock") return selectedLock;
  const task = POSE_TASKS.find((item) => item.id === referenceId);
  if (!task) throw new Error(`Unknown pose reference: ${referenceId}`);
  return path.join(SOURCE_DIR, ...task.file.split("/"));
}

async function copyVerifiedFrame(sourcePath, targetPath, force = false) {
  const source = await validateExistingFrame(sourcePath);
  if (await exists(targetPath)) {
    if (!force) {
      const target = await validateExistingFrame(targetPath);
      if (target.hash === source.hash) return target;
      throw new Error(`${path.relative(SOURCE_DIR, targetPath)} differs from its source; rerun with --force`);
    }
  }
  await atomicWrite(targetPath, source.bytes);
  return source;
}

async function materializeFrames(selectedLock, force) {
  const sourceById = new Map([["lock", selectedLock]]);
  for (const task of POSE_TASKS) sourceById.set(task.id, path.join(SOURCE_DIR, ...task.file.split("/")));
  const entries = [];
  for (const [clipId, frames] of Object.entries(FRAME_PLAN)) {
    const clipDir = path.join(SOURCE_DIR, "clips", clipId);
    await fs.mkdir(clipDir, { recursive: true });
    for (const frame of frames) {
      const sourcePath = sourceById.get(frame.from);
      if (!sourcePath) throw new Error(`Missing frame source ${frame.from}`);
      const targetPath = path.join(clipDir, frame.name);
      const result = await copyVerifiedFrame(sourcePath, targetPath, force);
      entries.push({ clipId, name: frame.name, path: targetPath, hash: result.hash, qa: result.qa });
    }
  }
  return entries;
}

function blendPixel(target, targetIndex, red, green, blue, alpha) {
  const normalized = alpha / 255;
  target[targetIndex] = Math.round(red * normalized + target[targetIndex] * (1 - normalized));
  target[targetIndex + 1] = Math.round(green * normalized + target[targetIndex + 1] * (1 - normalized));
  target[targetIndex + 2] = Math.round(blue * normalized + target[targetIndex + 2] * (1 - normalized));
  target[targetIndex + 3] = 255;
}

async function createContactSheet(items, outputPath, mapPath, columns = 6) {
  const cell = 256;
  const rows = Math.ceil(items.length / columns);
  const sheet = new PNG({ width: columns * cell, height: rows * cell, colorType: 6 });
  for (let y = 0; y < sheet.height; y += 1) {
    for (let x = 0; x < sheet.width; x += 1) {
      const shade = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) ? 238 : 252;
      const offset = (y * sheet.width + x) * 4;
      sheet.data[offset] = shade;
      sheet.data[offset + 1] = shade;
      sheet.data[offset + 2] = shade;
      sheet.data[offset + 3] = 255;
    }
  }

  const map = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const source = PNG.sync.read(await fs.readFile(item.path), { checkCRC: true });
    const row = Math.floor(index / columns);
    const column = index % columns;
    for (let y = 0; y < cell; y += 1) {
      const sourceY = Math.min(source.height - 1, Math.floor((y / cell) * source.height));
      for (let x = 0; x < cell; x += 1) {
        const sourceX = Math.min(source.width - 1, Math.floor((x / cell) * source.width));
        const sourceIndex = (sourceY * source.width + sourceX) * 4;
        const targetIndex = ((row * cell + y) * sheet.width + column * cell + x) * 4;
        blendPixel(sheet.data, targetIndex,
          source.data[sourceIndex], source.data[sourceIndex + 1], source.data[sourceIndex + 2], source.data[sourceIndex + 3]);
      }
    }
    map.push({
      index: index + 1,
      row: row + 1,
      column: column + 1,
      id: item.id || item.clipId || "",
      frame: item.name || "",
      path: path.relative(SOURCE_DIR, item.path).replaceAll("\\", "/"),
    });
  }
  await atomicWrite(outputPath, encodePng(sheet));
  await atomicWriteJson(mapPath, { schemaVersion: 1, columns, rows, items: map });
  return map;
}

function validatePlans() {
  const plannedIds = Object.keys(FRAME_PLAN).sort();
  const runtimeIds = [...XINGLI_ACTION_IDS].sort();
  if (JSON.stringify(plannedIds) !== JSON.stringify(runtimeIds)) {
    throw new Error("Generator clip plan does not match XINGLI_ACTION_IDS");
  }
  const frameCount = Object.values(FRAME_PLAN).reduce((sum, frames) => sum + frames.length, 0);
  if (frameCount !== 24 || POSE_TASKS.length !== 18) {
    throw new Error(`Generator plan invariant failed: ${POSE_TASKS.length} generated poses / ${frameCount} manifest frames`);
  }
  const timingIds = Object.keys(CLIP_TIMING).sort();
  if (JSON.stringify(plannedIds) !== JSON.stringify(timingIds)) {
    throw new Error("Generator timing plan does not match FRAME_PLAN");
  }
  for (const [clipId, frames] of Object.entries(FRAME_PLAN)) {
    const timing = CLIP_TIMING[clipId];
    if (!Number.isFinite(timing.fps) || timing.fps <= 0
      || !Number.isFinite(timing.hold_ms) || timing.hold_ms < 0
      || !Number.isFinite(timing.crossfade_ms) || timing.crossfade_ms < 0
      || timing.frame_durations_ms.length !== frames.length
      || timing.frame_durations_ms.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
      throw new Error(`Invalid clip timing for ${clipId}`);
    }
  }
}

function buildSourceManifest(selectedCandidate) {
  return {
    id: PROFILE.id,
    character: PROFILE.runtimeName,
    version: "2.0",
    specs: {
      canvas_size: "1536x1536",
      transparent: true,
      style: PROFILE.style,
      fps_target: "4fps",
      asset_kind: "key-pose-pack",
    },
    selected_lock: `character/lock_candidate_${selectedCandidate}.png`,
    character_files: {
      "character_lock.png": {
        dimensions: "1536x1536",
        mode: "RGBA",
      },
      [`lock_candidate_${selectedCandidate}.png`]: {
        dimensions: "1536x1536",
        mode: "RGBA",
      },
    },
    animations: Object.fromEntries(Object.entries(FRAME_PLAN).map(([clipId, frames]) => [clipId, {
      frame_count: frames.length,
      frames: frames.map((frame) => frame.name),
      ...CLIP_TIMING[clipId],
    }])),
    total_frames: 24,
    matte: {
      segmentation: "trusted-alpha-or-pure-magenta-key-or-rembg-isnet-anime",
      source_color: "transparent or #FF00FF",
      edge_cleanup: "flood-fill-key plus straight-alpha matte despill",
    },
    idle_policy: {
      posture: "standing",
      ambient: ["idle_loop", "thinking", "shy_look_away"],
      active_only: ["listen", "talk_loop", "comfort", "greet", "react_tap"],
      transitions: {
        standing_to_sitting: ["stand_to_sit", "sit_idle"],
        sitting_to_sleeping: ["sit_to_sleep", "sleep_loop"],
      },
    },
  };
}

function buildPromptsDocument(config, selectedCandidate, state) {
  return {
    schemaVersion: 1,
    character: PROFILE.runtimeName,
    profileId: PROFILE.id,
    modelPreference: config.models,
    selectedCandidate: selectedCandidate || null,
    imageRequest: {
      size: "2K",
      response_format: "url",
      watermark: false,
      sequential_image_generation: "disabled",
    },
    lockCandidates: LOCK_VARIANTS.map((_, index) => ({
      id: `lock_candidate_${index + 1}`,
      output: `character/lock_candidate_${index + 1}.png`,
      prompt: lockPrompt(index + 1),
      promptHash: sha256(lockPrompt(index + 1)),
    })),
    poseTasks: POSE_TASKS.map((task) => ({
      id: task.id,
      output: task.file,
      references: task.refs,
      prompt: posePrompt(task),
      promptHash: sha256(posePrompt(task)),
    })),
    completed: Object.fromEntries(Object.entries(state.entries).map(([key, entry]) => [key, {
      output: entry.output,
      outputHash: entry.outputHash,
      model: entry.model,
      completedAt: entry.completedAt || "",
    }])),
  };
}

function buildQaReport({ stage, selectedCandidate, state, contactMap = [], frames = [], consistency = null }) {
  const entries = Object.entries(state.entries).sort(([a], [b]) => a.localeCompare(b, "en"));
  const lines = [
    `# ${PROFILE.runtimeName} Asset Generation QA`,
    "",
    `- Stage: ${stage}`,
    `- Selected candidate: ${selectedCandidate || "not selected"}`,
    `- Verified generated artifacts: ${entries.length}`,
    `- Manifest frames: ${stage === "poses" || stage === "qa" ? 24 : 0}`,
    "- Background removal: rembg isnet-anime is mandatory; local gray/magenta fallback is rejected",
    "- Retouch: stripNeutralShadow on sit/sleep family; register standing/loop frames to lock or prior keyframe",
    "- Consistency: standing silhouette height/center/foot drift vs lock (GATE D)",
    "",
    "## Generated Artifacts",
    "",
    "| ID | Output | Model | Foreground | Transparent | Checker | Bounds |",
    "|---|---|---|---:|---:|---:|---|",
  ];
  for (const [id, entry] of entries) {
    const bounds = entry.qa?.bounds;
    lines.push(`| ${id} | ${entry.output || ""} | ${entry.model || ""} | ${entry.qa?.foregroundRatio ?? ""} | ${entry.qa?.transparentRatio ?? ""} | ${entry.qa?.checkerboardHits ?? ""} | ${bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : ""} |`);
  }
  if (consistency?.rows?.length) {
    lines.push(
      "",
      "## Standing Consistency vs Lock (GATE D)",
      "",
      `| Pose | Height ratio | Center Δx | Foot Δy | Status |`,
      `|---|---:|---:|---:|---|`,
    );
    for (const row of consistency.rows) {
      lines.push(`| ${row.id} | ${row.heightRatio} | ${row.centerDeltaX} | ${row.footDeltaY} | ${row.status} |`);
    }
    if (consistency.failures?.length) {
      lines.push("", "### Failures", "", ...consistency.failures.map((item) => `- ${item}`));
    }
  }
  if (frames.length) {
    lines.push("", "## Manifest Frames", "", "| Clip | Frame | SHA-256 | Foreground | Transparent |", "|---|---|---|---:|---:|");
    for (const frame of frames) {
      lines.push(`| ${frame.clipId} | ${frame.name} | ${frame.hash.slice(0, 16)}... | ${frame.qa?.foregroundRatio ?? ""} | ${frame.qa?.transparentRatio ?? ""} |`);
    }
    lines.push("", `Unique frame payloads: ${new Set(frames.map((frame) => frame.hash)).size}/${frames.length}. Intentional endpoint reuse is defined by FRAME_PLAN.`);
  }
  if (contactMap.length) {
    lines.push("", "## Contact Sheet Order", "", "| # | Row | Column | Clip / ID | Frame | Path |", "|---:|---:|---:|---|---|---|");
    for (const item of contactMap) {
      lines.push(`| ${item.index} | ${item.row} | ${item.column} | ${item.id} | ${item.frame} | ${item.path} |`);
    }
  }
  lines.push(
    "",
    "## Manual Gate (GATE E)",
    "",
    "Before importing, inspect the contact sheet for face, hair, clothing, hand, body-scale, and action continuity drift.",
    "Automated PNG/alpha/consistency checks do not fully prove artistic identity; still reject mature 5.5-head faces and broken anatomy by eye.",
    "",
  );
  return lines.join("\n");
}

async function assertStandingConsistency(lockPath) {
  const lock = await validateExistingFrame(lockPath);
  const lockQa = lock.qa;
  const rows = [];
  const failures = [];
  const heightMin = 0.88;
  const heightMax = 1.12;
  const centerMax = CANVAS_SIZE * 0.055;
  const footMax = CANVAS_SIZE * 0.045;
  for (const id of STANDING_CONSISTENCY_IDS) {
    const task = POSE_TASKS.find((item) => item.id === id);
    const posePath = path.join(SOURCE_DIR, ...task.file.split("/"));
    const pose = await validateExistingFrame(posePath);
    const heightRatio = pose.qa.bounds.height / lockQa.bounds.height;
    const centerDeltaX = Math.abs(pose.qa.centerX - lockQa.centerX);
    const footDeltaY = Math.abs(pose.qa.footY - lockQa.footY);
    const reasons = [];
    if (heightRatio < heightMin || heightRatio > heightMax) {
      reasons.push(`height ratio ${heightRatio.toFixed(3)} outside ${heightMin}-${heightMax}`);
    }
    if (centerDeltaX > centerMax) reasons.push(`center Δx ${centerDeltaX.toFixed(1)}px > ${centerMax.toFixed(0)}`);
    if (footDeltaY > footMax) reasons.push(`foot Δy ${footDeltaY.toFixed(1)}px > ${footMax.toFixed(0)}`);
    const status = reasons.length ? "FAIL" : "PASS";
    rows.push({
      id,
      heightRatio: Number(heightRatio.toFixed(4)),
      centerDeltaX: Number(centerDeltaX.toFixed(1)),
      footDeltaY: Number(footDeltaY.toFixed(1)),
      status,
    });
    if (reasons.length) failures.push(`${id}: ${reasons.join("; ")}`);
  }
  // Loop pair continuity (talk)
  const talk0 = await validateExistingFrame(path.join(SOURCE_DIR, "poses", "talk_0.png"));
  const talk1 = await validateExistingFrame(path.join(SOURCE_DIR, "poses", "talk_1.png"));
  const talkHeight = talk1.qa.bounds.height / talk0.qa.bounds.height;
  const talkFoot = Math.abs(talk1.qa.footY - talk0.qa.footY);
  const talkCenter = Math.abs(talk1.qa.centerX - talk0.qa.centerX);
  if (talkHeight < 0.97 || talkHeight > 1.03 || talkFoot > 12 || talkCenter > 14) {
    failures.push(
      `talk_loop: talk_1 vs talk_0 drift height=${talkHeight.toFixed(3)} footΔ=${talkFoot.toFixed(1)} centerΔ=${talkCenter.toFixed(1)}`,
    );
  }
  const report = { rows, failures, passed: failures.length === 0 };
  await atomicWriteJson(path.join(SOURCE_DIR, "previews", "consistency_report.json"), report);
  if (failures.length) {
    throw new Error(
      `GATE D consistency failed (${failures.length}). Redo only failing poses with --force --only id1,id2. See previews/consistency_report.json\n- ${failures.join("\n- ")}`,
    );
  }
  return report;
}

async function persistMetadata(config, selectedCandidate, state, reportOptions) {
  await atomicWriteJson(path.join(SOURCE_DIR, ".state", "generation-state.json"), state);
  await atomicWriteJson(path.join(SOURCE_DIR, "generation_prompts.json"),
    buildPromptsDocument(config, selectedCandidate, state));
  await atomicWrite(path.join(SOURCE_DIR, "generation_report.md"),
    buildQaReport({ ...reportOptions, selectedCandidate, state }));
}

async function runLockStage(args, config, state) {
  const candidateIndexes = args.candidate ? [args.candidate] : [1, 2, 3];
  for (const referencePath of args.references) {
    if (!(await exists(referencePath))) throw new Error(`Missing lock reference: ${referencePath}`);
  }
  console.log(`Generating ${candidateIndexes.length} ${PROFILE.label} lock candidate${candidateIndexes.length === 1 ? "" : "s"}${args.references.length ? " from approved identity references" : " from scratch"}...`);
  if (args.force) {
    await fs.rm(path.join(SOURCE_DIR, "asset_manifest.json"), { force: true });
    await fs.rm(path.join(SOURCE_DIR, "character", "character_lock.png"), { force: true });
  }
  const items = [];
  for (const index of candidateIndexes) {
    const outputPath = path.join(SOURCE_DIR, "character", `lock_candidate_${index}.png`);
    const entry = await generateArtifact({
      key: `lock_candidate_${index}`,
      outputPath,
      prompt: lockPrompt(index),
      referencePaths: args.references,
      state,
      config,
      force: args.force,
      requireRembg: args.requireRembg,
    });
    items.push({ id: `lock_candidate_${index}`, path: outputPath, qa: entry.qa });
    await persistMetadata(config, 0, state, { stage: "lock" });
  }
  const contactMap = await createContactSheet(
    items,
    path.join(SOURCE_DIR, "previews", "lock_candidates_contact_sheet.png"),
    path.join(SOURCE_DIR, "previews", "lock_candidates_contact_sheet.json"),
    Math.min(3, items.length),
  );
  if (args.select) {
    const selected = path.join(SOURCE_DIR, "character", `lock_candidate_${args.select}.png`);
    await copyVerifiedFrame(selected, path.join(SOURCE_DIR, "character", "character_lock.png"), true);
  }
  await persistMetadata(config, args.select || 0, state, { stage: "lock", contactMap });
  console.log("Lock candidate preview ready. Inspect previews/lock_candidates_contact_sheet.png before generating any poses.");
}

async function runPoseStage(args, config, state) {
  const selectedCandidate = path.join(SOURCE_DIR, "character", `lock_candidate_${args.select}.png`);
  if (!(await exists(selectedCandidate))) {
    throw new Error(`Missing lock candidate ${args.select}; run --stage lock first`);
  }
  await validateExistingFrame(selectedCandidate);
  const canonicalLock = path.join(SOURCE_DIR, "character", "character_lock.png");
  await copyVerifiedFrame(selectedCandidate, canonicalLock, true);
  const poseTasks = args.only.length
    ? POSE_TASKS.filter((task) => args.only.includes(task.id))
    : POSE_TASKS;
  console.log(`Generating ${poseTasks.length}/${POSE_TASKS.length} ${PROFILE.label} key poses from lock candidate ${args.select}...`);

  for (let index = 0; index < poseTasks.length; index += 1) {
    const task = poseTasks[index];
    const outputPath = path.join(SOURCE_DIR, ...task.file.split("/"));
    const referencePaths = task.refs.map((id) => resolvePoseReference(id, canonicalLock));
    const postprocess = task.postprocess || {};
    const registrationReferencePath = postprocess.registerTo
      ? resolvePoseReference(postprocess.registerTo, canonicalLock)
      : null;
    console.log(`  [${index + 1}/${poseTasks.length}] ${task.id}`);
    await generateArtifact({
      key: `pose:${task.id}`,
      outputPath,
      prompt: posePrompt(task),
      referencePaths,
      state,
      config,
      force: args.force,
      postprocess,
      registrationReferencePath,
      requireRembg: args.requireRembg,
    });
    await persistMetadata(config, args.select, state, { stage: "poses" });
  }

  const generatedPoseHashes = new Map();
  for (const task of POSE_TASKS) {
    const taskPath = path.join(SOURCE_DIR, ...task.file.split("/"));
    if (args.only.length && !args.only.includes(task.id) && !(await exists(taskPath))) continue;
    if (!(await exists(taskPath))) {
      throw new Error(`Missing pose ${task.id}; generate full pack or include dependencies before --only`);
    }
    const result = await validateExistingFrame(taskPath);
    if (generatedPoseHashes.has(result.hash)) {
      throw new Error(`QA rejected duplicate generated poses: ${generatedPoseHashes.get(result.hash)} and ${task.id}`);
    }
    generatedPoseHashes.set(result.hash, task.id);
  }

  // Full-pack consistency only when all poses exist
  let consistency = null;
  const allPresent = (await Promise.all(
    POSE_TASKS.map((task) => exists(path.join(SOURCE_DIR, ...task.file.split("/")))),
  )).every(Boolean);
  if (allPresent) {
    consistency = await assertStandingConsistency(canonicalLock);
    const frames = await materializeFrames(canonicalLock, args.force);
    const contactMap = await createContactSheet(
      frames,
      path.join(SOURCE_DIR, "previews", "poses_contact_sheet.png"),
      path.join(SOURCE_DIR, "previews", "poses_contact_sheet.json"),
      6,
    );
    await atomicWriteJson(path.join(SOURCE_DIR, "asset_manifest.json"), buildSourceManifest(args.select));
    await persistMetadata(config, args.select, state, { stage: "poses", contactMap, frames, consistency });
    console.log("Source pack ready: 16 clips / 24 key-pose frames. GATE D consistency PASS.");
    console.log("Inspect previews/poses_contact_sheet.png before running npm run import:xingli.");
  } else {
    await persistMetadata(config, args.select, state, { stage: "poses" });
    console.log("Partial pose set saved. Run full poses (no --only) to materialize clips and GATE D.");
  }
}

async function runQaStage(args, config, state) {
  const selectedCandidate = path.join(SOURCE_DIR, "character", `lock_candidate_${args.select}.png`);
  const canonicalLock = path.join(SOURCE_DIR, "character", "character_lock.png");
  if (!(await exists(canonicalLock))) {
    if (!(await exists(selectedCandidate))) {
      throw new Error(`Missing character_lock.png and lock_candidate_${args.select}.png`);
    }
    await copyVerifiedFrame(selectedCandidate, canonicalLock, true);
  }
  await validateExistingFrame(canonicalLock);
  for (const task of POSE_TASKS) {
    const taskPath = path.join(SOURCE_DIR, ...task.file.split("/"));
    if (!(await exists(taskPath))) throw new Error(`Missing pose for QA: ${task.id}`);
    await validateExistingFrame(taskPath);
  }
  const consistency = await assertStandingConsistency(canonicalLock);
  const frames = await materializeFrames(canonicalLock, false);
  await persistMetadata(config, args.select, state, { stage: "qa", frames, consistency });
  console.log(`GATE D consistency PASS (${consistency.rows.length} standing poses).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  validatePlans();
  await loadEnvFile();
  const config = resolveConfig();
  if (args.stage !== "qa" && !config.apiKey) throw new Error("Missing ARK_API_KEY in the environment or .env");
  await fs.mkdir(SOURCE_DIR, { recursive: true });
  const statePath = path.join(SOURCE_DIR, ".state", "generation-state.json");
  const state = await loadJson(statePath, { schemaVersion: 1, entries: {} });
  if (state.schemaVersion !== 1 || !state.entries || typeof state.entries !== "object") {
    throw new Error("Unsupported generation-state.json");
  }
  console.log(`Stage: ${args.stage}`);
  if (args.stage !== "qa") console.log(`Models: ${config.models.join(" -> ")}`);
  console.log(`Output: ${SOURCE_DIR}`);
  if (args.stage === "lock") await runLockStage(args, config, state);
  else if (args.stage === "qa") await runQaStage(args, config, state);
  else await runPoseStage(args, config, state);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`${PROFILE.label} generation failed: ${safeErrorMessage(error?.message || error, process.env.ARK_API_KEY || "")}`);
    process.exitCode = 1;
  });
}
