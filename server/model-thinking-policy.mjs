/** Server-owned, capability-scoped policy; never send vendor fields to arbitrary BYOK. */
export function hostedThinkingOptions({ managed, model, businessPurpose, env = process.env } = {}) {
  if (!managed || businessPurpose !== "chat.companion_reply" || !/^doubao-seed-2[-.]1(?:[-.]|$)/i.test(String(model || ""))) return {};
  const mode = String(env.YUEQI_COMPANION_THINKING || "disabled").trim().toLowerCase();
  if (mode === "preserve") return {};
  if (mode !== "disabled" && mode !== "enabled") return {};
  return { thinking: { type: mode } };
}
