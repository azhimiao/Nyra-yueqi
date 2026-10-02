import { readFileSync } from "node:fs";
import { join } from "node:path";

const PANEL_FILES = [
  "src/app.js",
  "src/panels/calendar.js",
  "src/panels/me.js",
  "src/panels/profile.js",
  "src/panels/library.js",
  "src/panels/chat.js",
  "src/panels/nav.js",
];

/** Concatenated app hub + panel modules for static verify greps after X5-1. */
export function readAppBundle(root) {
  return PANEL_FILES.map((rel) => readFileSync(join(root, rel), "utf8")).join("\n");
}
