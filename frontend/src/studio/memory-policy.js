/**
 * Memory policy: what may be remembered, proactivity, sensitive topics.
 */

/**
 * @typedef {{
 *   allowRemember: string[],
 *   denyRemember: string[],
 *   proactivity: "low"|"medium"|"high",
 *   sensitiveTopics: { topic: string, policy: "avoid"|"ask"|"soft" }[],
 *   maxProactivePerDay: number,
 *   retainRelationMemoryOnUpgrade: boolean,
 * }} MemoryPolicy
 */

const PROACTIVITY = new Set(["low", "medium", "high"]);
const SENSITIVE_POLICIES = new Set(["avoid", "ask", "soft"]);

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: MemoryPolicy } | { ok: false, reason: string, errors: string[] }}
 */
export function normalizeMemoryPolicy(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "memory_policy_not_object", errors: ["memoryPolicy required"] };
  }
  const errors = [];
  const o = /** @type {Record<string, unknown>} */ (raw);

  const allowRemember = Array.isArray(o.allowRemember)
    ? o.allowRemember.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const denyRemember = Array.isArray(o.denyRemember)
    ? o.denyRemember.map((x) => String(x).trim()).filter(Boolean)
    : [];

  let proactivity = String(o.proactivity || "medium").trim();
  if (!PROACTIVITY.has(proactivity)) {
    errors.push("proactivity must be low|medium|high");
    proactivity = "medium";
  }

  const sensitiveTopics = Array.isArray(o.sensitiveTopics)
    ? o.sensitiveTopics
        .map((s) => ({
          topic: String(s?.topic || "").trim(),
          policy: String(s?.policy || "ask").trim(),
        }))
        .filter((s) => s.topic && SENSITIVE_POLICIES.has(s.policy))
    : [];

  const maxProactivePerDay = Math.max(
    0,
    Math.min(48, Number(o.maxProactivePerDay) || (proactivity === "high" ? 8 : 4)),
  );

  // Package authors cannot opt out of preserving user relation memory on upgrade
  const retainRelationMemoryOnUpgrade = o.retainRelationMemoryOnUpgrade !== false;

  if (!allowRemember.length) errors.push("allowRemember must list at least one category");

  if (errors.length) {
    return { ok: false, reason: "invalid_memory_policy", errors };
  }

  return {
    ok: true,
    value: {
      allowRemember,
      denyRemember,
      proactivity: /** @type {MemoryPolicy["proactivity"]} */ (proactivity),
      sensitiveTopics,
      maxProactivePerDay,
      retainRelationMemoryOnUpgrade,
    },
  };
}

/**
 * @param {MemoryPolicy} policy
 * @param {string} category
 */
export function mayRemember(policy, category) {
  const cat = String(category || "").trim();
  if (!cat) return false;
  if (policy.denyRemember.includes(cat)) return false;
  return policy.allowRemember.includes(cat) || policy.allowRemember.includes("*");
}

/**
 * @param {MemoryPolicy} policy
 * @param {string} topic
 */
export function sensitiveTopicPolicy(policy, topic) {
  const t = String(topic || "").trim().toLowerCase();
  const hit = policy.sensitiveTopics.find((s) => s.topic.toLowerCase() === t);
  return hit?.policy || null;
}
