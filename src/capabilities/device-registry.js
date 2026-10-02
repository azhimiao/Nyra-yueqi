/**
 * Device capability catalogue.
 *
 * This is the single source of truth for privacy-sensitive native abilities.
 * Product/action capabilities in ./registry.js describe what the companion can
 * do; this catalogue describes which OS ability an action must preflight.
 */

const define = (row) => Object.freeze({
  androidPermissions: [],
  specialPermission: null,
  foregroundServiceType: null,
  requiresForeground: false,
  requiresUserGesture: false,
  executionRequiresUserGesture: false,
  sessionScoped: false,
  systemPermissionOnly: false,
  nativeBridge: null,
  availability: ["android", "web"],
  implemented: true,
  ...row,
});

const DEVICE_CAPABILITIES = Object.freeze([
  define({
    id: "desktop.overlay",
    displayName: "桌宠悬浮",
    description: "让桌宠在月栖退到后台后继续显示在其他应用上方",
    internalPermission: "desktop.overlay",
    androidPermissions: ["android.permission.SYSTEM_ALERT_WINDOW"],
    specialPermission: "SYSTEM_ALERT_WINDOW",
    systemPermissionOnly: true,
    foregroundServiceType: "specialUse",
    requiresUserGesture: true,
    executionRequiresUserGesture: true,
    nativeBridge: "CompanionOverlay",
    availability: ["android"],
  }),
  define({
    id: "microphone.capture",
    displayName: "麦克风",
    description: "在用户主动录音时采集声音",
    internalPermission: "microphone",
    androidPermissions: ["android.permission.RECORD_AUDIO"],
    systemPermissionOnly: true,
    foregroundServiceType: "microphone",
    requiresForeground: true,
    requiresUserGesture: true,
    executionRequiresUserGesture: true,
    nativeBridge: "NativeCapability",
  }),
  define({
    id: "voice.input",
    displayName: "语音输入",
    description: "将用户主动录制的语音转成文字",
    internalPermission: "voice.input",
    androidPermissions: ["android.permission.RECORD_AUDIO"],
    systemPermissionOnly: true,
    foregroundServiceType: "microphone",
    requiresForeground: true,
    requiresUserGesture: true,
    executionRequiresUserGesture: true,
    nativeBridge: "NativeCapability",
    dependsOn: ["microphone.capture"],
  }),
  define({
    id: "voice.output",
    displayName: "语音输出",
    description: "通过 TTS 或音频播放让角色说话",
    internalPermission: "voice.output",
    nativeBridge: "WebAudio",
  }),
  define({
    id: "camera.capture",
    displayName: "拍照",
    description: "仅在用户主动分享时拍摄单张照片",
    internalPermission: "camera",
    androidPermissions: ["android.permission.CAMERA"],
    systemPermissionOnly: true,
    foregroundServiceType: "camera",
    requiresForeground: true,
    requiresUserGesture: true,
    executionRequiresUserGesture: true,
    nativeBridge: "NativeCapability",
  }),
  define({
    id: "camera.preview",
    displayName: "摄像头预览",
    description: "在前台视频模式中显示摄像头画面",
    internalPermission: "camera.preview",
    androidPermissions: ["android.permission.CAMERA"],
    systemPermissionOnly: true,
    foregroundServiceType: "camera",
    requiresForeground: true,
    requiresUserGesture: true,
    executionRequiresUserGesture: true,
    sessionScoped: true,
    nativeBridge: "WebMedia",
  }),
  define({
    id: "location.current",
    displayName: "当前位置",
    description: "按需读取一次当前位置，允许仅提供大致位置",
    internalPermission: "location",
    androidPermissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
    ],
    systemPermissionOnly: true,
    requiresForeground: true,
    requiresUserGesture: true,
    nativeBridge: "NativeCapability",
  }),
  define({
    id: "location.background",
    displayName: "后台定位",
    description: "在用户单独开启的地点触发模式中访问后台位置",
    internalPermission: "location.background",
    androidPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION"],
    specialPermission: "BACKGROUND_LOCATION_SETTINGS",
    foregroundServiceType: "location",
    requiresUserGesture: true,
    nativeBridge: "NativeCapability",
    availability: ["android"],
    implemented: false,
    dependsOn: ["location.current"],
  }),
  define({
    id: "screen.capture",
    displayName: "单次看屏",
    description: "经系统逐次同意后读取一帧屏幕并立即释放",
    internalPermission: "screen.capture",
    androidPermissions: [
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
    ],
    specialPermission: "MEDIA_PROJECTION_CONSENT",
    // The per-session system consent is the only gate; no app-level toggle.
    systemPermissionOnly: true,
    foregroundServiceType: "mediaProjection",
    requiresUserGesture: true,
    executionRequiresUserGesture: true,
    sessionScoped: true,
    nativeBridge: "CompanionOverlay",
    availability: ["android", "electron", "web"],
  }),
  define({
    id: "screen.observe",
    displayName: "陪你看屏幕",
    description: "在明确可见的会话中持续采样屏幕，停止后释放全部资源",
    internalPermission: "screen.observe",
    androidPermissions: [
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
    ],
    specialPermission: "MEDIA_PROJECTION_CONSENT",
    foregroundServiceType: "mediaProjection",
    requiresUserGesture: true,
    executionRequiresUserGesture: true,
    sessionScoped: true,
    nativeBridge: "NativeCapability",
    availability: ["android", "electron", "web"],
    implemented: false,
  }),
  define({
    id: "notification.send",
    displayName: "通知",
    description: "在 App 外投递陪伴消息；与桌宠服务通知分属不同频道",
    internalPermission: "notification",
    androidPermissions: ["android.permission.POST_NOTIFICATIONS"],
    systemPermissionOnly: true,
    requiresUserGesture: true,
    nativeBridge: "LocalNotifications",
  }),
  define({
    id: "calendar.internal",
    displayName: "栖机日历",
    description: "读写月栖本地日历，不访问 Android 系统日历",
    internalPermission: "calendar.internal",
    nativeBridge: "ConversationCalendar",
  }),
  define({
    id: "calendar.read",
    displayName: "读取系统日历",
    description: "读取用户授权的 Android 系统日历与事件",
    internalPermission: "calendar.read",
    androidPermissions: ["android.permission.READ_CALENDAR"],
    systemPermissionOnly: true,
    requiresForeground: true,
    requiresUserGesture: true,
    nativeBridge: "NativeCapability",
    availability: ["android"],
  }),
  define({
    id: "calendar.write",
    displayName: "写入系统日历",
    description: "创建、更新或删除 Android 系统日历事件",
    internalPermission: "calendar.write",
    androidPermissions: ["android.permission.WRITE_CALENDAR"],
    systemPermissionOnly: true,
    requiresForeground: true,
    requiresUserGesture: true,
    nativeBridge: "NativeCapability",
    availability: ["android"],
  }),
]);

const DEVICE_CAPABILITY_MAP = new Map(DEVICE_CAPABILITIES.map((row) => [row.id, row]));

export const CAPABILITY_IDS = Object.freeze(DEVICE_CAPABILITIES.map((row) => row.id));

export function getDeviceCapability(id) {
  return DEVICE_CAPABILITY_MAP.get(String(id || "").trim()) || null;
}

export function listDeviceCapabilities() {
  return DEVICE_CAPABILITIES.map((row) => ({
    ...row,
    androidPermissions: [...row.androidPermissions],
    availability: [...row.availability],
    dependsOn: [...(row.dependsOn || [])],
  }));
}

export const TOOL_CAPABILITY_MAP = Object.freeze({
  "microphone.get_status": "microphone.capture",
  "microphone.request": "microphone.capture",
  "microphone.start_capture": "microphone.capture",
  "microphone.stop_capture": "microphone.capture",
  "voice.listen": "voice.input",
  "voice.speak": "voice.output",
  "camera.get_status": "camera.capture",
  "camera.request": "camera.capture",
  "camera.capture": "camera.capture",
  "location.get_current": "location.current",
  "screen.capture": "screen.capture",
  "screen.observe.start": "screen.observe",
  "screen.observe.stop": "screen.observe",
  "notification.send": "notification.send",
  "calendar.list_calendars": "calendar.read",
  "calendar.list_events": "calendar.read",
  "calendar.get_event": "calendar.read",
  "calendar.create_event": "calendar.write",
  "calendar.update_event": "calendar.write",
  "calendar.delete_event": "calendar.write",
});

export function capabilityForTool(toolName) {
  return TOOL_CAPABILITY_MAP[String(toolName || "").trim()] || null;
}
