/**
 * Single capability catalogue for companion chat, ActionProposal execution,
 * debug UI and future native function-calling adapters.
 */

export const CAPABILITY_REGISTRY_VERSION = "1.0";

const CAPABILITIES = Object.freeze([
  {
    id: "web.weather",
    title: "天气查询",
    description: "读取指定地点天气并返回来源与抓取时间",
    operations: ["lookup"], risk: "R0", approval: "none",
    implemented: true, enabledByDefault: true, executor: "turn-understanding/weather",
  },
  {
    id: "web.search",
    title: "联网检索",
    description: "通过检索网关读取带来源的公开信息，默认不写稳定记忆",
    operations: ["search"], risk: "R0", approval: "none",
    implemented: true, enabledByDefault: true, executor: "turn-understanding/web-search",
    featureFlag: "webRetrievalV1",
  },
  {
    id: "calendar",
    title: "日历与提醒",
    description: "读取本地日历，或经确认创建可撤销的日程与提醒",
    operations: ["list", "read", "free", "create", "create_reminder"],
    risk: "R0-R2", approval: "writes", implemented: true, enabledByDefault: true,
    executor: "turn-understanding/calendar",
  },
  {
    id: "calendar-draft",
    title: "日程草稿",
    description: "生成日程草稿但不直接写入日历",
    operations: ["create_draft"], risk: "R1", approval: "explicit-command",
    implemented: true, enabledByDefault: true, executor: "turn-understanding/calendar-draft",
  },
  {
    id: "companion.diary",
    title: "角色日记",
    description: "由当前角色写入可追溯日记 Artifact，并投递到聊天",
    operations: ["create"], risk: "R1", approval: "explicit-command",
    implemented: true, enabledByDefault: true, executor: "companion/diary-action",
  },
  {
    id: "companion.selfie",
    title: "角色自拍",
    description: "创建当前角色媒体 Artifact，并投递到聊天/相册",
    operations: ["create"], risk: "R1", approval: "explicit-command",
    implemented: true, enabledByDefault: true, executor: "companion/selfie",
  },
  {
    id: "assistant.task",
    title: "栖机助手任务",
    description: "创建受控本地助手任务；重要修改仍走审批",
    operations: ["create"], risk: "R1-R2", approval: "policy",
    implemented: true, enabledByDefault: true, executor: "studio-assist/task-runtime",
  },
  {
    id: "runtime.avatar",
    title: "角色表情与动作",
    description: "将模型输出映射到已安装角色包的受控动作与表情",
    operations: ["act", "express"], risk: "R0", approval: "none",
    implemented: true, enabledByDefault: true, executor: "runtime/protocol-v1",
  },
  {
    id: "artifact.show",
    title: "展示作品",
    description: "将已有 Artifact（日记/自拍/作品）投递或展示到聊天；不可伪造不存在的作品",
    operations: ["show"], risk: "R0", approval: "none",
    implemented: true, enabledByDefault: true, executor: "artifacts/delivery",
  },
  {
    id: "microphone.capture",
    title: "麦克风采集",
    description: "读取麦克风能力状态；原始 start/stop 仅供受信 UI 的语音会话控制",
    operations: ["get_status"],
    risk: "R1", approval: "user-gesture", implemented: true, enabledByDefault: true,
    executor: "device-tools/microphone",
  },
  {
    id: "voice.input",
    title: "语音输入",
    description: "采集用户主动录制的声音并进入 ASR",
    operations: ["listen"], risk: "R1", approval: "user-gesture",
    implemented: true, enabledByDefault: true, executor: "device-tools/voice-input",
  },
  {
    id: "voice.output",
    title: "语音输出",
    description: "使用独立 TTS/播放链路朗读文本，不依赖麦克风权限",
    operations: ["speak"], risk: "R0", approval: "none",
    implemented: true, enabledByDefault: true, executor: "device-tools/voice-output",
  },
  {
    id: "camera.capture",
    title: "主动拍照",
    description: "经用户确认后调用系统相机拍摄一张临时图片",
    operations: ["get_status", "capture"], risk: "R2", approval: "always",
    implemented: true, enabledByDefault: true, executor: "device-tools/camera",
  },
  {
    id: "location.current",
    title: "当前位置",
    description: "按需读取一次大致或精确位置",
    operations: ["get_current"], risk: "R1", approval: "user-gesture",
    implemented: true, enabledByDefault: true, executor: "device-tools/location",
  },
  {
    id: "screen.capture",
    title: "单次看屏",
    description: "每次经 MediaProjection 系统同意后截取一帧并释放",
    operations: ["capture"], risk: "R2", approval: "always",
    implemented: true, enabledByDefault: true, executor: "device-tools/screen-capture",
  },
  {
    id: "screen.observe",
    title: "陪你看屏幕",
    description: "启动或停止明确可见的屏幕观察会话",
    operations: ["start", "stop"], risk: "R2", approval: "always",
    implemented: false, enabledByDefault: false, executor: "device-tools/screen-observe",
  },
  {
    id: "notification.send",
    title: "发送通知",
    description: "在 Companion Messages 或 Agent Tasks 频道发送通知",
    operations: ["send"], risk: "R1", approval: "user-gesture",
    implemented: true, enabledByDefault: true, executor: "device-tools/notification",
  },
  {
    id: "calendar.read",
    title: "读取系统日历",
    description: "通过 CalendarContract 读取 Android 系统日历",
    operations: ["list_calendars", "list_events", "get_event"],
    risk: "R1", approval: "user-gesture", implemented: true, enabledByDefault: true,
    executor: "device-tools/calendar-read",
  },
  {
    id: "calendar.write",
    title: "写入系统日历",
    description: "经审批后通过 CalendarContract 创建、更新或删除事件",
    operations: ["create_event", "update_event", "delete_event"],
    risk: "R2", approval: "always", implemented: true, enabledByDefault: true,
    executor: "device-tools/calendar-write",
  },
  {
    id: "messaging.external",
    title: "外部代发消息",
    description: "需要宿主联系人适配器和二次确认；当前仅生成待确认提案",
    operations: ["send_message"], risk: "R3", approval: "always-twice",
    implemented: false, enabledByDefault: false, executor: "host-adapter-required",
  },
]);

export function listCapabilities({ includeUnavailable = true } = {}) {
  return CAPABILITIES
    .filter((item) => includeUnavailable || item.implemented)
    .map((item) => ({ ...item, operations: [...item.operations] }));
}

export function getCapability(capabilityId, operation = "") {
  const rawId = String(capabilityId || "").trim();
  const aliases = {
    "calendar-crud": "calendar",
    "web.retrieval": "web.search",
    "web.fetch": "web.search",
  };
  const id = aliases[rawId] || rawId;
  const row = CAPABILITIES.find((item) => item.id === id) || null;
  if (!row) return null;
  if (operation && !row.operations.includes(String(operation))) return null;
  return { ...row, operations: [...row.operations] };
}

export function capabilityPromptManifest(lang) {
  const en = String(lang?.conversationLanguage || lang || "").toLowerCase().startsWith("en");
  const rows = listCapabilities({ includeUnavailable: false })
    .filter((item) => item.enabledByDefault)
    .map((item) => `- ${item.id}: ${item.operations.join("|")}; risk=${item.risk}; approval=${item.approval}`);
  return [
    en ? `[Available product capabilities v${CAPABILITY_REGISTRY_VERSION}]` : `【可用产品能力 v${CAPABILITY_REGISTRY_VERSION}】`,
    ...rows,
    en
      ? "Capability availability is not proof of execution. Only an ActionProposal execution result proves success."
      : "能力存在不等于已经执行；只有 ActionProposal 的执行结果可以证明成功。",
  ].join("\n");
}

export function formatTurnActionContext(result, lang) {
  const understanding = result?.understanding || null;
  const dispatch = result?.dispatch || result?.shadow || null;
  if (!understanding && !dispatch) return "";
  const en = String(lang?.conversationLanguage || lang || "").toLowerCase().startsWith("en");
  const lines = [en ? "[This turn's governed capability state]" : "【本轮受控能力状态】"];
  if (understanding?.conversationalIntent) {
    lines.push(`${en ? "intent" : "意图"}: ${understanding.conversationalIntent}; interpreter=${understanding.interpreter || "unknown"}`);
  }
  for (const row of dispatch?.results || []) {
    const status = row.executed ? "executed" : (row.status || row.reason || "pending");
    const summary = String(row.summary || row.exactEffect || row.message || row.reason || "").trim();
    lines.push(`- ${row.kind || row.capabilityId || row.proposalId || "action"}: ${status}${summary ? `; ${summary}` : ""}`);
  }
  for (const proposal of dispatch?.pendingApproval || []) {
    lines.push(`- ${proposal.capabilityId}.${proposal.operation}: pending_approval; ${proposal.exactEffect || proposal.title || ""}`);
  }
  if (lines.length === 1) lines.push(en ? "No capability action was required." : "本轮不需要调用能力。");
  lines.push(en
    ? "Never claim completion for pending/failed actions. Acknowledge executed results naturally and include useful sourced facts."
    : "不得把待确认或失败动作说成已完成；对已执行结果自然回应，并保留有用的来源事实。");
  return lines.join("\n");
}

export function capabilityRegistrySummary() {
  const rows = listCapabilities({ includeUnavailable: true });
  return {
    version: CAPABILITY_REGISTRY_VERSION,
    total: rows.length,
    implemented: rows.filter((row) => row.implemented).length,
    enabledByDefault: rows.filter((row) => row.implemented && row.enabledByDefault).length,
    unavailable: rows.filter((row) => !row.implemented).map((row) => row.id),
  };
}

