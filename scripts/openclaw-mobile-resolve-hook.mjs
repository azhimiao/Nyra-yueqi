/**
 * ESM resolve hook — map @openclaw/ai and typebox to clawtry openclaw nested deps.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const APP_ROOT = process.env.OPENCLAW_APP_ROOT || "F:\\clawtry\\app";
const ocRequire = createRequire(join(APP_ROOT, "node_modules/openclaw/package.json"));

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.startsWith("@openclaw/") ||
    specifier === "typebox" ||
    specifier.startsWith("typebox/") ||
    specifier === "json5"
  ) {
    try {
      const resolved = ocRequire.resolve(specifier);
      return { shortCircuit: true, url: pathToFileURL(resolved).href };
    } catch {
      /* fall through */
    }
  }
  return nextResolve(specifier, context);
}
