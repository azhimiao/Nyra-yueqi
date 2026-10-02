/**
 * Detect dangerous pattern: click handler uses closest([data-X]) to navigate/remount,
 * while data-X is also on a container that wraps forms/inputs/submit buttons.
 * That swallows CTA clicks (the scroll compose bug).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..", "src");

function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}

/** Attrs that are identifiers / submit forms, not "open view" remount actions. */
const ALLOW = new Set([
  "data-scroll-compose-form",
  "data-live-form",
  "data-story-form",
  "data-cc-form",
  "data-explore-task-form",
  "data-profile-form",
  "data-phone-moment-comment-form",
  "data-moment-comment-form",
  "data-adv-create-form",
  "data-adv-form",
  "data-pop-panel",
  "data-phone-screen",
  "data-lock-pane",
  "data-timeline-stage",
  "data-kf-index",
  "data-cc-cast-row",
  "data-cc-world-row",
  "data-track-id",
  "data-moment-id",
  "data-preset-id",
  "data-regex-id",
  "data-ta-lock-hint",
  "data-ext-perm-cancel",
]);

const REMOUNT = /return\s+(render\w*|start\w*|open\w*|show\w*)\s*\(/;

const hits = [];

for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  const clickBlocks = [...src.matchAll(/addEventListener\(\s*["']click["'][\s\S]{0,12000}?\)\s*;/g)];
  const handlers = [
    ...src.matchAll(/function\s+onClick\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/g),
    ...clickBlocks.map((m) => [m[0], m[0]]),
  ];

  const dangerousAttrs = new Set();
  for (const block of handlers) {
    const body = typeof block[1] === "string" ? block[1] : block[0];
    for (const m of body.matchAll(/closest\(\s*["']\[(data-[a-z0-9-]+)[^\]]*\]["']\s*\)[\s\S]{0,120}?return\s+\w+/gi)) {
      const attr = m[1];
      if (ALLOW.has(attr)) continue;
      const window = m[0];
      if (!REMOUNT.test(window) && !/return\s+render/i.test(window)) continue;
      dangerousAttrs.add(attr);
    }
  }

  for (const attr of dangerousAttrs) {
    const re = new RegExp(`<(?:section|div|article|main)([^>]*\\s${attr}(?:\\s|=|>)[^>]*)>`, "gi");
    let m;
    while ((m = re.exec(src))) {
      if (/\btype\s*=\s*["']button["']/.test(m[1] || "")) continue;
      const snippet = src.slice(m.index, m.index + 900);
      if (!/<(?:form|input|textarea)\b/i.test(snippet) && !/<button[^>]*type=["']submit["']/i.test(snippet)) {
        continue;
      }
      hits.push({
        file: relative(join(root, ".."), file).replace(/\\/g, "/"),
        attr,
        sample: snippet.replace(/\s+/g, " ").slice(0, 140),
      });
    }
  }
}

if (!hits.length) {
  console.log("PASS  no remounting container action-attr collisions");
  process.exit(0);
}

console.log(`FAIL  ${hits.length} remounting container collision(s):`);
for (const h of hits) console.log(`- ${h.file}  [${h.attr}]  ${h.sample}…`);
process.exit(1);
