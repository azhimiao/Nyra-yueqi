/**
 * Regex transform rules — schema + compile (F5 / F4).
 */

export const REGEX_STORE_KEY = "yueqi.regex.v1";

function nowIso() {
  return new Date().toISOString();
}

/** @type {readonly object[]} */
export const BUILTIN_REGEX_RULES = Object.freeze([
  {
    id: "builtin-out-strip-think",
    name: "收起思考过程",
    description: "模型若带上思考内容，聊天里只显示最终回复，不把思考过程露出来。",
    direction: "outbound",
    pattern: "<think>[\\s\\S]*?<\\/think>",
    replacement: "",
    flags: "gis",
    enabled: true,
    order: 10,
    builtin: true,
  },
  {
    id: "builtin-in-trim-spaces",
    name: "合并多余空格",
    description: "你发出去的字若有一串空格，会自动收成一个，读起来更干净。",
    direction: "inbound",
    pattern: "[ \\t\\u3000]{2,}",
    replacement: " ",
    flags: "g",
    enabled: true,
    order: 10,
    builtin: true,
  },
]);

/**
 * @param {object} rule
 * @returns {{ ok: true, re: RegExp } | { ok: false, error: string }}
 */
export function compileRegexRule(rule) {
  try {
    const pattern = String(rule?.pattern ?? "");
    if (!pattern) return { ok: false, error: "空模式" };
    const flags = String(rule?.flags || "g");
    // Reject obvious catastrophic constructs we don't support
    if (/\(\?<=|\(\?<!/.test(pattern)) {
      return { ok: false, error: "不支持 lookbehind" };
    }
    const re = new RegExp(pattern, flags);
    return { ok: true, re };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "compile_failed") };
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeRegexRule(raw = {}) {
  const direction = raw.direction === "inbound" ? "inbound" : "outbound";
  return {
    id: String(raw.id || "").trim() || `regex-${Date.now()}`,
    name: String(raw.name || "未命名规则").trim() || "未命名规则",
    description: String(raw.description || "").trim(),
    direction,
    pattern: String(raw.pattern || ""),
    replacement: String(raw.replacement ?? ""),
    flags: String(raw.flags || "g"),
    enabled: raw.enabled !== false,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 100,
    builtin: Boolean(raw.builtin),
    broken: Boolean(raw.broken),
    updatedAt: raw.updatedAt || nowIso(),
  };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, rule?: object, errors: string[] }}
 */
export function validateRegexRule(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["不是有效规则"] };
  const rule = normalizeRegexRule(raw);
  if (!rule.name) errors.push("缺少名称");
  if (!rule.pattern) errors.push("缺少模式");
  const compiled = compileRegexRule(rule);
  if (!compiled.ok) errors.push(compiled.error || "编译失败");
  if (errors.length) return { ok: false, errors, rule: { ...rule, broken: true } };
  return { ok: true, rule, errors: [] };
}

export function createBuiltinRegexBag() {
  return {
    inbound: BUILTIN_REGEX_RULES.filter((r) => r.direction === "inbound").map((r) => ({ ...r })),
    outbound: BUILTIN_REGEX_RULES.filter((r) => r.direction === "outbound").map((r) => ({ ...r })),
  };
}
