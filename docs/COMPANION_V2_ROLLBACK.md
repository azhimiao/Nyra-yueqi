# Companion V2 rollback

1. Set cutover profile to `legacy` (`setCutoverProfile("legacy")` or clear `yueqi.cutover.profile.v1` to the documented default).
2. Do not delete CharacterProfileV2, preference, ToolRun, or revision history records.
3. Confirm `DEFAULT_CUTOVER_PROFILE` in source is still `legacy` before shipping an emergency build.
4. Rehearsal: switch `internal_v2` → `legacy` and confirm characters/preferences still load.
