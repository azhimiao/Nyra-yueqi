import { CAPABILITY_STATUS } from "./permission-broker.js";
import { capabilityPermissionBroker } from "../platform/native-capabilities.js";
import { TOOL_CAPABILITY_MAP } from "./device-registry.js";

function discoveryStatus(state) {
  if (state.status === CAPABILITY_STATUS.AVAILABLE && state.granted) return "CAN_USE";
  if (state.status === CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED) return "SESSION_REQUIRED";
  if (state.status === CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE) return "UNAVAILABLE";
  return "NEEDS_PERMISSION";
}

export async function buildDeviceCapabilitySnapshot(broker = capabilityPermissionBroker) {
  const states = await broker.getAllCapabilityStates();
  const capabilities = {};
  for (const [id, state] of Object.entries(states)) {
    capabilities[id] = {
      status: discoveryStatus(state),
      accuracy: state.accuracy || undefined,
      serviceRunning: state.serviceRunning || undefined,
      sessionScoped: state.sessionScoped || undefined,
      tools: Object.entries(TOOL_CAPABILITY_MAP)
        .filter(([, capability]) => capability === id)
        .map(([tool]) => tool),
    };
  }
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    capabilities,
  };
}

export function formatDeviceCapabilitySnapshot(snapshot, lang = "zh-CN") {
  const rows = Object.entries(snapshot?.capabilities || {})
    .map(([id, value]) => {
      const tools = value.tools?.length ? `; tools=${value.tools.join("|")}` : "";
      return `- ${id}: ${value.status}${value.accuracy ? `; accuracy=${value.accuracy}` : ""}${tools}`;
    });
  const english = String(lang || "").toLowerCase().startsWith("en");
  return [
    english
      ? "[Device capabilities — availability only; use tools to read private data]"
      : "【设备能力 — 这里只表示可用性；隐私数据必须按需调用工具读取】",
    ...rows,
    english
      ? "You may request a capability, but only the user and OS can grant it. Never claim device data without a successful tool result."
      : "你可以请求能力，但只有用户与系统能授权；没有成功 Tool 结果时不得声称读到了设备数据。",
  ].join("\n");
}
