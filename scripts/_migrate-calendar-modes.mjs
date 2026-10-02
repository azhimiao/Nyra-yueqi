import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "src/proactive/pipeline.js",
  "src/proactive/scheduler.js",
  "src/proactive/strategy.js",
  "src/phone-shell/phone-data.js",
  "src/phone-shell/app-screens.js",
  "src/phone-shell/phone-shell.js",
  "src/constants.js",
  "src/calendar/anniversaries.js",
  "src/panels/calendar.js",
  "src/calendar/ics.js",
  "src/app.js",
  "src/panels/library.js",
];

const pairs = [
  ["可主动消息", "proactive_message"],
  ["仅提醒", "notification_only"],
  ["不联动", "none"],
];

for (const rel of files) {
  const path = join(root, rel);
  let s = readFileSync(path, "utf8");
  const before = s;
  for (const [from, to] of pairs) {
    s = s.split(`"${from}"`).join(`"${to}"`);
    s = s.split(`'${from}'`).join(`'${to}'`);
  }
  if (s !== before) {
    writeFileSync(path, s);
    console.log("updated", rel);
  } else {
    console.log("unchanged", rel);
  }
}
