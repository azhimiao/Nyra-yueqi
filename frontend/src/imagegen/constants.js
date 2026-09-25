/** Imagegen constants (F6 / G1). */

export const IMAGEGEN_SETTINGS_KEY = "yueqi.imagegen.v1";
export const IMAGEGEN_JOBS_KEY = "yueqi.imagegen.jobs.v1";

/** Stable album group for AI-generated images. */
export const AI_GROUP_ID = "pg-ai-studio";
export const AI_GROUP_NAME = "AI 创作";

export const MAX_PROMPT_CHARS = 800;
export const MAX_JOBS = 20;
export const MAX_HISTORY_THUMBS = 6;

export const IMAGEGEN_SIZES = Object.freeze([
  "1024x1024",
  "512x512",
  "1792x1024",
  "1024x1792",
]);

/** @type {import("../settings/imagegen-preferences.js").ImagegenSettings} */
export const DEFAULT_IMAGEGEN_SETTINGS = Object.freeze({
  schemaVersion: 1,
  provider: "openai-compatible",
  apiKey: "",
  baseUrl: "",
  model: "dall-e-3",
  defaultSize: "1024x1024",
  enabled: true,
});
