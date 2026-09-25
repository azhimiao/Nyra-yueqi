/**
 * Companion diary production from chat intent (mirrors selfie direct_action).
 * Generate → saveDiary → Artifact / Delivery (pop write-back via existing flush).
 */

import { generateTodayDiary } from "../diary/generate.js";
import { getDiaryForDay, saveDiary, todayDiaryDay } from "../diary/records.js";
import { getDiarySettings } from "../settings/preferences.js";

const DIARY_INTENT_PATTERNS = [
  /(?:写|记|生成).{0,10}日记/,
  /(?:请|帮|让).{0,10}(?:写|记).{0,8}日记/,
  /把.{0,8}日记.{0,8}(?:写|记)/,
  /write.{0,16}(?:a\s+)?(?:diary|journal)/i,
];

const DIARY_VIEW_ONLY = /(?:看|打开|读|翻).{0,6}日记|(?:open|read|view).{0,12}(?:diary|journal)/i;

let diaryActionBusy = false;

/**
 * @param {string} text
 */
export function detectDiaryIntent(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (DIARY_VIEW_ONLY.test(raw)) return false;
  return DIARY_INTENT_PATTERNS.some((re) => re.test(raw));
}

/**
 * @param {{
 *   companionId?: string,
 *   characterId?: string,
 *   characterProfile?: object,
 *   sessionId?: string,
 *   currentDailyStatus?: object|null,
 *   styleId?: string,
 *   diaryDay?: string,
 *   overwrite?: boolean,
 *   collectProviderConfig?: () => object,
 *   generateFn?: typeof generateTodayDiary,
 *   saveFn?: typeof saveDiary,
 *   getExistingFn?: typeof getDiaryForDay,
 * }} opts
 */
export async function requestCompanionDiary(opts = {}) {
  const companionId = String(opts.companionId || opts.characterId || "").trim();
  if (!companionId) {
    return {
      ok: false,
      reason: "MISSING_SCOPE",
      message: "无法写日记：缺少角色作用域。",
    };
  }

  if (diaryActionBusy) {
    return {
      ok: false,
      reason: "BUSY",
      message: "我正在写另一篇日记，稍等一下～",
    };
  }

  const profile = opts.characterProfile && typeof opts.characterProfile === "object"
    ? opts.characterProfile
    : {};
  const characterName = String(profile.name || profile.alias || "角色").trim() || "角色";
  const settings = getDiarySettings();
  const styleId = String(opts.styleId || settings.style || "literary").trim() || "literary";
  const diaryDay = String(opts.diaryDay || "").trim() || todayDiaryDay();
  const generateFn = typeof opts.generateFn === "function" ? opts.generateFn : generateTodayDiary;
  const saveFn = typeof opts.saveFn === "function" ? opts.saveFn : saveDiary;
  const getExistingFn = typeof opts.getExistingFn === "function" ? opts.getExistingFn : getDiaryForDay;
  const collectProviderConfig = typeof opts.collectProviderConfig === "function"
    ? opts.collectProviderConfig
    : () => ({});

  diaryActionBusy = true;
  let stage = "generate";
  try {
    const existing = await getExistingFn(diaryDay, companionId);
    // Default deny overwrite — callers must opt in after explicit confirm.
    const allowOverwrite = opts.overwrite === true;
    if (existing && !allowOverwrite) {
      return {
        ok: false,
        reason: "EXISTS_NO_OVERWRITE",
        message: "今天的日记已经写过了。想重写的话，在日记里点生成就可以。",
        diaryId: existing.id || "",
        diaryDay,
      };
    }

    const generated = await generateFn(styleId, {
      sessionId: opts.sessionId || "",
      currentDailyStatus: opts.currentDailyStatus || null,
      collectProviderConfig,
      collectCharacterProfile: () => ({
        ...profile,
        id: companionId,
        characterId: companionId,
        name: characterName,
      }),
    });

    if (!generated?.ok || !generated.title || !generated.body) {
      return {
        ok: false,
        reason: generated?.reason || "MODEL_FAILED",
        message: generated?.message || "日记生成失败，我还没写进档案。",
        styleId,
        diaryDay,
      };
    }

    stage = "save";
    const saved = await saveFn({
      id: existing?.id,
      title: generated.title,
      body: generated.body,
      styleId: generated.styleId || styleId,
      diaryDay,
      roleName: characterName,
      weight: 1.42,
      pinned: existing ? undefined : false,
      companionId,
      characterId: companionId,
    });

    const diaryId = String(saved?.id || existing?.id || "").trim();
    if (!diaryId) {
      return {
        ok: false,
        reason: "SAVE_UNCONFIRMED",
        message: "日记内容生成了，但没有拿到保存回执，所以我不会说已经写好。",
        styleId: generated.styleId || styleId,
        diaryDay,
      };
    }

    // A returned object is not enough on Android: only a successful read-back
    // from the diary authority proves that the write survived the native bridge.
    stage = "verify";
    const persisted = await getExistingFn(diaryDay, companionId);
    if (!persisted || String(persisted.id || "").trim() !== diaryId) {
      return {
        ok: false,
        reason: "SAVE_UNCONFIRMED",
        message: "日记内容生成了，但保存后没有从档案里读回来，所以这次不能算写成功。",
        styleId: generated.styleId || styleId,
        diaryDay,
      };
    }
    const artifactId = diaryId ? `diary:${diaryId}` : "";

    return {
      ok: true,
      reason: "succeeded",
      message: "写好啦，你看看～",
      speech: "写好啦，你看看～",
      diaryId,
      artifactId,
      diaryDay,
      title: generated.title,
      styleId: generated.styleId || styleId,
      companionId,
      deepLink: artifactId ? `yueqi://artifact/${artifactId}` : "",
    };
  } catch (error) {
    const message = String(error?.message || "未知错误").slice(0, 200);
    return {
      ok: false,
      reason: stage === "generate" ? "MODEL_FAILED" : "SAVE_FAILED",
      message: stage === "generate"
        ? `日记生成失败：${message}`
        : `日记没有写入档案：${message}`,
    };
  } finally {
    diaryActionBusy = false;
  }
}
