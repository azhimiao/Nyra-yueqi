/**
 *  Assistant Intent Router — deterministic first; never default-upgrade to agent.
 */

/** @typedef {"conversation"|"direct-action"|"local-agent"|"external-required"} AssistantExecutionMode */

/**
 * @typedef {object} AssistantResourceRequest
 * @property {"character"|"worldbook"|"scenario"|"theme"|"workspace-file"} type
 * @property {string} [resourceId]
 * @property {"read"|"propose-write"} [access]
 */

/**
 * @typedef {object} AssistantIntentDecision
 * @property {AssistantExecutionMode} mode
 * @property {string} intent
 * @property {number} confidence
 * @property {string[]} requiredCapabilities
 * @property {AssistantResourceRequest[]} requestedResources
 * @property {string} reasonSummary
 * @property {string} [actionId]
 * @property {Record<string, unknown>} [actionArgs]
 */

const EXTERNAL_PATTERNS = [
  /\bpython\b/i,
  /运行\s*python/i,
  /\bshell\b/i,
  /执行\s*shell/i,
  /\bgit\b/i,
  /npm\s+(install|run|ci)/i,
  /安装\s*npm/i,
  /网页自动化|浏览器自动化|selenium|playwright/i,
  /访问任意外部文件|编译代码|运行第三方/,
  /child_process|powershell|cmd\.exe/i,
];

/** @type {{ id: string, intent: string, pattern: RegExp, args?: (m: RegExpMatchArray) => Record<string, unknown> }[]} */
const DIRECT_ACTIONS = [
  {
    id: "appearance.apply_theme",
    intent: "enable_night_mode",
    pattern: /^(打开|开启|切换到)?\s*(夜间模式|墨夜|深色模式|暗色模式)\s*$/i,
    args: () => ({ id: "ink" }),
  },
  {
    id: "appearance.apply_theme",
    intent: "apply_theme",
    pattern: /^(打开|开启|切换到|应用)\s*(月栖纸|青雾|松烟|墨夜)\s*$/,
    args: (m) => {
      const map = { 月栖纸: "yueqi", 青雾: "mist", 松烟: "pine", 墨夜: "ink" };
      return { id: map[m[2]] || "ink" };
    },
  },
  {
    id: "appearance.apply_theme",
    intent: "disable_night_mode",
    pattern: /^(关闭|关掉)\s*(夜间模式|深色模式|暗色模式)\s*$/i,
    args: () => ({ id: "yueqi" }),
  },
  {
    id: "proactive.update",
    intent: "disable_proactive",
    pattern: /^(关闭|关掉)\s*(主动消息|主动陪伴)\s*$/i,
    args: () => ({ probability: 0 }),
  },
  {
    id: "character.export_hint",
    intent: "export_character",
    pattern: /^(导出)\s*(当前)?\s*角色\s*$/i,
    args: () => ({}),
  },
];

const LOCAL_AGENT_PATTERNS = [
  {
    intent: "character_inspect_fix",
    // Only explicit character-card file / structure / fix-candidate requests.
    // Must NOT match: 检查角色人设 / 分析性格 / 感情 / 「角色是什么意思」
    pattern:
      /(检查|修复|补全|生成).{0,12}角色卡|(角色卡).{0,16}(问题|缺失|缺少|修复|检查|结构)|(生成).{0,8}(角色卡)?修复版本|有什么问题并生成修复/i,
    resources: [{ type: "character", access: "propose-write" }],
    capabilities: ["nyra.character.inspect", "workspace.write_text"],
  },
  {
    intent: "worldbook_merge",
    pattern: /(合并).*(世界书)|世界书.*(合并|去重)/i,
    resources: [{ type: "worldbook", access: "propose-write" }],
    capabilities: ["nyra.worldbook.create_merge_candidate"],
  },
  {
    intent: "theme_draft",
    pattern: /(根据|用).*(颜色|素材).*(主题|设计完整主题)|设计完整主题/i,
    resources: [{ type: "theme", access: "propose-write" }],
    capabilities: ["nyra.theme.inspect", "nyra.theme.create_theme_candidate"],
  },
  {
    intent: "scenario_audit",
    pattern: /(检查).*(情景剧包|情景剧)|情景剧.*(缺少|缺失|不完整)/i,
    resources: [{ type: "scenario", access: "read" }],
    capabilities: ["nyra.scenario.inspect"],
  },
];

const CONVERSATION_HINTS = [
  /是什么|怎么(修改|打开|用)|为什么|如何|告诉我|解释/,
  /我今天很难受|心情不好|安慰|陪我聊聊/,
  /夜间模式怎么打开|怎么打开夜间/,
  /你觉得.*角色|分析一下.*(性格|她|他)|检查自己的感情|角色是什么意思|检查角色人设/,
];

/**
 * @param {string} text
 * @param {{ authorizedResources?: AssistantResourceRequest[] }} [opts]
 * @returns {AssistantIntentDecision}
 */
export function routeAssistantIntent(text, opts = {}) {
  const value = String(text || "").trim();
  if (!value) {
    return {
      mode: "conversation",
      intent: "empty",
      confidence: 1,
      requiredCapabilities: [],
      requestedResources: [],
      reasonSummary: "empty input",
    };
  }

  for (const re of EXTERNAL_PATTERNS) {
    if (re.test(value)) {
      return {
        mode: "external-required",
        intent: "external_execution",
        confidence: 0.95,
        requiredCapabilities: ["external-backend"],
        requestedResources: [],
        reasonSummary: "Requires shell/code/browser backend unavailable in Mobile Runtime",
      };
    }
  }

  for (const action of DIRECT_ACTIONS) {
    const m = value.match(action.pattern);
    if (m) {
      return {
        mode: "direct-action",
        intent: action.intent,
        confidence: 0.92,
        requiredCapabilities: [action.id],
        requestedResources: [],
        reasonSummary: `Matched direct action schema ${action.id}`,
        actionId: action.id,
        actionArgs: action.args?.(m) || {},
      };
    }
  }

  for (const agent of LOCAL_AGENT_PATTERNS) {
    if (agent.pattern.test(value)) {
      const resources = opts.authorizedResources?.length
        ? opts.authorizedResources
        : agent.resources;
      return {
        mode: "local-agent",
        intent: agent.intent,
        confidence: 0.85,
        requiredCapabilities: agent.capabilities,
        requestedResources: resources,
        reasonSummary: `Multi-step local task: ${agent.intent}`,
      };
    }
  }

  // How-to / emotional / ambiguous → conversation (never auto-agent)
  for (const re of CONVERSATION_HINTS) {
    if (re.test(value)) {
      return {
        mode: "conversation",
        intent: "consult",
        confidence: 0.8,
        requiredCapabilities: [],
        requestedResources: [],
        reasonSummary: "Explanatory or emotional request; stay in conversation",
      };
    }
  }

  return {
    mode: "conversation",
    intent: "default_chat",
    confidence: 0.55,
    requiredCapabilities: [],
    requestedResources: [],
    reasonSummary: "Low confidence — default conversation (do not upgrade to agent)",
  };
}

export const ASSISTANT_EXECUTION_MODES = [
  "conversation",
  "direct-action",
  "local-agent",
  "external-required",
];
