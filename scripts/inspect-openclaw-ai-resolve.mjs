import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const r = createRequire("F:/clawtry/app/package.json");
const oc = "F:/clawtry/app/node_modules/openclaw";
const pkg = JSON.parse(readFileSync(join(oc, "package.json"), "utf8"));
const aiExports = Object.keys(pkg.exports || {}).filter((k) => k.includes("ai") || k.includes("@openclaw"));
console.log("ai-like exports", aiExports.slice(0, 40));

// resolve via openclaw context
const roc = createRequire(join(oc, "package.json"));
for (const s of [
  "@openclaw/ai/event-stream",
  "@openclaw/ai/validation",
  "@openclaw/ai/internal/runtime",
]) {
  try {
    console.log(s, "=>", roc.resolve(s));
  } catch (e) {
    console.log(s, "FAIL", e.code);
  }
}

const dist = join(oc, "dist");
const hits = [];
for (const f of readdirSync(dist)) {
  if (!f.endsWith(".js")) continue;
  const t = readFileSync(join(dist, f), "utf8");
  if (t.includes('from "ws"') || t.includes("from 'ws'") || t.includes('require("ws")')) {
    hits.push(f);
  }
}
console.log("ws importers", hits.slice(0, 40));

// stream chunk imports
const streamPath = roc.resolve("openclaw/plugin-sdk/llm");
const streamFile = readFileSync(join(dist, "stream-BcRkg2P0.js"), "utf8").slice(0, 500);
console.log("stream head", streamFile);
