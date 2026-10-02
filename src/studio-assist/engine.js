/** Yueqi assistant model loop using the first-party yq-pack / yq-tool protocol. */

import { callModel } from "../model/client.js";
import { getLocale } from "../i18n/index.js";
import { buildAssistSystemPrompt } from "./prompts.js";
import { executeAssistTool, expandPackGuide } from "./tools.js";
import { assistT, normalizeAssistLocale } from "./i18n.js";

const MAX_ROUNDS = 6;
const PACK_RE = /<yq-pack\s+name=["']([^"']+)["']\s*\/?\s*>/gi;
const TOOL_RE = /<yq-tool\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/yq-tool>/gi;

function safeParseArgs(raw) {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return { _protocolError: "invalid_json" };
  }
}

function cardId(prefix = "tool") {
  return `assist-${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function compactToolResult(result, locale) {
  const note = {
    ok: Boolean(result.ok),
    summary: String(result.summary || "").slice(0, 800),
  };
  if (result.data != null) {
    try {
      note.data = JSON.parse(JSON.stringify(result.data).slice(0, 5000));
    } catch {
      note.data = assistT("resultOmitted", {}, locale);
    }
  }
  return JSON.stringify(note);
}

/** Parse model output without executing it. */
export function parseAssistActions(content) {
  const text = String(content || "");
  const loads = [];
  const actions = [];
  let match;
  const packRe = new RegExp(PACK_RE.source, "gi");
  while ((match = packRe.exec(text))) loads.push(String(match[1] || "").trim());
  const toolRe = new RegExp(TOOL_RE.source, "gi");
  while ((match = toolRe.exec(text))) {
    actions.push({
      name: String(match[1] || "").trim(),
      args: safeParseArgs(match[2]),
    });
  }
  return {
    loads,
    actions,
    speech: text.replace(PACK_RE, "").replace(TOOL_RE, "").trim(),
  };
}

/** Run one user turn. Writes are returned as pending cards and never auto-confirmed. */
export async function runAssistTurn(opts) {
  const {
    config,
    history = [],
    userText,
    context = "",
    onTool,
  } = opts;
  const locale = normalizeAssistLocale(opts.locale || getLocale());

  if (!config?.baseUrl || !config?.apiKey || !config?.model) {
    return {
      ok: false,
      speech: assistT("noKey", {}, locale),
      cards: [],
    };
  }

  const messages = [
    { role: "system", content: buildAssistSystemPrompt(context, locale) },
    ...history.map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: String(userText || "").trim() },
  ];

  const cards = [];
  let lastSpeech = "";

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const result = await callModel(config, messages, {
      temperature: 0.28,
      stream: false,
      companionId: context.characterId || context.companionId || "",
      businessPurpose: "assistant.conversation",
      capability: "tool_calling",
    });
    const content = String(result?.content || "").trim();
    if (!content) return { ok: false, speech: assistT("emptyModel", {}, locale), cards };

    const parsed = parseAssistActions(content);
    lastSpeech = parsed.speech || lastSpeech;
    if (!parsed.loads.length && !parsed.actions.length) {
      return { ok: true, speech: parsed.speech || content, cards };
    }

    const toolNotes = [];
    for (const packName of parsed.loads) {
      const guide = expandPackGuide(packName, locale);
      const card = {
        id: cardId("pack"),
        type: "pack",
        name: packName,
        ok: guide.ok,
        summary: guide.text.slice(0, 500),
      };
      cards.push(card);
      onTool?.(card);
      toolNotes.push(`${locale === "en" ? "Area" : "领域"} ${packName}: ${guide.text}`);
    }

    let pendingApproval = null;
    for (const action of parsed.actions) {
      if (action.args?._protocolError) {
        const card = {
          id: cardId("error"),
          type: "tool",
          name: action.name,
          ok: false,
          summary: assistT("invalidJson", {}, locale),
        };
        cards.push(card);
        onTool?.(card);
        toolNotes.push(`工具 ${action.name}: ${card.summary}`);
        continue;
      }

      const execution = await executeAssistTool(action.name, action.args || {}, { context, locale });
      const card = {
        id: cardId("tool"),
        type: "tool",
        name: action.name,
        ok: Boolean(execution.ok),
        summary: execution.summary || "",
        risk: execution.risk || "read",
        needConfirm: Boolean(execution.needConfirm),
        pendingAction: execution.pendingAction || null,
      };
      cards.push(card);
      onTool?.(card);
      if (card.needConfirm) {
        pendingApproval = card;
        break;
      }
      toolNotes.push(`${locale === "en" ? "Tool" : "工具"} ${action.name}: ${compactToolResult(execution, locale)}`);
    }

    if (pendingApproval) {
      return {
        ok: true,
        speech: parsed.speech || pendingApproval.summary,
        cards,
        pending: true,
      };
    }

    messages.push({ role: "assistant", content });
    messages.push({
      role: "user",
      content: assistT("gatewayReturn", { notes: toolNotes.join("\n") }, locale),
    });
  }

  return {
    ok: true,
    speech: lastSpeech || assistT("roundLimit", {}, locale),
    cards,
  };
}
