const COMMON_LOCK_VARIANTS = Object.freeze([
  "正面自然站立，双手放松垂在身体两侧，闭嘴轻微微笑，目光稳定看向用户",
  "正面自然站立，一只手轻放在胸前，另一只手自然垂下，神情亲近但克制",
  "正面自然站立，双手在身前轻握，姿态放松，轮廓清楚，适合作为桌宠定妆锁图",
]);

const PROFILES = Object.freeze({
  xingli: {
    id: "xingli",
    runtimeName: "星梨 (Xingli)",
    label: "星梨",
    gender: "female",
    sourceDir: ["assets", "characters", "xingli-source"],
    runtimeDir: ["public", "assets", "characters", "xingli"],
    style: "成年女性4.8头身半Q版二维动画",
    characterBible: [
      "原创二维动画角色星梨，22岁成年女性，不参考任何现有动漫、游戏角色或现实画师",
      "年轻、软萌、温柔、自然的成年女友感，整体第一印象必须可爱而不是成熟御姐；明确为成年女性，不是儿童或幼女",
      "稳定4.8头身的精致半Q版比例，完整全身；脸型短而圆润，下颌柔和，中庭短，小巧鼻子和嘴，肩线窄而柔和",
      "浅鼠尾草绿色中长微卷发，齐刘海，发尾固定在锁骨至胸前位置；琥珀色大眼睛，淡淡腮红",
      "固定穿奶白色短袖方领泡袖居家连衣裙，裙摆有蕾丝花边，浅粉色细腰带与右侧蝴蝶结，白色过膝袜，棕色乐福鞋",
      "干净轻盈的暖棕色线稿，现代日系二维动画与乙女游戏角色立绘质感，柔和赛璐璐阴影，轮廓清晰",
    ],
    lockVariants: COMMON_LOCK_VARIANTS,
  },
  "yueqi-female": {
    id: "yueqi-female",
    runtimeName: "月栖·昼 (Yueqi Day)",
    label: "月栖·昼",
    gender: "female",
    sourceDir: ["assets", "characters", "yueqi-female-source"],
    runtimeDir: ["public", "assets", "characters", "yueqi-female"],
    style: "成年女性4.3头身精致Q版二维动画",
    characterBible: [
      "原创二维动画桌宠，成年女性，精致4.3头身Q版比例，完整全身，不参考任何现有动漫、游戏角色或现实画师",
      "身份必须严格来自参考三视图：奶油浅金色长卷发，头顶一缕弧形呆毛，左侧白色五瓣花与浅蓝垂饰，蓝紫色大眼睛，短圆脸和温柔闭嘴微笑",
      "固定穿冷白与冰蓝配色的露肩短裙、浅蓝领巾和胸前蝴蝶结、蓬松袖套、白色长袜、白蓝短靴、腰侧白色小包；金色与蓝色小饰件的位置保持一致",
      "服装必须清爽、端正、完整覆盖，不增加裸露，不改变裙长、袜靴、花饰、包或配色",
      "冷白秩序、浅蓝光感、深蓝细线条；现代日系二维动画桌宠质感，柔和赛璐璐阴影，轮廓清楚，不能做成塑料3D公仔",
    ],
    lockVariants: COMMON_LOCK_VARIANTS,
    motionReplacements: [
      ["4.8头身", "参考图中的4.3头身比例"],
    ],
  },
  "yueqi-male": {
    id: "yueqi-male",
    runtimeName: "月栖·夜 (Yueqi Night)",
    label: "月栖·夜",
    gender: "male",
    sourceDir: ["assets", "characters", "yueqi-male-source"],
    runtimeDir: ["public", "assets", "characters", "yueqi-male"],
    style: "成年男性4.3头身精致Q版二维动画",
    characterBible: [
      "原创二维动画桌宠，成年男性，精致4.3头身Q版比例，完整全身，不参考任何现有动漫、游戏角色或现实画师",
      "身份必须严格来自参考三视图：深灰黑色蓬松短发，顶部不规则发束，灰蓝色大眼睛，短圆脸，右侧蓝黑发夹与细长蓝色垂饰，温和闭嘴微笑",
      "固定穿冷白连帽外套、黑色内搭、黑灰束脚裤、黑白蓝高帮鞋；蓝灰交叉背带、腰带、袖口扣带、菱形金属饰件与右侧长蓝带的位置保持一致",
      "服装保持利落而完整，不改变外套版型、裤长、鞋、发饰、背带和蓝黑冷白配色",
      "冷白外壳、蓝黑结构线与克制金属质感；现代日系二维动画桌宠质感，柔和赛璐璐阴影，轮廓清楚，不能做成塑料3D公仔",
    ],
    lockVariants: COMMON_LOCK_VARIANTS,
    motionReplacements: [
      ["4.8头身", "参考图中的4.3头身比例"],
      ["她", "他"],
      ["裙边", "外套下摆"],
      ["裙摆", "外套与裤装"],
      ["袜子与鞋", "裤脚与鞋"],
      ["日常居家穿着", "完整日常穿着"],
    ],
  },
});

export function getPetGenerationProfile(id = "xingli") {
  const key = String(id || "xingli").trim();
  const profile = PROFILES[key];
  if (!profile) throw new Error(`Unknown pet generation profile: ${key}`);
  return profile;
}

export function listPetGenerationProfiles() {
  return Object.keys(PROFILES);
}
