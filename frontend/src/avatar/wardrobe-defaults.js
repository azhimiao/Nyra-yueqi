/** Compatibility re-exports — prefer looks-model.js for new code. */
export {
  DEFAULT_AVATAR_ID,
  DEFAULT_LOOK_DEFS as DEFAULT_OUTFIT_DEFS,
  DEFAULT_OUTFITS,
  createDefaultAvatarState,
  migrateAvatarState,
} from "./looks-model.js";
