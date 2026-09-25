/**
 * 信物消息解析与校验 — B7 协议（纯函数，无 DOM）。
 * 红包已下线：历史 `[红包|…]` 仅降级为普通文本，不再渲染卡片。
 */

import { t } from "../i18n/index.js";

const TOKEN_KINDS = new Set(["transfer", "collect"]);
const LEGACY_REDPACKET = new Set(["redpacket", "红包"]);
const SIMPLE_KIND_MAP = {
  转账: "transfer",
  transfer: "transfer",
  收款: "collect",
  collect: "collect",
};

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function isValidAmount(amount) {
  const n = roundMoney(amount);
  // 微信式转账：允许较大金额；上限与钱包结算一致
  return Number.isFinite(n) && n > 0 && n <= 999999.99;
}

function buildToken(kind, fields = {}) {
  const amount = roundMoney(Number(fields.amount) || 0);
  return {
    kind,
    amount,
    currency: "nyra_coin",
    note: String(fields.note || fields.message || "").slice(0, 60),
    blessing: "",
    status: String(fields.status || "pending"),
    direction: fields.direction === "out" ? "out" : "in",
    counterpartyId: String(fields.counterpartyId || fields.characterId || "").trim(),
    ledgerId: String(fields.ledgerId || "").trim(),
  };
}

function parseKeyValueSyntax(text) {
  const match = String(text || "").trim().match(/^\[信物:(\w+)([^\]]*)\]$/i);
  if (!match) return null;
  const kind = String(match[1] || "").toLowerCase();
  if (LEGACY_REDPACKET.has(kind)) {
    return { legacyRedpacket: true, raw: String(text || "").trim() };
  }
  if (!TOKEN_KINDS.has(kind)) return null;
  const tail = match[2] || "";
  const fields = {};
  for (const part of tail.match(/(\w+)=([^\s\]]+)/g) || []) {
    const kv = part.match(/^(\w+)=(.+)$/);
    if (!kv) continue;
    fields[kv[1].toLowerCase()] = kv[2];
  }
  return buildToken(kind, {
    amount: fields.amount,
    note: fields.note,
    direction: fields.direction,
    counterpartyId: fields.counterpartyid || fields.characterid,
    status: fields.status,
  });
}

function parsePipeSyntax(text) {
  const match = String(text || "").trim().match(/^\[(红包|转账|收款|redpacket|transfer|collect)\|([^|\]]+)(?:\|([^\]]*))?\]$/i);
  if (!match) return null;
  const label = String(match[1] || "");
  if (LEGACY_REDPACKET.has(label.toLowerCase()) || LEGACY_REDPACKET.has(label)) {
    return { legacyRedpacket: true, raw: String(text || "").trim() };
  }
  const kind = SIMPLE_KIND_MAP[label.toLowerCase()] || SIMPLE_KIND_MAP[label];
  if (!kind) return null;
  return buildToken(kind, {
    amount: match[2],
    note: match[3] || "",
  });
}

function parseStructuredMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return null;
  const mediaType = String(metadata.mediaType || "").trim();
  if (LEGACY_REDPACKET.has(mediaType)) {
    return { legacyRedpacket: true, raw: "" };
  }
  if (!TOKEN_KINDS.has(mediaType)) return null;
  const token = metadata.token && typeof metadata.token === "object"
    ? metadata.token
    : metadata;
  return buildToken(mediaType, {
    amount: token.amount,
    note: token.note,
    direction: token.direction,
    counterpartyId: token.counterpartyId,
    status: token.status,
    ledgerId: token.ledgerId,
  });
}

export function validateTokenPayload(payload = {}) {
  const kind = String(payload.kind || "").trim();
  const amount = roundMoney(Number(payload.amount) || 0);
  const errors = [];

  if (!TOKEN_KINDS.has(kind)) errors.push("kind_invalid");
  if (!isValidAmount(amount)) errors.push("amount_invalid");

  if (errors.length) {
    return {
      ok: false,
      errors,
      display: {
        mediaType: "text",
        content: "〔信物格式有误，已当普通消息显示〕",
      },
    };
  }

  return {
    ok: true,
    token: {
      ...payload,
      kind,
      amount,
      currency: "nyra_coin",
    },
    display: {
      mediaType: kind,
      content: String(payload.note || defaultNoteForKind(kind)).slice(0, 120),
    },
  };
}

function defaultNoteForKind(kind) {
  if (kind === "transfer") return "转账";
  if (kind === "collect") return "向你收款";
  return "信物";
}

export function parseTokenMessage(text, metadata) {
  const raw = String(text || "").trim();
  const fromMeta = parseStructuredMetadata(metadata);
  if (fromMeta?.legacyRedpacket) {
    return {
      ok: false,
      fallbackText: raw || "〔历史红包，已不再支持〕",
      display: { mediaType: "text", content: raw || "〔历史红包，已不再支持〕" },
    };
  }
  if (fromMeta) {
    const validated = validateTokenPayload(fromMeta);
    if (validated.ok) {
      return {
        ok: true,
        mediaType: validated.display.mediaType,
        content: validated.display.content,
        token: validated.token,
      };
    }
    return { ok: false, fallbackText: raw || validated.display.content, display: validated.display };
  }

  const parsed = parseKeyValueSyntax(raw) || parsePipeSyntax(raw);
  if (!parsed) {
    return { ok: false, fallbackText: raw, display: { mediaType: "text", content: raw } };
  }
  if (parsed.legacyRedpacket) {
    return {
      ok: false,
      fallbackText: raw,
      display: { mediaType: "text", content: raw },
    };
  }

  const validated = validateTokenPayload(parsed);
  if (!validated.ok) {
    return { ok: false, fallbackText: raw, errors: validated.errors, display: validated.display };
  }

  return {
    ok: true,
    mediaType: validated.display.mediaType,
    content: validated.display.content,
    token: validated.token,
  };
}

export function parseToken(text) {
  return parseTokenMessage(text);
}

export function validateToken(payload) {
  return validateTokenPayload(payload);
}

export function isTokenMediaType(mediaType) {
  return TOKEN_KINDS.has(String(mediaType || "").trim());
}

export function markTokenSettled(token = {}, settlement = {}) {
  const ledgerId = typeof settlement === "string" ? settlement : (settlement?.ledgerId || "");
  // 转账发出即到账，不再卡在「待对方收款」
  return {
    ...token,
    status: "completed",
    ledgerId: String(ledgerId || token.ledgerId || ""),
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

export function renderTokenCardHtml(token = {}, { messageId = "", canPay = true } = {}) {
  const kind = String(token.kind || "");
  const amount = roundMoney(Number(token.amount) || 0);
  const rawNote = String(token.note || "");
  const protocolDefaultNote = defaultNoteForKind(kind);
  const localizedDefaultNote = kind === "transfer"
    ? t("shared.token.transfer")
    : kind === "collect"
      ? t("shared.token.collectFromYou")
      : t("shared.token.token");
  const note = !rawNote || rawNote === protocolDefaultNote ? localizedDefaultNote : rawNote;
  const status = String(token.status || "pending");
  const settled = status === "opened" || status === "completed" || Boolean(token.ledgerId);
  const msgAttr = messageId ? ` data-token-message-id="${escapeAttr(messageId)}"` : "";
  const amountText = amount.toFixed(2);
  const currency = t("phone.pop.coin");

  if (kind === "redpacket") {
    // Feature removed — never render a card.
    return "";
  }

  if (kind === "transfer") {
    const outgoing = token.direction === "out";
    // awaiting 为旧数据：发出时已扣款，按已到账展示
    const received = status === "completed" || status === "opened" || status === "awaiting" || Boolean(token.ledgerId);
    const statusLabel = received
      ? (outgoing ? t("shared.token.arrived") : t("shared.token.collected"))
      : (outgoing ? t("shared.token.arrived") : t("shared.token.collect"));
    const memo = note && note !== localizedDefaultNote ? note : "";
    const [yuan, fen] = amountText.split(".");
    return `
      <div class="mini-token-card mini-token-card--transfer is-flat ${received ? "is-settled" : ""} ${outgoing ? "is-out" : "is-in"}"${msgAttr} role="group" aria-label="${escapeAttr(t("shared.token.transferAria", { amount: amountText, currency }))}">
        <span class="mini-token-card__badge" aria-hidden="true"><i data-lucide="arrow-left-right"></i></span>
        <div class="mini-token-card__main">
          <div class="mini-token-card__money">
            <span class="mini-token-card__currency">¥</span>
            <strong class="mini-token-card__figure">${escapeHtml(yuan)}<small>.${escapeHtml(fen)}</small></strong>
          </div>
          ${memo ? `<span class="mini-token-card__note">${escapeHtml(memo)}</span>` : ""}
        </div>
        ${!outgoing && !received
          ? `<button type="button" class="mini-token-card__action" data-token-action="confirm"${msgAttr} ${!canPay ? "disabled" : ""} aria-label="${escapeAttr(t("shared.token.collectAria", { amount: amountText, currency }))}">${escapeHtml(t("shared.token.collect"))}</button>`
          : `<span class="mini-token-card__done">${escapeHtml(statusLabel)}</span>`}
      </div>`;
  }

  if (kind === "collect") {
    return `
      <div class="mini-token-card mini-token-card--collect ${settled ? "is-settled" : ""}"${msgAttr} role="group" aria-label="${escapeAttr(t("shared.token.collectAria", { amount: amountText, currency }))}">
        <span class="mini-token-card__tag">${escapeHtml(t("shared.token.collectFromYou"))}</span>
        <strong class="mini-token-card__amount">${escapeHtml(amountText)} ${escapeHtml(currency)}</strong>
        <p class="mini-token-card__note">${escapeHtml(note)}</p>
        ${settled
          ? `<span class="mini-token-card__done">${escapeHtml(t("shared.token.paid"))}</span>`
          : `<button type="button" class="mini-token-card__action" data-token-action="pay"${msgAttr} ${!canPay ? "disabled" : ""} aria-label="${escapeAttr(t("shared.token.confirmPaymentAria", { amount: amountText, currency }))}">${escapeHtml(t("shared.token.confirmPayment"))}</button>`}
      </div>`;
  }

  // F7 fallback：扩展提醒信物（非钱包结算；documented token_card）
  if (kind === "reminder" || kind === "token_card") {
    const title = String(token.title || rawNote || t("shared.token.reminder")).slice(0, 40);
    const subtitle = String(token.subtitle || "").slice(0, 80);
    return `
      <div class="mini-token-card mini-token-card--reminder"${msgAttr} role="group" aria-label="${escapeAttr(t("shared.token.reminderAria", { title }))}">
        <span class="mini-token-card__tag">${escapeHtml(t("shared.token.reminderTag"))}</span>
        <strong class="mini-token-card__amount">${escapeHtml(title)}</strong>
        ${subtitle ? `<p class="mini-token-card__note">${escapeHtml(subtitle)}</p>` : ""}
      </div>`;
  }

  return "";
}

/** F7 扩展信物 / F1 钱包信物 */
export function isRenderableTokenCard(mediaType, token) {
  if (String(mediaType || "") === "redpacket" || String(token?.kind || "") === "redpacket") return false;
  if (isTokenMediaType(mediaType)) return true;
  if (mediaType === "token_card" || mediaType === "reminder") return true;
  return String(token?.kind || "") === "reminder";
}
