/**
 * Custom inquiry contacts (no store / payments / orders).
 * One product-wide source for author/community contacts. Build-time variables
 * may override these public defaults for a branded distribution.
 */
import { getLocale, t } from "../i18n/index.js";

export const CUSTOM_CONTACT = {
  github: String(import.meta.env?.VITE_YUEQI_GITHUB_URL || "https://github.com/azhimiao/Nyra-yueqi").trim(),
  discord: String(import.meta.env?.VITE_YUEQI_CONTACT_DISCORD || "CogPrism").trim(),
  wechat: String(import.meta.env?.VITE_YUEQI_CONTACT_WECHAT || "azhimiaoo").trim(),
  qqGroup: String(import.meta.env?.VITE_YUEQI_CONTACT_QQ_GROUP || "1034044082").trim(),
  email: String(import.meta.env?.VITE_YUEQI_CONTACT_EMAIL || "3804762525@qq.com").trim(),
  qq: String(import.meta.env?.VITE_YUEQI_CONTACT_QQ || "3804762525").trim(),
};

/** 小手机界面 / 主题定制咨询（联系方式与 CUSTOM_CONTACT 共用） */
export const UI_CUSTOM_CONTACT = CUSTOM_CONTACT;

export function getCustomContactCopy(locale = getLocale()) {
  return {
    github: CUSTOM_CONTACT.github,
    discord: CUSTOM_CONTACT.discord,
    wechat: CUSTOM_CONTACT.wechat,
    qqGroup: CUSTOM_CONTACT.qqGroup,
    email: CUSTOM_CONTACT.email,
    qq: CUSTOM_CONTACT.qq,
    title: t("pages.companionChrome.customContact.title", locale),
    blurb: t("pages.companionChrome.customContact.blurb", locale),
    note: t("pages.companionChrome.customContact.note", locale),
  };
}

export function getUiCustomContactCopy(locale = getLocale()) {
  return {
    github: UI_CUSTOM_CONTACT.github,
    discord: UI_CUSTOM_CONTACT.discord,
    wechat: UI_CUSTOM_CONTACT.wechat,
    qqGroup: UI_CUSTOM_CONTACT.qqGroup,
    email: UI_CUSTOM_CONTACT.email,
    qq: UI_CUSTOM_CONTACT.qq,
    title: t("pages.companionChrome.uiCustomContact.title", locale),
    blurb: t("pages.companionChrome.uiCustomContact.blurb", locale),
    note: t("pages.companionChrome.uiCustomContact.note", locale),
  };
}

export function hasCustomContact(contact = CUSTOM_CONTACT) {
  const source = contact && typeof contact === "object" ? contact : CUSTOM_CONTACT;
  const github = String(source.github || "").trim();
  const discord = String(source.discord || "").trim();
  const wechat = String(source.wechat || "").trim();
  const qqGroup = String(source.qqGroup || "").trim();
  const email = String(source.email || "").trim();
  const qq = String(source.qq || "").trim();
  const placeholderWechat = !wechat || wechat === "在此填写微信号" || wechat === "未配置微信号";
  const placeholderEmail = !email || email === "在此填写邮箱";
  return Boolean(github || discord || qqGroup || qq || !placeholderWechat || !placeholderEmail);
}
