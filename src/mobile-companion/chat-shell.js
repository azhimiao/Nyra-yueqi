function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char]));
}

function messageMarkup(message = {}) {
  const mine = message.role === "user";
  const body = escapeHtml(message.content || "").replace(/\n/g, "<br>");
  return `<article class="mobile-companion-message ${mine ? "is-mine" : "is-ai"}"><p>${body}</p></article>`;
}

/**
 * The deliberately small Android-first companion surface.
 * It owns only the active conversation; the complete phone OS stays lazy.
 */
export function mountMobileCompanion({ root, getMessages, sendMessage, getCharacter } = {}) {
  if (!root) throw new TypeError("mountMobileCompanion requires root");
  let visible = false;
  let busy = false;

  root.innerHTML = `
    <section class="mobile-companion" aria-label="伴侣聊天">
      <header class="mobile-companion__bar">
        <span class="mobile-companion__avatar" aria-hidden="true"></span>
        <div><strong data-mobile-name>月栖</strong><span>在线</span></div>
      </header>
      <main class="mobile-companion__thread" data-mobile-thread aria-live="polite"></main>
      <form class="mobile-companion__composer" data-mobile-form>
        <input type="text" maxlength="1200" autocomplete="off" enterkeyhint="send" placeholder="输入消息" aria-label="消息" data-mobile-input />
        <button type="submit" aria-label="发送" data-mobile-send>↑</button>
      </form>
    </section>`;

  const name = root.querySelector("[data-mobile-name]");
  const avatar = root.querySelector(".mobile-companion__avatar");
  const thread = root.querySelector("[data-mobile-thread]");
  const form = root.querySelector("[data-mobile-form]");
  const input = root.querySelector("[data-mobile-input]");
  const send = root.querySelector("[data-mobile-send]");

  function paintCharacter() {
    const character = getCharacter?.() || {};
    const label = String(character.name || character.alias || "月栖").trim();
    if (name) name.textContent = label;
    if (avatar) avatar.textContent = label.slice(0, 1) || "月";
  }

  async function refresh() {
    paintCharacter();
    const messages = await Promise.resolve(getMessages?.() || []);
    if (!thread) return;
    thread.innerHTML = messages.length
      ? messages.map(messageMarkup).join("")
      : '<p class="mobile-companion__empty">我在。现在想和我说什么？</p>';
    thread.scrollTop = thread.scrollHeight;
  }

  async function submit(event) {
    event.preventDefault();
    const text = String(input?.value || "").trim();
    if (!text || busy) return;
    busy = true;
    if (send) send.disabled = true;
    try {
      await sendMessage?.(text);
      if (input) input.value = "";
      await refresh();
    } finally {
      busy = false;
      if (send) send.disabled = false;
      input?.focus();
    }
  }

  form?.addEventListener("submit", submit);
  return {
    setVisible(next) {
      visible = Boolean(next);
      root.hidden = !visible;
      if (visible) void refresh();
    },
    refresh,
    isVisible: () => visible,
    destroy() {
      form?.removeEventListener("submit", submit);
      root.replaceChildren();
    },
  };
}