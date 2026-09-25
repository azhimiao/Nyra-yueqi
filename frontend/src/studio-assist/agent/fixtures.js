/** Fallback payloads when a live character or scenario is not loaded. */

export const CHARACTER_FIX_FIXTURE = {
  name: "角色",
  description: "",
};

export const SCENARIO_AUDIT_FIXTURE = {
  id: "default-scenario-1",
  title: "雨站候车",
  premise: "雨夜车站的短叙",
  beats: [{ id: "b1", title: "开幕" }],
  cast: { leadId: "char-a", memberIds: [] },
};
