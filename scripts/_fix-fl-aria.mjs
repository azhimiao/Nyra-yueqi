import fs from "node:fs";
const p = "src/first-light/ui.js";
const lines = fs.readFileSync(p, "utf8").split(/\n/);
for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].includes("aria-label") && lines[i].includes("?")) {
    const t = lines[i].trim();
    if (t.startsWith('"aria-label"') && !t.includes("First Light")) {
      lines[i] = '      "aria-label": getBrandName(getLocale()),';
    }
  }
  if (lines[i].includes('|| "??"')) {
    lines[i] = lines[i].replace(/\|\| "\?\?"/g, "|| getBrandName(getLocale())");
  }
}
let s = lines.join("\n");
if (!s.includes("getBrandName")) {
  s = s.replace(
    'import { getLocale, setLocale } from "../i18n/index.js";',
    'import { getLocale, setLocale, getBrandName } from "../i18n/index.js";',
  );
}
fs.writeFileSync(p, s);
console.log("fixed");