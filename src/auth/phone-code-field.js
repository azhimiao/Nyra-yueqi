import { getLocale } from "../i18n/index.js";

const LABELS = Object.freeze({
  "zh-CN": Object.freeze({
    "+86": "中国大陆",
    "+1": "美国/加拿大",
    "+44": "英国",
    "+81": "日本",
    "+82": "韩国",
    "+65": "新加坡",
    "+61": "澳大利亚",
  }),
  en: Object.freeze({
    "+86": "China mainland",
    "+1": "US / Canada",
    "+44": "United Kingdom",
    "+81": "Japan",
    "+82": "Korea",
    "+65": "Singapore",
    "+61": "Australia",
  }),
});

let documentBound = false;

function countryLabel(code) {
  const table = getLocale() === "en" ? LABELS.en : LABELS["zh-CN"];
  return table[code] || "";
}

function menuOf(wrap) {
  return wrap.querySelector(".auth-phone-code-menu");
}

function triggerOf(wrap) {
  return wrap.querySelector(".auth-phone-code");
}

function closeMenu(wrap) {
  const menu = menuOf(wrap);
  const trigger = triggerOf(wrap);
  if (menu) menu.hidden = true;
  trigger?.setAttribute("aria-expanded", "false");
  wrap.classList.remove("is-open");
}

function openMenu(wrap) {
  document.querySelectorAll(".auth-phone-input.is-open, .mini-auth-phone.is-open").forEach((other) => {
    if (other !== wrap) closeMenu(other);
  });
  const menu = menuOf(wrap);
  const trigger = triggerOf(wrap);
  if (menu) menu.hidden = false;
  trigger?.setAttribute("aria-expanded", "true");
  wrap.classList.add("is-open");
}

function bindDocumentOnce() {
  if (documentBound || typeof document === "undefined") return;
  documentBound = true;
  document.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    document.querySelectorAll(".auth-phone-input.is-open, .mini-auth-phone.is-open").forEach((wrap) => {
      if (!target || !wrap.contains(target)) closeMenu(wrap);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".auth-phone-input.is-open, .mini-auth-phone.is-open").forEach(closeMenu);
  });
}

function syncWrap(wrap) {
  const select = wrap.querySelector("select");
  const valueNode = wrap.querySelector(".auth-phone-code__value");
  if (!select || !valueNode) return;
  valueNode.textContent = select.value || "+86";
  wrap.querySelectorAll("[data-phone-code]").forEach((item) => {
    const selected = item.dataset.phoneCode === select.value;
    item.setAttribute("aria-selected", selected ? "true" : "false");
    item.classList.toggle("is-selected", selected);
  });
}

function enhanceOne(wrap) {
  const select = wrap.querySelector("select");
  if (!select || select.dataset.phoneCodeEnhanced === "1") return;
  select.dataset.phoneCodeEnhanced = "1";
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "auth-phone-code";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "国家或地区代码");
  const valueNode = document.createElement("span");
  valueNode.className = "auth-phone-code__value";
  trigger.append(valueNode);

  const menu = document.createElement("div");
  menu.className = "auth-phone-code-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");

  for (const option of select.options) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "option");
    item.dataset.phoneCode = option.value;
    const code = document.createElement("strong");
    code.textContent = option.value;
    const name = document.createElement("span");
    name.textContent = countryLabel(option.value) || option.textContent.trim();
    item.append(code, name);
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncWrap(wrap);
      closeMenu(wrap);
    });
    menu.append(item);
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (wrap.classList.contains("is-open")) closeMenu(wrap);
    else openMenu(wrap);
  });

  wrap.classList.add("is-enhanced");
  wrap.insertBefore(trigger, select);
  wrap.append(menu);
  syncWrap(wrap);
}

/** Replace native country-code <select> with a compact custom picker. */
export function enhancePhoneCodeFields(root = document) {
  if (!root?.querySelectorAll) return;
  bindDocumentOnce();
  root.querySelectorAll(".auth-phone-input, .mini-auth-phone").forEach(enhanceOne);
}
