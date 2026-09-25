/**
 * Chat / Pop cards for capability open + permission request buttons.
 */

export const CAPABILITY_OPEN_EVENT = "yueqi:capability-open";
export const CAPABILITY_PERMISSION_EVENT = "yueqi:capability-permission";

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

export function isCapabilityActionMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return false;
  return clean(metadata.kind, 40) === "capability-action"
    || clean(metadata.activityType, 40) === "capability";
}

/**
 * @param {object} metadata
 * @param {{ locale?: string }} [opts]
 */
export function resolveCapabilityActionCard(metadata = {}, { locale = "zh-CN" } = {}) {
  if (!isCapabilityActionMetadata(metadata)) return null;
  const en = String(locale || "").toLowerCase().startsWith("en");
  return {
    capabilityId: clean(metadata.capabilityId, 80),
    permissionId: clean(metadata.permissionId, 80),
    openApp: clean(metadata.openApp, 40),
    event: clean(metadata.event, 80),
    needsPermission: Boolean(metadata.needsPermission),
    needsConfirm: Boolean(metadata.needsConfirm),
    actionLabel: clean(metadata.actionLabel, 40)
      || (metadata.needsPermission
        ? (en ? "Request permission" : "申请权限")
        : (en ? "Open" : "打开")),
    secondaryLabel: clean(metadata.secondaryLabel, 40),
    title: clean(metadata.title, 80)
      || (metadata.needsPermission
        ? (en ? "Permission needed" : "需要权限")
        : (en ? "Action" : "操作")),
  };
}
