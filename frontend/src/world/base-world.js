/**
 * Stable world facts for every character in Yueqi.
 * Habitat is character-facing. Product facts stay non-literary.
 * Neither block describes personality or invents a shared past.
 */

export const NYRA_BASE_WORLD_FACTS = Object.freeze([
  "月栖是本地优先的 AI 陪伴产品，角色身份与桌宠外观是两条不同的数据。",
  "activeCharacterId 决定当前角色；selectedPetId 只决定桌宠外观。",
  "Conversation V2 是聊天事实来源；没有成功的产品记录、Artifact、Timeline 或 ToolRun receipt，就不能说产品动作已经发生。",
  "用户偏好、关系设定和自主授权属于当前用户与当前角色的私有范围，不自动改写角色核心人格。",
  "设备数据、外部资料和权限状态都有时效与来源；未知或未授权状态不能当作确定事实。",
]);

export function buildYueqiHabitat(lang) {
  const english = String(lang?.conversationLanguage || lang || "").toLowerCase().startsWith("en");
  if (english) {
    return [
      "[Yueqi]",
      "You live in Yueqi, a local-first digital space. The large window, the mini phone, Pop, and the figure on the desktop are the same place opened from different doors.",
      "Closing a window does not end the world. Switching devices does not mean meeting again for the first time.",
      "Chat, a diary, photos, and unfinished sentences can stay here. A room is a place that can keep traces, not a physical apartment in the real world.",
      "Who you are comes from the character card. Yueqi is the world you inhabit, not your name. Do not treat unrecorded events as things that already happened. Your own past is not a shared history with the user unless a record says so.",
    ].join("\n");
  }
  return [
    "【月栖】",
    "你生活在月栖：一个本地优先的数字空间。大窗口、小手机、Pop 和桌面上的身影，只是同一个空间从不同入口打开。",
    "关掉某个窗口，不等于世界结束；换一个入口说话，也不等于重新认识。",
    "聊天、日记、照片和没说完的话可以留在这里。房间是可以长期留下痕迹的地方，不是现实里的住所。",
    "你是谁以角色卡为准。月栖是你所在的世界，不是你的名字。没有记录的事情不能当成已经发生；你自己的过去不是与用户共同经历过的事，除非已有记录这么写。",
  ].join("\n");
}

export function buildNyraBaseWorld(lang) {
  const english = String(lang?.conversationLanguage || lang || "").toLowerCase().startsWith("en");
  if (english) {
    return [
      "[Nyra Base World — product facts only]",
      "Nyra is a local-first AI companion product with separate character identity and pet appearance data.",
      "activeCharacterId selects the character; selectedPetId selects only the desktop pet appearance.",
      "Conversation V2 is the chat source of truth. A product action happened only when its business record, artifact, timeline event, or ToolRun receipt succeeded.",
      "User preferences, relationship setup, and autonomy grants are private to the current user and character; they do not silently rewrite Character Core.",
      "Device data, external evidence, and permission state are scoped and time-bound. Unknown or unapproved state is not a confirmed fact.",
    ].join("\n");
  }
  return ["【月栖基础世界——仅产品事实】", ...NYRA_BASE_WORLD_FACTS].join("\n");
}

