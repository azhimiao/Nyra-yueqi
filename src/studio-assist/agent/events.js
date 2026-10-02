/**
 * Map NyraAgentRuntimeEvent → AssistantTaskEvent (product layer).
 * OpenClaw raw events must not leak past here.
 */

/**
 * @typedef {
 *   | { type: "task_created" }
 *   | { type: "task_started" }
 *   | { type: "step_updated"; summary: string }
 *   | { type: "tool_started"; toolName: string }
 *   | { type: "tool_finished"; toolName: string }
 *   | { type: "artifact_created"; artifactId: string }
 *   | { type: "approval_required"; approvalId: string }
 *   | { type: "task_paused" }
 *   | { type: "task_resumed" }
 *   | { type: "task_completed"; summary: string }
 *   | { type: "task_failed"; code: string; message: string }
 * } AssistantTaskEvent
 */

const TOOL_LABELS = {
  "character.inspect": "正在检查角色卡结构",
  "nyra.character.inspect": "正在检查角色卡结构",
  "nyra.character.validate": "正在校验角色卡",
  "nyra.character.create_candidate": "正在生成修复候选",
  "workspace.write_text": "正在写入工作区候选文件",
  "workspace.read_text": "正在读取工作区文件",
  "workspace.list": "正在列出工作区",
  "workspace.inspect_json": "正在解析 JSON",
  "workspace.create_artifact": "正在创建产物",
  "nyra.worldbook.create_merge_candidate": "正在生成世界书合并候选",
  "nyra.theme.inspect": "正在检查主题快照",
  "nyra.theme.validate_theme": "正在校验主题候选",
  "nyra.theme.create_theme_candidate": "正在生成主题候选",
  "nyra.scenario.inspect": "正在检查情景剧包",
  "nyra.scenario.validate": "正在校验情景剧结构",
  "nyra.scenario.create_candidate": "正在生成情景剧修复候选",
  "nyra.resource.inspect_manifest": "正在检查资源包清单",
  "nyra.resource.validate_references": "正在校验资源引用",
  "nyra.resource.create_repaired_candidate": "正在生成资源包修复候选",
  "nyra.settings.read": "正在读取设置",
  "nyra.settings.describe": "正在说明设置项",
  "shell.exec": "请求了不受支持的 Shell",
};

/**
 * @param {{ type: string, [k: string]: unknown }} nyraEvent
 * @returns {AssistantTaskEvent|null}
 */
export function mapNyraEventToAssistant(nyraEvent) {
  if (!nyraEvent || typeof nyraEvent !== "object") return null;
  switch (nyraEvent.type) {
    case "run_started":
      return { type: "task_started" };
    case "model_requested":
      return {
        type: "step_updated",
        summary: `模型步骤 ${nyraEvent.step || ""}`.trim(),
      };
    case "tool_requested":
      return {
        type: "tool_started",
        toolName: String(nyraEvent.toolName || ""),
      };
    case "tool_completed":
      return {
        type: "tool_finished",
        toolName: String(nyraEvent.toolName || ""),
      };
    case "approval_required":
      return {
        type: "approval_required",
        approvalId: String(nyraEvent.approvalId || ""),
      };
    case "run_completed":
      return {
        type: "task_completed",
        summary: String(nyraEvent.summary || "完成"),
      };
    case "run_failed":
      return {
        type: "task_failed",
        code: String(nyraEvent.code || "RUNTIME_ERROR"),
        message: sanitizeUserMessage(String(nyraEvent.message || "任务失败")),
      };
    default:
      return null;
  }
}

/**
 * @param {string} toolName
 */
export function toolStepSummary(toolName) {
  return TOOL_LABELS[toolName] || `执行工具：${toolName}`;
}

/**
 * Strip secrets / absolute paths / internal dumps from user-facing text.
 * @param {string} message
 */
export function sanitizeUserMessage(message) {
  let text = String(message || "");
  text = text.replace(/sk-[a-zA-Z0-9]{8,}/g, "[redacted]");
  text = text.replace(/[A-Za-z]:\\[^\s]+/g, "[path]");
  text = text.replace(/\/(?:Users|home|var|tmp)\/[^\s]+/g, "[path]");
  if (text.length > 280) text = `${text.slice(0, 277)}...`;
  return text;
}

/**
 * @param {AssistantTaskEvent} event
 * @param {string} [fallback]
 */
export function eventToSpeech(event, fallback = "") {
  if (!event) return fallback;
  switch (event.type) {
    case "task_started":
      return "已启动本地 Agent 任务";
    case "step_updated":
      return event.summary;
    case "tool_started":
      return toolStepSummary(event.toolName);
    case "tool_finished":
      return `${toolStepSummary(event.toolName)} — 完成`;
    case "artifact_created":
      return "已生成候选产物";
    case "approval_required":
      return "已生成修复候选，等待你确认是否导入";
    case "task_completed":
      return event.summary || "任务完成";
    case "task_failed":
      return `任务失败：${event.message}`;
    case "task_paused":
      return "任务已暂停，可在恢复后继续";
    case "task_resumed":
      return "任务已恢复";
    default:
      return fallback;
  }
}
