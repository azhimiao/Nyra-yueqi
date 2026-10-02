/** One-shot ARK connectivity smoke (not a gate). Does not print secrets. */
import path from "node:path";
import { RealProvider, loadDotenv } from "../src/providers/real-provider.mjs";

await loadDotenv();
const p = new RealProvider();
try {
  await p.ensureConfigured();
  const out = path.join("F:/beautiful/.avatar-factory", "_smoke", "ark-smoke.png");
  await p.generateOne({
    prompt:
      "simple anime girl full body, solid flat background #B8B8B8, semi-chibi adult, no watermark, no checkerboard",
    outPath: out,
    size: "1920x1920",
  });
  console.log(JSON.stringify({ ok: true, model: p.model, out }));
} catch (e) {
  console.log(
    JSON.stringify({
      ok: false,
      code: e.code || "ERROR",
      errorClass: e.errorClass || null,
      status: e.status || null,
      message: String(e.message || e).slice(0, 300),
    }),
  );
  process.exitCode = 1;
}
