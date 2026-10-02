import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, "www");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;

const swPath = join(root, "public", "sw.js");
const swTemplate = await readFile(swPath, "utf8");
const swOutput = swTemplate.replace("__CACHE_VERSION__", version.replace(/\./g, "-"));
await writeFile(join(outDir, "sw.js"), swOutput);

await writeFile(
  join(outDir, "build-info.json"),
  JSON.stringify(
    {
      app: "yueqi-companion",
      version,
      builtAt: new Date().toISOString(),
      phase: "P2",
    },
    null,
    2
  )
);

console.log(`Post-build metadata written to ${outDir} (v${version})`);
