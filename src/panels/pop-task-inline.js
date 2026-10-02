/**
 * Pop inline task approval card (OC-pop-inline-approve).
 */

import { t } from "../i18n/index.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object} metadata — message.metadata from pop task dispatch
 */
export function buildPopTaskInlineHtml(metadata = {}) {
  if (metadata.kind !== "agent-task") return "";
  if (metadata.taskStatus !== "WAITING_FOR_APPROVAL" || !metadata.taskId) return "";
  const taskId = String(metadata.taskId);
  const title = metadata.taskTitle || t("shared.task.defaultTitle");
  const effect = metadata.taskEffect || metadata.taskSummary || t("shared.task.defaultEffect");
  return `
    <section class="mini-pop-task-card" data-pop-task-card="${escapeHtml(taskId)}">
      <header><strong>${escapeHtml(title)}</strong><span>${escapeHtml(t("shared.task.awaitingConfirmation"))}</span></header>
      <p class="mini-pop-task-card__effect">${escapeHtml(effect)}</p>
      <div class="mini-pop-task-card__actions">
        <button type="button" class="mini-text-btn" data-pop-task-reject="${escapeHtml(taskId)}">${escapeHtml(t("shared.task.reject"))}</button>
        <button type="button" class="mini-app-cta" data-pop-task-approve="${escapeHtml(taskId)}">${escapeHtml(t("shared.task.approve"))}</button>
        <button type="button" class="mini-text-btn" data-pop-task-open-center="${escapeHtml(taskId)}">${escapeHtml(t("shared.task.taskCenter"))}</button>
      </div>
    </section>
  `;
}

/**
 * @param {object} task — assistant task from dispatch result
 */
export function popTaskMetadataFromAssistantTask(task) {
  if (!task?.id) return {};
  return {
    kind: "agent-task",
    source: "pop_dispatch",
    taskId: task.id,
    taskTitle: task.title || t("shared.task.defaultTitle"),
    taskStatus: task.status,
    taskSummary: task.stepSummary || "",
    taskEffect: task.stepSummary || task.instruction || "",
    needInlineApproval: task.status === "WAITING_FOR_APPROVAL",
  };
}
