/**
 * Explore-specific intent routing — reuses assistant modes; never invents Shell execution.
 */

import { routeAssistantIntent } from "../studio-assist/agent/intent-router.js";

const EXPLORE_LOCAL = [
  {
    intent: "worldbook_merge",
    pattern: /(合并).*(世界书)|世界书.*(合并|去重|重复)/i,
  },
  {
    intent: "character_inspect_fix",
    pattern: /(检查|修复).{0,12}角色卡|(角色卡).{0,16}(问题|缺失|修复)/i,
  },
  {
    intent: "text_analyze",
    pattern: /(分析|整理|汇总).*(markdown|md|txt|json|文本|文件)/i,
  },
  {
    intent: "zip_inspect",
    pattern: /(检查|校验).*(zip|资源包|主题包)/i,
  },
];

const EXPLORE_EXTERNAL = [
  /\bpython\b/i,
  /运行\s*python/i,
  /\bshell\b/i,
  /\bgit\b/i,
  /npm\s+(install|run)/i,
  /网页自动化|浏览器自动化|编译|任意代码/,
];

/**
 * @param {string} text
 */
export function routeExploreIntent(text) {
  const value = String(text || "").trim();
  for (const re of EXPLORE_EXTERNAL) {
    if (re.test(value)) {
      return {
        mode: "external-required",
        intent: "external_execution",
        confidence: 0.95,
        reasonSummary: "Explore refuses shell/code/browser in-client",
        requiredCapabilities: ["external-backend"],
        requestedResources: [],
      };
    }
  }
  for (const row of EXPLORE_LOCAL) {
    if (row.pattern.test(value)) {
      return {
        mode: "local-agent",
        intent: row.intent,
        confidence: 0.88,
        reasonSummary: `Explore local task: ${row.intent}`,
        requiredCapabilities: [],
        requestedResources: [],
      };
    }
  }
  // Fall through to assistant router for shared phrases
  const assist = routeAssistantIntent(value);
  if (assist.mode === "local-agent" || assist.mode === "external-required") {
    return { ...assist, reasonSummary: `via assistant router: ${assist.reasonSummary}` };
  }
  return {
    mode: "conversation",
    intent: "explore_chat",
    confidence: 0.6,
    reasonSummary: "Default explore conversation / skill chat",
    requiredCapabilities: [],
    requestedResources: [],
  };
}
