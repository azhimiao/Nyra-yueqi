import { createIcons, icons } from "lucide";

// lucide stamps `data-lucide` onto the <svg> it generates, so a bare
// createIcons() re-creates every icon in the document on each call. Screens call
// this after most renders, which on a phone WebView meant hundreds of SVGs were
// torn down and rebuilt per tap. Remember what each node rendered and only
// touch nodes whose glyph actually changed.
const PENDING_ATTR = "data-icon-pending";
const RENDERED_ATTR = "data-icon-rendered";

/**
 * @param {ParentNode} [scope] Limit the scan to a subtree; defaults to the document.
 */
export function refreshIcons(scope) {
  const root = typeof scope?.querySelectorAll === "function" ? scope : document;

  let pending = 0;
  for (const node of root.querySelectorAll("[data-lucide]")) {
    const name = node.getAttribute("data-lucide");
    if (!name || node.getAttribute(RENDERED_ATTR) === name) continue;
    node.setAttribute(PENDING_ATTR, name);
    pending += 1;
  }

  if (pending) {
    createIcons({ icons, nameAttr: PENDING_ATTR, root });
    for (const node of root.querySelectorAll(`[${PENDING_ATTR}]`)) {
      node.setAttribute(RENDERED_ATTR, node.getAttribute(PENDING_ATTR));
      node.removeAttribute(PENDING_ATTR);
    }
  }

  document.body.classList.add("icons-ready");
}
