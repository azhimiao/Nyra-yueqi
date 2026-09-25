/**
 * Lightweight env probes for autonomy media / battery gates.
 */

/**
 * @returns {Promise<{ batteryLevel: number|null, charging: boolean, connectionType: string, powerSave: boolean }>}
 */
export async function probeDevicePolicyEnv() {
  const env = {
    batteryLevel: null,
    charging: false,
    connectionType: "unknown",
    powerSave: false,
  };
  try {
    if (typeof navigator !== "undefined" && navigator.getBattery) {
      const bat = await navigator.getBattery();
      env.batteryLevel = Number(bat.level);
      env.charging = Boolean(bat.charging);
    }
  } catch {
    /* ignore */
  }
  try {
    const conn = navigator?.connection || navigator?.mozConnection || navigator?.webkitConnection;
    if (conn?.effectiveType || conn?.type) {
      const t = String(conn.type || conn.effectiveType || "").toLowerCase();
      env.connectionType = t.includes("wifi") || t === "ethernet" ? "wifi" : t || "unknown";
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-data: reduce)").matches) {
      env.powerSave = true;
    }
  } catch {
    /* ignore */
  }
  return env;
}
