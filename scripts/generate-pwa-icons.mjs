/**
 * Publish the committed brand icons into public/assets for the web build.
 *
 * Rendering happens offline in scripts/generate-app-icons.py so the build needs
 * no image library. This step only copies and fails loudly if a master is
 * missing — it must never invent a placeholder, or a release ships a blank icon.
 */

import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const brandDir = join(root, "assets", "brand");
const assetsDir = join(root, "public", "assets");
const icons = ["icon-192.png", "icon-512.png"];

await mkdir(assetsDir, { recursive: true });

for (const name of icons) {
  const source = join(brandDir, name);
  try {
    await stat(source);
  } catch {
    throw new Error(
      `Missing brand icon ${name}. Run "npm run generate:app-icons" to render it from assets/brand/app-icon-1024.png.`,
    );
  }
  await copyFile(source, join(assetsDir, name));
}

console.log(`Published ${icons.length} brand icons to public/assets/`);
