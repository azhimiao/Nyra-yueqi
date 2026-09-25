/**
 * P6 — 栖机助手受控路由（plan §8.3）。
 * Does NOT hijack ordinary companion chat; only explicit NL/action patterns.
 */

import { BUILTIN_QIJI_ASSISTANT } from "./profile-schema.js";
import {
  attachSkillToProfile,
  getAgentProfile,
  listAgentProfiles,
} from "./profile-store.js";
import { selectAgent } from "./selection.js";
import { findTriggerMatches } from "../skill-platform/router.js";
import {
  getCatalogEntry,
  getInstallation,
  listInstallations,
} from "../skill-platform/store.js";
import { DEFAULT_SCOPES } from "../skill-platform/schema.js";

/** @typedef {"switch_agent"|"recommend_skills"|"open_explore_import"|"create_agent"|"attach_skill"} AssistRouteId */

const SWITCH_PATTERNS = [
  /切换(?:到|成)?\s*(.+)/i,
  /切到\s*(.+)/i,
  /选择\s*(?:一个\s*)?(?:agent|专家|助手)\s*(.+)?/i,
  /switch\s+(?:to\s+)?(.+)/i,
  /open\s+agent\s+picker/i,
  /打开\s*agent\s*选择/i,
  /选择\s*agent/i,
];

const RECOMMEND_PATTERNS = [
  /推荐(?:一下)?(?:已安装)?(?:的)?(?:能力|skill|技能)/i,
  /有什么(?:已安装)?(?:能力|skill)/i,
  /用\s*(.+?)\s*帮(?:我|助)/i,
  /recommend\s+(?:installed\s+)?skills?/i,
];

const IMPORT_PATTERNS = [
  /导入(?:一个)?(?:agent|技能|能力)/i,
  /打开探索(?:.*)?导入/i,
  /探索.*导入/i,
  /添加(?:一个)?(?:agent|能力包|skill)/i,
  /import\s+(?:a\s+)?(?:skill|agent)/i,
  /open\s+explore\s+import/i,
];

const CREATE_PATTERNS = [
  /创建(?:一个|我的)?(?:agent|助手|主持人|总编|跑团)/i,
  /做(?:一个|个)?(?:跑团|主持人|总编|agent)/i,
  /给我(?:做|创建|生成)(?:一个|个)?(.+)/i,
  /create\s+(?:my\s+)?(?:agent|gm|host)/i,
];

const ATTACH_PATTERNS = [
  /给栖机助手(?:加上|添加|组合)(?:一个)?(.+)/i,
  /给\s*栖机\s*加上(.+)/i,
  /组合(?:一下)?(?:技能|能力)(?:[:：]?\s*(.+))?/i,
  /attach\s+(?:skill\s+)?(.+)?\s*(?:to\s+qiji)?/i,
  /加上(?:生活整理|关系探索|能力)(?:能力|技能)?/i,
];

function normalizeText(text) {
  return String(text || "").trim();
}

function matchesAny(text, patterns) {
  return patterns.some((re) => re.test(text));
}

function findAgentByNameHint(hint) {
  const q = normalizeText(hint).toLowerCase();
  if (!q) return null;
  const agents = listAgentProfiles();
  return (
    agents.find((a) => a.name.toLowerCase() === q)
    || agents.find((a) => a.name.toLowerCase().includes(q))
    || agents.find((a) => a.id.toLowerCase().includes(q.replace(/\s+/g, "-")))
    || null
  );
}

function findSkillByNameHint(hint) {
  const q = normalizeText(hint).toLowerCase();
  if (!q) return null;
  const installations = listInstallations();
  for (const skillId of Object.keys(installations)) {
    const catalog = getCatalogEntry(skillId);
    const name = String(catalog?.name || skillId).toLowerCase();
    if (name === q || name.includes(q) || skillId.toLowerCase().includes(q.replace(/\s+/g, "-"))) {
      return { skillId, catalog, installation: installations[skillId] };
    }
  }
  return null;
}

/**
 * Build attach-skill capability summary for user confirmation.
 * @param {string} skillId
 * @param {string} [profileId]
 */
export function buildAttachSkillSummary(skillId, profileId = BUILTIN_QIJI_ASSISTANT.id) {
  const sid = String(skillId || "").trim();
  const catalog = getCatalogEntry(sid);
  const installation = getInstallation(sid);
  const profile = getAgentProfile(profileId);
  if (!catalog || !installation) {
    return { ok: false, reason: "skill_not_installed" };
  }
  if (installation.enabled === false) {
    return { ok: false, reason: "skill_disabled" };
  }
  if ((profile?.skillIds || []).includes(sid)) {
    return { ok: false, reason: "already_attached" };
  }

  const scopes = profile?.defaultScopes || { ...DEFAULT_SCOPES };
  const caps = installation.grants?.capabilities || catalog.requestedCapabilities || [];

  return {
    ok: true,
    skillId: sid,
    profileId,
    summary: {
      agentName: profile?.name || BUILTIN_QIJI_ASSISTANT.name,
      skillName: catalog.name || sid,
      version: installation.version || catalog.version,
      scopes,
      capabilities: caps,
      willRead: [
        "你主动发起的对话与上下文（按启动授权）",
        catalog.description ? String(catalog.description).slice(0, 120) : "该能力包的方法与资源",
      ],
      mayPropose: caps.length
        ? [`已授权任务：${caps.join("、")}（需任务中心确认）`]
        : ["不主动提议任务，除非你附加工具授权"],
      wont: ["不会自动写入长期记忆", "不会替代恋人 Pop 身份", "不会执行任意代码"],
    },
  };
}

/**
 * Match user text to a controlled assist route (no model required).
 * @param {string} userText
 * @param {{ locale?: string }} [opts]
 * @returns {{ matched: false } | { matched: true, route: AssistRouteId, payload: object }}
 */
export function matchAssistRoute(userText, opts = {}) {
  const text = normalizeText(userText);
  if (!text) return { matched: false };

  if (matchesAny(text, SWITCH_PATTERNS)) {
    let agentHint = "";
    for (const re of SWITCH_PATTERNS) {
      const m = text.match(re);
      if (m?.[1]) {
        agentHint = normalizeText(m[1]);
        break;
      }
    }
    const agent = findAgentByNameHint(agentHint);
    return {
      matched: true,
      route: "switch_agent",
      payload: { agentHint, agentId: agent?.id, agentName: agent?.name },
    };
  }

  if (matchesAny(text, RECOMMEND_PATTERNS)) {
    let query = text;
    const useMatch = text.match(/用\s*(.+?)\s*帮/i);
    if (useMatch?.[1]) query = useMatch[1];
    const suggestions = findTriggerMatches(query);
    const installed = Object.entries(listInstallations())
      .filter(([, inst]) => inst.enabled !== false)
      .slice(0, 3)
      .map(([skillId]) => {
        const catalog = getCatalogEntry(skillId);
        return { skillId, name: catalog?.name || skillId };
      });
    return {
      matched: true,
      route: "recommend_skills",
      payload: {
        suggestions: suggestions.length ? suggestions : installed,
        query,
      },
    };
  }

  if (matchesAny(text, IMPORT_PATTERNS)) {
    return { matched: true, route: "open_explore_import", payload: {} };
  }

  if (matchesAny(text, CREATE_PATTERNS)) {
    let seed = text;
    const m = text.match(/给我(?:做|创建|生成)(?:一个|个)?(.+)/i);
    if (m?.[1]) seed = normalizeText(m[1]);
    return { matched: true, route: "create_agent", payload: { seed } };
  }

  if (matchesAny(text, ATTACH_PATTERNS)) {
    let hint = "";
    for (const re of ATTACH_PATTERNS) {
      const m = text.match(re);
      if (m?.[1]) {
        hint = normalizeText(m[1]);
        break;
      }
    }
    if (!hint && /生活整理/i.test(text)) hint = "生活整理";
    if (!hint && /关系探索/i.test(text)) hint = "关系探索";
    const skill = findSkillByNameHint(hint);
    return {
      matched: true,
      route: "attach_skill",
      payload: { hint, skillId: skill?.skillId, skillName: skill?.catalog?.name },
    };
  }

  return { matched: false };
}

/**
 * Execute a matched assist route (local actions only).
 * @param {{ route: AssistRouteId, payload: object }} match
 * @param {{ locale?: string, confirmed?: boolean }} [opts]
 */
export function executeAssistRoute(match, opts = {}) {
  const locale = opts.locale === "en" ? "en" : "zh-CN";
  const route = match?.route;
  const payload = match?.payload || {};

  if (route === "switch_agent") {
    if (payload.agentId) {
      const result = selectAgent(payload.agentId);
      if (result.ok) {
        return {
          ok: true,
          speech: locale === "en"
            ? `Switched to ${result.value.name}. Skill runs for other agents are unchanged.`
            : `已切换到「${result.value.name}」。其他 Agent 的运行状态不会丢失。`,
          routeAction: { type: "agent_selected", agentId: payload.agentId },
          cards: [],
        };
      }
    }
    return {
      ok: true,
      speech: locale === "en"
        ? "Opening agent picker — choose who should handle this conversation."
        : "正在打开 Agent 选择器，请点选要切换的专家。",
      routeAction: { type: "open_agent_picker" },
      cards: [],
    };
  }

  if (route === "recommend_skills") {
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    if (!suggestions.length) {
      return {
        ok: true,
        speech: locale === "en"
          ? "No installed skills yet. Say “open explore import” to add one from a folder or zip."
          : "还没有已安装的能力包。你可以说「打开探索导入」从文件夹或 zip 添加。",
        chips: [],
        cards: [],
      };
    }
    const names = suggestions.map((s) => s.name || s.skillId).join("、");
    return {
      ok: true,
      speech: locale === "en"
        ? `Installed capabilities you can start: ${names}. Tap a chip to confirm — ordinary chat stays unchanged until you start a run.`
        : `已安装且可启动的能力：${names}。点选下方推荐芯片确认后才会启动 Skill Run；在此之前普通聊天路径不变。`,
      chips: suggestions.map((s) => ({
        label: s.name || s.skillId,
        skillId: s.skillId,
        action: "confirm_skill_start",
      })),
      cards: [],
    };
  }

  if (route === "open_explore_import") {
    return {
      ok: true,
      speech: locale === "en"
        ? "Opening Explore → Create & Import. Pick a zip or folder — nothing is installed until you confirm."
        : "正在打开「探索 → 创建与导入」。选择 zip 或文件夹后还需你确认才会安装，不会假装已经拥有该能力。",
      routeAction: { type: "open_explore", tab: "import" },
      cards: [],
    };
  }

  if (route === "create_agent") {
    const seed = String(payload.seed || "").trim();
    return {
      ok: true,
      speech: locale === "en"
        ? "Opening Agent Composer in Explore. Describe your goal, edit the draft, then save — no manifest editor exposed."
        : "正在打开探索页的 Agent 创建器。用自然语言描述目标、编辑草稿后保存即可，不会暴露 Manifest 或代码编辑器。",
      routeAction: { type: "open_explore", tab: "import", composeSeed: seed },
      cards: [],
    };
  }

  if (route === "attach_skill") {
    const skillId = String(payload.skillId || "").trim();
    if (!skillId) {
      return {
        ok: false,
        speech: locale === "en"
          ? "Which installed skill should attach to 栖机助手? Name it, or open Explore to import one first."
          : "请说明要把哪个已安装能力加到栖机助手；若尚未安装，请先说「打开探索导入」。",
        cards: [],
      };
    }

    const preview = buildAttachSkillSummary(skillId);
    if (!preview.ok) {
      const reasons = {
        skill_not_installed: locale === "en" ? "That skill is not installed." : "该能力尚未安装。",
        skill_disabled: locale === "en" ? "That skill is disabled — enable it in Explore first." : "该能力已停用，请先在探索页启用。",
        already_attached: locale === "en" ? "栖机助手 already has this skill." : "栖机助手已装载该能力。",
      };
      return {
        ok: false,
        speech: reasons[preview.reason] || preview.reason,
        cards: [],
      };
    }

    const s = preview.summary;
    const summaryText = [
      `「${s.skillName}」→ ${s.agentName}`,
      `读取：${s.willRead.join("；")}`,
      `可能提议：${s.mayPropose.join("；")}`,
      `不会：${s.wont.join("；")}`,
    ].join("\n");

    if (!opts.confirmed) {
      return {
        ok: true,
        speech: locale === "en"
          ? `Review what attaching ${s.skillName} adds, then confirm.`
          : `请确认将「${s.skillName}」加到栖机助手的影响范围：`,
        pending: true,
        cards: [{
          id: `assist-attach-${skillId}-${Date.now()}`,
          type: "tool",
          name: "agent.attach_skill",
          ok: false,
          summary: summaryText,
          risk: "write",
          needConfirm: true,
          pendingAction: { name: "agent.attach_skill", args: { skillId, profileId: preview.profileId } },
        }],
      };
    }

    const attached = attachSkillToProfile(preview.profileId, skillId);
    return {
      ok: attached.ok,
      speech: attached.ok
        ? (locale === "en"
          ? `Attached ${s.skillName} to 栖机助手. Ordinary chat is unchanged until you start a skill run.`
          : `已将「${s.skillName}」加到栖机助手。普通陪伴聊天路径不变，需你确认启动后才会走 Skill Run。`)
        : (locale === "en" ? `Could not attach: ${attached.reason}` : `未能添加：${attached.reason}`),
      cards: [],
      routeAction: attached.ok ? { type: "skill_attached", skillId, profileId: preview.profileId } : undefined,
    };
  }

  return { ok: false, speech: "", cards: [] };
}

/**
 * Try controlled route before model loop.
 * @param {string} userText
 * @param {{ locale?: string }} [opts]
 */
export function tryAssistRoute(userText, opts = {}) {
  const match = matchAssistRoute(userText, opts);
  if (!match.matched) return null;
  return executeAssistRoute(match, opts);
}

/**
 * Dispatch browser-side route actions (explore navigate, agent picker).
 * @param {object} routeAction
 */
export function dispatchAssistRouteAction(routeAction) {
  if (!routeAction?.type) return;
  try {
    if (routeAction.type === "open_agent_picker") {
      window.dispatchEvent(new CustomEvent("yueqi.agent.open-picker"));
    } else if (routeAction.type === "open_explore") {
      window.dispatchEvent(new CustomEvent("yueqi.explore.navigate", {
        detail: {
          tab: routeAction.tab || "import",
          composeSeed: routeAction.composeSeed || "",
        },
      }));
    } else if (routeAction.type === "agent_selected" || routeAction.type === "skill_attached") {
      window.dispatchEvent(new CustomEvent("yueqi.assist.route", { detail: routeAction }));
    }
  } catch {
    /* tests / SSR */
  }
}
