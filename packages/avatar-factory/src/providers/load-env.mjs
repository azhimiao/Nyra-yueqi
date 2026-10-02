import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Load KEY=VAL from .env into process.env if missing. Never logs values. */
export function loadDotEnv(file = path.join(ROOT, ".env")) {
  if (!fs.existsSync(file)) return { loaded: false };
  const text = fs.readFileSync(file, "utf8");
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) {
      process.env[k] = v;
      n++;
    }
  }
  return { loaded: true, keysSet: n };
}

export function requireArkKey() {
  loadDotEnv();
  const key = process.env.ARK_API_KEY;
  if (!key) {
    const err = new Error("ARK_API_KEY missing");
    err.code = "PROVIDER_NOT_CONFIGURED";
    throw err;
  }
  return key;
}
