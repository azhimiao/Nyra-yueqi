/** Light fixtures for Local Agent tasks — no OpenClaw imports. */

export const CHARACTER_FIX_FIXTURE = {
  name: "月栖测试角色",
  description: "用于验证助手 Agent",
};

export const SCENARIO_AUDIT_FIXTURE = {
  id: "fixture-scenario-1",
  title: "雨站候车",
  premise: "雨夜车站的短叙",
  beats: [{ id: "b1", title: "开幕" }],
  cast: { leadId: "char-a", memberIds: [] },
};
