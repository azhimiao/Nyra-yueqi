/**
 * Agent Composer — NL describe → draft Agent Profile (offline heuristics + optional model).
 * Does NOT execute imported JS.
 */

import { validateAgentProfile } from "../profile-schema.js";
import { DEFAULT_SCOPES } from "../../skill-platform/schema.js";

/** Offline templates (plan §P4). */
export const AGENT_COMPOSER_TEMPLATES = Object.freeze({
  gm: {
    id: "user-gm-host",
    name: "跑团主持人",
    tagline: "主持 TRPG / 跑团，守规则、控节奏、帮玩家推进剧情。",
    icon: "dice-5",
    kind: "user_created",
    skillIds: [],
    defaultRunMode: "isolated_new",
    defaultScopes: { ...DEFAULT_SCOPES },
    triggers: ["跑团", "dnd", "trpg", "桌游", "主持人", "dungeon", "game master"],
  },
  editor: {
    id: "user-novel-editor",
    name: "小说总编",
    tagline: "帮你看结构、改节奏、提修改建议，不代写全文。",
    icon: "book-open-text",
    kind: "user_created",
    skillIds: [],
    defaultRunMode: "isolated_new",
    defaultScopes: { ...DEFAULT_SCOPES },
    triggers: ["小说", "写作", "总编", "改稿", "章节", "novel", "editor"],
  },
  life: {
    id: "user-life-organizer",
    name: "生活整理",
    tagline: "整理待办、日程与生活节奏，提议任务需你确认。",
    icon: "list-checks",
    kind: "user_created",
    skillIds: [],
    defaultRunMode: "isolated_new",
    defaultScopes: { ...DEFAULT_SCOPES, memoryWrite: "propose_personal" },
    triggers: ["生活", "整理", "待办", "日程", "习惯", "todo", "organize"],
  },
});

/**
 * Match user text to a template id.
 * @param {string} text
 */
export function matchComposerTemplate(text) {
  const lower = String(text || "").trim().toLowerCase();
  if (!lower) return null;
  for (const [key, tpl] of Object.entries(AGENT_COMPOSER_TEMPLATES)) {
    if (tpl.triggers.some((t) => lower.includes(String(t).toLowerCase()))) {
      return key;
    }
  }
  return null;
}

/**
 * Build capability card fields for draft preview.
 * @param {object} profile
 */
export function agentDraftCapabilityCard(profile) {
  return {
    name: profile.name,
    tagline: profile.tagline,
    willRead: ["你描述的目标与对话上下文（按启动授权）"],
    mayPropose: profile.defaultScopes?.memoryWrite !== "off"
      ? ["整理类任务提议（需任务中心确认）"]
      : ["不主动提议任务，除非你附加能力包"],
    wont: ["不会执行任意代码", "不会自动写入长期记忆", "不会替代恋人 Pop 身份"],
  };
}

/**
 * Compose draft Agent Profile from natural language (offline-first).
 * @param {string} description
 * @param {{ modelFn?: (prompt: string) => Promise<object|null> }} [opts]
 */
export async function composeAgentDraft(description, opts = {}) {
  const text = String(description || "").trim();
  if (!text) {
    return { ok: false, reason: "empty_description" };
  }

  const templateKey = matchComposerTemplate(text);
  if (templateKey) {
    const tpl = AGENT_COMPOSER_TEMPLATES[templateKey];
    const validated = validateAgentProfile({
      ...tpl,
      tagline: tpl.tagline,
    });
    if (!validated.ok) return validated;
    return {
      ok: true,
      source: "template",
      templateKey,
      value: validated.value,
      card: agentDraftCapabilityCard(validated.value),
    };
  }

  if (typeof opts.modelFn === "function") {
    try {
      const enriched = await opts.modelFn(text);
      if (enriched?.name) {
        const validated = validateAgentProfile({
          id: enriched.id || `user-${Date.now().toString(36)}`,
          name: enriched.name,
          tagline: enriched.tagline || enriched.purpose || text.slice(0, 120),
          icon: enriched.icon || "bot",
          kind: "user_created",
          skillIds: [],
          defaultRunMode: "isolated_new",
          defaultScopes: { ...DEFAULT_SCOPES, ...(enriched.defaultScopes || {}) },
        });
        if (validated.ok) {
          return {
            ok: true,
            source: "model",
            value: validated.value,
            card: agentDraftCapabilityCard(validated.value),
          };
        }
      }
    } catch {
      /* fall through to generic draft */
    }
  }

  const slug = text.slice(0, 12).replace(/\s+/g, "-").toLowerCase() || "custom";
  const validated = validateAgentProfile({
    id: `user-${slug}-${Date.now().toString(36).slice(-4)}`,
    name: text.length <= 24 ? text : `${text.slice(0, 20)}…`,
    tagline: `按你的描述工作：${text.slice(0, 100)}`,
    icon: "bot",
    kind: "user_created",
    skillIds: [],
    defaultRunMode: "isolated_new",
    defaultScopes: { ...DEFAULT_SCOPES },
  });
  if (!validated.ok) return validated;
  return {
    ok: true,
    source: "generic",
    value: validated.value,
    card: agentDraftCapabilityCard(validated.value),
  };
}

/**
 * Render draft preview HTML for composer UI.
 * @param {object} card
 */
export function renderAgentDraftCardHtml(card) {
  const lines = (items) => (items || []).map((i) => `<li>${escapeHtmlLite(i)}</li>`).join("");
  return `
    <article class="explore-cap-card">
      <h3>${escapeHtmlLite(card.name)}</h3>
      <p>${escapeHtmlLite(card.tagline || "")}</p>
      <strong>将会读取</strong>
      <ul>${lines(card.willRead)}</ul>
      <strong>可能提议</strong>
      <ul>${lines(card.mayPropose)}</ul>
      <strong>不会</strong>
      <ul>${lines(card.wont)}</ul>
    </article>
  `;
}

function escapeHtmlLite(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
