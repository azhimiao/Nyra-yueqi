/**
 * First Light copy selector — zh-CN / en-US formal packs (not runtime MT).
 */

import { getLocale } from "../i18n/index.js";
import { toPackLocale, toSupportedLocale } from "../i18n/language-prefs.js";
import { FL_COPY_ZH, labelOf as labelOfBase } from "./locales/zh-CN.js";
import { FL_COPY_EN } from "./locales/en.js";

export { labelOfBase as labelOf };
/** @deprecated Prefer getFirstLightCopy(locale) for live UI. */
export { FL_COPY_ZH as FL_COPY };

export function getFirstLightCopy(locale) {
  const pack = toPackLocale(locale || getLocale());
  return pack === "en" ? FL_COPY_EN : FL_COPY_ZH;
}

export function firstLightTrackLabels(locale) {
  const c = getFirstLightCopy(locale);
  return [
    { id: "meet", label: c.track.meet },
    { id: "bond", label: c.track.bond },
    { id: "temper", label: c.track.temper },
    { id: "edge", label: c.track.edge },
    { id: "begin", label: c.track.begin },
  ];
}

export function isEnglishFirstLight(locale) {
  return toSupportedLocale(locale || getLocale()) === "en-US";
}
