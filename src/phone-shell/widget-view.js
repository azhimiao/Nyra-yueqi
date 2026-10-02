/**
 * Paint an imported widget into a closed shadow root so its CSS
 * cannot restyle the rest of the phone.
 */

const BASE_CSS = `
:host { display: block; box-sizing: border-box; padding: 12px 14px; color: inherit; font: inherit; }
* { box-sizing: border-box; }
img { max-width: 100%; height: auto; }
p { margin: 0; }
`;

function widgetRev(widget) {
  const src = `${widget.title}\0${widget.span}\0${widget.html}\0${widget.css}`;
  let hash = 0;
  for (let index = 0; index < src.length; index += 1) hash = (hash * 31 + src.charCodeAt(index)) >>> 0;
  return String(hash);
}

export function paintCustomWidget(node, widget) {
  if (!node || !widget) return;
  const rev = widgetRev(widget);
  if (node.dataset.widgetRev === rev && node.shadowRoot) return;
  node.dataset.widgetRev = rev;
  node.dataset.widgetSpan = widget.span === "half" ? "half" : "wide";
  node.setAttribute("aria-label", widget.title || "组件");
  const shadow = node.shadowRoot || node.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  const style = document.createElement("style");
  style.textContent = `${BASE_CSS}\n${widget.css || ""}`;
  const body = document.createElement("div");
  body.className = "nyra-widget-body";
  body.innerHTML = widget.html || "";
  shadow.append(style, body);
}
