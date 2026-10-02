/**
 * Character avatar policy:
 * 头像 = 用户自备图，或 /assets/avatars/ 下非默认样例的资源。
 * 禁止：桌宠 / pet-poses / 情景立绘 / VN 立绘 / 内置林星梨样例头像冒充用户头像。
 */

/** @deprecated 仅兼容旧引用；体验 App 禁止当作默认头像展示 */
export const XINGLI_AVATAR_URL = "/assets/avatars/xingli/profile.png";
/** @deprecated 情景专用样例，禁止当用户头像 */
export const XINGLI_SCENARIO_PORTRAIT_URL = "/assets/scenario/characters/xingli/dialogue.png";

const BANNED_AVATAR_PATHS = [
  /\/assets\/avatars\/xingli\//i,
  /\/assets\/(characters|pet-poses)\//i,
  /\/assets\/(scenario|vn)\//i,
  /\/clips\//i,
];

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isRealCharacterAvatar(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  if (BANNED_AVATAR_PATHS.some((re) => re.test(u))) return false;
  if (u.startsWith("data:image/")) return true;
  if (u.startsWith("blob:")) return true;
  if (/^https:\/\//i.test(u)) return true;
  if (/^\/assets\/avatars\/[a-z0-9/_-]+\.(png|webp|jpe?g)$/i.test(u)) return true;
  return false;
}

/**
 * 仅返回用户真实头像；没有则空字符串。
 * 绝不回退到林星梨样例或桌宠图。
 * @param {{ avatarUrl?: string } | null | undefined} character
 * @returns {string}
 */
export function resolveCharacterAvatarUrl(character) {
  const raw = String(character?.avatarUrl || "").trim();
  if (isRealCharacterAvatar(raw)) return raw;
  return "";
}

/**
 * 情景舞台立绘：只用用户头像；无则空（调用方用占位字）。
 * 不再注入内置林星梨情景立绘。
 */
export function resolveScenarioPortraitUrl(character) {
  return resolveCharacterAvatarUrl(character);
}
