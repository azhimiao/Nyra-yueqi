/**
 * Resolve the chat bubble body text node — never the psychology / menu / footer.
 */

const PSYCH_SEL = "[data-inner-psychology], [data-turn-activity], [data-persisted-turn-activity], .message-turn-activity, .mini-turn-activity";
const OUTSIDE_BUBBLE_SEL = `${PSYCH_SEL}, .message-menu, .message-reactions, .message-reply-preview, .message-recalled-copy`;

export function isPsychologyNode(node) {
  return Boolean(node?.closest?.(PSYCH_SEL));
}

export function resolveMessageBodyParagraph(article) {
  if (!article || typeof article.querySelector !== "function") return null;
  const marked = article.querySelector("[data-message-body]");
  if (marked) return marked;
  const inRow = article.querySelector(".message-row > p, .message-bubble .message-row > p, .message-bubble > p");
  if (inRow && !isPsychologyNode(inRow)) return inRow;
  for (const child of article.children || []) {
    if (child.matches?.("p") && !isPsychologyNode(child)) return child;
    if (child.classList?.contains("message-row") || child.classList?.contains("message-bubble")) {
      const nested = child.querySelector("p");
      if (nested && !isPsychologyNode(nested)) return nested;
    }
  }
  return null;
}

export function setMessageBodyText(article, text) {
  ensureMessageBubbleShell(article);
  const node = resolveMessageBodyParagraph(article);
  if (!node) return null;
  node.textContent = String(text ?? "");
  return node;
}

export function ensureMessageBodyMarked(article) {
  const node = resolveMessageBodyParagraph(article);
  if (node) node.dataset.messageBody = "true";
  return node;
}

/**
 * Psychology stays outside; spoken text lives in one `.message-bubble` shell
 * so the outer article is never a second card.
 *
 * @param {HTMLElement} article
 * @param {{ psychology?: boolean }} [options] — only psychology turns get has-turn-activity
 */
export function ensureMessageBubbleShell(article, options = {}) {
  if (!article || typeof document === "undefined") return null;
  let shell = article.querySelector(":scope > .message-bubble");
  if (shell) {
    article.classList.add("has-message-bubble");
    if (options.psychology) article.classList.add("has-turn-activity");
    return shell;
  }

  const move = [];
  for (const child of [...article.children]) {
    if (child.matches?.(OUTSIDE_BUBBLE_SEL)) continue;
    move.push(child);
  }

  shell = document.createElement("div");
  shell.className = "message-bubble";
  if (move.length) {
    move.forEach((node) => shell.append(node));
  } else {
    const p = document.createElement("p");
    p.dataset.messageBody = "true";
    p.textContent = "";
    shell.append(p);
  }

  const menu = article.querySelector(":scope > .message-menu");
  const psych = article.querySelector(
    ":scope > [data-inner-psychology], :scope > [data-turn-activity], :scope > [data-persisted-turn-activity], :scope > .message-turn-activity, :scope > .mini-turn-activity",
  );
  if (menu) article.insertBefore(shell, menu);
  else if (psych?.nextSibling) article.insertBefore(shell, psych.nextSibling);
  else article.append(shell);

  article.classList.add("has-message-bubble");
  if (options.psychology || article.querySelector(PSYCH_SEL)) {
    article.classList.add("has-turn-activity");
  }
  ensureMessageBodyMarked(article);
  return shell;
}
