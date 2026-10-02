/** Built-in Xingche chibi pose assets (static URLs under public/). */

export const DEFAULT_POSE_ASSET_BASE = "/assets/pet-poses";

export const DEFAULT_POSE_ASSET_IDS = [
  "idle_default",
  "sleep_pose",
  "greet",
  "selfie",
  "talking_default",
  "react_tap",
  "comfort",
];

const POSE_SET = new Set(DEFAULT_POSE_ASSET_IDS);

export function defaultPoseAssetUrl(actionId) {
  const id = String(actionId || "").trim();
  if (!POSE_SET.has(id)) return "";
  return `${DEFAULT_POSE_ASSET_BASE}/${id}.png`;
}

export function isDefaultPoseAssetId(actionId) {
  return POSE_SET.has(String(actionId || "").trim());
}
