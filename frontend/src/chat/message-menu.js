/**
 * The persistent three-dot menu under every chat bubble.
 *
 * App and Pop render their threads differently (DOM nodes vs HTML strings),
 * so only the markup and copy are shared — each shell binds its own handler.
 */

const LABELS = {
  "zh-CN": {
    trigger: "更多操作",
    edit: "编辑",
    reply: "回复",
    regenerate: "重新生成",
    react: "回应",
    delete: "删除",
    editTitle: "编辑消息",
    deleteTitle: "删除消息",
    deleteConfirm: "删除后这条消息不会再出现在聊天里；由它生成的记忆和摘要也会停止使用。",
    save: "保存",
    cancel: "取消",
    editFailed: "编辑未保存，请重试",
    deleteFailed: "删除未保存，请重试",
    reactFailed: "回应未保存，请重试",
  },
  en: {
    trigger: "More actions",
    edit: "Edit",
    reply: "Reply",
    regenerate: "Regenerate",
    react: "React",
    delete: "Delete",
    editTitle: "Edit message",
    deleteTitle: "Delete message",
    deleteConfirm: "This message and any memory or summary derived from it will no longer be used.",
    save: "Save",
    cancel: "Cancel",
    editFailed: "Edit was not saved. Try again.",
    deleteFailed: "Delete was not saved. Try again.",
    reactFailed: "Reaction was not saved. Try again.",
  },
};

const ICONS = {
  edit: "pencil",
  reply: "reply",
  regenerate: "refresh-cw",
  react: "smile-plus",
  delete: "trash-2",
};

export function messageMenuCopy(locale) {
  return String(locale || "").toLowerCase().startsWith("en") ? LABELS.en : LABELS["zh-CN"];
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string[]} actions
 * @param {{ locale?: string }} [options]
 */
export function renderMessageMenuHtml(actions = [], options = {}) {
  const items = actions.filter((action) => ICONS[action]);
  if (!items.length) return "";
  const copy = messageMenuCopy(options.locale);
  const entries = items.map((action) => `
        <button type="button" role="menuitem" data-message-action="${action}">
          <i data-lucide="${ICONS[action]}" aria-hidden="true"></i><span>${escapeAttribute(copy[action])}</span>
        </button>`).join("");
  return `<div class="message-menu" data-message-menu>
      <button type="button" class="message-menu__trigger" data-message-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="${escapeAttribute(copy.trigger)}" title="${escapeAttribute(copy.trigger)}">
        <i data-lucide="more-horizontal" aria-hidden="true"></i>
      </button>
      <div class="message-menu__list" data-message-menu-list role="menu" hidden>${entries}
      </div>
    </div>`;
}

/** Close every open menu except an optional survivor. */
export function closeMessageMenus(root = document, keep = null) {
  root.querySelectorAll?.("[data-message-menu]").forEach((menu) => {
    if (menu === keep) return;
    menu.querySelector("[data-message-menu-list]")?.setAttribute("hidden", "");
    menu.querySelector("[data-message-menu-trigger]")?.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open", "is-up");
    releaseMenuRoom();
  });
}

function nearestScroller(node) {
  let current = node?.parentElement;
  while (current && current !== document.body) {
    const overflowY = getComputedStyle(current).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

/** Breathing room between the popover and the bottom of the transcript. */
const MENU_EDGE_GAP = 8;

/**
 * Scroll room borrowed while a popover is open, as a real element: a bottom
 * margin on the last message is not reliably part of a scroller's scrollable
 * overflow, so growing one leaves the popover short of fitting.
 */
let menuRoomSpacer = null;

function releaseMenuRoom() {
  menuRoomSpacer?.remove();
  menuRoomSpacer = null;
}

function reserveMenuRoom(scroller, height) {
  releaseMenuRoom();
  const spacer = scroller.ownerDocument.createElement("div");
  spacer.dataset.messageMenuRoom = "";
  spacer.setAttribute("aria-hidden", "true");
  spacer.style.cssText = `height:${height}px;flex:0 0 auto;pointer-events:none;`;
  scroller.append(spacer);
  menuRoomSpacer = spacer;
}

/**
 * Where the popover's bottom edge lands, read from layout rather than from its
 * painted box: the open transition scales it, and a rect measured mid-animation
 * reports it shorter than it will be.
 * @param {HTMLElement} menu
 * @param {HTMLElement} list
 */
function menuBottom(menu, list) {
  return menu.getBoundingClientRect().top + list.offsetTop + list.offsetHeight;
}

/**
 * Keep the popover below its bubble. Flipping it above instead lays an opaque
 * card over the very message being acted on, which is what made the menu look
 * broken; the transcript is scrolled to open that space, and when the bubble is
 * the newest one — nothing beneath it to scroll into — room is borrowed first.
 * @param {HTMLElement} menu
 * @param {HTMLElement} list
 */
function placeMessageMenu(menu, list) {
  menu.classList.remove("is-up");
  releaseMenuRoom();
  const scroller = nearestScroller(menu);
  const limit = scroller ? scroller.getBoundingClientRect().bottom : (window.innerHeight || 0);
  const overflow = menuBottom(menu, list) - limit + MENU_EDGE_GAP;
  if (overflow <= 0) return;

  if (scroller) {
    const room = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    if (room < overflow) {
      // An absolutely positioned popover already stretches the scrollable
      // region it overhangs, so lengthening the transcript by the shortfall
      // alone buys nothing: the union of the two is unchanged. The spacer has
      // to reach past the popover's own bottom edge before the scroller gains
      // anywhere to travel.
      reserveMenuRoom(scroller, list.offsetTop + list.offsetHeight + MENU_EDGE_GAP);
    }
    scroller.scrollTop += overflow;
    if (menuBottom(menu, list) <= limit + 1) return;
    releaseMenuRoom();
  }
  // Nowhere left to put it, so overlap and stay on screen.
  menu.classList.add("is-up");
}

/**
 * Toggle the menu owned by a trigger. Returns true when it ends up open.
 * @param {HTMLElement} trigger
 * @param {Document|HTMLElement} root
 */
export function toggleMessageMenu(trigger, root = document) {
  const menu = trigger.closest("[data-message-menu]");
  const list = menu?.querySelector("[data-message-menu-list]");
  if (!menu || !list) return false;
  const willOpen = list.hasAttribute("hidden");
  closeMessageMenus(root, willOpen ? menu : null);
  if (willOpen) {
    list.removeAttribute("hidden");
    trigger.setAttribute("aria-expanded", "true");
    menu.classList.add("is-open");
    placeMessageMenu(menu, list);
  } else {
    list.setAttribute("hidden", "");
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open", "is-up");
    releaseMenuRoom();
  }
  return willOpen;
}
