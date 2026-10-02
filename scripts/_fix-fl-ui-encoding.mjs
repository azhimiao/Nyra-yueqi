import fs from "node:fs";

const p = "src/first-light/ui.js";
let s = fs.readFileSync(p, "utf8");
s = s.replace(/text:\s*"\?\?"/g, "text: copy.chrome.continue");
s = s.replace(/label:\s*"\?\?"/g, "label: copy.chrome.continue");
fs.writeFileSync(p, s);
console.log("fixed", (s.match(/copy\.chrome\.continue/g) || []).length);
