import fs from "node:fs";

const p = "src/first-light/ui.js";
let s = fs.readFileSync(p, "utf8");
s = s.replace(/name\.value \|\| "\?\?"/g, "name.value || getBrandName(getLocale())");
s = s.replace(/"aria-label": "\?\?",?/g, '"aria-label": getBrandName(getLocale()),');
s = s.replace(/"aria-label": "\?\?',/g, '"aria-label": getBrandName(getLocale()),');
if (!s.includes("getBrandName")) {
  s = s.replace(
    'import { getLocale, setLocale } from "../i18n/index.js";',
    'import { getLocale, setLocale, getBrandName } from "../i18n/index.js";',
  );
}
fs.writeFileSync(p, s);
console.log("ok", s.includes("getBrandName(getLocale())"));
