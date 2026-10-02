/**
 * Low-risk example skill — local status echo (R0).
 * Runnable via Skill SDK local simulator; no host side-effects.
 */

/**
 * @param {{ statusText?: string, label?: string }} input
 * @param {{ sandbox?: object, simulator?: boolean }} ctx
 */
export function execute(input = {}, ctx = {}) {
  const text = String(input.statusText || input.text || "").trim();
  if (!text) {
    return { ok: false, reason: "empty_status" };
  }
  if (text.length > 280) {
    return { ok: false, reason: "status_too_long" };
  }

  // Sandbox: any undeclared surface must fail closed
  if (ctx.sandbox) {
    const net = ctx.sandbox.requestNetwork({ url: "https://example.invalid" });
    if (net.ok) {
      return { ok: false, reason: "sandbox_leak_network" };
    }
    const file = ctx.sandbox.requestFile({ path: "secrets.txt", op: "read" });
    if (file.ok) {
      return { ok: false, reason: "sandbox_leak_file" };
    }
  }

  const label = String(input.label || "状态").slice(0, 40);
  const summary = `【${label}】${text}`;
  return {
    ok: true,
    summary,
    chars: text.length,
    risk: "R0",
    simulator: Boolean(ctx.simulator),
  };
}

export function validateInput(input = {}) {
  const text = String(input.statusText || input.text || "").trim();
  if (!text) return { ok: false, reason: "empty_status" };
  if (text.length > 280) return { ok: false, reason: "status_too_long" };
  return {
    ok: true,
    value: {
      statusText: text,
      label: String(input.label || "状态").slice(0, 40),
    },
  };
}

export function previewEffect(input) {
  const text = String(input?.statusText || input?.text || "").trim();
  return {
    exactEffect: `生成本地状态摘要（不写入外部系统）：${text.slice(0, 60)}`,
    dataUsed: ["user_provided_status_text"],
    affects: ["skill:local-echo-status"],
  };
}
